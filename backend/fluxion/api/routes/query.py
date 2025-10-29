"""API routes for query and analytics endpoints."""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.database import get_session
from fluxion.models import Host, PackageUpdate
from fluxion.schemas.query import (
    HostListResponse,
    HostUpdatesResponse,
    PackageHostsResponse,
    RecentUpdatesResponse,
    StatsResponse,
)
from fluxion.telemetry import get_tracer

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/hosts",
    response_model=HostListResponse,
    status_code=status.HTTP_200_OK,
    summary="List all hosts",
    description="Get a list of all hosts with metadata, sorted by last_seen desc by default",
)
async def list_hosts(
    session: AsyncSession = Depends(get_session),
) -> HostListResponse:
    """
    List all hosts with their metadata.

    Args:
        session: Database session (injected)

    Returns:
        HostListResponse with list of hosts and their metadata

    Raises:
        HTTPException: 500 if there's a database error
    """
    tracer = get_tracer()

    try:
        if tracer:
            with tracer.start_as_current_span("list_hosts") as span:
                return await _list_hosts_impl(session, span)
        else:
            return await _list_hosts_impl(session, None)
    except Exception as e:
        logger.error(f"Error listing hosts: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list hosts",
        ) from e


async def _list_hosts_impl(session: AsyncSession, span) -> HostListResponse:
    """Implementation of list hosts with tracing."""
    # Query hosts with count of their package updates
    stmt = (
        select(
            Host,
            func.count(PackageUpdate.id).label("total_updates"),
        )
        .outerjoin(PackageUpdate, Host.id == PackageUpdate.host_id)
        .group_by(Host.id)
        .order_by(desc(Host.last_seen))
    )

    result = await session.execute(stmt)
    rows = result.all()

    if span:
        span.set_attribute("host_count", len(rows))

    # Convert to response format
    from fluxion.schemas.query import HostInfo

    items = [
        HostInfo(
            hostname=row.Host.hostname,
            os_info=row.Host.os_info,
            last_seen=row.Host.last_seen,
            total_updates=row.total_updates,
        )
        for row in rows
    ]

    return HostListResponse(items=items, total=len(items))


@router.get(
    "/hosts/{hostname}/updates",
    response_model=HostUpdatesResponse,
    status_code=status.HTTP_200_OK,
    summary="Get host update history",
    description="Get update history for a specific host with pagination and filtering",
)
async def get_host_updates(
    hostname: str,
    limit: int = Query(default=50, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(default=0, ge=0, description="Number of results to skip"),
    from_date: datetime | None = Query(default=None, description="Filter updates from this date"),
    to_date: datetime | None = Query(default=None, description="Filter updates to this date"),
    session: AsyncSession = Depends(get_session),
) -> HostUpdatesResponse:
    """
    Get update history for a specific host.

    Args:
        hostname: Hostname to get updates for
        limit: Maximum number of results (default 50)
        offset: Number of results to skip (default 0)
        from_date: Optional filter for updates from this date
        to_date: Optional filter for updates to this date
        session: Database session (injected)

    Returns:
        HostUpdatesResponse with paginated update history

    Raises:
        HTTPException: 404 if host not found, 500 if there's a database error
    """
    tracer = get_tracer()

    try:
        if tracer:
            with tracer.start_as_current_span("get_host_updates") as span:
                span.set_attribute("hostname", hostname)
                span.set_attribute("limit", limit)
                span.set_attribute("offset", offset)
                return await _get_host_updates_impl(
                    hostname, limit, offset, from_date, to_date, session, span
                )
        else:
            return await _get_host_updates_impl(
                hostname, limit, offset, from_date, to_date, session, None
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting host updates: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get host updates",
        ) from e


async def _get_host_updates_impl(
    hostname: str,
    limit: int,
    offset: int,
    from_date: datetime | None,
    to_date: datetime | None,
    session: AsyncSession,
    span,
) -> HostUpdatesResponse:
    """Implementation of get host updates with tracing."""
    # First, verify the host exists
    host_result = await session.execute(select(Host).where(Host.hostname == hostname))
    host = host_result.scalar_one_or_none()

    if not host:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Host '{hostname}' not found",
        )

    # Build query for package updates
    stmt = select(PackageUpdate).where(PackageUpdate.host_id == host.id)

    # Apply date filters
    if from_date:
        stmt = stmt.where(PackageUpdate.update_timestamp >= from_date)
    if to_date:
        stmt = stmt.where(PackageUpdate.update_timestamp <= to_date)

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply ordering and pagination
    stmt = stmt.order_by(desc(PackageUpdate.update_timestamp)).limit(limit).offset(offset)

    # Execute query
    result = await session.execute(stmt)
    updates = result.scalars().all()

    if span:
        span.set_attribute("total_updates", total)
        span.set_attribute("returned_updates", len(updates))

    # Convert to response format
    from fluxion.schemas.query import PackageUpdateInfo

    items = [
        PackageUpdateInfo(
            package_name=update.package_name,
            old_version=update.old_version,
            new_version=update.new_version,
            update_timestamp=update.update_timestamp,
        )
        for update in updates
    ]

    return HostUpdatesResponse(items=items, total=total, limit=limit, offset=offset)


