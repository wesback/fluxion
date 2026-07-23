"""Webhook configuration models for sending notifications on package updates."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class WebhookConfig(Base):
    """Model for webhook configuration."""

    __tablename__ = "webhook_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    event_types: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    headers_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        Index("ix_webhook_configs_enabled", "enabled"),
    )

    def __repr__(self) -> str:
        return (
            f"<WebhookConfig(id={self.id}, name='{self.name}', "
            f"url='{self.url}', enabled={self.enabled})>"
        )


class WebhookDeliveryHistory(Base):
    """Model for tracking webhook delivery attempts."""

    __tablename__ = "webhook_delivery_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    webhook_config_id: Mapped[int] = mapped_column(
        ForeignKey("webhook_configs.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    delivered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        Index("ix_webhook_delivery_history_webhook_config_id", "webhook_config_id"),
        Index("ix_webhook_delivery_history_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<WebhookDeliveryHistory(id={self.id}, webhook_config_id={self.webhook_config_id}, "
            f"event_type='{self.event_type}', status_code={self.status_code}, "
            f"attempt={self.attempt_number})>"
        )


class IngestDiagnostic(Base):
    """Server-observed aggregate for an ingest request."""

    __tablename__ = "ingest_diagnostics"

    id: Mapped[int] = mapped_column(primary_key=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="webhook")
    package_manager: Mapped[str | None] = mapped_column(String(32), nullable=True)
    package_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    accepted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False, default="accepted")

    __table_args__ = (
        Index("ix_ingest_diagnostics_received_at", "received_at"),
        Index("ix_ingest_diagnostics_package_manager", "package_manager"),
    )
