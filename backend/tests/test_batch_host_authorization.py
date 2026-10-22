import sqlite3
from pathlib import Path

import pytest
import pytest_asyncio
import sqlalchemy as sa
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import sessionmaker

import fluxion.api.routes.admin as admin_module
import fluxion.api.routes.updates as updates_module
import fluxion.middleware.auth as auth_module
import fluxion.models as models
from fluxion.auth import generate_api_key, hash_api_key, verify_api_key
from sqlalchemy.ext.asyncio import AsyncSession
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


BATCH = {
    "hostname": "node1.example.test",
    "os_info": "Test Linux",
    "package_manager": "apt",
    "updates": [{
        "package_name": "openssl",
        "old_version": "1.0",
        "new_version": "2.0",
        "is_security": True,
    }],
}
APK_BATCH = {
    "hostname": "node1.example.test",
    "os_info": "Alpine Linux",
    "packages": [{"name": "openssl", "old": "1.0", "version": "2.0", "security": True}],
}


@pytest_asyncio.fixture
async def ingest_authorization(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    database = tmp_path / "batch_authorization.sqlite"
    engine = sa.create_engine(f"sqlite:///{database}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)

    auth_dispatch_globals = auth_module.APIKeyAuthMiddleware.dispatch.__globals__
    original_auth_session = auth_dispatch_globals["get_session"]
    original_updates_session = updates_module.get_session
    original_admin_session = admin_module.get_session
    auth_dispatch_globals["get_session"] = get_test_session
    monkeypatch.setattr(updates_module, "get_session", get_test_session)
    monkeypatch.setattr(admin_module, "get_session", get_test_session)

    production_app.dependency_overrides[original_updates_session] = get_test_session
    production_app.dependency_overrides[original_admin_session] = get_test_session
    monkeypatch.setitem(auth_dispatch_globals, "get_session", get_test_session)

    admin_key = generate_api_key()
    with factory() as session:
        session.add(models.APIKey(name="Admin", key_hash=hash_api_key(admin_key), role="admin", is_active=True, allowed_hosts=[]))
        session.commit()

    async def count(model):
        with factory() as session:
            return session.execute(sa.select(sa.func.count()).select_from(model)).scalar_one()

    async def count_many(*models_to_count):
        counts = []
        for model in models_to_count:
            counts.append(await count(model))
        return tuple(counts)

    async with AsyncClient(transport=ASGITransport(app=production_app), base_url="http://test") as client:
        yield {"client": client, "factory": factory, "count": count, "count_many": count_many,
               "engine": engine, "admin_key": admin_key}

    production_app.dependency_overrides.clear()
    engine.dispose()


@pytest.mark.asyncio
async def test_api_key_allowed_hosts_create_and_list_round_trip(ingest_authorization) -> None:
    client = ingest_authorization["client"]
    headers = {"X-API-Key": ingest_authorization["admin_key"]}

    created = await client.post(
        "/api/v1/admin/api-keys",
        json={"name": "Node key", "role": "user", "allowed_hosts": ["Node1.example.test"]},
        headers=headers,
    )
    assert created.status_code == 201

    listed = await client.get("/api/v1/admin/api-keys", headers=headers)
    assert listed.status_code == 200
    node_key = next(item for item in listed.json()["items"] if item["name"] == "Node key")
    assert node_key["allowed_hosts"] == ["node1.example.test"]

    omitted = await client.post(
        "/api/v1/admin/api-keys",
        json={"name": "No hosts", "role": "user"},
        headers=headers,
    )
    assert omitted.status_code == 201
    listed = await client.get("/api/v1/admin/api-keys", headers=headers)
    no_hosts = next(item for item in listed.json()["items"] if item["name"] == "No hosts")
    assert no_hosts["allowed_hosts"] == []

    before = await ingest_authorization["count"](models.APIKey)
    for value in ("node1.example.test", ["*.example.test"]):
        response = await client.post(
            "/api/v1/admin/api-keys",
            json={"name": "Invalid key", "role": "user", "allowed_hosts": value},
            headers=headers,
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Validation error"
        assert await ingest_authorization["count"](models.APIKey) == before


@pytest.mark.asyncio
async def test_exact_hostname_authorization_contract(ingest_authorization) -> None:
    client = ingest_authorization["client"]
    factory = ingest_authorization["factory"]

    def seed_key(name: str, role: str, allowed_hosts: list[str]):
        key = generate_api_key()
        with factory() as session:
            session.add(models.APIKey(name=name, key_hash=hash_api_key(key), role=role, is_active=True, allowed_hosts=allowed_hosts))
            session.commit()
        return key

    user_key = seed_key("User exact", "user", ["node1.example.test"])
    empty_key = seed_key("User empty", "user", [])
    admin_key = ingest_authorization["admin_key"]

    routes = (
        ("/api/v1/updates/batch", BATCH),
        ("/api/v1/updates/ingest/apk", APK_BATCH),
    )
    rows = (models.PackageUpdate, models.Host, models.DeliveryIdentity, models.WebhookOutbox)

    cases = (
        (user_key, "node1.example.test", 201),
        (user_key, "NODE1.example.test", 403),
        (user_key, "node1.example.test.evil.test", 403),
        (user_key, "evil-node1.example.test", 403),
        (empty_key, "node1.example.test", 403),
        (admin_key, "node1.example.test", 201),
        (None, "node1.example.test", 401),
    )

    for path, payload_template in routes:
        for key, hostname, expected in cases:
            with factory() as session:
                session.query(models.WebhookOutbox).delete()
                session.query(models.DeliveryIdentity).delete()
                session.query(models.PackageUpdate).delete()
                session.query(models.Host).delete()
                session.query(models.IngestDiagnostic).delete()
                session.commit()
            payload = dict(payload_template)
            payload["hostname"] = hostname
            before = await ingest_authorization["count_many"](*rows)
            headers = {} if key is None else {"X-API-Key": key}
            response = await client.post(path, json=payload, headers=headers)
            after = await ingest_authorization["count_many"](*rows)
            assert response.status_code == expected
            if expected == 403:
                assert response.json() == {"detail": "Hostname not authorized for this API key"}
                assert after == before
            elif expected == 401:
                assert after == before
            else:
                assert after[0] == 1
                assert after[1] >= 1


@pytest.mark.asyncio
async def test_batch_without_authenticated_key_fails_closed(tmp_path: Path) -> None:
    database = tmp_path / "bare.sqlite"
    engine = sa.create_engine(f"sqlite:///{database}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)

    bare_app = FastAPI()
    bare_app.include_router(updates_module.router, prefix="/api/v1")
    bare_app.dependency_overrides[updates_module.get_session] = get_test_session

    async with AsyncClient(transport=ASGITransport(app=bare_app), base_url="http://test") as client:
        response = await client.post("/api/v1/updates/batch", json=BATCH)

    assert response.status_code == 403
    assert response.json() == {"detail": "Hostname not authorized for this API key"}
    with factory() as session:
        assert session.execute(sa.select(sa.func.count()).select_from(models.PackageUpdate)).scalar_one() == 0
        assert session.execute(sa.select(sa.func.count()).select_from(models.Host)).scalar_one() == 0
        assert session.execute(sa.select(sa.func.count()).select_from(models.WebhookOutbox)).scalar_one() == 0
    engine.dispose()
