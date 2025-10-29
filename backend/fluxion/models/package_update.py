"""PackageUpdate model for tracking package updates on hosts."""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class PackageUpdate(Base):
    """Model for tracking package updates on Linux hosts."""

    __tablename__ = "package_updates"

    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int] = mapped_column(
        ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False
    )
    package_name: Mapped[str] = mapped_column(String(255), nullable=False)
    old_version: Mapped[str | None] = mapped_column(String(255), nullable=True)
    new_version: Mapped[str] = mapped_column(String(255), nullable=False)
    update_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    # Relationship to host
    host: Mapped["Host"] = relationship("Host", back_populates="package_updates")

    # Indexes for efficient queries
    __table_args__ = (
        Index("ix_package_updates_package_name", "package_name"),
        Index("ix_package_updates_update_timestamp", "update_timestamp"),
        # Composite indexes for efficient queries
        Index("ix_package_updates_host_id_update_timestamp", "host_id", "update_timestamp"),
        Index(
            "ix_package_updates_package_name_update_timestamp",
            "package_name",
            "update_timestamp",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<PackageUpdate(id={self.id}, host_id={self.host_id}, "
            f"package='{self.package_name}', version='{self.old_version}'->{self.new_version}')>"
        )
