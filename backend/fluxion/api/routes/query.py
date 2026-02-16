"""API routes for query and analytics endpoints."""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
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
    summary="List all hosts",
    description="Get a list of all hosts with metadata, sorted by last_seen descending",
)
async def list_hosts(
    session: AsyncSession = Depends(get_session),
) -> HostListResponse:
    """
    List all hosts with metadata.

    Returns hosts sorted by last_seen timestamp in descending order (most recent first).

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
                span.set_attribute("endpoint", "list_hosts")
                return await _list_hosts_impl(session)
        else:
            return await _list_hosts_impl(session)
    except Exception as e:
        logger.error(f"Error listing hosts: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve hosts",
        ) from e


async def _list_hosts_impl(session: AsyncSession) -> HostListResponse:
    """Implementation of list hosts with query optimization."""
    # Get all hosts with total update count
    # Using a subquery to count updates per host
    update_count_subquery = (
        select(
            PackageUpdate.host_id,
            func.count(PackageUpdate.id).label("update_count"),
        )
        .group_by(PackageUpdate.host_id)
        .subquery()
    )

    # Join hosts with update counts
    stmt = (
        select(
            Host.hostname,
            Host.os_info,
            Host.last_seen,
            func.coalesce(update_count_subquery.c.update_count, 0).label("total_updates"),
        )
        .outerjoin(update_count_subquery, Host.id == update_count_subquery.c.host_id)
        .order_by(Host.last_seen.desc())
    )

    result = await session.execute(stmt)
    hosts = result.all()

    return HostListResponse(
        items=[
            {
                "hostname": row.hostname,
                "os_info": row.os_info,
                "last_seen": row.last_seen,
                "total_updates": row.total_updates,
            }
            for row in hosts
        ]
    )


@router.get(
    "/hosts/{hostname}/updates",
    response_model=HostUpdatesResponse,
    summary="Get update history for specific host",
    description="Get paginated update history for a specific host with optional date filtering",
)
async def get_host_updates(
    hostname: str,
    limit: int = Query(50, ge=1, le=1000, description="Maximum number of results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    from_date: datetime | None = Query(
        None, description="Filter updates from this date (ISO8601 UTC)"
    ),
    to_date: datetime | None = Query(None, description="Filter updates to this date (ISO8601 UTC)"),
    session: AsyncSession = Depends(get_session),
) -> HostUpdatesResponse:
    """
    Get update history for a specific host with pagination.

    Args:
        hostname: Hostname to get updates for
        limit: Maximum number of results (default 50, max 1000)
        offset: Number of results to skip (default 0)
        from_date: Optional start date filter (ISO8601 UTC)
        to_date: Optional end date filter (ISO8601 UTC)
        session: Database session (injected)

    Returns:
        HostUpdatesResponse with paginated updates

    Raises:
        HTTPException: 404 if host not found, 500 if database error
    """
    tracer = get_tracer()

    # Validate date range if both dates are provided
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_date must be before to_date",
        )

    try:
        if tracer:
            with tracer.start_as_current_span("get_host_updates") as span:
                span.set_attribute("endpoint", "get_host_updates")
                span.set_attribute("hostname", hostname)
                span.set_attribute("limit", limit)
                span.set_attribute("offset", offset)
                return await _get_host_updates_impl(
                    hostname, limit, offset, from_date, to_date, session
                )
        else:
            return await _get_host_updates_impl(
                hostname, limit, offset, from_date, to_date, session
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting host updates for {hostname}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve host updates",
        ) from e


async def _get_host_updates_impl(
    hostname: str,
    limit: int,
    offset: int,
    from_date: datetime | None,
    to_date: datetime | None,
    session: AsyncSession,
) -> HostUpdatesResponse:
    """Implementation of get host updates with query optimization."""
    # First, verify the host exists
    host_result = await session.execute(select(Host).where(Host.hostname == hostname))
    host = host_result.scalar_one_or_none()

    if not host:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Host '{hostname}' not found",
        )

    # Build base query for updates
    base_query = select(PackageUpdate).where(PackageUpdate.host_id == host.id)

    # Apply date filters if provided
    if from_date:
        base_query = base_query.where(PackageUpdate.update_timestamp >= from_date)
    if to_date:
        base_query = base_query.where(PackageUpdate.update_timestamp <= to_date)

    # Get total count with filters (optimized - no ORDER BY or LIMIT)
    count_query = (
        select(func.count(PackageUpdate.id))
        .where(PackageUpdate.host_id == host.id)
    )
    if from_date:
        count_query = count_query.where(PackageUpdate.update_timestamp >= from_date)
    if to_date:
        count_query = count_query.where(PackageUpdate.update_timestamp <= to_date)

    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Get paginated results sorted by timestamp descending
    query = base_query.order_by(PackageUpdate.update_timestamp.desc()).limit(limit).offset(offset)

    result = await session.execute(query)
    updates = result.scalars().all()

    return HostUpdatesResponse(
        items=[
            {
                "package_name": update.package_name,
                "old_version": update.old_version,
                "new_version": update.new_version,
                "update_timestamp": update.update_timestamp,
            }
            for update in updates
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/packages/{package_name}/hosts",
    response_model=PackageHostsResponse,
    summary="Get hosts with specific package",
    description="Get list of hosts that have installed a specific package with version information. Supports partial/wildcard matching (case-insensitive).",
)
async def get_package_hosts(
    package_name: str,
    session: AsyncSession = Depends(get_session),
) -> PackageHostsResponse:
    """
    Get hosts that have installed a specific package.

    Returns the latest version of the package installed on each host.
    Performs case-insensitive partial matching on package names.

    Args:
        package_name: Name or partial name of the package to search for (e.g., 'nginx', 'lib', 'python')
        session: Database session (injected)

    Returns:
        PackageHostsResponse with list of hosts and their package versions

    Raises:
        HTTPException: 500 if there's a database error
    """
    tracer = get_tracer()

    try:
        if tracer:
            with tracer.start_as_current_span("get_package_hosts") as span:
                span.set_attribute("endpoint", "get_package_hosts")
                span.set_attribute("package_name", package_name)
                return await _get_package_hosts_impl(package_name, session)
        else:
            return await _get_package_hosts_impl(package_name, session)
    except Exception as e:
        logger.error(f"Error getting hosts for package {package_name}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve package hosts",
        ) from e


async def _get_package_hosts_impl(
    package_name: str, session: AsyncSession
) -> PackageHostsResponse:
    """Implementation of get package hosts with query optimization."""
    # Get the latest update for this package on each host
    # Using a window function to get the most recent update per host
    # Support wildcard search: use ILIKE for case-insensitive pattern matching
    # Escape SQL wildcard characters in user input to prevent pattern injection
    escaped_name = package_name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    latest_update_subquery = (
        select(
            PackageUpdate.host_id,
            PackageUpdate.package_name,
            PackageUpdate.new_version,
            PackageUpdate.update_timestamp,
            func.row_number()
            .over(
                partition_by=PackageUpdate.host_id,
                order_by=PackageUpdate.update_timestamp.desc(),
            )
            .label("rn"),
        )
        .where(PackageUpdate.package_name.ilike(f"%{escaped_name}%"))
        .subquery()
    )

    # Filter to only get the most recent update (rn = 1) and join with hosts
    stmt = (
        select(
            Host.hostname,
            latest_update_subquery.c.package_name,
            latest_update_subquery.c.new_version,
            latest_update_subquery.c.update_timestamp,
        )
        .join(latest_update_subquery, Host.id == latest_update_subquery.c.host_id)
        .where(latest_update_subquery.c.rn == 1)
        .order_by(Host.hostname)
    )

    result = await session.execute(stmt)
    hosts = result.all()

    return PackageHostsResponse(
        items=[
            {
                "hostname": row.hostname,
                "package_name": row.package_name,
                "current_version": row.new_version,
                "last_updated": row.update_timestamp,
            }
            for row in hosts
        ]
    )


@router.get(
    "/updates/recent",
    response_model=RecentUpdatesResponse,
    summary="Get recent updates",
    description="Get recent updates across all hosts with configurable time window",
)
async def get_recent_updates(
    limit: int = Query(20, ge=1, le=1000, description="Maximum number of results to return"),
    hours: int = Query(24, ge=1, le=168, description="Number of hours to look back (max 168 = 7d)"),
    session: AsyncSession = Depends(get_session),
) -> RecentUpdatesResponse:
    """
    Get recent updates across all hosts.

    Args:
        limit: Maximum number of results (default 20, max 1000)
        hours: Number of hours to look back (default 24, max 168)
        session: Database session (injected)

    Returns:
        RecentUpdatesResponse with list of recent updates

    Raises:
        HTTPException: 500 if there's a database error
    """
    tracer = get_tracer()

    try:
        if tracer:
            with tracer.start_as_current_span("get_recent_updates") as span:
                span.set_attribute("endpoint", "get_recent_updates")
                span.set_attribute("limit", limit)
                span.set_attribute("hours", hours)
                return await _get_recent_updates_impl(limit, hours, session)
        else:
            return await _get_recent_updates_impl(limit, hours, session)
    except Exception as e:
        logger.error(f"Error getting recent updates: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve recent updates",
        ) from e


async def _get_recent_updates_impl(
    limit: int, hours: int, session: AsyncSession
) -> RecentUpdatesResponse:
    """Implementation of get recent updates with query optimization."""
    # Calculate cutoff time
    cutoff_time = datetime.now(UTC) - timedelta(hours=hours)

    # Get recent updates with host information
    stmt = (
        select(
            Host.hostname,
            PackageUpdate.package_name,
            PackageUpdate.old_version,
            PackageUpdate.new_version,
            PackageUpdate.update_timestamp,
        )
        .join(Host, PackageUpdate.host_id == Host.id)
        .where(PackageUpdate.update_timestamp >= cutoff_time)
        .order_by(PackageUpdate.update_timestamp.desc())
        .limit(limit)
    )

    result = await session.execute(stmt)
    updates = result.all()

    return RecentUpdatesResponse(
        items=[
            {
                "hostname": row.hostname,
                "package_name": row.package_name,
                "old_version": row.old_version,
                "new_version": row.new_version,
                "timestamp": row.update_timestamp,
            }
            for row in updates
        ]
    )


@router.get(
    "/stats",
    response_model=StatsResponse,
    summary="Get dashboard statistics",
    description="Get comprehensive statistics for dashboard including top packages and hosts",
)
async def get_stats(
    session: AsyncSession = Depends(get_session),
) -> StatsResponse:
    """
    Get dashboard statistics.

    Returns comprehensive statistics including:
    - Total number of hosts
    - Total number of updates
    - Updates in the last 24 hours
    - Updates in the last 7 days
    - Top 10 most updated packages
    - Top 10 most active hosts

    Args:
        session: Database session (injected)

    Returns:
        StatsResponse with dashboard statistics

    Raises:
        HTTPException: 500 if there's a database error
    """
    tracer = get_tracer()

    try:
        if tracer:
            with tracer.start_as_current_span("get_stats") as span:
                span.set_attribute("endpoint", "get_stats")
                return await _get_stats_impl(session)
        else:
            return await _get_stats_impl(session)
    except Exception as e:
        logger.error(f"Error getting statistics: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve statistics",
        ) from e


async def _get_stats_impl(session: AsyncSession) -> StatsResponse:
    """Implementation of get stats with query optimization."""
    # Get total hosts
    total_hosts_result = await session.execute(select(func.count(Host.id)))
    total_hosts = total_hosts_result.scalar() or 0

    # Get total updates
    total_updates_result = await session.execute(select(func.count(PackageUpdate.id)))
    total_updates = total_updates_result.scalar() or 0

    # Get updates in last 24 hours
    cutoff_24h = datetime.now(UTC) - timedelta(hours=24)
    updates_24h_result = await session.execute(
        select(func.count(PackageUpdate.id)).where(
            PackageUpdate.update_timestamp >= cutoff_24h
        )
    )
    updates_last_24h = updates_24h_result.scalar() or 0

    # Get updates in last 7 days
    cutoff_7d = datetime.now(UTC) - timedelta(days=7)
    updates_7d_result = await session.execute(
        select(func.count(PackageUpdate.id)).where(PackageUpdate.update_timestamp >= cutoff_7d)
    )
    updates_last_7d = updates_7d_result.scalar() or 0

    # Get top 10 most updated packages
    top_packages_stmt = (
        select(
            PackageUpdate.package_name,
            func.count(PackageUpdate.id).label("count"),
        )
        .group_by(PackageUpdate.package_name)
        .order_by(func.count(PackageUpdate.id).desc())
        .limit(10)
    )
    top_packages_result = await session.execute(top_packages_stmt)
    top_packages = top_packages_result.all()

    # Get top 10 most active hosts
    top_hosts_stmt = (
        select(
            Host.hostname,
            func.count(PackageUpdate.id).label("count"),
        )
        .join(PackageUpdate, Host.id == PackageUpdate.host_id)
        .group_by(Host.hostname)
        .order_by(func.count(PackageUpdate.id).desc())
        .limit(10)
    )
    top_hosts_result = await session.execute(top_hosts_stmt)
    top_hosts = top_hosts_result.all()

    return StatsResponse(
        total_hosts=total_hosts,
        total_updates=total_updates,
        updates_last_24h=updates_last_24h,
        updates_last_7d=updates_last_7d,
        most_updated_packages=[
            {"package": row.package_name, "count": row.count} for row in top_packages
        ],
        most_active_hosts=[{"hostname": row.hostname, "count": row.count} for row in top_hosts],
    )
