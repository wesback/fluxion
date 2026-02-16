"""API routes for package updates."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.database import get_session
from fluxion.models import Host, PackageUpdate
from fluxion.schemas.package_update import (
    BatchPackageUpdateRequest,
    BatchPackageUpdateResponse,
    PackageUpdateRequest,
    PackageUpdateResponse,
)
from fluxion.services import WebhookService
from fluxion.telemetry import get_tracer, record_package_update

router = APIRouter()
logger = logging.getLogger(__name__)

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
                update_data, background_tasks, session, tracer
            )
    else:
        return await _create_package_update_impl(update_data, background_tasks, session, None)


async def _create_package_update_impl(
    update_data: PackageUpdateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession,
    tracer,
) -> PackageUpdateResponse:
    """Implementation of package update creation with tracing."""
    try:
        # Normalize old_version sentinel values to None for new installs
        old_version = _normalize_old_version(update_data.old_version)

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
                    now,
                    session,
                )
        else:
            package_update = await _insert_package_update(
                host.id,
                update_data.package_name,
                old_version,
                update_data.new_version,
                now,
                session,
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

        # Trigger package-related webhooks (async, don't block response)
        background_tasks.add_task(
            _trigger_package_change_webhooks,
            update_data.hostname,
            update_data.package_name,
            old_version,
            update_data.new_version,
            update_data.is_security,
        )

        return PackageUpdateResponse(
            id=package_update.id, message="Package update recorded successfully"
        )

    except Exception as e:
        await session.rollback()
        logger.error(f"Error recording package update: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record package update",
        ) from e


async def _upsert_host(
    hostname: str, session: AsyncSession, os_info: str | None = None
) -> tuple[Host, datetime]:
    """Upsert host record (create if not exists, update last_seen and os_info if exists)."""
    result = await session.execute(select(Host).where(Host.hostname == hostname))
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
    update_timestamp: datetime,
    session: AsyncSession,
) -> PackageUpdate:
    """Insert a new package update record."""
    package_update = PackageUpdate(
        host_id=host_id,
        package_name=package_name,
        old_version=old_version,
        new_version=new_version,
        update_timestamp=update_timestamp,
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
    session: AsyncSession = Depends(get_session),
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
                batch_data, background_tasks, session, tracer
            )
    else:
        return await _create_batch_package_updates_impl(batch_data, background_tasks, session, None)


async def _create_batch_package_updates_impl(
    batch_data: BatchPackageUpdateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession,
    tracer,
) -> BatchPackageUpdateResponse:
    """Implementation of batch package update creation with tracing."""
    try:
        # Upsert host record with custom span
        if tracer:
            with tracer.start_as_current_span("upsert_host") as span:
                span.set_attribute("hostname", batch_data.hostname)
                if batch_data.os_info:
                    span.set_attribute("os_info", batch_data.os_info)
                host, now = await _upsert_host(batch_data.hostname, session, batch_data.os_info)
        else:
            host, now = await _upsert_host(batch_data.hostname, session, batch_data.os_info)

        # Create all package update records
        created_ids: list[int] = []
        package_changes: list[tuple[str, str | None, str, bool]] = []  # (name, old, new, is_security)

        for update_item in batch_data.updates:
            # Normalize old_version sentinel values to None for new installs
            old_version = _normalize_old_version(update_item.old_version)

            # Insert package update with custom span
            if tracer:
                with tracer.start_as_current_span("insert_package_update") as span:
                    span.set_attribute("package_name", update_item.package_name)
                    span.set_attribute("host_id", host.id)
                    package_update = await _insert_package_update(
                        host.id,
                        update_item.package_name,
                        old_version,
                        update_item.new_version,
                        now,
                        session,
                    )
            else:
                package_update = await _insert_package_update(
                    host.id,
                    update_item.package_name,
                    old_version,
                    update_item.new_version,
                    now,
                    session,
                )

            created_ids.append(package_update.id)

            # Track package changes for webhook triggering
            package_changes.append(
                (
                    update_item.package_name,
                    old_version,
                    update_item.new_version,
                    update_item.is_security,
                )
            )

            logger.debug(
                f"Package update queued: host={batch_data.hostname}, "
                f"package={update_item.package_name}, "
                f"version={old_version}->{update_item.new_version}, "
                f"id={package_update.id}"
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

    except Exception as e:
        await session.rollback()
        logger.error(f"Error recording batch package updates: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record batch package updates",
        ) from e
