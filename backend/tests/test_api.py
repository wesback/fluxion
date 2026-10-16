"""Tests for the FastAPI application endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from fluxion.api.routes.updates import _normalize_old_version
from fluxion.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    """Test the health check endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}


@pytest.mark.asyncio
async def test_root_endpoint():
    """Test the root endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "version" in data
        assert data["docs"] == "/docs"


@pytest.mark.asyncio
async def test_package_update_validation():
    """Test package update endpoint with invalid data."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Now requires API key authentication
        response = await client.post("/api/v1/updates", json={})
        assert response.status_code == 401


def test_normalize_old_version_install_sentinels():
    """Install sentinel old_version values should normalize to None."""
    sentinel_values = ["-", "N/A", "n/a", "None", "(none)", "<none>", "null", ""]
    for value in sentinel_values:
        assert _normalize_old_version(value) is None


def test_normalize_old_version_keeps_real_versions():
    """Real version values should remain unchanged."""
    assert _normalize_old_version("1.2.3") == "1.2.3"
    assert _normalize_old_version(" 1.2.3 ") == " 1.2.3 "


@pytest.mark.asyncio
async def test_batch_updates_missing_api_key():
    """Test that batch updates require authentication before validating the body."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Now requires API key authentication
        response = await client.post("/api/v1/updates/batch", json={})
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_openapi_docs():
    """Test that OpenAPI docs are accessible."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/docs")
        assert response.status_code == 200

        response = await client.get("/openapi.json")
        assert response.status_code == 200
        openapi_spec = response.json()
        assert "paths" in openapi_spec
        assert "/api/v1/updates" in openapi_spec["paths"]
        assert "/api/v1/updates/batch" in openapi_spec["paths"]
        assert "/health" in openapi_spec["paths"]
        assert "/ready" in openapi_spec["paths"]
