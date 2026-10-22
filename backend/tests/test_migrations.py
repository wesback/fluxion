"""Migration contract tests for ingest query indexes."""

import importlib.util
import sqlite3
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

BACKEND_ROOT = Path(__file__).resolve().parents[1]
VERSIONS = BACKEND_ROOT / "alembic" / "versions"
MIGRATION = VERSIONS / "b1c2d3e4f5a6_add_ingest_query_indexes.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("ingest_query_indexes", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module



def _revision_ids() -> list[str]:
    return sorted(
        getattr(_load_migration(), "revision"),
        key=str,
    )


def _upgrade_indexes(database: Path) -> set[tuple[str, str, tuple[str, ...]]]:
    connection = sqlite3.connect(database)
    names = set()
    for (table_name,) in connection.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        for row in connection.execute(f'PRAGMA index_list("{table_name}")'):
            index_name = row[1]
            if index_name.startswith("sqlite_"):
                continue
            columns = tuple(
                column[2]
                for column in connection.execute(f'PRAGMA index_info("{index_name}")')
            )
            names.add((index_name, table_name, columns))
    connection.close()
    return names


def test_ingest_query_migration_records_and_uses_indexes(monkeypatch: pytest.MonkeyPatch) -> None:
    """AC: migration indexes and evidence are an exact one-to-one contract."""
    migration = _load_migration()
    assert set(migration.MIGRATION_INDEXES) == set(migration.INDEX_EVIDENCE)
    assert migration.revision == "b1c2d3e4f5a6"
    assert migration.down_revision == "4f6a2c1d9b77"

    existing = {
        ("ix_package_updates_package_name", ("package_name",)),
        ("ix_package_updates_update_timestamp", ("update_timestamp",)),
        ("ix_package_updates_host_id_update_timestamp", ("host_id", "update_timestamp")),
        ("ix_package_updates_package_name_update_timestamp", ("package_name", "update_timestamp")),
        ("ix_package_updates_is_security_update_timestamp", ("is_security", "update_timestamp")),
    }
    for name, (table, columns) in migration.MIGRATION_INDEXES.items():
        assert table == "package_updates"
        assert (name, tuple(columns)) not in existing

    evidence_path = BACKEND_ROOT.parent / "docs" / "evidence" / "backend-ingest-query-plans.md"
    evidence = evidence_path.read_text()
    for name in migration.MIGRATION_INDEXES:
        assert name in evidence

    database = BACKEND_ROOT.parent / "migration_contract.sqlite"
    if database.exists():
        database.unlink()
    engine = sa.create_engine(f"sqlite:///{database}")
    try:
        with engine.begin() as connection:
            connection.execute(sa.text("CREATE TABLE package_updates (host_id INTEGER, package_name TEXT, update_timestamp TEXT, package_manager TEXT, is_security INTEGER)"))
            connection.execute(sa.text("CREATE INDEX ix_package_updates_package_name ON package_updates (package_name)"))

            with monkeypatch.context() as patch:
                patch.setitem(migration.INDEX_EVIDENCE, "missing_evidence", "extra-row")
                with pytest.raises(RuntimeError, match="exactly one evidence row"):
                    migration._validate_contract(connection)

            with monkeypatch.context() as patch:
                removed_name = next(iter(migration.INDEX_EVIDENCE))
                patch.delitem(migration.INDEX_EVIDENCE, removed_name)
                with pytest.raises(RuntimeError, match="exactly one evidence row"):
                    migration._validate_contract(connection)

            with monkeypatch.context() as patch:
                patch.setitem(migration.MIGRATION_INDEXES, "ix_package_updates_package_name", ("package_updates", ("package_name",)))
                patch.setitem(migration.INDEX_EVIDENCE, "ix_package_updates_package_name", "duplicate-name")
                with pytest.raises(RuntimeError, match="duplicates an existing"):
                    migration._validate_contract(connection)

            connection.execute(sa.text("CREATE INDEX ix_duplicate_shape ON package_updates (package_name, host_id, update_timestamp)"))
            with monkeypatch.context() as patch:
                patch.setitem(migration.MIGRATION_INDEXES, "ix_duplicate_shape_test", ("package_updates", ("package_name", "host_id", "update_timestamp")))
                patch.setitem(migration.INDEX_EVIDENCE, "ix_duplicate_shape_test", "duplicate")
                with pytest.raises(RuntimeError, match="duplicates an existing package-update index columns"):
                    migration._validate_contract(connection)
    finally:
        engine.dispose()
        if database.exists():
            database.unlink()


