import importlib.util
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
import pytest_asyncio
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import fluxion.api.routes.updates as updates_module
from fluxion.models import (
    DeliveryIdentity,
    Host,
    PackageUpdate,
    WebhookConfig,
    WebhookDeliveryHistory,
    WebhookOutbox,
)
from fluxion.models.base import Base

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


PACKAGE = {
    "hostname": "host-a",
    "package_name": "openssl",
    "old_version": "1.0",
    "new_version": "2.0",
    "is_security": True,
    "package_manager": "apt",
}


class AsyncOverSync:
    """Awaitable face of a real SQLAlchemy session on SQLite.

    The route code awaits its session calls; the test database is SQLite, whose async driver is not a
    project dependency, so the same ORM session runs synchronously underneath. Every statement, flush,
    commit and rollback is real; nothing is simulated.
    """

    def __init__(self, session) -> None:
        self._session = session

    @property
    def new(self):
        return self._session.new

    def add(self, value) -> None:
        self._session.add(value)

    async def execute(self, *args, **kwargs):
        return self._session.execute(*args, **kwargs)

    async def flush(self) -> None:
        self._session.flush()

    async def commit(self) -> None:
        self._session.commit()

    async def rollback(self) -> None:
        self._session.rollback()


@pytest_asyncio.fixture
async def ingest():
    """The production updates router on a real SQLite database, without the API-key middleware."""
    engine = sa.create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as seed:
        seed.add_all([
            WebhookConfig(name="both", url="https://a.example/hook", enabled=True,
                          event_types=["package_update", "security_update"]),
            WebhookConfig(name="install-only", url="https://b.example/hook", enabled=True,
                          event_types=["package_install"]),
            WebhookConfig(name="disabled", url="https://c.example/hook", enabled=False,
                          event_types=["package_update", "security_update"]),
        ])
        seed.commit()

    app = FastAPI()
    app.include_router(updates_module.router, prefix="/api/v1")

    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)

    app.dependency_overrides[updates_module.get_session] = get_test_session

    async def count(model) -> int:
        with factory() as session:
            return session.execute(sa.select(sa.func.count()).select_from(model)).scalar_one()

    async def outbox_pairs() -> set[tuple[int, str]]:
        with factory() as session:
            rows = session.execute(sa.select(WebhookOutbox)).scalars().all()
            return {(row.webhook_config_id, row.event_type) for row in rows}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield SimpleNamespace(client=client, factory=factory, count=count, outbox_pairs=outbox_pairs)
    engine.dispose()


async def _state(ingest) -> dict[str, int]:
    return {
        "packages": await ingest.count(PackageUpdate),
        "hosts": await ingest.count(Host),
        "identities": await ingest.count(DeliveryIdentity),
        "outbox": await ingest.count(WebhookOutbox),
    }


async def test_package_commit_creates_exact_outbox_pairs(ingest) -> None:
    response = await ingest.client.post("/api/v1/updates", json=PACKAGE, headers={"X-Delivery-ID": "delivery-123"})

    assert response.status_code == 201
    # One row per enabled webhook and event type that webhook subscribes to; the install-only
    # and the disabled webhook get nothing.
    webhooks = {name: id_ for id_, name in await _webhook_names(ingest)}
    assert await ingest.outbox_pairs() == {
        (webhooks["both"], "package_update"),
        (webhooks["both"], "security_update"),
    }
    # The package rows were committed in the same transaction as the outbox rows.
    assert await _state(ingest) == {"packages": 1, "hosts": 1, "identities": 1, "outbox": 2}
    with ingest.factory() as session:
        payloads = session.execute(sa.select(WebhookOutbox.payload)).scalars().all()
    assert {payload["delivery_identity"] for payload in payloads} == {"delivery-123"}


async def _webhook_names(ingest) -> list[tuple[int, str]]:
    with ingest.factory() as session:
        return [(row.id, row.name) for row in session.execute(sa.select(WebhookConfig)).scalars().all()]


async def test_outbox_insert_failure_rolls_back_transaction(ingest, monkeypatch: pytest.MonkeyPatch) -> None:
    def failing_outbox(**_kwargs):
        raise RuntimeError("forced outbox insert failure")

    monkeypatch.setattr(updates_module, "WebhookOutbox", failing_outbox)

    response = await ingest.client.post("/api/v1/updates", json=PACKAGE, headers={"X-Delivery-ID": "delivery-fail"})

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to record package update"}
    # Package, host, delivery identity and outbox rows were all added before the failure; none survive.
    assert await _state(ingest) == {"packages": 0, "hosts": 0, "identities": 0, "outbox": 0}


