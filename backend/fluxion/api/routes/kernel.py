"""Kernel fleet inventory API."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.database import get_session
from fluxion.models import Host, PackageUpdate
from fluxion.schemas.analytics import KernelFleetItem, KernelFleetResponse
from fluxion.services.package_classifier import kernel_predicate as package_kernel_predicate
from fluxion.services.time import as_utc

router = APIRouter()


def kernel_predicate():
    """Build the canonical SQL predicate for kernel package families."""
    return package_kernel_predicate(PackageUpdate.package_name)


@router.get(
    "/kernel/fleet",
    response_model=KernelFleetResponse,
    summary="Get latest kernel package per host",
)
@router.get("/fleet/kernel", response_model=KernelFleetResponse, include_in_schema=False)
@router.get("/kernels", response_model=KernelFleetResponse, include_in_schema=False)
async def kernel_fleet(
    hostname: str | None = Query(None),
    os_info: str | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    limit: int = Query(10_000, ge=1, le=10_000),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> KernelFleetResponse:
    """Return latest observed kernel package/version and update age per active host."""
    latest = (
        select(
            PackageUpdate.host_id,
            PackageUpdate.package_name,
            PackageUpdate.new_version,
            PackageUpdate.update_timestamp,
            PackageUpdate.is_security,
            func.row_number()
            .over(
                partition_by=PackageUpdate.host_id,
                order_by=(
                    PackageUpdate.update_timestamp.desc(),
                    PackageUpdate.id.desc(),
                ),
            )
            .label("row_number"),
        )
        .where(kernel_predicate())
        .subquery()
    )
    if from_date and to_date and as_utc(from_date) > as_utc(to_date):
        raise HTTPException(status_code=400, detail="from_date must be before to_date")
    stmt = (
        select(
            Host.hostname,
            Host.os_info,
            latest.c.package_name,
            latest.c.new_version,
            latest.c.update_timestamp,
            latest.c.is_security,
        )
        .outerjoin(
            latest,
            (Host.id == latest.c.host_id) & (latest.c.row_number == 1),
        )
        .where(Host.archived_at.is_(None))
        .order_by(Host.hostname)
    )
    if hostname:
        stmt = stmt.where(Host.hostname == hostname)
    if os_info:
        stmt = stmt.where(Host.os_info.ilike(f"%{os_info}%"))
    if from_date:
        stmt = stmt.where(latest.c.update_timestamp >= as_utc(from_date))
    if to_date:
        stmt = stmt.where(latest.c.update_timestamp <= as_utc(to_date))
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    now = datetime.now(UTC)
    items = []
    for row in result.all():
        age = None
        if row.update_timestamp is not None:
            timestamp = row.update_timestamp
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=UTC)
            age = max(0, int((now - timestamp).total_seconds()))
        items.append(
            KernelFleetItem(
                hostname=row.hostname,
                os_info=row.os_info,
                kernel_package=row.package_name,
                kernel_version=row.new_version,
                last_updated=row.update_timestamp,
                update_age_seconds=age,
                is_security=bool(row.is_security) if row.is_security is not None else False,
            )
        )
    return KernelFleetResponse(items=items, total_hosts=len(items))
