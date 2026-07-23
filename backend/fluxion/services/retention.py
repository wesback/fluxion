"""Bounded retention maintenance for package and webhook histories."""

from datetime import UTC, datetime, timedelta

MIN_RETENTION_DAYS = 365


def retention_cutoff(retention_days: int, *, now: datetime | None = None) -> datetime:
    """Return a timezone-aware UTC cutoff for a retention period."""
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    return current.astimezone(UTC) - timedelta(days=retention_days)


async def delete_package_updates(
    session,
    cutoff: datetime,
    *,
    batch_size: int = 1000,
) -> int:
    """Delete old package updates in bounded batches."""
    from sqlalchemy import delete, select

    from fluxion.models import PackageUpdate

    deleted = 0
    while True:
        ids = (
            await session.execute(
                select(PackageUpdate.id)
                .where(PackageUpdate.update_timestamp < cutoff)
                .order_by(PackageUpdate.id)
                .limit(batch_size)
            )
        ).scalars().all()
        if not ids:
            break
        await session.execute(delete(PackageUpdate).where(PackageUpdate.id.in_(ids)))
        await session.flush()
        deleted += len(ids)
        if len(ids) < batch_size:
            break
    return deleted


async def delete_webhook_history(
    session,
    cutoff: datetime,
    *,
    batch_size: int = 1000,
) -> int:
    """Delete old webhook delivery history separately from package history."""
    from sqlalchemy import delete, select

    from fluxion.models import WebhookDeliveryHistory

    deleted = 0
    while True:
        ids = (
            await session.execute(
                select(WebhookDeliveryHistory.id)
                .where(WebhookDeliveryHistory.created_at < cutoff)
                .order_by(WebhookDeliveryHistory.id)
                .limit(batch_size)
            )
        ).scalars().all()
        if not ids:
            break
        await session.execute(
            delete(WebhookDeliveryHistory).where(WebhookDeliveryHistory.id.in_(ids))
        )
        await session.flush()
        deleted += len(ids)
        if len(ids) < batch_size:
            break
    return deleted


async def run_retention(
    session,
    *,
    package_update_retention_days: int,
    webhook_history_retention_days: int,
    batch_size: int = 1000,
    now: datetime | None = None,
) -> dict[str, int]:
    """Run package-update and webhook-history retention as explicit operations."""
    for retention_days in (
        package_update_retention_days,
        webhook_history_retention_days,
    ):
        if retention_days < MIN_RETENTION_DAYS:
            raise ValueError(f"retention_days must be at least {MIN_RETENTION_DAYS}")
    return {
        "package_updates_deleted": await delete_package_updates(
            session,
            retention_cutoff(package_update_retention_days, now=now),
            batch_size=batch_size,
        ),
        "webhook_history_deleted": await delete_webhook_history(
            session,
            retention_cutoff(webhook_history_retention_days, now=now),
            batch_size=batch_size,
        ),
    }
