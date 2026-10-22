"""Add exact allowed hostnames to API keys.

Revision ID: 20261022allowedhosts
Revises: b1c2d3e4f5a6
"""
from alembic import op
import sqlalchemy as sa

revision = "20261022allowedhosts"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("api_keys", sa.Column("allowed_hosts", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("api_keys", "allowed_hosts")
