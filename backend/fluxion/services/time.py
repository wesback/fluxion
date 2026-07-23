"""UTC boundary helpers for API query semantics."""

from datetime import UTC, datetime


def as_utc(value: datetime) -> datetime:
    """Normalize aware or naive API datetimes to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