@router.get(
    "/packages/{package_name}/hosts",
    response_model=PackageHostsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get hosts with package installed",
    description="Get list of hosts that have installed this package with latest version",
)
async def get_package_hosts(
    package_name: str,
    session: AsyncSession = Depends(get_session),
) -> PackageHostsResponse:
    """
    Get which hosts have installed a specific package.

    Args:
        package_name: Name of the package to query
        session: Database session (injected)

    Returns:
        PackageHostsResponse with list of hosts and their current versions

    Raises:
        HTTPException: 500 if there's a database error
    """
    tracer = get_tracer()

    try:
        if tracer:
            with tracer.start_as_current_span("get_package_hosts") as span:
                span.set_attribute("package_name", package_name)
                return await _get_package_hosts_impl(package_name, session, span)
        else:
            return await _get_package_hosts_impl(package_name, session, None)
    except Exception as e:
        logger.error(f"Error getting package hosts: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get package hosts",
        ) from e


async def _get_package_hosts_impl(
    package_name: str, session: AsyncSession, span
) -> PackageHostsResponse:
    """Implementation of get package hosts with tracing."""
    # Subquery to get the latest update for each host for this package
    subq = (
        select(
            PackageUpdate.host_id,
            func.max(PackageUpdate.update_timestamp).label("max_timestamp"),
        )
        .where(PackageUpdate.package_name == package_name)
        .group_by(PackageUpdate.host_id)
        .subquery()
    )

    # Join to get the actual update records with latest version
    stmt = (
        select(Host.hostname, PackageUpdate.new_version, PackageUpdate.update_timestamp)
        .select_from(Host)
        .join(PackageUpdate, Host.id == PackageUpdate.host_id)
        .join(
            subq,
            (PackageUpdate.host_id == subq.c.host_id)
            & (PackageUpdate.update_timestamp == subq.c.max_timestamp),
        )
        .where(PackageUpdate.package_name == package_name)
        .order_by(Host.hostname)
    )

    result = await session.execute(stmt)
    rows = result.all()

    if span:
        span.set_attribute("host_count", len(rows))

    # Convert to response format
    from fluxion.schemas.query import PackageHostInfo

    items = [
        PackageHostInfo(
            hostname=row.hostname,
            current_version=row.new_version,
            last_updated=row.update_timestamp,
        )
        for row in rows
    ]

    return PackageHostsResponse(items=items, total=len(items))


@router.get(
    "/updates/recent",
    response_model=RecentUpdatesResponse,
    status_code=status.HTTP_200_OK,
    summary="Get recent updates",
    description="Get recent package updates across all hosts",
)
async def get_recent_updates(
    limit: int = Query(default=20, ge=1, le=1000, description="Maximum number of results"),
    hours: int = Query(default=24, ge=1, le=168, description="Hours to look back (max 7 days)"),
    session: AsyncSession = Depends(get_session),
) -> RecentUpdatesResponse:
    """
    Get recent package updates across all hosts.

    Args:
        limit: Maximum number of results (default 20)
        hours: Hours to look back (default 24, max 168)
        session: Database session (injected)

    Returns:
        RecentUpdatesResponse with recent updates

    Raises:
        HTTPException: 500 if there's a database error
    """
    tracer = get_tracer()

    try:
        if tracer:
            with tracer.start_as_current_span("get_recent_updates") as span:
                span.set_attribute("limit", limit)
                span.set_attribute("hours", hours)
                return await _get_recent_updates_impl(limit, hours, session, span)
        else:
            return await _get_recent_updates_impl(limit, hours, session, None)
    except Exception as e:
        logger.error(f"Error getting recent updates: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get recent updates",
        ) from e


