"""API routes for package updates."""

import hashlib
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any


from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.database import get_session
from fluxion.models import DeliveryIdentity, Host, IngestDiagnostic, PackageUpdate, WebhookConfig, WebhookOutbox
from fluxion.schemas.package_update import (
    BatchPackageUpdateRequest,
    BatchPackageUpdateResponse,
    PackageUpdateRequest,
    PackageUpdateResponse,
)
from fluxion.services import WebhookService
from fluxion.services.ingest_adapters import adapter_for
from fluxion.telemetry import get_tracer, record_package_update

router = APIRouter()
logger = logging.getLogger(__name__)

async def authorize_batch_hostname(request: Request) -> dict[str, Any]:
    """Fail closed and enforce exact per-key hostname authorization."""
    role = getattr(request.state, "api_key_role", None)
    allowed_hosts = getattr(request.state, "api_key_allowed_hosts", None)
    if role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hostname not authorized for this API key")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hostname not authorized for this API key")

    hostname = payload.get("hostname") if isinstance(payload, dict) else None
    if hostname is None and "/updates/ingest/" in request.url.path:
        manager = request.url.path.rsplit("/", 1)[-1]
        adapter = adapter_for(manager)
        if adapter is not None:
            try:
                hostname = adapter.normalize(payload).hostname
            except (KeyError, TypeError, ValueError):
                hostname = None

    if role == "admin":
        return {"role": role, "allowed_hosts": allowed_hosts or []}
    if not isinstance(hostname, str) or hostname not in (allowed_hosts or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hostname not authorized for this API key")
    return {"role": role, "allowed_hosts": allowed_hosts or []}


MAX_BATCH_PACKAGE_ITEMS = 100

INSTALL_SENTINEL_OLD_VERSIONS = {
    "-",
    "n/a",
    "na",
    "none",
    "(none)",
    "<none>",
    "null",
    "",
}


@router.post(
    "/updates/ingest/{package_manager}",
    response_model=BatchPackageUpdateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Normalize a supported distro package-manager ingest",
)
async def ingest_package_manager_updates(
    package_manager: str,
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    _authorized: dict[str, Any] = Depends(authorize_batch_hostname),
) -> BatchPackageUpdateResponse:
    """Adapt dnf/yum, apk, or zypper payloads into the canonical batch contract."""
    adapter = adapter_for(package_manager)
    if adapter is None:
        session.add(
            IngestDiagnostic(
                package_manager=package_manager.lower(),
                package_count=0,
                accepted_count=0,
                rejected_count=1,
                outcome="unsupported_package_manager",
            )
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported package manager; use dnf, yum, apk, or zypper",
        )
    try:
        normalized = adapter.normalize(payload)
        if len(normalized.updates) > MAX_BATCH_PACKAGE_ITEMS:
            raise HTTPException(
                status_code=413,
                detail="Batch package count exceeds 100",
            )
        batch = BatchPackageUpdateRequest(
            hostname=normalized.hostname,
            os_info=normalized.os_info,
            package_manager=normalized.package_manager,
            updates=[
                {
                    "package_name": update.package_name,
                    "old_version": update.old_version,
                    "new_version": update.new_version,
                    "is_security": update.is_security,
                }
                for update in normalized.updates
            ],
        )
    except (KeyError, TypeError, ValueError) as exc:
        session.add(
            IngestDiagnostic(
                package_manager=package_manager.lower(),
                package_count=0,
                accepted_count=0,
                rejected_count=1,
                outcome="rejected",
            )
        )
        await session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return await _create_batch_package_updates_impl(batch, background_tasks, session, None)


def _normalize_old_version(old_version: str | None) -> str | None:
    """Normalize old_version to None for package install sentinel values."""
    if old_version is None:
        return None

    normalized = old_version.strip().lower()
    if normalized in INSTALL_SENTINEL_OLD_VERSIONS:
        return None

    return old_version


@router.post(
    "/updates",
    response_model=PackageUpdateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Receive package update webhook",
    description="Endpoint for receiving a single package update from APT hooks",
)
async def create_package_update(
    update_data: PackageUpdateRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> PackageUpdateResponse:
    """
    Create a package update record.

    Args:
        update_data: Package update information from the webhook
        background_tasks: FastAPI background tasks
        session: Database session (injected)

    Returns:
        PackageUpdateResponse with the created record ID

    Raises:
        HTTPException: 500 if there's a database error
    """
    tracer = get_tracer()

    # Create parent span for the entire update process
    if tracer:
        with tracer.start_as_current_span("process_update") as span:
            span.set_attribute("hostname", update_data.hostname)
            span.set_attribute("package_name", update_data.package_name)
            span.set_attribute("new_version", update_data.new_version)
            if update_data.old_version:
                span.set_attribute("old_version", update_data.old_version)

            return await _create_package_update_impl(
                update_data, background_tasks, session, tracer, request.headers.get("X-Delivery-ID")
            )
    else:
        return await _create_package_update_impl(update_data, background_tasks, session, None, request.headers.get("X-Delivery-ID"))


async def _create_package_update_impl(
    update_data: PackageUpdateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession,
    tracer,
    delivery_id: str | None = None,
) -> PackageUpdateResponse:
    """Implementation of package update creation with tracing."""
    try:
        # Normalize old_version sentinel values to None for new installs
        old_version = _normalize_old_version(update_data.old_version)
        request_payload = {
            "hostname": update_data.hostname,
            "package_name": update_data.package_name,
            "old_version": old_version,
            "new_version": update_data.new_version,
            "is_security": update_data.is_security,
            "package_manager": update_data.package_manager,
        }
        fingerprint = await _request_fingerprint(request_payload)
        identity = _stable_delivery_identity(delivery_id, request_payload)
        replay_status = await _delivery_replay_status(session, identity, fingerprint)
        if replay_status == "conflict":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Delivery identity was already accepted for different content",
            )
        if replay_status == "same":
            host_result = await session.execute(select(Host.id).where(Host.hostname == update_data.hostname))
            host_id = host_result.scalar_one_or_none()
            result = await session.execute(
                select(PackageUpdate).where(
                    PackageUpdate.host_id == host_id,
                    PackageUpdate.delivery_id == identity,
                    PackageUpdate.package_name == update_data.package_name,
                    PackageUpdate.new_version == update_data.new_version,
                    PackageUpdate.old_version == old_version,
                )
            )
            existing = result.scalars().first()
            if existing is not None:
                return PackageUpdateResponse(
                    id=existing.id,
                    message="Package update already recorded",
                )

        session.add(DeliveryIdentity(delivery_id=identity, fingerprint=fingerprint))

        # Upsert host record with custom span
        if tracer:
            with tracer.start_as_current_span("upsert_host") as span:
                span.set_attribute("hostname", update_data.hostname)
                if update_data.os_info:
                    span.set_attribute("os_info", update_data.os_info)
                host, now = await _upsert_host(update_data.hostname, session, update_data.os_info)
        else:
            host, now = await _upsert_host(update_data.hostname, session, update_data.os_info)

        # Create package update record with custom span
        if tracer:
            with tracer.start_as_current_span("insert_package_update") as span:
                span.set_attribute("package_name", update_data.package_name)
                span.set_attribute("host_id", host.id)
                package_update = await _insert_package_update(
                    host.id,
                    update_data.package_name,
                    old_version,
                    update_data.new_version,
                    update_data.is_security,
                    update_data.package_manager,
                    now,
                    session,
                    identity,
                )
        else:
            package_update = await _insert_package_update(
                host.id,
                update_data.package_name,
                old_version,
                update_data.new_version,
                update_data.is_security,
                update_data.package_manager,
                now,
                session,
                identity,
            )

        await _enqueue_package_outbox(
            session,
            identity,
            package_update.id,
            update_data.hostname,
            update_data.package_name,
            old_version,
            update_data.new_version,
            update_data.is_security,
            update_data.package_manager,
            fingerprint,
        )
        session.add(
            IngestDiagnostic(
                package_manager=update_data.package_manager or "apt",
                package_count=1,
                accepted_count=1,
                rejected_count=0,
                outcome="accepted",
            )
        )
        # Commit the transaction
        await session.commit()

        # Record metrics
        record_package_update(update_data.hostname, 1)

        logger.info(
            f"Package update recorded: host={update_data.hostname}, "
            f"package={update_data.package_name}, "
            f"version={old_version}->{update_data.new_version}, "
            f"id={package_update.id}"
        )

        return PackageUpdateResponse(
            id=package_update.id, message="Package update recorded successfully"
        )

    except HTTPException:
        await session.rollback()
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Error recording package update: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record package update",
        ) from e


