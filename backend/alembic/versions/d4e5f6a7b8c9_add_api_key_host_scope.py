"""Add host authorization scope to API keys.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "api_keys",
        sa.Column("host_scope", sa.String(length=20), nullable=False, server_default="listed"),
    )
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, allowed_hosts FROM api_keys")).fetchall()
    for key_id, hosts in rows:
        if isinstance(hosts, str):
            hosts = __import__("json").loads(hosts)
        scope = "all" if not hosts else "listed"
        connection.execute(
            sa.text("UPDATE api_keys SET host_scope = :scope WHERE id = :key_id"),
            {"scope": scope, "key_id": key_id},
        )


def downgrade() -> None:
    op.drop_column("api_keys", "host_scope")
