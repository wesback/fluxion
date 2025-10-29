"""API routes for package updates."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
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

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/updates",
    response_model=PackageUpdateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Receive package update webhook",
    description="Endpoint for receiving a single package update from APT hooks",
)
async def create_package_update(
    update_data: PackageUpdateRequest,
    session: AsyncSession = Depends(get_session),
) -> PackageUpdateResponse:
    """
    Create a package update record.

    Args:
        update_data: Package update information from the webhook
        session: Database session (injected)

    Returns:
        PackageUpdateResponse with the created record ID

    Raises:
        HTTPException: 500 if there's a database error
    """
    try:
        # Normalize old_version: treat "-" as None for new installs
        old_version = update_data.old_version
        if old_version == "-":
            old_version = None

        # Upsert host record (create if not exists, update last_seen if exists)
        result = await session.execute(select(Host).where(Host.hostname == update_data.hostname))
        host = result.scalar_one_or_none()

        now = datetime.now(UTC)

        if host:
            # Update existing host's last_seen timestamp
            host.last_seen = now
            host.updated_at = now
            logger.info(f"Updated last_seen for host: {update_data.hostname}")
        else:
            # Create new host record
            host = Host(
                hostname=update_data.hostname,
                os_info="Unknown",  # Will be updated by future enhancements
                last_seen=now,
            )
            session.add(host)
            await session.flush()  # Flush to get host.id
            logger.info(f"Created new host: {update_data.hostname}")

        # Create package update record
        package_update = PackageUpdate(
            host_id=host.id,
            package_name=update_data.package_name,
            old_version=old_version,
            new_version=update_data.new_version,
            update_timestamp=now,
        )
        session.add(package_update)
        await session.flush()  # Flush to get package_update.id

        # Commit the transaction
        await session.commit()

        logger.info(
            f"Package update recorded: host={update_data.hostname}, "
            f"package={update_data.package_name}, "
            f"version={old_version}->{update_data.new_version}, "
            f"id={package_update.id}"
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
    session: AsyncSession = Depends(get_session),
) -> BatchPackageUpdateResponse:
    """
    Create multiple package update records in a single transaction.

    This endpoint is more efficient when multiple packages are updated at once,
    as it requires only a single API call and database transaction.

    Args:
        batch_data: Batch of package updates from the webhook
        session: Database session (injected)

    Returns:
        BatchPackageUpdateResponse with created record IDs and count

    Raises:
        HTTPException: 500 if there's a database error
    """
    try:
        # Upsert host record (create if not exists, update last_seen if exists)
        result = await session.execute(select(Host).where(Host.hostname == batch_data.hostname))
        host = result.scalar_one_or_none()

        now = datetime.now(UTC)

        if host:
            # Update existing host's last_seen timestamp
            host.last_seen = now
            host.updated_at = now
            logger.info(f"Updated last_seen for host: {batch_data.hostname}")
        else:
            # Create new host record
            host = Host(
                hostname=batch_data.hostname,
                os_info="Unknown",  # Will be updated by future enhancements
                last_seen=now,
            )
            session.add(host)
            await session.flush()  # Flush to get host.id
            logger.info(f"Created new host: {batch_data.hostname}")

        # Create all package update records
        created_ids: list[int] = []
        for update_item in batch_data.updates:
            # Normalize old_version: treat "-" as None for new installs
            old_version = update_item.old_version
            if old_version == "-":
                old_version = None

            package_update = PackageUpdate(
                host_id=host.id,
                package_name=update_item.package_name,
                old_version=old_version,
                new_version=update_item.new_version,
                update_timestamp=now,
            )
            session.add(package_update)
            await session.flush()  # Flush to get package_update.id
            created_ids.append(package_update.id)

            logger.debug(
                f"Package update queued: host={batch_data.hostname}, "
                f"package={update_item.package_name}, "
                f"version={old_version}->{update_item.new_version}, "
                f"id={package_update.id}"
            )

        # Commit the transaction
        await session.commit()

        logger.info(
            f"Batch package updates recorded: host={batch_data.hostname}, "
            f"count={len(created_ids)}, ids={created_ids}"
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