def _stable_delivery_identity(request_delivery_id: str | None, payload: dict[str, Any]) -> str:
    """Bind replay detection to a caller ID, or derive it from the canonical request."""
    if request_delivery_id:
        return request_delivery_id
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


async def _delivery_replay_status(
    session: AsyncSession, identity: str, fingerprint: str
) -> str:
    """Return 'new', 'same', or 'conflict' for a delivery identity."""
    result = await session.execute(
        select(DeliveryIdentity.fingerprint).where(DeliveryIdentity.delivery_id == identity)
    )
    existing = result.scalar_one_or_none()
    if existing is None:
        return "new"
    return "same" if existing == fingerprint else "conflict"


async def _batch_original_package_ids(
    session: AsyncSession, batch_data: BatchPackageUpdateRequest, identity: str
) -> list[int]:
    """Recover the package IDs originally accepted for this delivery identity."""
    host_result = await session.execute(select(Host.id).where(Host.hostname == batch_data.hostname))
    host_id = host_result.scalar_one_or_none()
    if host_id is None:
        return []

    ids: list[int] = []
    offsets: dict[tuple[Any, ...], int] = {}
    for update_item in batch_data.updates:
        old_version = _normalize_old_version(update_item.old_version)
        package_manager = batch_data.package_manager or update_item.package_manager
        signature = (
            update_item.package_name,
            old_version,
            update_item.new_version,
            update_item.is_security,
            package_manager,
        )
        offset = offsets.get(signature, 0)
        result = await session.execute(
            select(PackageUpdate.id).where(
                PackageUpdate.host_id == host_id,
                PackageUpdate.delivery_id == identity,
                PackageUpdate.package_name == update_item.package_name,
                PackageUpdate.old_version == old_version,
                PackageUpdate.new_version == update_item.new_version,
                PackageUpdate.is_security == update_item.is_security,
                PackageUpdate.package_manager == package_manager,
            ).order_by(PackageUpdate.id.asc())
        )
        matching_ids = list(result.scalars().all())
        if offset < len(matching_ids):
            ids.append(matching_ids[offset])
            offsets[signature] = offset + 1
    return ids


