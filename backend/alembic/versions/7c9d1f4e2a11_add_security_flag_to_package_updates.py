"""Persist package update security classification.

Revision ID: 7c9d1f4e2a11
Revises: 19d698aef279
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7c9d1f4e2a11"
down_revision: str | Sequence[str] | None = "19d698aef279"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add a non-null, backward-compatible security flag."""
    op.add_column(
        "package_updates",
        sa.Column("is_security", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "ix_package_updates_is_security_update_timestamp",
        "package_updates",
        ["is_security", "update_timestamp"],
        unique=False,
    )
    op.alter_column("package_updates", "is_security", server_default=None)


def downgrade() -> None:
    """Remove the security flag and its index."""
    op.drop_index(
        "ix_package_updates_is_security_update_timestamp",
        table_name="package_updates",
    )
    op.drop_column("package_updates", "is_security")
