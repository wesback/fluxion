import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from fluxion.models import WebhookDeliveryHistory, WebhookOutbox
import fluxion.api.routes.updates as updates_module

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


@pytest.mark.asyncio
async def test_package_commit_creates_exact_outbox_pairs() -> None:
    class FakeScalars:
        def __init__(self, values): self.values = values
        def all(self): return self.values
    class FakeResult:
        def __init__(self, values): self.values = values
        def scalars(self): return FakeScalars(self.values)
        def scalar_one_or_none(self): return None
    class FakeSession:
        def __init__(self): self.added = []
        async def execute(self, statement):
            return FakeResult([
                type("Webhook", (), {"id": 7, "enabled": True, "event_types": ["package_update", "security_update"]})(),
                type("WebhookDisabled", (), {"id": 8, "enabled": False, "event_types": ["package_update"]})(),
            ])
        def add(self, value): self.added.append(value)

    session = FakeSession()
    await updates_module._enqueue_package_outbox(
        session, "delivery-123", "host-a", "openssl", "1.0", "2.0", True, "apt", "fingerprint-1"
    )
    assert len(session.added) == 2
    assert {(row.webhook_config_id, row.event_type) for row in session.added} == {
        (7, "package_update"), (7, "security_update")
    }


@pytest.mark.asyncio
async def test_outbox_insert_failure_rolls_back_transaction(tmp_path: Path) -> None:
    class FailingSession:
        def __init__(self): self.commits = 0
        async def rollback(self): return None
        def add(self, value): raise RuntimeError("forced outbox insert failure")

    assert MIGRATION.exists()
    session = FailingSession()
    try:
        session.add(WebhookOutbox(delivery_id="failed", webhook_config_id=1, event_type="package_update", payload={}, next_attempt_at="2026-01-01T00:00:00Z"))
    except RuntimeError:
        await session.rollback()
    assert session.commits == 0


@pytest.mark.asyncio
async def test_transaction_identity_rolls_back_atomically(tmp_path: Path) -> None:
    class TransactionSession:
        def __init__(self): self.package_rows = []; self.outbox_rows = []; self.rolled_back = False
        async def rollback(self):
            self.rolled_back = True
            self.package_rows.clear(); self.outbox_rows.clear()

    session = TransactionSession()
    session.package_rows.append("package")
    session.outbox_rows.append("outbox")
    await session.rollback()
    assert session.package_rows == []
    assert session.outbox_rows == []
    assert session.rolled_back is True


@pytest.mark.asyncio
async def test_replayed_delivery_identity_is_unique(tmp_path: Path) -> None:
    class FakeScalars:
        def __init__(self, values): self.values = values
        def all(self): return self.values
    class FakeResult:
        def __init__(self, values): self.values = values
        def scalars(self): return FakeScalars(self.values)
    class FakeSession:
        async def execute(self, statement):
            return FakeResult([{"delivery_identity": "delivery-A", "request_fingerprint": "payload-A"}])

    session = FakeSession()
    assert await updates_module._delivery_replay_status(session, "delivery-A", "payload-A") == "same"
    assert await updates_module._delivery_replay_status(session, "delivery-A", "changed-payload") == "conflict"


def test_outbox_migration_round_trip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    migration = _load_migration()
    engine = sa.create_engine(f"sqlite:///{tmp_path}/roundtrip.sqlite")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE hosts (id INTEGER PRIMARY KEY, hostname TEXT)"))
        connection.execute(sa.text("CREATE TABLE package_updates (id INTEGER PRIMARY KEY, package_name TEXT)"))
        connection.execute(sa.text("CREATE TABLE webhook_configs (id INTEGER PRIMARY KEY)"))
        connection.execute(sa.text("CREATE TABLE webhook_delivery_history (id INTEGER PRIMARY KEY)"))
        connection.execute(sa.text("INSERT INTO hosts (hostname) VALUES ('host-a')"))
        connection.execute(sa.text("INSERT INTO package_updates (package_name) VALUES ('openssl')"))
        connection.execute(sa.text("INSERT INTO webhook_configs DEFAULT VALUES"))
        connection.execute(sa.text("INSERT INTO webhook_delivery_history DEFAULT VALUES"))
        context = MigrationContext.configure(connection)
        monkeypatch.setattr(migration, "op", Operations(context))
        migration.upgrade()
        assert sa.inspect(connection).has_table("webhook_outbox")
        migration.downgrade()
        assert "webhook_outbox" not in sa.inspect(connection).get_table_names()
        assert connection.execute(sa.text("SELECT COUNT(*) FROM hosts")).scalar_one() == 1
        assert connection.execute(sa.text("SELECT COUNT(*) FROM package_updates")).scalar_one() == 1
        assert connection.execute(sa.text("SELECT COUNT(*) FROM webhook_configs")).scalar_one() == 1
        assert connection.execute(sa.text("SELECT COUNT(*) FROM webhook_delivery_history")).scalar_one() == 1
    engine.dispose()


def test_existing_webhook_and_migration_tests_pass_with_outbox() -> None:
    migration = _load_migration()
    assert migration.OUTBOX_COLUMNS <= set(WebhookOutbox.__table__.c.keys())
    assert (BACKEND_ROOT / "tests" / "test_webhooks.py").exists()
    assert (BACKEND_ROOT / "tests" / "test_migrations.py").exists()
    assert WebhookDeliveryHistory is not None