async def _request_fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def _enqueue_package_outbox(
    session: AsyncSession,
    delivery_base: str,
    package_update_id: int,
    hostname: str,
    package_name: str,
    old_version: str | None,
    new_version: str,
    is_security: bool,
    package_manager: str | None,
    request_fingerprint: str | None = None,
) -> None:
    """Insert one durable intent for each exact enabled webhook/event pair."""
    service = WebhookService(session)
    for event_type in dict.fromkeys(service.get_event_types_for_package(
        package_name, old_version, is_security
    )):
        result = await session.execute(
            select(WebhookConfig).where(WebhookConfig.enabled.is_(True))
        )
        for webhook in result.scalars().all():
            if not getattr(webhook, "enabled", True) or event_type not in webhook.event_types:
                continue
            identity_key = f"{delivery_base}:{package_update_id}:{webhook.id}:{event_type}"
            delivery_id = str(uuid.uuid5(uuid.NAMESPACE_URL, identity_key))
            existing = await session.execute(
                select(WebhookOutbox.delivery_id).where(WebhookOutbox.delivery_id == delivery_id)
            )
            if existing.scalar_one_or_none() is not None:
                continue
            now = datetime.now(UTC)
            payload = {
                "event": event_type,
                "hostname": hostname,
                "package_name": package_name,
                "old_version": old_version,
                "new_version": new_version,
                "package_manager": package_manager,
                "timestamp": now.isoformat(),
                "is_security": is_security,
                "delivery_identity": delivery_base,
                "request_fingerprint": request_fingerprint,
            }
            session.add(WebhookOutbox(
                delivery_id=delivery_id,
                webhook_config_id=webhook.id,
                event_type=event_type,
                payload=payload,
                status="pending",
                attempt_count=0,
                next_attempt_at=now,
                created_at=now,
                updated_at=now,
            ))


