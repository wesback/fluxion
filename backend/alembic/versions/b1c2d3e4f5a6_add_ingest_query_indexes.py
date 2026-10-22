"""Add measured package-update ingest query indexes.

Revision ID: b1c2d3e4f5a6
Revises: 4f6a2c1d9b77
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.engine import Connection

from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | Sequence[str] | None = "4f6a2c1d9b77"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MIGRATION_INDEXES: dict[str, tuple[str, tuple[str, ...]]] = {
    "ix_package_updates_host_id_package_name_update_timestamp": (
        "package_updates",
        ("host_id", "package_name", "update_timestamp"),
    ),
    "ix_package_updates_package_name_host_id_update_timestamp": (
        "package_updates",
        ("package_name", "host_id", "update_timestamp"),
    ),
    "ix_package_updates_package_manager_update_timestamp": (
        "package_updates",
        ("package_manager", "update_timestamp"),
    ),
}

INDEX_EVIDENCE = {
    "ix_package_updates_host_id_package_name_update_timestamp": "host-package-history",
    "ix_package_updates_package_name_host_id_update_timestamp": "package-host-history",
    "ix_package_updates_package_manager_update_timestamp": "ingest-manager-analytics",
}


def _validate_contract(bind: Connection) -> None:
    if set(MIGRATION_INDEXES) != set(INDEX_EVIDENCE):
        raise RuntimeError("Every migration index must have exactly one evidence row")

    inspector = sa.inspect(bind)
    existing_names: set[str] = set()
    existing_columns: set[tuple[str, ...]] = set()
    for table_name in inspector.get_table_names():
        for index in inspector.get_indexes(table_name):
            index_name = index["name"]
            if index_name:
                existing_names.add(index_name)
            if table_name == "package_updates":
                existing_columns.add(tuple(index["column_names"] or []))

    migration_columns: list[tuple[str, ...]] = []
    for name, (table, columns) in MIGRATION_INDEXES.items():
        if table != "package_updates":
            raise RuntimeError(f"Index {name} has an unsupported table")
        if name in existing_names:
            raise RuntimeError(f"Index {name} duplicates an existing package-update index name")
        if columns in existing_columns:
            raise RuntimeError(f"Index {name} duplicates an existing package-update index columns")
        if columns in migration_columns:
            raise RuntimeError(f"Index {name} duplicates another migration index columns")
        migration_columns.append(columns)


def upgrade() -> None:
    """Create only measured, non-duplicate package-update indexes."""
    bind = op.get_bind()
    _validate_contract(bind)

    for name, (table, columns) in MIGRATION_INDEXES.items():
        op.create_index(name, table, list(columns), unique=False)


def downgrade() -> None:
    """Remove only indexes created by this migration."""
    for name in reversed(tuple(MIGRATION_INDEXES)):
        op.drop_index(name, table_name="package_updates")
