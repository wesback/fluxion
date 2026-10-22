import hashlib
import importlib.util
import json
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

import fluxion.api.routes.updates as updates_module
import fluxion.models as models
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
        identity_columns = {c["name"] for c in inspector.get_columns("webhook_delivery_identities")}
        assert identity_columns == {"delivery_id", "fingerprint", "created_at"}
        identity_pk = inspector.get_pk_constraint("webhook_delivery_identities")
        assert identity_pk["constrained_columns"] == ["delivery_id"]
        assert models.WebhookOutbox.__table__.name == "webhook_outbox"
        assert models.DeliveryIdentity.__table__.name == "webhook_delivery_identities"
        assert set(models.WebhookOutbox.__table__.c.keys()) == columns | {"id"}
        assert set(models.DeliveryIdentity.__table__.c.keys()) == identity_columns
        assert models.DeliveryIdentity.__table__.primary_key.columns.keys() == ["delivery_id"]
        assert {index.name for index in models.WebhookOutbox.__table__.indexes} >= {
            "ix_webhook_outbox_status", "ix_webhook_outbox_next_attempt_at"
        }
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

BATCH = {
    "hostname": "host-a",
    "os_info": "Ubuntu 24.04 LTS",
    "package_manager": "apt",
    "updates": [
        {"package_name": "openssl", "old_version": "1.0", "new_version": "2.0", "is_security": True},
    ],
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
async def ingest(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """The production updates router on a temporary file-backed SQLite database, without the API-key
    middleware. Webhook configurations 11 and 12 are enabled, 13 is disabled. Webhook delivery after
    the response (a network call) is the only part replaced."""
    engine = sa.create_engine(
        f"sqlite:///{tmp_path}/ingest.sqlite", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as seed:
        seed.add_all([
            models.WebhookConfig(id=11, name="both", url="https://a.example/hook", enabled=True,
                                 event_types=["package_update", "security_update"]),
            models.WebhookConfig(id=12, name="updates", url="https://b.example/hook", enabled=True,
                                 event_types=["package_update"]),
            models.WebhookConfig(id=13, name="disabled", url="https://c.example/hook", enabled=False,
                                 event_types=["package_update", "security_update"]),
        ])
        seed.commit()

    async def no_delivery(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(updates_module, "_trigger_package_change_webhooks", no_delivery)

    app = FastAPI()
    app.include_router(updates_module.router, prefix="/api/v1")

    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)

    app.dependency_overrides[updates_module.get_session] = get_test_session

    statements: list[tuple[str, object]] = []

    def capture(_conn, _cursor, statement, parameters, _context, _executemany):
        statements.append((statement, parameters))

    sa.event.listen(engine, "before_cursor_execute", capture)

    async def count(model, *where) -> int:
        with factory() as session:
            query = sa.select(sa.func.count()).select_from(model)
            for condition in where:
                query = query.where(condition)
            return session.execute(query).scalar_one()

    async def outbox_pairs() -> set[tuple[int, str]]:
        with factory() as session:
            rows = session.execute(sa.select(models.WebhookOutbox)).scalars().all()
            return {(row.webhook_config_id, row.event_type) for row in rows}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield SimpleNamespace(client=client, engine=engine, factory=factory, count=count,
                              outbox_pairs=outbox_pairs, statements=statements)
    sa.event.remove(engine, "before_cursor_execute", capture)
    engine.dispose()


async def _state(ingest) -> dict[str, int]:
    return {
        "packages": await ingest.count(models.PackageUpdate),
        "outbox": await ingest.count(models.WebhookOutbox),
        "identities": await ingest.count(models.DeliveryIdentity),
        "accepted": await ingest.count(models.IngestDiagnostic, models.IngestDiagnostic.outcome == "accepted"),
    }


async def test_batch_commit_persists_exact_enabled_webhook_event_pairs(ingest) -> None:
    response = await ingest.client.post(
        "/api/v1/updates/batch", json=BATCH, headers={"X-Delivery-ID": "delivery-batch-A"}
    )

    assert response.status_code == 201
    # Exactly one row per enabled configuration and subscribed event type; disabled 13 gets none.
    assert await ingest.outbox_pairs() == {
        (11, "package_update"),
        (11, "security_update"),
        (12, "package_update"),
    }
    # Package row, delivery identity, accepted diagnostic and outbox rows were committed together.
    assert await _state(ingest) == {"packages": 1, "outbox": 3, "identities": 1, "accepted": 1}
    with ingest.factory() as session:
        payloads = session.execute(sa.select(models.WebhookOutbox.payload)).scalars().all()
        package_id = session.execute(sa.select(models.PackageUpdate.id)).scalar_one()
    assert {payload["delivery_identity"] for payload in payloads} == {"delivery-batch-A"}
    assert response.json()["ids"] == [package_id]


async def test_outbox_insert_failure_returns_500_and_rolls_back(ingest) -> None:
    with ingest.engine.begin() as connection:
        connection.execute(sa.text(
            "CREATE TRIGGER fail_outbox_insert BEFORE INSERT ON webhook_outbox "
            "BEGIN SELECT RAISE(ABORT, 'outbox insert failed'); END"
        ))

    response = await ingest.client.post(
        "/api/v1/updates/batch", json=BATCH, headers={"X-Delivery-ID": "delivery-batch-fail"}
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to record batch package updates"}
    # The package row and the delivery identity were flushed before the outbox insert failed; a new
    # session sees none of them.
    assert await _state(ingest) == {"packages": 0, "outbox": 0, "identities": 0, "accepted": 0}
    assert await ingest.count(models.Host) == 0


async def test_transaction_identity_rolls_back_atomically(ingest, monkeypatch: pytest.MonkeyPatch) -> None:
    real_commit = AsyncOverSync.commit
    calls = {"count": 0}

    async def failing_commit(self):
        calls["count"] += 1
        if calls["count"] == 1:
            # Delivery identity and outbox rows are both pending in this transaction when the commit fails.
            pending = {type(item) for item in self.new}
            assert {models.DeliveryIdentity, models.WebhookOutbox} <= pending
            raise RuntimeError("forced commit failure")
        await real_commit(self)

    monkeypatch.setattr(AsyncOverSync, "commit", failing_commit)

    first = await ingest.client.post("/api/v1/updates/batch", json=BATCH, headers={"X-Delivery-ID": "tx-129"})

    assert first.status_code == 500
    assert await _state(ingest) == {"packages": 0, "outbox": 0, "identities": 0, "accepted": 0}

    # The same transaction identity is still unused, so the retry commits everything together.
    retry = await ingest.client.post("/api/v1/updates/batch", json=BATCH, headers={"X-Delivery-ID": "tx-129"})

    assert retry.status_code == 201
    assert await _state(ingest) == {"packages": 1, "outbox": 3, "identities": 1, "accepted": 1}


def _fingerprint(batch: dict) -> str:
    """The request-content fingerprint the contract binds to a delivery ID: SHA-256 of the canonical
    JSON of the normalised batch."""
    payload = {
        "hostname": batch["hostname"],
        "os_info": batch.get("os_info"),
        "package_manager": batch.get("package_manager"),
        "updates": [
            {
                "package_name": update["package_name"],
                "old_version": update.get("old_version"),
                "new_version": update["new_version"],
                "is_security": update.get("is_security", False),
                "package_manager": update.get("package_manager"),
            }
            for update in batch["updates"]
        ],
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def test_delivery_identity_replay_contract(ingest) -> None:
    headers_a = {"X-Delivery-ID": "delivery-A"}
    first = await ingest.client.post("/api/v1/updates/batch", json=BATCH, headers=headers_a)
    assert first.status_code == 201
    accepted = await _state(ingest)
    assert accepted == {"packages": 1, "outbox": 3, "identities": 1, "accepted": 1}

    # Same delivery ID, same content: the original IDs, nothing new stored.
    replay = await ingest.client.post("/api/v1/updates/batch", json=BATCH, headers=headers_a)
    assert replay.status_code == 201
    assert replay.json()["ids"] == first.json()["ids"]
    assert await _state(ingest) == accepted

    # Same delivery ID, changed content: 409, nothing stored.
    changed = {**BATCH, "updates": [{**BATCH["updates"][0], "new_version": "3.0"}]}
    conflict = await ingest.client.post("/api/v1/updates/batch", json=changed, headers=headers_a)
    assert conflict.status_code == 409
    assert await _state(ingest) == accepted

    # New delivery ID with no enabled webhook for its event types: the package and its identity are
    # stored with the request fingerprint, and no outbox row.
    with ingest.engine.begin() as connection:
        connection.execute(sa.text("UPDATE webhook_configs SET enabled = 0 WHERE id IN (11, 12)"))
    batch_b = {**BATCH, "updates": [{**BATCH["updates"][0], "package_name": "libssl3"}]}
    new_b = await ingest.client.post("/api/v1/updates/batch", json=batch_b, headers={"X-Delivery-ID": "delivery-B"})
    assert new_b.status_code == 201
    assert await _state(ingest) == {"packages": 2, "outbox": 3, "identities": 2, "accepted": 2}
    with ingest.factory() as session:
        stored = session.execute(
            sa.select(models.DeliveryIdentity.fingerprint).where(models.DeliveryIdentity.delivery_id == "delivery-B")
        ).scalar_one()
        b_ids = session.execute(
            sa.select(models.PackageUpdate.id).where(models.PackageUpdate.package_name == "libssl3")
        ).scalars().all()
    assert stored == _fingerprint(batch_b)
    assert new_b.json()["ids"] == b_ids

    # Replay with unrelated identity and outbox rows present: the lookup selects the identity by
    # delivery ID and never reads outbox rows.
    with ingest.engine.begin() as connection:
        connection.execute(sa.text(
            "INSERT INTO webhook_delivery_identities (delivery_id, fingerprint, created_at) "
            "VALUES ('delivery-Z', 'unrelated', CURRENT_TIMESTAMP)"
        ))
        connection.execute(sa.text(
            "INSERT INTO webhook_outbox (delivery_id, webhook_config_id, event_type, payload, status, "
            "attempt_count, next_attempt_at, created_at, updated_at) VALUES ('unrelated-outbox', 11, "
            "'package_update', '{}', 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ))
    before = await _state(ingest)
    ingest.statements.clear()
    replay_again = await ingest.client.post("/api/v1/updates/batch", json=BATCH, headers=headers_a)
    assert replay_again.status_code == 201
    assert replay_again.json()["ids"] == first.json()["ids"]
    assert await _state(ingest) == before
    request_statements = [(sql, params) for sql, params in ingest.statements
                          if "count(*)" not in sql.lower()]
    lookups = [(sql, params) for sql, params in request_statements
               if "FROM webhook_delivery_identities" in sql and "delivery_id" in sql]
    assert lookups, request_statements
    assert all("delivery-A" in tuple(params) for _, params in lookups)
    assert not [sql for sql, _ in request_statements if "webhook_outbox" in sql]


def test_outbox_migration_round_trip_preserves_application_rows(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    migration = _load_migration()
    engine = sa.create_engine(f"sqlite:///{tmp_path}/roundtrip.sqlite")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE hosts (id INTEGER PRIMARY KEY, hostname TEXT)"))
        connection.execute(sa.text("CREATE TABLE package_updates (id INTEGER PRIMARY KEY, package_name TEXT)"))
        connection.execute(sa.text("CREATE TABLE webhook_configs (id INTEGER PRIMARY KEY, name TEXT)"))
        connection.execute(sa.text("CREATE TABLE webhook_delivery_history (id INTEGER PRIMARY KEY, event_type TEXT)"))
        connection.execute(sa.text("INSERT INTO hosts (id, hostname) VALUES (41, 'host-a')"))
        connection.execute(sa.text("INSERT INTO package_updates (id, package_name) VALUES (51, 'openssl')"))
        connection.execute(sa.text("INSERT INTO webhook_configs (id, name) VALUES (11, 'primary')"))
        connection.execute(sa.text("INSERT INTO webhook_delivery_history (id, event_type) VALUES (71, 'package_update')"))
        context = MigrationContext.configure(connection)
        monkeypatch.setattr(migration, "op", Operations(context))
        migration.upgrade()
        assert sa.inspect(connection).has_table("webhook_outbox")
        assert sa.inspect(connection).has_table("webhook_delivery_identities")
        connection.execute(sa.text("INSERT INTO webhook_delivery_identities (delivery_id, fingerprint, created_at) VALUES ('delivery-A', 'payload-A', CURRENT_TIMESTAMP)"))
        connection.execute(sa.text("INSERT INTO webhook_outbox (delivery_id, webhook_config_id, event_type, payload, status, attempt_count, next_attempt_at, created_at, updated_at) VALUES ('delivery-A', 11, 'package_update', '{}', 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
        migration.downgrade()
        assert "webhook_outbox" not in sa.inspect(connection).get_table_names()
        assert "webhook_delivery_identities" not in sa.inspect(connection).get_table_names()
        assert connection.execute(sa.text("SELECT id, hostname FROM hosts")).fetchall() == [(41, "host-a")]
        assert connection.execute(sa.text("SELECT id, package_name FROM package_updates")).fetchall() == [(51, "openssl")]
        assert connection.execute(sa.text("SELECT id, name FROM webhook_configs")).fetchall() == [(11, "primary")]
        assert connection.execute(sa.text("SELECT id, event_type FROM webhook_delivery_history")).fetchall() == [(71, "package_update")]
        remaining_indexes = {
            index["name"]
            for table_name in sa.inspect(connection).get_table_names()
            for index in sa.inspect(connection).get_indexes(table_name)
        }
        assert "ix_webhook_outbox_status" not in remaining_indexes
        assert "ix_webhook_outbox_next_attempt_at" not in remaining_indexes
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
    assert await ingest.count(models.WebhookDeliveryHistory) == 0
    with ingest.factory() as session:
        outbox_row = session.execute(sa.select(models.WebhookOutbox).limit(1)).scalar_one()
        session.add(models.WebhookDeliveryHistory(
            webhook_config_id=outbox_row.webhook_config_id, event_type=outbox_row.event_type,
            payload=outbox_row.payload, status_code=200, attempt_number=1,
            delivered_at=datetime.now(UTC),
        ))
        session.commit()
    assert await ingest.count(models.WebhookDeliveryHistory) == 1
    assert await ingest.count(models.WebhookOutbox) == 3
    assert (await _state(ingest))["outbox"] == 3
