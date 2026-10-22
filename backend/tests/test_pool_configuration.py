import os
import subprocess
import sys
from pathlib import Path

import pytest

from fluxion.config import Settings
from fluxion.database.connection import close_db, get_engine


VALID = {
    "database_url": "postgresql+asyncpg://user:pass@localhost/fluxion",
    "api_replicas": 1,
    "db_pool_size": 4,
    "db_max_overflow": 4,
    "relay_pool_size": 4,
    "relay_worker_count": 4,
    "db_pool_timeout": 5.0,
    "db_pool_recycle": 3600,
    "postgres_max_connections": 100,
    "reserved_connections": 20,
}


def test_pool_configuration_contract():
    settings = Settings(**VALID)
    settings.validate_pool_startup()
    assert settings.db_pool_size + settings.db_max_overflow == 8

    for field in ("database_url", "api_replicas", "db_pool_size", "db_max_overflow", "relay_pool_size", "relay_worker_count", "db_pool_timeout", "db_pool_recycle", "postgres_max_connections", "reserved_connections"):
        values = dict(VALID)
        values[field] = None
        with pytest.raises((RuntimeError, ValueError)):
            Settings(**values).validate_pool_startup()


@pytest.mark.parametrize("replicas,api_total,relay_total,aggregate,valid", [(-1,7,7,None,False),(0,7,7,None,False),(11,7,7,None,False),(1,7,7,14,True),(1,8,8,16,True),(1,9,7,None,False),(1,7,9,None,False),(9,8,7,79,True),(10,8,0,80,True),(10,8,1,81,False)])
def test_pool_replica_boundaries(replicas, api_total, relay_total, aggregate, valid):
    values = dict(VALID, api_replicas=replicas, db_pool_size=api_total, db_max_overflow=0, relay_pool_size=relay_total)
    settings = Settings(**values)
    if valid:
        settings.validate_pool_startup()
    else:
        with pytest.raises(RuntimeError):
            settings.validate_pool_startup()


@pytest.mark.asyncio
async def test_pool_pre_ping_and_checkout_timeout(monkeypatch):
    import fluxion.database.connection as connection
    import time
    from sqlalchemy import create_engine
    from sqlalchemy.exc import TimeoutError
    from sqlalchemy.pool import QueuePool
    from httpx import ASGITransport, AsyncClient
    from fluxion.main import app

    await close_db()
    connection._engine = None
    values = dict(VALID, db_pool_size=1, db_max_overflow=0, db_pool_timeout=0.05)
    settings = Settings(**values)
    monkeypatch.setattr(connection, "settings", settings)
    engine = get_engine()
    assert engine.sync_engine.pool._pre_ping is True
    assert engine.sync_engine.pool._recycle == 3600
    assert engine.sync_engine.pool._timeout == 0.05

    sync_pool = create_engine("sqlite:///:memory:", poolclass=QueuePool, pool_size=1, max_overflow=0, pool_timeout=0.05, pool_pre_ping=True)
    held = sync_pool.connect()

    @app.post("/docs", include_in_schema=False)
    async def pool_saturation_test():
        try:
            with sync_pool.connect():
                return {"ok": True}
        except TimeoutError:
            raise TimeoutError()

    started = time.monotonic()
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        response = await client.post("/docs")
    elapsed = time.monotonic() - started
    assert response.status_code == 503
    assert response.content == b'{"detail":"Database connection pool exhausted"}'
    assert elapsed < 1.05

    held.close()
    stale = sync_pool.connect()
    stale.connection.dbapi_connection.close()
    stale.close()
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        recovery = await client.post("/docs")
    assert recovery.status_code == 200

    app.router.routes[:] = [route for route in app.router.routes if getattr(route, "path", None) != "/docs" or getattr(route, "methods", None) == {"GET", "HEAD"}]
    await engine.dispose()


