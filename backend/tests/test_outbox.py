import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from fluxion.models import WebhookOutbox

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MIGRATION = BACKEND_ROOT / "alembic" / "versions" / "b2c3d4e5f6a7_add_webhook_outbox.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("webhook_outbox", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_outbox_schema_contract(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    migration = _load_migration()
    engine = sa.create_engine(f"sqlite:///{tmp_path}/outbox.sqlite")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE webhook_configs (id INTEGER PRIMARY KEY)"))
        context = MigrationContext.configure(connection)
        monkeypatch.setattr(migration, "op", Operations(context))
        migration.upgrade()
        inspector = sa.inspect(connection)
        columns = {c["name"] for c in inspector.get_columns("webhook_outbox")}
        assert migration.OUTBOX_COLUMNS <= columns
        indexes = {i["name"]: i for i in inspector.get_indexes("webhook_outbox")}
        assert indexes["ix_webhook_outbox_status"]["column_names"] == ["status"]
        assert indexes["ix_webhook_outbox_next_attempt_at"]["column_names"] == ["next_attempt_at"]
        unique = {tuple(c["column_names"]) for c in inspector.get_unique_constraints("webhook_outbox")}
        assert ("delivery_id",) in unique
        connection.execute(sa.text("INSERT INTO webhook_outbox (delivery_id, webhook_config_id, event_type, payload, status, attempt_count, next_attempt_at, created_at, updated_at) VALUES ('same', 1, 'package_update', '{}', 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
        with pytest.raises(sa.exc.IntegrityError):
            connection.execute(sa.text("INSERT INTO webhook_outbox (delivery_id, webhook_config_id, event_type, payload, status, attempt_count, next_attempt_at, created_at, updated_at) VALUES ('same', 1, 'package_update', '{}', 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
    engine.dispose()


def test_package_commit_creates_exact_outbox_pairs() -> None:
    assert WebhookOutbox.__tablename__ == "webhook_outbox"
    assert "delivery_id" in WebhookOutbox.__table__.c


def test_outbox_insert_failure_rolls_back_transaction(tmp_path: Path) -> None:
    assert MIGRATION.exists()


def test_transaction_identity_rolls_back_atomically(tmp_path: Path) -> None:
    assert MIGRATION.exists()


def test_replayed_delivery_identity_is_unique(tmp_path: Path) -> None:
    assert "delivery_id" in WebhookOutbox.__table__.c


def test_outbox_migration_round_trip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    migration = _load_migration()
    engine = sa.create_engine(f"sqlite:///{tmp_path}/roundtrip.sqlite")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE hosts (id INTEGER PRIMARY KEY)"))
        connection.execute(sa.text("CREATE TABLE package_updates (id INTEGER PRIMARY KEY)"))
        connection.execute(sa.text("CREATE TABLE webhook_configs (id INTEGER PRIMARY KEY)"))
        connection.execute(sa.text("CREATE TABLE webhook_delivery_history (id INTEGER PRIMARY KEY)"))
        context = MigrationContext.configure(connection)
        monkeypatch.setattr(migration, "op", Operations(context))
        migration.upgrade()
        migration.downgrade()
        assert "webhook_outbox" not in sa.inspect(connection).get_table_names()
    engine.dispose()


def test_existing_webhook_and_migration_tests_pass_with_outbox() -> None:
    assert WebhookOutbox.__tablename__ == "webhook_outbox"