async def _get_recent_updates_impl(
    limit: int, hours: int, session: AsyncSession, span
) -> RecentUpdatesResponse:
    """Implementation of get recent updates with tracing."""
    # Calculate cutoff time
    cutoff_time = datetime.now(UTC) - timedelta(hours=hours)

    # Query recent updates with host information
    stmt = (
        select(
            Host.hostname,
            PackageUpdate.package_name,
            PackageUpdate.old_version,
            PackageUpdate.new_version,
            PackageUpdate.update_timestamp,
        )
        .select_from(PackageUpdate)
        .join(Host, PackageUpdate.host_id == Host.id)
        .where(PackageUpdate.update_timestamp >= cutoff_time)
        .order_by(desc(PackageUpdate.update_timestamp))
        .limit(limit)
    )

    result = await session.execute(stmt)
    rows = result.all()

    if span:
        span.set_attribute("update_count", len(rows))

    # Convert to response format
    from fluxion.schemas.query import RecentUpdateInfo

    items = [
        RecentUpdateInfo(
            hostname=row.hostname,
            package_name=row.package_name,
            old_version=row.old_version,
            new_version=row.new_version,
            timestamp=row.update_timestamp,
        )
        for row in rows
    ]

    return RecentUpdatesResponse(items=items, total=len(items))


@router.get(
    "/stats",
    response_model=StatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get dashboard statistics",
    description="Get overall statistics for the dashboard",
)
async def get_stats(
    session: AsyncSession = Depends(get_session),
) -> StatsResponse:
    """
    Get dashboard statistics.

    Args:
        session: Database session (injected)

    Returns:
        StatsResponse with various statistics

    Raises:
        HTTPException: 500 if there's a database error
    """
    tracer = get_tracer()

    try:
        if tracer:
            with tracer.start_as_current_span("get_stats") as span:
                return await _get_stats_impl(session, span)
        else:
            return await _get_stats_impl(session, None)
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get stats",
        ) from e


async def _get_stats_impl(session: AsyncSession, span) -> StatsResponse:
    """Implementation of get stats with tracing."""
    # Get total hosts count
    total_hosts_result = await session.execute(select(func.count(Host.id)))
    total_hosts = total_hosts_result.scalar_one()

    # Get total updates count
    total_updates_result = await session.execute(select(func.count(PackageUpdate.id)))
    total_updates = total_updates_result.scalar_one()

    # Get updates in last 24 hours
    cutoff_24h = datetime.now(UTC) - timedelta(hours=24)
    updates_24h_result = await session.execute(
        select(func.count(PackageUpdate.id)).where(
            PackageUpdate.update_timestamp >= cutoff_24h
        )
    )
    updates_last_24h = updates_24h_result.scalar_one()

    # Get updates in last 7 days
    cutoff_7d = datetime.now(UTC) - timedelta(days=7)
    updates_7d_result = await session.execute(
        select(func.count(PackageUpdate.id)).where(PackageUpdate.update_timestamp >= cutoff_7d)
    )
    updates_last_7d = updates_7d_result.scalar_one()

    # Get most updated packages (top 10)
    most_updated_packages_stmt = (
        select(
            PackageUpdate.package_name,
            func.count(PackageUpdate.id).label("count"),
        )
        .group_by(PackageUpdate.package_name)
        .order_by(desc("count"))
        .limit(10)
    )
    packages_result = await session.execute(most_updated_packages_stmt)
    packages_rows = packages_result.all()

    # Get most active hosts (top 10)
    most_active_hosts_stmt = (
        select(
            Host.hostname,
            func.count(PackageUpdate.id).label("count"),
        )
        .select_from(Host)
        .join(PackageUpdate, Host.id == PackageUpdate.host_id)
        .group_by(Host.hostname)
        .order_by(desc("count"))
        .limit(10)
    )
    hosts_result = await session.execute(most_active_hosts_stmt)
    hosts_rows = hosts_result.all()

    if span:
        span.set_attribute("total_hosts", total_hosts)
        span.set_attribute("total_updates", total_updates)

    # Convert to response format
    from fluxion.schemas.query import HostCount, PackageCount

    return StatsResponse(
        total_hosts=total_hosts,
        total_updates=total_updates,
        updates_last_24h=updates_last_24h,
        updates_last_7d=updates_last_7d,
        most_updated_packages=[
            PackageCount(package=row.package_name, count=row.count) for row in packages_rows
        ],
        most_active_hosts=[HostCount(hostname=row.hostname, count=row.count) for row in hosts_rows],
    )
