"""Add archived host identities, package-manager metadata, and ingest diagnostics.

Revision ID: 4f6a2c1d9b77
Revises: 7c9d1f4e2a11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4f6a2c1d9b77"
down_revision: str | Sequence[str] | None = "7c9d1f4e2a11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add fields and server-observed diagnostics."""
    op.add_column("hosts", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("package_updates", sa.Column("package_manager", sa.String(length=32), nullable=True))

    # The original hostname constraint prevented a new identity after archival.
    with op.batch_alter_table("hosts") as batch:
        batch.drop_constraint("hosts_hostname_key", type_="unique")
    op.create_index(
        "ix_hosts_active_hostname",
        "hosts",
        ["hostname"],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL"),
        sqlite_where=sa.text("archived_at IS NULL"),
    )

    op.create_table(
        "ingest_diagnostics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("package_manager", sa.String(length=32), nullable=True),
        sa.Column("package_count", sa.Integer(), nullable=False),
        sa.Column("accepted_count", sa.Integer(), nullable=False),
        sa.Column("rejected_count", sa.Integer(), nullable=False),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ingest_diagnostics_received_at",
        "ingest_diagnostics",
        ["received_at"],
        unique=False,
    )
    op.create_index(
        "ix_ingest_diagnostics_package_manager",
        "ingest_diagnostics",
        ["package_manager"],
        unique=False,
    )


def downgrade() -> None:
    """Remove diagnostics and restore the legacy hostname constraint."""
    op.drop_index("ix_ingest_diagnostics_package_manager", table_name="ingest_diagnostics")
    op.drop_index("ix_ingest_diagnostics_received_at", table_name="ingest_diagnostics")
    op.drop_table("ingest_diagnostics")
    op.drop_index("ix_hosts_active_hostname", table_name="hosts")
    with op.batch_alter_table("hosts") as batch:
        batch.create_unique_constraint("hosts_hostname_key", ["hostname"])
    op.drop_column("package_updates", "package_manager")
    op.drop_column("hosts", "archived_at")
