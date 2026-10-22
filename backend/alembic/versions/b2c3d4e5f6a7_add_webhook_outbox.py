"""Add durable webhook outbox state.

Revision ID: b2c3d4e5f6a7
Revises: b1c2d3e4f5a6
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OUTBOX_COLUMNS = {
    "delivery_id", "webhook_config_id", "event_type", "payload", "status",
    "attempt_count", "next_attempt_at", "lease_owner", "lease_expires_at",
    "created_at", "updated_at",
}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("package_updates"):
        package_columns = {column["name"] for column in inspector.get_columns("package_updates")}
        if "delivery_id" not in package_columns:
            op.add_column("package_updates", sa.Column("delivery_id", sa.String(length=255), nullable=True))

    op.create_table(
        "webhook_delivery_identities",
        sa.Column("delivery_id", sa.String(length=255), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("delivery_id"),
    )
    op.create_table(
        "webhook_outbox",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("delivery_id", sa.String(length=255), nullable=False),
        sa.Column("webhook_config_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_owner", sa.String(length=255), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["webhook_config_id"], ["webhook_configs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("delivery_id", name="uq_webhook_outbox_delivery_id"),
    )
    op.create_index("ix_webhook_outbox_status", "webhook_outbox", ["status"], unique=False)
    op.create_index("ix_webhook_outbox_next_attempt_at", "webhook_outbox", ["next_attempt_at"], unique=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("package_updates"):
        package_columns = {column["name"] for column in inspector.get_columns("package_updates")}
        if "delivery_id" in package_columns:
            op.drop_column("package_updates", "delivery_id")
    op.drop_index("ix_webhook_outbox_next_attempt_at", table_name="webhook_outbox")
    op.drop_index("ix_webhook_outbox_status", table_name="webhook_outbox")
    op.drop_table("webhook_outbox")
    op.drop_table("webhook_delivery_identities")
