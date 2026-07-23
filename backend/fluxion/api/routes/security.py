"""Security feed, host health, and bounded export APIs."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.database import get_session
from fluxion.models import Host, PackageUpdate
from fluxion.schemas.query import (
    HostHealthItem,
    HostHealthResponse,
    SecurityFeedResponse,
    UpdateFilters,
)
from fluxion.services.export import export_rows
from fluxion.services.host_health import HostStatus, get_host_status
from fluxion.services.query_filters import apply_update_filters

router = APIRouter()


@router.get("/health/hosts", response_model=HostHealthResponse, summary="Get fleet host health")
@router.get("/hosts/health", response_model=HostHealthResponse, include_in_schema=False)
async def host_health(session: AsyncSession = Depends(get_session)) -> HostHealthResponse:
    """Return host liveness based only on the last package report."""
    update_counts = (
        select(PackageUpdate.host_id, func.count(PackageUpdate.id).label("total_updates"))
        .group_by(PackageUpdate.host_id)
        .subquery()
    )
    result = await session.execute(
        select(
            Host.hostname,
            Host.os_info,
            Host.last_seen,
            func.coalesce(update_counts.c.total_updates, 0).label("total_updates"),
        )
        .outerjoin(update_counts, Host.id == update_counts.c.host_id)
        .where(Host.archived_at.is_(None))
        .order_by(Host.last_seen.asc())
    )
    items = [
        HostHealthItem(
            hostname=row.hostname,
            os_info=row.os_info,
            last_seen=row.last_seen,
            total_updates=row.total_updates,
            status=get_host_status(row.last_seen).value,
        )
        for row in result.all()
    ]
    counts = {status.value: 0 for status in HostStatus}
    for item in items:
        counts[item.status] += 1
    return HostHealthResponse(
        items=items,
        total_hosts=len(items),
        healthy_hosts=counts[HostStatus.HEALTHY.value],
        stale_hosts=counts[HostStatus.STALE.value],
        missing_hosts=counts[HostStatus.MISSING.value],
    )


@router.get("/security", response_model=SecurityFeedResponse, summary="Get security update feed")
async def security_feed(
    filters: UpdateFilters = Depends(),
    session: AsyncSession = Depends(get_session),
) -> SecurityFeedResponse:
    """Return persisted security updates and fleet security aggregations."""
    filters = filters.model_copy(update={"is_security": True})
    base = select(
        Host.hostname,
        PackageUpdate.package_name,
        PackageUpdate.old_version,
        PackageUpdate.new_version,
        PackageUpdate.update_timestamp,
        PackageUpdate.is_security,
    ).join(Host, PackageUpdate.host_id == Host.id)
    filtered = apply_update_filters(base, filters)
    total = (
        await session.execute(select(func.count()).select_from(filtered.subquery()))
    ).scalar() or 0
    rows = (
        await session.execute(
            filtered.order_by(PackageUpdate.update_timestamp.desc())
            .limit(filters.limit)
            .offset(filters.offset)
        )
    ).mappings().all()

    now = datetime.now(UTC)
    updates_24h = await _count_security_updates(session, now - timedelta(hours=24))
    updates_7d = await _count_security_updates(session, now - timedelta(days=7))
    top_packages = await _top_security_packages(session)
    top_hosts = await _top_security_hosts(session)

    return SecurityFeedResponse(
        items=[
            {
                "hostname": update.hostname,
                "package_name": update.package_name,
                "old_version": update.old_version,
                "new_version": update.new_version,
                "update_timestamp": update.update_timestamp,
                "is_security": update.is_security,
            }
            for update in rows
        ],
        total=total,
        limit=filters.limit,
        offset=filters.offset,
        security_updates_last_24h=updates_24h,
        security_updates_last_7d=updates_7d,
        top_packages=top_packages,
        top_hosts=top_hosts,
    )


@router.get("/security/export", summary="Export security updates")
async def export_security_updates(
    format: Literal["csv", "json"] = Query("json"),
    filters: UpdateFilters = Depends(),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Export the filtered security feed, capped at 10,000 rows."""
    filters = filters.model_copy(update={"is_security": True})
    return await _export_updates(format, filters, session, "security-updates")


@router.get("/updates/export", summary="Export package updates")
async def export_updates(
    format: Literal["csv", "json"] = Query("json"),
    filters: UpdateFilters = Depends(),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Export filtered package updates, capped at 10,000 rows."""
    return await _export_updates(format, filters, session, "package-updates")


async def _export_updates(
    format: str,
    filters: UpdateFilters,
    session: AsyncSession,
    filename: str,
) -> Response:
    """Query and serialize a bounded update export."""
    stmt = apply_update_filters(
        select(
            Host.hostname,
            PackageUpdate.package_name,
            PackageUpdate.old_version,
            PackageUpdate.new_version,
            PackageUpdate.update_timestamp,
            PackageUpdate.is_security,
        ).join(Host, PackageUpdate.host_id == Host.id),
        filters,
    )
    rows = (
        await session.execute(
            stmt.order_by(PackageUpdate.update_timestamp.desc())
            .limit(filters.limit)
            .offset(filters.offset)
        )
    ).mappings().all()
    payload = export_rows(rows, format)
    extension = "csv" if format == "csv" else "json"
    return Response(
        content=payload.body,
        media_type=payload.content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}.{extension}"'},
    )


async def _count_security_updates(session: AsyncSession, cutoff: datetime) -> int:
    """Count security updates after a timestamp."""
    result = await session.execute(
        select(func.count(PackageUpdate.id))
        .join(Host, PackageUpdate.host_id == Host.id)
        .where(
            Host.archived_at.is_(None),
            PackageUpdate.is_security.is_(True),
            PackageUpdate.update_timestamp >= cutoff,
        )
    )
    return result.scalar() or 0


async def _top_security_packages(session: AsyncSession) -> list[dict[str, int | str]]:
    result = await session.execute(
        select(PackageUpdate.package_name, func.count(PackageUpdate.id).label("count"))
        .join(Host, PackageUpdate.host_id == Host.id)
        .where(Host.archived_at.is_(None), PackageUpdate.is_security.is_(True))
        .group_by(PackageUpdate.package_name)
        .order_by(func.count(PackageUpdate.id).desc())
        .limit(10)
    )
    return [{"package": row.package_name, "count": row.count} for row in result.all()]


async def _top_security_hosts(session: AsyncSession) -> list[dict[str, int | str]]:
    result = await session.execute(
        select(Host.hostname, func.count(PackageUpdate.id).label("count"))
        .join(PackageUpdate, Host.id == PackageUpdate.host_id)
        .where(Host.archived_at.is_(None), PackageUpdate.is_security.is_(True))
        .group_by(Host.hostname)
        .order_by(func.count(PackageUpdate.id).desc())
        .limit(10)
    )
    return [{"hostname": row.hostname, "count": row.count} for row in result.all()]
