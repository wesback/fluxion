"""Authorized diagnostics and weekly retention maintenance APIs."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fluxion.config import settings
from fluxion.database import get_session
from fluxion.models import IngestDiagnostic, WebhookConfig, WebhookDeliveryHistory
from fluxion.schemas.analytics import (
    IngestDiagnosticsResponse,
    RetentionMaintenanceRequest,
    RetentionMaintenanceResponse,
    WebhookCoverageItem,
    WebhookCoverageResponse,
)
from fluxion.services.retention import run_retention

router = APIRouter()


def _window(days: int) -> tuple[datetime, datetime]:
    """Return a bounded UTC diagnostics window."""
    to_date = datetime.now(UTC)
    return to_date - timedelta(days=days), to_date


@router.get(
    "/admin/diagnostics/ingest",
    response_model=IngestDiagnosticsResponse,
    summary="Get redacted server-observed ingest diagnostics",
)
@router.get(
    "/admin/ingest/diagnostics",
    response_model=IngestDiagnosticsResponse,
    include_in_schema=False,
)
async def ingest_diagnostics(
    days: int = Query(7, ge=1, le=365),
    session: AsyncSession = Depends(get_session),
) -> IngestDiagnosticsResponse:
    """Return aggregate ingest counters only; no agent-provided diagnostics are exposed."""
    from_date, to_date = _window(days)
    filters = [
        IngestDiagnostic.received_at >= from_date,
        IngestDiagnostic.received_at <= to_date,
    ]
    aggregate = (
        await session.execute(
            select(
                func.count(IngestDiagnostic.id).label("requests"),
                func.coalesce(func.sum(IngestDiagnostic.package_count), 0).label("received"),
                func.coalesce(func.sum(IngestDiagnostic.accepted_count), 0).label("accepted"),
                func.coalesce(func.sum(IngestDiagnostic.rejected_count), 0).label("rejected"),
            ).where(*filters)
        )
    ).one()
    manager_rows = (
        await session.execute(
            select(
                func.coalesce(IngestDiagnostic.package_manager, "unknown"),
                func.count(IngestDiagnostic.id),
            )
            .where(*filters)
            .group_by(IngestDiagnostic.package_manager)
        )
    ).all()
    outcome_rows = (
        await session.execute(
            select(IngestDiagnostic.outcome, func.count(IngestDiagnostic.id))
            .where(*filters)
            .group_by(IngestDiagnostic.outcome)
        )
    ).all()
    return IngestDiagnosticsResponse(
        from_date=from_date,
        to_date=to_date,
        requests=aggregate.requests,
        packages_received=aggregate.received,
        packages_accepted=aggregate.accepted,
        packages_rejected=aggregate.rejected,
        by_package_manager={str(row[0]): row[1] for row in manager_rows},
        by_outcome={row[0]: row[1] for row in outcome_rows},
    )


@router.get(
    "/admin/diagnostics/webhooks",
    response_model=WebhookCoverageResponse,
    summary="Get redacted webhook coverage aggregates",
)
@router.get(
    "/admin/webhook-coverage",
    response_model=WebhookCoverageResponse,
    include_in_schema=False,
)
async def webhook_coverage(
    days: int = Query(7, ge=1, le=365),
    session: AsyncSession = Depends(get_session),
) -> WebhookCoverageResponse:
    """Aggregate configured and delivered event types without exposing webhook secrets."""
    from_date, to_date = _window(days)
    configs = (
        await session.execute(
            select(WebhookConfig.event_types).where(WebhookConfig.enabled.is_(True))
        )
    ).all()
    configured: dict[str, int] = {}
    for row in configs:
        for event_type in row[0] or []:
            configured[event_type] = configured.get(event_type, 0) + 1
    history = (
        await session.execute(
            select(
                WebhookDeliveryHistory.event_type,
                func.count(WebhookDeliveryHistory.id).label("attempted"),
                func.sum(
                    case(
                        (
                            WebhookDeliveryHistory.status_code.between(200, 299),
                            1,
                        ),
                        else_=0,
                    )
                ).label("delivered"),
            )
            .where(
                WebhookDeliveryHistory.created_at >= from_date,
                WebhookDeliveryHistory.created_at <= to_date,
            )
            .group_by(WebhookDeliveryHistory.event_type)
        )
    ).all()
    event_types = set(configured)
    event_types.update(row.event_type for row in history)
    by_event = {row.event_type: row for row in history}
    items = []
    for event_type in sorted(event_types):
        row = by_event.get(event_type)
        attempted = row.attempted if row else 0
        delivered = row.delivered if row and row.delivered else 0
        items.append(
            WebhookCoverageItem(
                event_type=event_type,
                configured=configured.get(event_type, 0),
                attempted=attempted,
                delivered=delivered,
                failed=attempted - delivered,
            )
        )
    return WebhookCoverageResponse(from_date=from_date, to_date=to_date, items=items)


@router.post(
    "/maintenance/retention",
    response_model=RetentionMaintenanceResponse,
    summary="Run bounded retention maintenance",
)
@router.post(
    "/admin/maintenance/retention",
    response_model=RetentionMaintenanceResponse,
)
async def retention_maintenance(
    request: RetentionMaintenanceRequest,
    session: AsyncSession = Depends(get_session),
) -> RetentionMaintenanceResponse:
    """Run bounded retention using the Helm JSON contract for both histories."""
    retention_days = request.retention_days
    result = await run_retention(
        session,
        package_update_retention_days=retention_days,
        webhook_history_retention_days=retention_days,
        batch_size=settings.retention_batch_size,
    )
    await session.commit()
    return RetentionMaintenanceResponse(
        **result,
        package_update_retention_days=retention_days,
        webhook_history_retention_days=retention_days,
    )
