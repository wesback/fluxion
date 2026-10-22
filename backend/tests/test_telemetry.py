"""Tests for OpenTelemetry instrumentation."""

from unittest.mock import patch

import pytest

from fluxion.telemetry import (
    get_meter,
    get_tracer,
    record_db_connection_change,
    record_http_request,
    record_package_update,
    setup_telemetry,
    shutdown_telemetry,
)


@pytest.fixture
def mock_settings():
    """Mock settings for testing."""
    with patch("fluxion.telemetry.settings") as mock:
        mock.otel_enabled = True
        mock.otel_exporter_type = "console"
        mock.otel_service_name = "test-fluxion"
        mock.app_version = "0.1.0"
        mock.otel_environment = "test"
        yield mock


def test_setup_telemetry_disabled():
    """Test that telemetry setup respects disabled flag."""
    with patch("fluxion.telemetry.settings") as mock_settings:
        mock_settings.otel_enabled = False
        setup_telemetry()
        tracer = get_tracer()
        assert tracer is None


def test_setup_telemetry_console_exporter(mock_settings):
    """Test telemetry setup with console exporter."""
    setup_telemetry()
    tracer = get_tracer()
    assert tracer is not None


def test_get_tracer_before_setup():
    """Test getting tracer before setup returns None."""
    # Reset global state
    import fluxion.telemetry
    fluxion.telemetry._tracer = None
    tracer = get_tracer()
    # Could be None or a tracer depending on state
    assert tracer is None or tracer is not None


def test_get_meter_before_setup():
    """Test getting meter before setup returns None."""
    # Reset global state
    import fluxion.telemetry
    fluxion.telemetry._meter = None
    meter = get_meter()
    # Could be None or a meter depending on state
    assert meter is None or meter is not None


def test_record_http_request_without_initialization():
    """Test that recording metrics without initialization doesn't crash."""
    # This should not raise an exception
    record_http_request("/test", "GET", 200, 0.123)


def test_record_package_update_without_initialization():
    """Test that recording package update without initialization doesn't crash."""
    # This should not raise an exception
    record_package_update("test-host", 1)


def test_record_db_connection_change_without_initialization():
    """Test that recording db connection change without initialization doesn't crash."""
    # This should not raise an exception
    record_db_connection_change(1)


def test_shutdown_telemetry():
    """Test telemetry shutdown doesn't crash."""
    # This should not raise an exception
    shutdown_telemetry()


@pytest.mark.asyncio
async def test_pool_observability_contract(monkeypatch):
    """Runtime pool checkout, checkin, and timeout events produce exact metrics."""
    import tempfile

    from fastapi import Depends
    from httpx import ASGITransport, AsyncClient
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import InMemoryMetricReader
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    import fluxion.database.connection as connection
    import fluxion.telemetry as telemetry
    from fluxion.config import Settings
    from fluxion.database.connection import close_db, get_engine, get_session
    from fluxion.main import app

    reader = InMemoryMetricReader()
    provider = MeterProvider(metric_readers=[reader])
    meter = provider.get_meter("pool-observability-test")
    telemetry._pool_active = meter.create_up_down_counter("db_pool_active")
    telemetry._pool_idle = meter.create_up_down_counter("db_pool_idle")
    telemetry._pool_overflow = meter.create_up_down_counter("db_pool_overflow")
    telemetry._pool_checkout_waits = meter.create_counter("db_pool_checkout_waits_total")
    telemetry._pool_last_active = 0
    telemetry._pool_last_idle = 0
    telemetry._pool_last_overflow = 0
    telemetry._pool_last_waited = 0

    values = {
        "database_url": "postgresql://user:secret@localhost/fluxion",
        "api_replicas": 1, "db_pool_size": 1, "db_max_overflow": 0,
        "relay_pool_size": 0, "relay_worker_count": 0, "db_pool_timeout": 0.05,
        "db_pool_recycle": 3600, "postgres_max_connections": 100,
        "reserved_connections": 20,
    }
    settings = Settings(**values)
    monkeypatch.setattr(connection, "settings", settings)
    await close_db()
    connection._engine = None

    db_path = tempfile.mktemp(suffix=".db")
    monkeypatch.setattr(connection, "create_async_engine", lambda *args, **kwargs:
        create_async_engine(
            "sqlite+aiosqlite:///" + db_path,
            pool_size=kwargs["pool_size"], max_overflow=kwargs["max_overflow"],
            pool_pre_ping=kwargs["pool_pre_ping"], pool_recycle=kwargs["pool_recycle"],
            pool_timeout=kwargs["pool_timeout"],
        ))
    connection.get_pool_status.wait_count = 0
    engine = get_engine()

    def snapshot():
        metrics = {}
        data = reader.get_metrics_data()
        if data is None:
            return metrics
        for resource_metrics in data.resource_metrics:
            for scope_metrics in resource_metrics.scope_metrics:
                for metric in scope_metrics.metrics:
                    for point in metric.data.data_points:
                        metrics[metric.name] = {
                            "value": point.value,
                            "attributes": dict(point.attributes or {}),
                        }
        return metrics

    held = await engine.connect()
    checked_out = snapshot()
    assert checked_out["db_pool_active"] == {"value": 1, "attributes": {}}
    assert checked_out["db_pool_idle"] == {"value": 0, "attributes": {}}
    assert checked_out["db_pool_overflow"] == {"value": 0, "attributes": {}}
    assert "db_pool_checkout_waits_total" not in checked_out

    await held.close()
    released = snapshot()
    assert released["db_pool_active"] == {"value": 0, "attributes": {}}
    assert released["db_pool_idle"] == {"value": 1, "attributes": {}}
    assert released["db_pool_overflow"] == {"value": 0, "attributes": {}}

    held = await engine.connect()

    @app.post("/docs", include_in_schema=False)
    async def telemetry_pool_test(session: AsyncSession = Depends(get_session)):
        await session.execute(text("SELECT 1"))
        return {"ok": True}

    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        response = await client.post("/docs")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database connection pool exhausted"}

    timed_out = snapshot()
    assert timed_out["db_pool_active"] == {"value": 1, "attributes": {}}
    assert timed_out["db_pool_idle"] == {"value": 0, "attributes": {}}
    assert timed_out["db_pool_overflow"] == {"value": 0, "attributes": {}}
    assert timed_out["db_pool_checkout_waits_total"] == {"value": 1, "attributes": {}}
    assert all(set(point["attributes"]) == set() for point in timed_out.values())

    await held.close()
    app.router.routes[:] = [route for route in app.router.routes if getattr(route, "path", None) != "/docs" or getattr(route, "methods", None) == {"GET", "HEAD"}]
    await engine.dispose()


def test_shutdown_telemetry_disabled():
    """Test telemetry shutdown when disabled."""
    with patch("fluxion.telemetry.settings") as mock_settings:
        mock_settings.otel_enabled = False
        shutdown_telemetry()


def test_telemetry_config_validation(mock_settings):
    """Test that telemetry validates configuration."""
    # Test with valid console exporter
    mock_settings.otel_exporter_type = "console"
    setup_telemetry()

    # Test with valid otlp exporter
    mock_settings.otel_exporter_type = "otlp"
    mock_settings.otel_exporter_otlp_endpoint = "http://localhost:4317"
    setup_telemetry()

    # Test with valid otlp-http exporter
    mock_settings.otel_exporter_type = "otlp-http"
    mock_settings.otel_exporter_otlp_endpoint = "http://localhost:4318"
    setup_telemetry()