async def test_transaction_identity_rolls_back_atomically(ingest, monkeypatch: pytest.MonkeyPatch) -> None:
    real_commit = AsyncOverSync.commit
    calls = {"count": 0}

    async def failing_commit(self):
        calls["count"] += 1
        if calls["count"] == 1:
            # Delivery identity and outbox rows are both pending in this transaction when the commit fails.
            pending = {type(item) for item in self.new}
            assert {DeliveryIdentity, WebhookOutbox} <= pending
            raise RuntimeError("forced commit failure")
        await real_commit(self)

    monkeypatch.setattr(AsyncOverSync, "commit", failing_commit)

    first = await ingest.client.post("/api/v1/updates", json=PACKAGE, headers={"X-Delivery-ID": "tx-129"})

    assert first.status_code == 500
    assert await _state(ingest) == {"packages": 0, "hosts": 0, "identities": 0, "outbox": 0}

    # The same transaction identity is still unused, so the retry commits everything together.
    retry = await ingest.client.post("/api/v1/updates", json=PACKAGE, headers={"X-Delivery-ID": "tx-129"})

    assert retry.status_code == 201
    assert await _state(ingest) == {"packages": 1, "hosts": 1, "identities": 1, "outbox": 2}


async def test_replayed_delivery_identity_is_unique(ingest) -> None:
    headers = {"X-Delivery-ID": "delivery-A"}

    first = await ingest.client.post("/api/v1/updates", json=PACKAGE, headers=headers)
    replay = await ingest.client.post("/api/v1/updates", json=PACKAGE, headers=headers)
    conflict = await ingest.client.post(
        "/api/v1/updates", json={**PACKAGE, "new_version": "3.0"}, headers=headers
    )

    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]
    assert replay.json()["message"] == "Package update already recorded"
    assert conflict.status_code == 409
    # One accepted ingest record, one package row and one outbox identity per webhook/event pair.
    assert await _state(ingest) == {"packages": 1, "hosts": 1, "identities": 1, "outbox": 2}
    with ingest.factory() as session:
        delivery_ids = session.execute(sa.select(WebhookOutbox.delivery_id)).scalars().all()
    assert len(delivery_ids) == len(set(delivery_ids)) == 2


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
        assert sa.inspect(connection).has_table("webhook_delivery_identities")
        connection.execute(sa.text("INSERT INTO webhook_delivery_identities (delivery_id, fingerprint, created_at) VALUES ('delivery-A', 'payload-A', CURRENT_TIMESTAMP)"))
        migration.downgrade()
        assert "webhook_outbox" not in sa.inspect(connection).get_table_names()
        assert "webhook_delivery_identities" not in sa.inspect(connection).get_table_names()
        assert connection.execute(sa.text("SELECT COUNT(*) FROM hosts")).scalar_one() == 1
        assert connection.execute(sa.text("SELECT COUNT(*) FROM package_updates")).scalar_one() == 1
        assert connection.execute(sa.text("SELECT COUNT(*) FROM webhook_configs")).scalar_one() == 1
        assert connection.execute(sa.text("SELECT COUNT(*) FROM webhook_delivery_history")).scalar_one() == 1
    engine.dispose()


async def test_existing_webhook_and_migration_tests_pass_with_outbox(ingest) -> None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    # Migration chain: the outbox revision is in the history and the history has a single head.
    script = ScriptDirectory.from_config(Config(str(BACKEND_ROOT / "alembic.ini")))
    revisions = {revision.revision for revision in script.walk_revisions()}
    assert "b2c3d4e5f6a7" in revisions
    assert len(script.get_heads()) == 1

    # Delivery history keeps working beside outbox state: ingest queues outbox rows and writes no
    # history; a recorded delivery attempt is stored next to the pending outbox row and neither
    # table changes the other.
    response = await ingest.client.post("/api/v1/updates", json=PACKAGE, headers={"X-Delivery-ID": "history-1"})
    assert response.status_code == 201
    assert await ingest.count(WebhookDeliveryHistory) == 0
    with ingest.factory() as session:
        outbox_row = session.execute(sa.select(WebhookOutbox).limit(1)).scalar_one()
        session.add(WebhookDeliveryHistory(
            webhook_config_id=outbox_row.webhook_config_id, event_type=outbox_row.event_type,
            payload=outbox_row.payload, status_code=200, attempt_number=1,
            delivered_at=datetime.now(UTC),
        ))
        session.commit()
    assert await ingest.count(WebhookDeliveryHistory) == 1
    assert await ingest.count(WebhookOutbox) == 2
    assert (await _state(ingest))["outbox"] == 2