def test_ingest_query_migration_upgrade(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC: upgrade creates exactly this migration's named package-update indexes."""
    migration = _load_migration()
    database = tmp_path / "upgrade.sqlite"
    engine = sa.create_engine(f"sqlite:///{database}")
    with engine.begin() as connection:
        connection.execute(sa.text(
            "CREATE TABLE package_updates (id INTEGER PRIMARY KEY, host_id INTEGER, "
            "package_name TEXT, package_manager TEXT, update_timestamp TEXT, is_security INTEGER)"
        ))
        connection.execute(sa.text("CREATE INDEX ix_package_updates_package_name ON package_updates (package_name)"))
        connection.execute(sa.text("CREATE INDEX ix_package_updates_update_timestamp ON package_updates (update_timestamp)"))
        connection.execute(sa.text("CREATE INDEX ix_package_updates_host_id_update_timestamp ON package_updates (host_id, update_timestamp)"))
        connection.execute(sa.text("CREATE INDEX ix_package_updates_package_name_update_timestamp ON package_updates (package_name, update_timestamp)"))
        connection.execute(sa.text("CREATE INDEX ix_package_updates_is_security_update_timestamp ON package_updates (is_security, update_timestamp)"))

        context = MigrationContext.configure(connection)
        operations = Operations(context)
        monkeypatch.setattr(migration, "op", operations)
        migration.upgrade()

    indexes = _upgrade_indexes(database)
    package_indexes = {
        (name, table, tuple(columns))
        for name, table, columns in indexes
        if table == "package_updates"
    }
    migration_indexes = {
        (name, table, tuple(columns))
        for name, (table, columns) in migration.MIGRATION_INDEXES.items()
    }
    assert migration_indexes <= package_indexes
    assert {name for name, _, _ in package_indexes if name.startswith("ix_package_updates_")} == {
        "ix_package_updates_package_name",
        "ix_package_updates_update_timestamp",
        "ix_package_updates_host_id_update_timestamp",
        "ix_package_updates_package_name_update_timestamp",
        "ix_package_updates_is_security_update_timestamp",
        *migration.MIGRATION_INDEXES.keys(),
    }
    for name, table, columns in migration_indexes:
        assert (name, table, columns) in package_indexes
    engine.dispose()


def test_ingest_query_migration_downgrade(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC: downgrade removes only migration indexes and preserves application rows."""
    migration = _load_migration()
    database = tmp_path / "downgrade.sqlite"
    engine = sa.create_engine(f"sqlite:///{database}")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE hosts (id INTEGER PRIMARY KEY, hostname TEXT NOT NULL)"))
        connection.execute(sa.text(
            "CREATE TABLE package_updates (id INTEGER PRIMARY KEY, host_id INTEGER, "
            "package_name TEXT, package_manager TEXT, update_timestamp TEXT)"
        ))
        connection.execute(sa.text("CREATE TABLE webhook_configs (id INTEGER PRIMARY KEY)"))
        connection.execute(sa.text("CREATE TABLE webhook_delivery_history (id INTEGER PRIMARY KEY)"))
        connection.execute(sa.text("CREATE TABLE outbox (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)"))
        connection.execute(sa.text("INSERT INTO hosts (hostname) VALUES ('host-a')"))
        connection.execute(sa.text("INSERT INTO package_updates (host_id, package_name) VALUES (1, 'openssl')"))
        connection.execute(sa.text("INSERT INTO webhook_configs DEFAULT VALUES"))
        connection.execute(sa.text("INSERT INTO webhook_delivery_history DEFAULT VALUES"))
        connection.execute(sa.text("INSERT INTO outbox (payload) VALUES ('delivery')"))
        for name, (table, columns) in migration.MIGRATION_INDEXES.items():
            connection.execute(sa.text(f"CREATE INDEX {name} ON {table} ({', '.join(columns)})"))

        context = MigrationContext.configure(connection)
        operations = Operations(context)
        monkeypatch.setattr(migration, "op", operations)
        migration.downgrade()

        remaining = _upgrade_indexes(database)
        for name in migration.MIGRATION_INDEXES:
            assert not any(index_name == name for index_name, _, _ in remaining)
        assert connection.execute(sa.text("SELECT hostname FROM hosts")).fetchall() == [("host-a",)]
        assert connection.execute(sa.text("SELECT package_name FROM package_updates")).fetchall() == [("openssl",)]
        assert connection.execute(sa.text("SELECT id FROM webhook_configs")).fetchall() == [(1,)]
        assert connection.execute(sa.text("SELECT id FROM webhook_delivery_history")).fetchall() == [(1,)]
        assert connection.execute(sa.text("SELECT id, payload FROM outbox")).fetchall() == [(1, "delivery")]
    engine.dispose()


def test_existing_migration_sequence_includes_new_head() -> None:
    """AC: the migration graph terminates at the documented new head."""
    migration_files = list(VERSIONS.glob("*.py"))
    revisions = {}
    for path in migration_files:
        spec = importlib.util.spec_from_file_location(path.stem, path)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        revisions[getattr(module, "revision", None)] = getattr(module, "down_revision", None)

    assert revisions["b1c2d3e4f5a6"] == "4f6a2c1d9b77"
    assert "4f6a2c1d9b77" in revisions
    heads = {revision for revision, parent in revisions.items() if revision != "__pycache__"}
    parents = {parent for parent in revisions.values() if isinstance(parent, str)}
    assert heads - parents == {"b1c2d3e4f5a6"}