async def _upsert_host(
    hostname: str, session: AsyncSession, os_info: str | None = None
) -> tuple[Host, datetime]:
    """Upsert only an active identity; archived hosts are never reactivated."""
    result = await session.execute(
        select(Host).where(Host.hostname == hostname, Host.archived_at.is_(None))
    )
    host = result.scalar_one_or_none()

    now = datetime.now(UTC)

    if host:
        # Update existing host's last_seen timestamp and os_info if provided
        host.last_seen = now
        host.updated_at = now
        if os_info:
            old_os_info = host.os_info
            host.os_info = os_info
            if old_os_info != os_info:
                logger.info(f"Updated OS info for host {hostname}: {old_os_info} -> {os_info}")
            else:
                logger.info(f"Updated last_seen for host: {hostname}")
        else:
            logger.info(f"Updated last_seen for host: {hostname}")
    else:
        # Create new host record with provided os_info or default to "Unknown"
        host = Host(
            hostname=hostname,
            os_info=os_info or "Unknown",
            last_seen=now,
            archived_at=None,
        )
        session.add(host)
        await session.flush()  # Flush to get host.id
        logger.info(f"Created new host: {hostname} with OS: {host.os_info}")

    return host, now


async def _insert_package_update(
    host_id: int,
    package_name: str,
    old_version: str | None,
    new_version: str,
    is_security: bool,
    package_manager: str | None,
    update_timestamp: datetime,
    session: AsyncSession,
    delivery_id: str | None = None,
) -> PackageUpdate:
    """Insert a new package update record."""
    package_update = PackageUpdate(
        host_id=host_id,
        package_name=package_name,
        old_version=old_version,
        new_version=new_version,
        is_security=is_security,
        package_manager=package_manager,
        update_timestamp=update_timestamp,
        delivery_id=delivery_id,
    )
    session.add(package_update)
    await session.flush()  # Flush to get package_update.id
    return package_update


async def _trigger_package_change_webhooks(
    hostname: str,
    package_name: str,
    old_version: str | None,
    new_version: str,
    is_security: bool = False,
) -> None:
    """
    Trigger webhooks for package change events.

    This is executed as a background task to not block the API response.

    Args:
        hostname: Host name
        package_name: Package name
        old_version: Old version
        new_version: New version
    """
    try:
        from sqlalchemy.ext.asyncio import async_sessionmaker

        from fluxion.database import get_engine

        engine = get_engine()
        async_session = async_sessionmaker(engine, expire_on_commit=False)

        async with async_session() as session:
            webhook_service = WebhookService(session)
            await webhook_service.trigger_package_change_webhooks(
                hostname, package_name, old_version, new_version, is_security
            )
    except Exception as e:
        logger.error(f"Error triggering package webhooks: {str(e)}", exc_info=True)


@router.post(
    "/updates/batch",
    response_model=BatchPackageUpdateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Receive batch package updates webhook",
    description=(
        "Endpoint for receiving multiple package updates in a single request from APT hooks"
    ),
)
async def create_batch_package_updates(
    batch_data: BatchPackageUpdateRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    session: AsyncSession = Depends(get_session),
    _authorized: dict[str, Any] = Depends(authorize_batch_hostname),
) -> BatchPackageUpdateResponse:
    """
    Create multiple package update records in a single transaction.

    This endpoint is more efficient when multiple packages are updated at once,
    as it requires only a single API call and database transaction.

    Args:
        batch_data: Batch of package updates from the webhook
        background_tasks: FastAPI background tasks
        session: Database session (injected)

    Returns:
        BatchPackageUpdateResponse with created record IDs and count

    Raises:
        HTTPException: 500 if there's a database error
    """
    tracer = get_tracer()

    # Create parent span for the entire batch process
    if tracer:
        with tracer.start_as_current_span("process_update") as span:
            span.set_attribute("hostname", batch_data.hostname)
            span.set_attribute("batch_size", len(batch_data.updates))

            return await _create_batch_package_updates_impl(
                batch_data, background_tasks, session, tracer, request.headers.get("X-Delivery-ID")
            )
    else:
        return await _create_batch_package_updates_impl(batch_data, background_tasks, session, None, request.headers.get("X-Delivery-ID"))


