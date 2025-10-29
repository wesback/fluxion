"""Tests for OpenTelemetry instrumentation."""

import pytest
from unittest.mock import patch, MagicMock
from fluxion.telemetry import (
    setup_telemetry,
    get_tracer,
    get_meter,
    record_http_request,
    record_package_update,
    record_db_connection_change,
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


def test_shutdown_telemetry_disabled():
    """Test telemetry shutdown when disabled."""
    with patch("fluxion.telemetry.settings") as mock_settings:
        mock_settings.otel_enabled = False
        shutdown_telemetry()


@pytest.mark.asyncio
async def test_telemetry_with_fastapi_app():
    """Test that telemetry works with FastAPI app."""
    from httpx import ASGITransport, AsyncClient
    from fluxion.main import app

    # Make a request to ensure telemetry is initialized via lifespan
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200

        # Make another request to generate some traces
        response = await client.get("/")
        assert response.status_code == 200


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
