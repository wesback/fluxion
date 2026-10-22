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

    for field in ("database_url", "api_replicas", "db_pool_size", "db_max_overflow", "relay_pool_size", "relay_worker_count", "db_pool_timeout"):
        values = dict(VALID)
        values[field] = None
        with pytest.raises((RuntimeError, ValueError)):
            Settings(**values).validate_pool_startup()


@pytest.mark.parametrize("replicas,api_total,relay_total,valid", [(1,8,4,True),(10,8,8,False),(0,7,7,False),(11,7,7,False),(1,7,7,True),(1,8,8,True),(1,9,7,False),(1,7,9,False)])
def test_pool_replica_boundaries(replicas, api_total, relay_total, valid):
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
    await close_db()
    connection._engine = None
    settings = Settings(**VALID)
    monkeypatch.setattr(connection, "settings", settings)
    engine = get_engine()
    assert engine.sync_engine.pool._pre_ping is True
    assert engine.sync_engine.pool._recycle == 3600
    assert engine.sync_engine.pool._timeout == 5.0
    await engine.dispose()


@pytest.mark.parametrize("field", ["api_replicas","db_pool_size","db_max_overflow","relay_pool_size","relay_worker_count","db_pool_timeout","db_pool_recycle","postgres_max_connections","reserved_connections"])
def test_pool_environment_contract(field):
    value = "not-an-integer" if field != "db_pool_timeout" else "not-a-number"
    try:
        Settings(**dict(VALID, **{field: value}))
    except ValueError:
        return
    raise AssertionError("non-numeric pool setting was accepted")


@pytest.mark.parametrize("aggregate", [79,80,81])
def test_missing_pool_configuration_fails(aggregate):
    if aggregate == 81:
        with pytest.raises(RuntimeError, match="Aggregate application"):
            Settings(**dict(VALID, api_replicas=10, db_pool_size=7, db_max_overflow=1, relay_pool_size=8)).validate_pool_startup()


def test_existing_pool_configuration_suite():
    Settings(**VALID).validate_pool_startup()