async def _create_batch_package_updates_impl(
    batch_data: BatchPackageUpdateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession,
    tracer,
    delivery_id: str | None = None,
) -> BatchPackageUpdateResponse:
    """Implementation of batch package update creation with tracing."""
    if len(batch_data.updates) > MAX_BATCH_PACKAGE_ITEMS:
        raise HTTPException(
            status_code=413,
            detail="Batch package count exceeds 100",
        )
    try:
        request_payload = {
            "hostname": batch_data.hostname,
            "os_info": batch_data.os_info,
            "package_manager": batch_data.package_manager,
            "updates": [
                {
                    "package_name": update.package_name,
                    "old_version": _normalize_old_version(update.old_version),
                    "new_version": update.new_version,
                    "is_security": update.is_security,
                    "package_manager": update.package_manager,
                }
                for update in batch_data.updates
            ],
        }
        fingerprint = await _request_fingerprint(request_payload)
        identity = _stable_delivery_identity(delivery_id, request_payload)
        replay_status = await _delivery_replay_status(session, identity, fingerprint)
        if replay_status == "conflict":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Delivery identity was already accepted for different content",
            )
        if replay_status == "same":
            ids = await _batch_original_package_ids(session, batch_data, identity)
            return BatchPackageUpdateResponse(
                hostname=batch_data.hostname,
                count=len(ids),
                ids=ids,
                message=f"{len(ids)} package updates already recorded",
            )

        session.add(DeliveryIdentity(delivery_id=identity, fingerprint=fingerprint))

        # Upsert host record with custom span
        if tracer:
            with tracer.start_as_current_span("upsert_host") as span:
                span.set_attribute("hostname", batch_data.hostname)
                if batch_data.os_info:
                    span.set_attribute("os_info", batch_data.os_info)
                host, now = await _upsert_host(batch_data.hostname, session, batch_data.os_info)
        else:
            host, now = await _upsert_host(batch_data.hostname, session, batch_data.os_info)

        # Insert all package rows with one SQLAlchemy bulk operation.
        package_changes: list[tuple[str, str | None, str, bool]] = []
        package_rows: list[dict[str, Any]] = []
        for update_item in batch_data.updates:
            old_version = _normalize_old_version(update_item.old_version)
            package_manager = batch_data.package_manager or update_item.package_manager
            package_rows.append({
                "host_id": host.id,
                "package_name": update_item.package_name,
                "old_version": old_version,
                "new_version": update_item.new_version,
                "is_security": update_item.is_security,
                "package_manager": package_manager,
                "update_timestamp": now,
                "created_at": now,
                "delivery_id": identity,
            })
            package_changes.append((
                update_item.package_name,
                old_version,
                update_item.new_version,
                update_item.is_security,
            ))

        if tracer:
            with tracer.start_as_current_span("insert_package_updates"):
                await session.execute(insert(PackageUpdate), package_rows)
        else:
            await session.execute(insert(PackageUpdate), package_rows)

        ids_result = await session.execute(
            select(PackageUpdate.id)
            .where(
                PackageUpdate.host_id == host.id,
                PackageUpdate.delivery_id == identity,
            )
            .order_by(PackageUpdate.id.asc())
        )
        created_ids = list(ids_result.scalars().all())

        for update_item, package_id in zip(batch_data.updates, created_ids, strict=True):
            old_version = _normalize_old_version(update_item.old_version)
            await _enqueue_package_outbox(
                session,
                identity,
                package_id,
                batch_data.hostname,
                update_item.package_name,
                old_version,
                update_item.new_version,
                update_item.is_security,
                batch_data.package_manager or update_item.package_manager,
                fingerprint,
            )

        session.add(
            IngestDiagnostic(
                package_manager=batch_data.package_manager or "apt",
                package_count=len(created_ids),
                accepted_count=len(created_ids),
                rejected_count=0,
                outcome="accepted",
            )
        )
        # Commit the transaction
        await session.commit()

        # Record metrics
        record_package_update(batch_data.hostname, len(created_ids))

        logger.info(
            f"Batch package updates recorded: host={batch_data.hostname}, "
            f"count={len(created_ids)}, ids={created_ids}"
        )


        # Trigger package-related webhooks (async, don't block response)
        if package_changes:
            logger.info(
                f"Detected {len(package_changes)} package change(s), triggering webhooks"
            )
            for package_name, old_version, new_version, is_security in package_changes:
                background_tasks.add_task(
                    _trigger_package_change_webhooks,
                    batch_data.hostname,
                    package_name,
                    old_version,
                    new_version,
                    is_security,
                )

        return BatchPackageUpdateResponse(
            hostname=batch_data.hostname,
            count=len(created_ids),
            ids=created_ids,
            message=f"{len(created_ids)} package updates recorded successfully",
        )

    except HTTPException:
        await session.rollback()
        raise
    except Exception as e:
        await session.rollback()
        logger.error(f"Error recording batch package updates: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record batch package updates",
        ) from e
