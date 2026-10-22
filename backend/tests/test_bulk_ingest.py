from pathlib import Path
from types import SimpleNamespace

import pytest
import pytest_asyncio
import sqlalchemy as sa
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import sessionmaker

import fluxion.api.routes.updates as updates_module
import fluxion.models as models
from fluxion.models.base import Base


class AsyncOverSync:
    def __init__(self, session):
        self._session = session

    @property
    def new(self):
        return self._session.new

    def add(self, value):
        self._session.add(value)

    async def execute(self, *args, **kwargs):
        return self._session.execute(*args, **kwargs)

    async def flush(self):
        self._session.flush()

    async def commit(self):
        self._session.commit()

    async def rollback(self):
        self._session.rollback()


@pytest_asyncio.fixture
async def ingest(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    engine = sa.create_engine(f"sqlite:///{tmp_path}/bulk.sqlite", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as seed:
        seed.add_all([
            models.WebhookConfig(id=11, name="both", url="https://a.example/hook", enabled=True,
                                 event_types=["package_update", "security_update"]),
            models.WebhookConfig(id=12, name="updates", url="https://b.example/hook", enabled=True,
                                 event_types=["package_update"]),
        ])
        seed.commit()

    async def no_delivery(*_args, **_kwargs):
        return None

    monkeypatch.setattr(updates_module, "_trigger_package_change_webhooks", no_delivery)
    app = FastAPI()
    app.include_router(updates_module.router, prefix="/api/v1")

    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)

    app.dependency_overrides[updates_module.get_session] = get_test_session
    app.dependency_overrides[updates_module.authorize_batch_hostname] = lambda: {"role": "admin", "allowed_hosts": []}

    statements: list[tuple[str, object, bool]] = []

    def capture(_conn, _cursor, statement, parameters, _context, executemany):
        statements.append((statement, parameters, executemany))

    sa.event.listen(engine, "before_cursor_execute", capture)

    async def count(model, *where) -> int:
        with factory() as session:
            query = sa.select(sa.func.count()).select_from(model)
            for condition in where:
                query = query.where(condition)
            return session.execute(query).scalar_one()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield SimpleNamespace(client=client, engine=engine, factory=factory, count=count, statements=statements)
    sa.event.remove(engine, "before_cursor_execute", capture)
    engine.dispose()


def batch(count: int, hostname: str = "bulk-host") -> dict:
    updates = [{
        "package_name": f"pkg-{i}",
        "old_version": "1.0",
        "new_version": "2.0",
        "is_security": False,
    } for i in range(1, count + 1)]
    return {"hostname": hostname, "os_info": "Test OS", "package_manager": "apt", "updates": updates}


def endpoint_and_payload(count: int, endpoint: str) -> tuple[str, dict]:
    if endpoint == "batch":
        return "/api/v1/updates/batch", batch(count)
    payload = {"hostname": "bulk-host", "os_info": "Test OS", "packages": batch(count)["updates"]}
    return "/api/v1/updates/ingest/apk", payload


@pytest.mark.parametrize("endpoint", ["batch", "ingest"])
@pytest.mark.parametrize("count,expected_status", [(99, 201), (100, 201), (101, 413)])
async def test_batch_item_bound_contract(ingest, endpoint: str, count: int, expected_status: int) -> None:
    url, payload = endpoint_and_payload(count, endpoint)
    response = await ingest.client.post(url, json=payload, headers={"X-Delivery-ID": f"bound-{endpoint}-{count}"})
    assert response.status_code == expected_status
    if count == 101:
        assert response.json() == {"detail": "Batch package count exceeds 100"}
        assert await ingest.count(models.Host) == 0
        assert await ingest.count(models.PackageUpdate) == 0
        assert await ingest.count(models.DeliveryIdentity) == 0
        assert await ingest.count(models.WebhookOutbox) == 0
    else:
        assert response.json()["count"] == count
        assert await ingest.count(models.PackageUpdate) == count


async def test_bulk_transaction_preserves_distinct_rows(ingest) -> None:
    payload = batch(100)
    payload["updates"][0] = {**payload["updates"][0], "package_name": "duplicate"}
    payload["updates"][1] = {**payload["updates"][1], "package_name": "duplicate"}
    response = await ingest.client.post("/api/v1/updates/batch", json=payload, headers={"X-Delivery-ID": "bulk-distinct"})
    assert response.status_code == 201
    assert await ingest.count(models.Host) == 1
    assert await ingest.count(models.PackageUpdate) == 100
    with ingest.factory() as session:
        duplicates = session.execute(sa.select(models.PackageUpdate.id).where(models.PackageUpdate.package_name == "duplicate")).scalars().all()
    assert len(duplicates) == 2
    assert duplicates[0] != duplicates[1]
    assert response.json()["ids"] == sorted(duplicates + [i for i in response.json()["ids"] if i not in duplicates])


async def test_bulk_insert_round_trip_bound(ingest) -> None:
    response = await ingest.client.post("/api/v1/updates/batch", json=batch(100), headers={"X-Delivery-ID": "bulk-roundtrip"})
    assert response.status_code == 201
    assert len(response.json()["ids"]) == 100
    package_events = [item for item in ingest.statements if "insert into package_updates" in item[0].lower().replace("\n", " ")]
    assert len(package_events) == 1
    assert package_events[0][2] is True
    assert len(package_events[0][1]) == 100


async def test_bulk_ingest_rollback_and_sanitized_error(ingest) -> None:
    with ingest.engine.begin() as connection:
        connection.execute(sa.text(
            "CREATE TRIGGER fail_package_insert BEFORE INSERT ON package_updates "
            "WHEN NEW.package_name = 'pkg-100' "
            "BEGIN SELECT RAISE(ABORT, 'pkg-100 INSERT trigger forbidden'); END"
        ))
    response = await ingest.client.post("/api/v1/updates/batch", json=batch(100), headers={"X-Delivery-ID": "bulk-fail"})
    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to record batch package updates"}
    text = response.text
    assert "pkg-100" not in text and "INSERT" not in text and "trigger" not in text
    assert await ingest.count(models.Host) == 0
    assert await ingest.count(models.PackageUpdate) == 0
    assert await ingest.count(models.DeliveryIdentity) == 0
    assert await ingest.count(models.WebhookOutbox) == 0
    package_events = [item for item in ingest.statements if "insert into package_updates" in item[0].lower().replace("\n", " ")]
    assert len(package_events) == 1
