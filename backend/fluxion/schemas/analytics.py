"""Schemas for bounded analytics, fleet, diagnostics, and maintenance APIs."""

from datetime import datetime

from pydantic import BaseModel, Field


class ActivityBucket(BaseModel):
    """One UTC time bucket of aggregated update activity."""

    bucket: datetime
    updates: int
    installs: int
    upgrades: int
    security_updates: int
    kernel_updates: int


class ActivityAnalyticsResponse(BaseModel):
    """Time-bucketed update activity without raw-row serialization."""

    bucket: str
    from_date: datetime
    to_date: datetime
    items: list[ActivityBucket]


class KernelFleetItem(BaseModel):
    """Latest kernel package observed for one host."""

    hostname: str
    os_info: str
    kernel_package: str | None
    kernel_version: str | None
    last_updated: datetime | None
    update_age_seconds: int | None
    is_security: bool


class KernelFleetResponse(BaseModel):
    """Kernel inventory across active host identities."""

    items: list[KernelFleetItem]
    total_hosts: int


class IngestDiagnosticsResponse(BaseModel):
    """Redacted server-observed ingest aggregates."""

    from_date: datetime
    to_date: datetime
    requests: int
    packages_received: int
    packages_accepted: int
    packages_rejected: int
    by_package_manager: dict[str, int]
    by_outcome: dict[str, int]


class WebhookCoverageItem(BaseModel):
    """Aggregated webhook delivery coverage by event."""

    event_type: str
    configured: int
    attempted: int
    delivered: int
    failed: int


class WebhookCoverageResponse(BaseModel):
    """Redacted webhook coverage aggregates."""

    from_date: datetime
    to_date: datetime
    items: list[WebhookCoverageItem]


class RetentionMaintenanceRequest(BaseModel):
    """Helm-compatible retention maintenance request."""

    retention_days: int = Field(ge=365, le=3650)


class RetentionMaintenanceResponse(BaseModel):
    """Counts from one bounded retention execution."""

    package_updates_deleted: int = Field(ge=0)
    webhook_history_deleted: int = Field(ge=0)
    package_update_retention_days: int
    webhook_history_retention_days: int