@pytest.mark.parametrize("field", ["api_replicas","db_pool_size","db_max_overflow","relay_pool_size","relay_worker_count","db_pool_timeout","db_pool_recycle","postgres_max_connections","reserved_connections"])
def test_pool_environment_contract(monkeypatch, field):
    env_names = {
        "api_replicas": "API_REPLICAS", "db_pool_size": "API_POOL_SIZE",
        "db_max_overflow": "API_MAX_OVERFLOW", "relay_pool_size": "RELAY_POOL_SIZE",
        "relay_worker_count": "RELAY_WORKER_COUNT", "db_pool_timeout": "DB_POOL_TIMEOUT",
        "db_pool_recycle": "DB_POOL_RECYCLE", "postgres_max_connections": "POSTGRES_MAX_CONNECTIONS",
        "reserved_connections": "RESERVED_CONNECTIONS",
    }
    for env_name in env_names.values():
        monkeypatch.delenv(env_name, raising=False)
    for name, value in VALID.items():
        env_name = env_names.get(name, name.upper())
        monkeypatch.setenv(env_name, str(value))
    monkeypatch.setenv(env_names[field], "not-a-number")
    with pytest.raises(ValueError):
        Settings().validate_pool_startup()

    monkeypatch.setenv(env_names[field], "-1")
    settings = Settings()
    if field in ("api_replicas", "db_pool_size", "db_max_overflow", "relay_pool_size", "relay_worker_count", "db_pool_timeout", "db_pool_recycle"):
        negative_text = {
            "api_replicas": "API_REPLICAS must be between 1 and 10",
            "db_pool_size": "API_POOL_SIZE must be non-negative",
            "db_max_overflow": "API_MAX_OVERFLOW must be non-negative",
            "relay_pool_size": "RELAY_POOL_SIZE must be non-negative",
            "relay_worker_count": "RELAY_WORKER_COUNT must be non-negative",
            "db_pool_timeout": "DB_POOL_TIMEOUT must be positive",
            "db_pool_recycle": "DB_POOL_RECYCLE must be non-negative",
        }[field]
        with pytest.raises((RuntimeError, ValueError), match=negative_text.replace("-", "\\-")):
            settings.validate_pool_startup()
    else:
        with pytest.raises(RuntimeError, match="must be 100|must be 20"):
            settings.validate_pool_startup()

    for name, value in VALID.items():
        env_name = env_names.get(name, name.upper())
        monkeypatch.setenv(env_name, str(value))
    monkeypatch.setenv("API_REPLICAS", "10")
    monkeypatch.setenv("API_POOL_SIZE", "8")
    monkeypatch.setenv("API_MAX_OVERFLOW", "0")
    monkeypatch.setenv("RELAY_POOL_SIZE", "1")
    with pytest.raises(RuntimeError, match="Aggregate application pool allocation"):
        Settings().validate_pool_startup()


@pytest.mark.parametrize("aggregate", [79,80,81])
def test_missing_pool_configuration_fails(monkeypatch, aggregate):
    api_total = 8
    relay_total = 7 if aggregate == 79 else (0 if aggregate == 80 else 1)
    replicas = 9 if aggregate == 79 else 10
    values = dict(VALID, api_replicas=replicas, db_pool_size=api_total, db_max_overflow=0, relay_pool_size=relay_total)
    if aggregate == 81:
        values = dict(VALID, api_replicas=10, db_pool_size=8, db_max_overflow=0, relay_pool_size=1)
        with pytest.raises(RuntimeError, match="Aggregate application pool allocation"):
            Settings(**values).validate_pool_startup()
    else:
        Settings(**values).validate_pool_startup()

    import fluxion.database.connection as connection
    import fluxion.main as main
    monkeypatch.setattr(connection, "_engine", None)
    monkeypatch.setattr(connection, "_sessionmaker", None)
    calls = []
    monkeypatch.setattr(connection, "create_async_engine", lambda *args, **kwargs: calls.append((args, kwargs)))

    for field in ("database_url", "db_pool_size", "db_max_overflow", "relay_pool_size", "api_replicas", "db_pool_timeout"):
        missing = dict(VALID)
        missing[field] = None
        missing_settings = Settings(**missing)
        monkeypatch.setattr(connection, "settings", missing_settings)
        with pytest.raises((RuntimeError, ValueError)):
            connection.get_engine()
    assert calls == []

    for field, missing in ((field, None) for field in ("database_url", "db_pool_size", "db_max_overflow", "relay_pool_size", "api_replicas", "db_pool_timeout")):
        missing_settings = Settings(**dict(VALID, **{field: missing}))
        monkeypatch.setattr(main, "settings", missing_settings)
        with pytest.raises((RuntimeError, ValueError)):
            missing_settings.validate_pool_startup()
    assert calls == []

def test_existing_pool_configuration_suite():
    """Run the documented backend suite without recursively running this wrapper."""
    backend = Path(__file__).resolve().parent.parent
    completed = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-s", "-k", "not test_existing_pool_configuration_suite"],
        cwd=str(backend),
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
