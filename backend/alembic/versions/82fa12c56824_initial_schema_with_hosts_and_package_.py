"""Initial schema with hosts and package_updates tables

Revision ID: 82fa12c56824
Revises:
Create Date: 2025-10-29 12:15:02.942408

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '82fa12c56824'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create hosts table
    op.create_table(
        'hosts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('hostname', sa.String(length=255), nullable=False),
        sa.Column('os_info', sa.Text(), nullable=False),
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('hostname')
    )
    # Create index on hostname
    op.create_index('ix_hosts_hostname', 'hosts', ['hostname'], unique=False)

    # Create package_updates table
    op.create_table(
        'package_updates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('host_id', sa.Integer(), nullable=False),
        sa.Column('package_name', sa.String(length=255), nullable=False),
        sa.Column('old_version', sa.String(length=255), nullable=True),
        sa.Column('new_version', sa.String(length=255), nullable=False),
        sa.Column('update_timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['host_id'], ['hosts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    # Create individual indexes
    op.create_index(
        "ix_package_updates_package_name", "package_updates", ["package_name"], unique=False
    )
    op.create_index(
        "ix_package_updates_update_timestamp",
        "package_updates",
        ["update_timestamp"],
        unique=False,
    )

    # Create composite indexes for efficient queries
    op.create_index(
        "ix_package_updates_host_id_update_timestamp",
        "package_updates",
        ["host_id", "update_timestamp"],
        unique=False,
    )
    op.create_index(
        "ix_package_updates_package_name_update_timestamp",
        "package_updates",
        ["package_name", "update_timestamp"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop package_updates table and its indexes
    op.drop_index(
        "ix_package_updates_package_name_update_timestamp", table_name="package_updates"
    )
    op.drop_index("ix_package_updates_host_id_update_timestamp", table_name="package_updates")
    op.drop_index("ix_package_updates_update_timestamp", table_name="package_updates")
    op.drop_index("ix_package_updates_package_name", table_name="package_updates")
    op.drop_table("package_updates")

    # Drop hosts table and its indexes
    op.drop_index("ix_hosts_hostname", table_name="hosts")
    op.drop_table("hosts")
