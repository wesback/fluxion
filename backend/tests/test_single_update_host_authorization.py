import sqlite3
from pathlib import Path

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import sessionmaker

import fluxion.api.routes.admin as admin_module
import fluxion.api.routes.updates as updates_module
import fluxion.middleware.auth as auth_module
import fluxion.models as models
from fluxion.auth import generate_api_key, hash_api_key
from fluxion.main import app as production_app
from fluxion.models.base import Base


class AsyncOverSync:
    def __init__(self, session):
        self._session = session

    async def execute(self, *args, **kwargs):
        return self._session.execute(*args, **kwargs)

    async def commit(self):
        self._session.commit()

    async def rollback(self):
        self._session.rollback()

    async def flush(self):
        self._session.flush()

    @property
    def new(self):
        return self._session.new

    async def refresh(self, value):
        self._session.refresh(value)

    def add(self, value):
        self._session.add(value)


SINGLE = {
    "hostname": "node1.example.test",
    "os_info": "Test Linux",
    "package_name": "openssl",
    "old_version": "1.0",
    "new_version": "2.0",
    "is_security": True,
}
BATCH = {
    "hostname": "node1.example.test",
    "os_info": "Test Linux",
    "package_manager": "apt",
    "updates": [{"package_name": "openssl", "old_version": "1.0", "new_version": "2.0", "is_security": True}],
}


@pytest_asyncio.fixture
async def ingest_authorization(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    database = tmp_path / "single_authorization.sqlite"
    engine = sa.create_engine(f"sqlite:///{database}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)

    auth_globals = auth_module.APIKeyAuthMiddleware.dispatch.__globals__
    original_updates_session = updates_module.get_session
    original_admin_session = admin_module.get_session
    monkeypatch.setitem(auth_globals, "get_session", get_test_session)
    monkeypatch.setattr(updates_module, "get_session", get_test_session)
    monkeypatch.setattr(admin_module, "get_session", get_test_session)
    production_app.dependency_overrides[original_updates_session] = get_test_session
    production_app.dependency_overrides[original_admin_session] = get_test_session

    admin_key = generate_api_key()
    with factory() as session:
        session.add(models.APIKey(name="Admin", key_hash=hash_api_key(admin_key), role="admin", is_active=True, allowed_hosts=[], host_scope="all"))
        session.commit()

    async def count_many(*models_to_count):
        with factory() as session:
            return tuple(session.execute(sa.select(sa.func.count()).select_from(model)).scalar_one() for model in models_to_count)

    async with AsyncClient(transport=ASGITransport(app=production_app), base_url="http://test") as client:
        yield {"client": client, "factory": factory, "count_many": count_many, "admin_key": admin_key}

    production_app.dependency_overrides.clear()
    engine.dispose()


def seed_key(factory, name, role, allowed_hosts, host_scope="listed"):
    key = generate_api_key()
    with factory() as session:
        session.add(models.APIKey(name=name, key_hash=hash_api_key(key), role=role, is_active=True, allowed_hosts=allowed_hosts, host_scope=host_scope))
        session.commit()
    return key


def clear_rows(factory):
    with factory() as session:
        for model in (models.WebhookOutbox, models.DeliveryIdentity, models.PackageUpdate, models.Host, models.IngestDiagnostic):
            session.query(model).delete()
        session.commit()


@pytest.mark.asyncio
async def test_single_update_host_scope_contract(ingest_authorization):
    client, factory = ingest_authorization["client"], ingest_authorization["factory"]
    listed = seed_key(factory, "Listed", "user", ["node1.example.test"])
    all_key = seed_key(factory, "All", "user", [], "all")
    cases = (
        (listed, "node1.example.test", 201, (1, 1)),
        (listed, "node9.example.test", 403, (0, 0)),
        (all_key, "node9.example.test", 201, (1, 1)),
        (ingest_authorization.get("admin_key"), "node9.example.test", 201, (1, 1)),
        (None, "node1.example.test", 401, (0, 0)),
    )
    rows = (models.PackageUpdate, models.Host, models.DeliveryIdentity, models.WebhookOutbox)
    for key, hostname, expected, package_host in cases:
        clear_rows(factory)
        payload = dict(SINGLE, hostname=hostname)
        headers = {} if key is None else {"X-API-Key": key}
        response = await client.post("/api/v1/updates", json=payload, headers=headers)
        counts = await ingest_authorization["count_many"](*rows)
        assert response.status_code == expected
        assert counts[:2] == package_host
        if expected == 403:
            assert response.json() == {"detail": "Hostname not authorized for this API key"}
            assert counts == (0, 0, 0, 0)
        elif expected == 401:
            assert counts == (0, 0, 0, 0)


@pytest.mark.asyncio
async def test_hostname_match_ignores_case_only(ingest_authorization):
    client, factory = ingest_authorization["client"], ingest_authorization["factory"]
    listed = seed_key(factory, "Case listed", "user", ["node1.example.test"])
    routes = (("/api/v1/updates", SINGLE), ("/api/v1/updates/batch", BATCH))
    cases = (("NODE1.Example.Test", 201), ("NODE1.example.test.evil.test", 403), ("evil-NODE1.example.test", 403))
    for path, template in routes:
        for hostname, expected in cases:
            clear_rows(factory)
            payload = dict(template, hostname=hostname)
            response = await client.post(path, json=payload, headers={"X-API-Key": listed})
            assert response.status_code == expected
            if expected == 403:
                assert response.json() == {"detail": "Hostname not authorized for this API key"}
                rows = (models.PackageUpdate, models.Host, models.DeliveryIdentity, models.WebhookOutbox)
                assert await ingest_authorization["count_many"](*rows) == (0, 0, 0, 0)
            else:
                with factory() as session:
                    host = session.execute(sa.select(models.Host).where(models.Host.hostname == hostname)).scalar_one()
                    assert host.hostname == hostname
