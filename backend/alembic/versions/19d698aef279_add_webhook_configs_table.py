"""add_webhook_configs_table

Revision ID: 19d698aef279
Revises: 02a374743c78
Create Date: 2025-11-01 06:26:53.548663

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '19d698aef279'
down_revision: Union[str, Sequence[str], None] = '02a374743c78'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create webhook_configs table
    op.create_table(
        'webhook_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('event_types', sa.JSON(), nullable=False),
        sa.Column('headers_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_webhook_configs_enabled', 'webhook_configs', ['enabled'], unique=False)

    # Create webhook_delivery_history table for debugging
    op.create_table(
        'webhook_delivery_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('webhook_config_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=True),
        sa.Column('response_body', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['webhook_config_id'], ['webhook_configs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(
        'ix_webhook_delivery_history_webhook_config_id',
        'webhook_delivery_history',
        ['webhook_config_id'],
        unique=False
    )
    op.create_index(
        'ix_webhook_delivery_history_created_at',
        'webhook_delivery_history',
        ['created_at'],
        unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop webhook_delivery_history table and its indexes
    op.drop_index('ix_webhook_delivery_history_created_at', table_name='webhook_delivery_history')
    op.drop_index('ix_webhook_delivery_history_webhook_config_id', table_name='webhook_delivery_history')
    op.drop_table('webhook_delivery_history')

    # Drop webhook_configs table and its indexes
    op.drop_index('ix_webhook_configs_enabled', table_name='webhook_configs')
    op.drop_table('webhook_configs')
