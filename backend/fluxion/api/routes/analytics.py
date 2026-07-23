"""Server-side activity analytics API."""

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.database import get_session
from fluxion.models import Host, PackageUpdate
from fluxion.schemas.analytics import ActivityAnalyticsResponse
from fluxion.schemas.query import UpdateFilters
from fluxion.services.package_classifier import kernel_predicate
from fluxion.services.query_filters import apply_update_filters
from fluxion.services.time import as_utc

router = APIRouter()


@router.get(
    "/activity/analytics",
    response_model=ActivityAnalyticsResponse,
    summary="Get time-bucketed update activity",
)
@router.get(
    "/analytics/activity",
    response_model=ActivityAnalyticsResponse,
    include_in_schema=False,
)
@router.get("/activity", response_model=ActivityAnalyticsResponse, include_in_schema=False)
async def activity_analytics(
    bucket: Literal["hour", "day", "week"] = Query("day"),
    filters: UpdateFilters = Depends(),
    session: AsyncSession = Depends(get_session),
) -> ActivityAnalyticsResponse:
    """Aggregate updates in SQL by UTC bucket and canonical filters."""
    now = datetime.now(UTC)
    from_date = as_utc(filters.from_date) if filters.from_date else now - timedelta(days=7)
    to_date = as_utc(filters.to_date) if filters.to_date else now
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date must be before to_date")

    # PostgreSQL's third date_trunc argument makes bucket boundaries UTC,
    # independent of the database session timezone.
    bucket_expr = func.date_trunc(bucket, PackageUpdate.update_timestamp, "UTC").label("bucket")
    install = case((PackageUpdate.old_version.is_(None), 1), else_=0)
    kernel_filter = kernel_predicate(PackageUpdate.package_name)
    kernel = case((kernel_filter, 1), else_=0)
    stmt = (
        select(
            bucket_expr,
            func.count(PackageUpdate.id).label("updates"),
            func.sum(install).label("installs"),
            func.sum(case((PackageUpdate.old_version.is_not(None), 1), else_=0)).label("upgrades"),
            func.sum(case((PackageUpdate.is_security.is_(True), 1), else_=0)).label(
                "security_updates"
            ),
            func.sum(kernel).label("kernel_updates"),
        )
        .join(Host, PackageUpdate.host_id == Host.id)
        .where(
            Host.archived_at.is_(None),
        )
        .group_by(bucket_expr)
        .order_by(bucket_expr)
    )
    stmt = apply_update_filters(
        stmt,
        filters.model_copy(update={"from_date": from_date, "to_date": to_date}),
    )

    rows = (await session.execute(stmt)).all()
    return ActivityAnalyticsResponse(
        bucket=bucket,
        from_date=from_date,
        to_date=to_date,
        items=[
            {
                "bucket": as_utc(row.bucket),
                "updates": row.updates or 0,
                "installs": row.installs or 0,
                "upgrades": row.upgrades or 0,
                "security_updates": row.security_updates or 0,
                "kernel_updates": row.kernel_updates or 0,
            }
            for row in rows
        ],
    )
