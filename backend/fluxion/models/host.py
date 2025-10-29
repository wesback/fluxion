"""Host model for tracking Linux hosts."""

from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Host(Base):
    """Model for tracking Linux hosts that report package updates."""

    __tablename__ = "hosts"

    id: Mapped[int] = mapped_column(primary_key=True)
    hostname: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    os_info: Mapped[str] = mapped_column(Text, nullable=False)
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationship to package updates
    package_updates: Mapped[list["PackageUpdate"]] = relationship(
        "PackageUpdate", back_populates="host", cascade="all, delete-orphan"
    )

    # Index on hostname for fast lookups
    __table_args__ = (Index("ix_hosts_hostname", "hostname"),)

    def __repr__(self) -> str:
        return f"<Host(id={self.id}, hostname='{self.hostname}')>"
