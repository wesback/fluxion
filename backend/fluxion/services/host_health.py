"""Host liveness and fleet health semantics."""

from datetime import UTC, datetime, timedelta
from enum import StrEnum

HOST_STALE_AFTER_DAYS = 30
HOST_MISSING_AFTER_DAYS = 365


class HostStatus(StrEnum):
    """Status derived solely from package-report ``last_seen`` activity."""

    HEALTHY = "healthy"
    STALE = "stale"
    MISSING = "missing"


def get_host_status(last_seen: datetime | None, now: datetime | None = None) -> HostStatus:
    """Return healthy through 30d, stale through 365d, missing after 365d."""
    if last_seen is None:
        return HostStatus.MISSING
    reference = now or datetime.now(UTC)
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=UTC)
    age = reference - last_seen
    if age > timedelta(days=HOST_MISSING_AFTER_DAYS):
        return HostStatus.MISSING
    if age > timedelta(days=HOST_STALE_AFTER_DAYS):
        return HostStatus.STALE
    return HostStatus.HEALTHY
