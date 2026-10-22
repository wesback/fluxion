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

    async def execute(self, *args, **kwargs): return self._session.execute(*args, **kwargs)
    async def commit(self): self._session.commit()
    async def rollback(self): self._session.rollback()
    async def flush(self): self._session.flush()
    async def refresh(self, value): self._session.refresh(value)
    def add(self, value): self._session.add(value)


@pytest_asyncio.fixture
async def ingest_authorization(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'api_key_update.sqlite'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    async def get_test_session():
        with factory() as session:
            yield AsyncOverSync(session)

    auth_globals = auth_module.APIKeyAuthMiddleware.dispatch.__globals__
    original_auth = auth_globals["get_session"]
    original_updates = updates_module.get_session
    original_admin = admin_module.get_session
    auth_globals["get_session"] = get_test_session
    monkeypatch.setattr(updates_module, "get_session", get_test_session)
    monkeypatch.setattr(admin_module, "get_session", get_test_session)
    production_app.dependency_overrides[original_updates] = get_test_session
    production_app.dependency_overrides[original_admin] = get_test_session

    admin_key = generate_api_key()
    with factory() as session:
        session.add(models.APIKey(name="Admin", key_hash=hash_api_key(admin_key), role="admin", is_active=True, allowed_hosts=[], host_scope="all"))
        session.commit()

    async with AsyncClient(transport=ASGITransport(app=production_app), base_url="http://test") as client:
        yield {"client": client, "factory": factory, "admin_key": admin_key}

    production_app.dependency_overrides.clear()
    auth_globals["get_session"] = original_auth
    engine.dispose()


def seed_key(factory, name="Key", role="user", scope="listed", hosts=None):
    key = generate_api_key()
    with factory() as session:
        obj = models.APIKey(name=name, key_hash=hash_api_key(key), role=role, is_active=True, allowed_hosts=hosts or [], host_scope=scope)
        session.add(obj)
        session.commit()
        session.refresh(obj)
        return key, obj.id


@pytest.mark.asyncio
async def test_update_host_scope_contract(ingest_authorization):
    client = ingest_authorization["client"]
    factory = ingest_authorization["factory"]
    headers = {"X-API-Key": ingest_authorization["admin_key"]}

    cases = (
        ("listed", ["node1.example.test"], {"allowed_hosts": ["Node2.example.test"]}, 200, "listed", ["node2.example.test"]),
        ("listed", ["node1.example.test"], {"host_scope": "all"}, 200, "all", ["node1.example.test"]),
        ("all", [], {"host_scope": "listed", "allowed_hosts": ["node1.example.test"]}, 200, "listed", ["node1.example.test"]),
        ("listed", ["node1.example.test"], {"allowed_hosts": []}, 422, "listed", ["node1.example.test"]),
        ("listed", ["node1.example.test"], {"allowed_hosts": ["*.example.test"]}, 422, "listed", ["node1.example.test"]),
        ("all", [], {"host_scope": "some"}, 422, "all", []),
    )
    for scope, hosts, body, expected_status, expected_scope, expected_hosts in cases:
        key, key_id = seed_key(factory, scope=scope, hosts=list(hosts))
        original_hash = None
        with factory() as session:
            original_hash = session.query(models.APIKey).filter_by(id=key_id).one().key_hash
        response = await client.patch(f"/api/v1/admin/api-keys/{key_id}", json=body, headers=headers)
        assert response.status_code == expected_status
        with factory() as session:
            stored = session.query(models.APIKey).filter_by(id=key_id).one()
            assert stored.host_scope == expected_scope
            assert stored.allowed_hosts == expected_hosts
            assert stored.key_hash == original_hash

    missing = await client.patch("/api/v1/admin/api-keys/999999", json={"host_scope": "all"}, headers=headers)
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_update_takes_effect_and_requires_admin(ingest_authorization):
    client = ingest_authorization["client"]
    factory = ingest_authorization["factory"]
    user_key, key_id = seed_key(factory, name="Mutable", scope="listed", hosts=["node1.example.test"])
    admin_headers = {"X-API-Key": ingest_authorization["admin_key"]}

    payload = {"hostname": "node9.example.test", "os_info": "Test Linux", "package_manager": "apt", "updates": [{"package_name": "openssl", "old_version": "1.0", "new_version": "2.0", "is_security": True}]}
    denied = await client.post("/api/v1/updates/batch", json=payload, headers={"X-API-Key": user_key})
    assert denied.status_code == 403
    assert denied.json() == {"detail": "Hostname not authorized for this API key"}

    updated = await client.patch(f"/api/v1/admin/api-keys/{key_id}", json={"host_scope": "all"}, headers=admin_headers)
    assert updated.status_code == 200
    assert updated.json()["host_scope"] == "all"
    allowed = await client.post("/api/v1/updates/batch", json=payload, headers={"X-API-Key": user_key})
    assert allowed.status_code == 201

    control = await client.get("/api/v1/admin/api-keys", headers={"X-API-Key": user_key})
    own_patch = await client.patch(f"/api/v1/admin/api-keys/{key_id}", json={"host_scope": "listed", "allowed_hosts": ["node3.example.test"]}, headers={"X-API-Key": user_key})
    assert own_patch.status_code == control.status_code
    assert own_patch.json() == control.json()
    with factory() as session:
        stored = session.query(models.APIKey).filter_by(id=key_id).one()
        assert stored.host_scope == "all"
        assert stored.allowed_hosts == ["node1.example.test"]
