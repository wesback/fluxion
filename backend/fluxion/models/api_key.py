"""API Key model for authentication."""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from fluxion.models.base import Base


class APIKey(Base):
    """
    API key for authentication.

    Attributes:
        id: Primary key
        key_hash: Bcrypt hash of the API key
        name: Human-readable name/description of the key
        created_at: Timestamp when the key was created
        last_used: Timestamp when the key was last used (nullable)
        is_active: Whether the key is active (can be deactivated without deletion)
        role: Role of the API key (e.g., "user", "admin")
    """

    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key_hash: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    last_used: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="user", index=True
    )

    def __repr__(self) -> str:
        """String representation of APIKey."""
        return (
            f"<APIKey(id={self.id}, name='{self.name}', role='{self.role}', "
            f"is_active={self.is_active})>"
        )
