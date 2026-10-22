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

    async def refresh(self, value):
        self._session.refresh(value)

    def add(self, value):
        self._session.add(value)


@pytest_asyncio.fixture
async def ingest_authorization(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'host_scope.sqlite'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)

    globals_ = auth_module.APIKeyAuthMiddleware.dispatch.__globals__
    original_auth = globals_["get_session"]
    original_updates = updates_module.get_session
    original_admin = admin_module.get_session
    globals_["get_session"] = get_test_session
    monkeypatch.setattr(updates_module, "get_session", get_test_session)
    monkeypatch.setattr(admin_module, "get_session", get_test_session)
    production_app.dependency_overrides[original_updates] = get_test_session
    production_app.dependency_overrides[original_admin] = get_test_session

    admin_key = generate_api_key()
    with factory() as session:
        session.add(models.APIKey(name="Admin", key_hash=hash_api_key(admin_key), role="admin", is_active=True, allowed_hosts=[]))
        session.commit()

    async with AsyncClient(transport=ASGITransport(app=production_app), base_url="http://test") as client:
        yield {"client": client, "factory": factory, "admin_key": admin_key}

    production_app.dependency_overrides.clear()
    globals_["get_session"] = original_auth
    engine.dispose()


@pytest.mark.asyncio
async def test_host_scope_create_and_list_contract(ingest_authorization) -> None:
    client = ingest_authorization["client"]
    headers = {"X-API-Key": ingest_authorization["admin_key"]}
    cases = (
        ({"name": "All", "role": "user"}, 201, "all", []),
        ({"name": "Listed", "role": "user", "allowed_hosts": ["Node1.example.test"]}, 201, "listed", ["node1.example.test"]),
        ({"name": "Explicit all", "role": "user", "host_scope": "all", "allowed_hosts": ["node1.example.test"]}, 201, "all", ["node1.example.test"]),
        ({"name": "Invalid listed", "role": "user", "host_scope": "listed"}, 422, None, None),
        ({"name": "Invalid scope", "role": "user", "host_scope": "some"}, 422, None, None),
    )
    before = len(await _list_items(client, headers))
    for body, status, scope, hosts in cases:
        response = await client.post("/api/v1/admin/api-keys", json=body, headers=headers)
        assert response.status_code == status
        if status == 201:
            items = await _list_items(client, headers)
            item = next(value for value in items if value["name"] == body["name"])
            assert item["host_scope"] == scope
            assert item["allowed_hosts"] == hosts
    factory = ingest_authorization["factory"]
    with factory() as session:
        assert session.query(models.APIKey).count() == before + 3

        orm_key = generate_api_key()
        orm_api_key = models.APIKey(
            name="ORM default listed",
            key_hash=hash_api_key(orm_key),
            role="user",
            is_active=True,
            allowed_hosts=["node1.example.test"],
        )
        session.add(orm_api_key)
        session.commit()
        session.refresh(orm_api_key)
        assert orm_api_key.host_scope == "listed"

        for model in (models.WebhookOutbox, models.DeliveryIdentity, models.PackageUpdate, models.Host):
            session.query(model).delete()
        session.commit()

    payload = dict(BATCH)
    payload["hostname"] = "node9.example.test"
    response = await client.post("/api/v1/updates/batch", json=payload, headers={"X-API-Key": orm_key})
    assert response.status_code == 403
    assert response.json() == {"detail": "Hostname not authorized for this API key"}
    with factory() as session:
        assert session.query(models.PackageUpdate).count() == 0
        assert session.query(models.Host).count() == 0


BATCH = {
    "hostname": "node1.example.test",
    "os_info": "Test Linux",
    "package_manager": "apt",
    "updates": [{"package_name": "openssl", "old_version": "1.0", "new_version": "2.0", "is_security": True}],
}
APK_BATCH = {
    "hostname": "node1.example.test",
    "os_info": "Alpine Linux",
    "packages": [{"name": "openssl", "old": "1.0", "version": "2.0", "security": True}],
}


@pytest.mark.asyncio
async def test_host_scope_authorization_contract(ingest_authorization) -> None:
    client = ingest_authorization["client"]
    factory = ingest_authorization["factory"]

    def seed(name: str, role: str, scope: str, hosts: list[str]) -> str:
        key = generate_api_key()
        with factory() as session:
            session.add(models.APIKey(name=name, key_hash=hash_api_key(key), role=role, is_active=True, allowed_hosts=hosts, host_scope=scope))
            session.commit()
        return key

    keys = (
        (seed("All empty", "user", "all", []), "node9.example.test", 201),
        (seed("All listed", "user", "all", ["node1.example.test"]), "node9.example.test", 201),
        (seed("Listed match", "user", "listed", ["node1.example.test"]), "node1.example.test", 201),
        (seed("Listed refuse", "user", "listed", ["node1.example.test"]), "node9.example.test", 403),
        (ingest_authorization["admin_key"], "node9.example.test", 201),
    )
    routes = ("/api/v1/updates/batch", "/api/v1/updates/ingest/apk")
    for path in routes:
        for key, hostname, expected in keys:
            with factory() as session:
                for model in (models.WebhookOutbox, models.DeliveryIdentity, models.PackageUpdate, models.Host):
                    session.query(model).delete()
                session.commit()
            payload = dict(APK_BATCH if path.endswith("/apk") else BATCH)
            payload["hostname"] = hostname
            if path.endswith("/apk") and "packages" in payload:
                payload["packages"] = [dict(value) for value in payload["packages"]]
            response = await client.post(path, json=payload, headers={"X-API-Key": key})
            assert response.status_code == expected
            with factory() as session:
                package_count = session.query(models.PackageUpdate).count()
                host_count = session.query(models.Host).count()
            if expected == 403:
                assert response.json() == {"detail": "Hostname not authorized for this API key"}
                assert (package_count, host_count) == (0, 0)
            else:
                assert package_count == 1
                assert host_count >= 1


async def _list_items(client: AsyncClient, headers: dict[str, str]) -> list[dict]:
    response = await client.get("/api/v1/admin/api-keys", headers=headers)
    assert response.status_code == 200
    return response.json()["items"]
