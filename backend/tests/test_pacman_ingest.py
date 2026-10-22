from pathlib import Path
from types import SimpleNamespace

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
async def ingest(tmp_path: Path, monkeypatch):
    engine = sa.create_engine(f"sqlite:///{tmp_path}/pacman.sqlite", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

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

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield SimpleNamespace(client=client, factory=factory, engine=engine)
    engine.dispose()


async def test_pacman_ingest_contract(ingest) -> None:
    payload = {
        "hostname": "arch1.example.test",
        "os_info": "Arch Linux",
        "updates": [
            {"package_name": "linux", "old_version": "6.11.1.arch1-1", "new_version": "6.11.2.arch1-1"},
            {"package_name": "vim", "old_version": "-", "new_version": "9.1.0785-1"},
        ],
    }

    response = await ingest.client.post("/api/v1/updates/ingest/pacman", json=payload)
    assert response.status_code == 201

    with ingest.factory() as session:
        rows = session.query(models.PackageUpdate).order_by(models.PackageUpdate.id).all()

    assert len(rows) == 2
    assert [row.package_manager for row in rows] == ["pacman", "pacman"]
    assert rows[0].old_version == "6.11.1.arch1-1"
    assert rows[1].old_version is None

    uppercase = await ingest.client.post("/api/v1/updates/ingest/PACMAN", json=payload)
    assert uppercase.status_code == 201

    with ingest.factory() as session:
        uppercase_rows = session.query(models.PackageUpdate).order_by(models.PackageUpdate.id).all()
        unknown_before = len(uppercase_rows)

    assert len(uppercase_rows) == 2
    assert all(row.package_manager == "pacman" for row in uppercase_rows)
    assert uppercase_rows[0].old_version == "6.11.1.arch1-1"
    assert uppercase_rows[1].old_version is None

    unknown = await ingest.client.post("/api/v1/updates/ingest/pacmn", json=payload)
    assert unknown.status_code == 400
    assert unknown.json() == {"detail": "Unsupported package manager; use dnf, yum, apk, or zypper"}
    with ingest.factory() as session:
        assert session.query(models.PackageUpdate).count() == unknown_before
