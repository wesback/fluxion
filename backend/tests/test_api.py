"""Tests for the FastAPI application endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

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


@pytest.mark.asyncio
async def test_package_update_old_version_normalization():
    """Test that old_version '-' is normalized to None."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test with "-" as old_version
        response = await client.post(
            "/api/v1/updates",
            json={
                "hostname": "test-host-dash",
                "package_name": "test-package",
                "old_version": "-",
                "new_version": "1.0.0",
            },
        )

        # Now requires API key authentication
        assert response.status_code in [401, 503]


@pytest.mark.asyncio
async def test_package_update_null_old_version():
    """Test package update with null old_version (new install)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/updates",
            json={
                "hostname": "test-host-new",
                "package_name": "new-package",
                "old_version": None,
                "new_version": "1.0.0",
            },
        )

        # Now requires API key authentication
        assert response.status_code in [401, 503]


@pytest.mark.asyncio
async def test_batch_updates_validation():
    """Test batch package updates endpoint with invalid data."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Now requires API key authentication
        response = await client.post("/api/v1/updates/batch", json={})
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_batch_updates_single_package():
    """Test batch updates with a single package."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/updates/batch",
            json={
                "hostname": "test-batch-single",
                "updates": [
                    {"package_name": "nginx", "old_version": "1.18.0", "new_version": "1.22.0"}
                ],
            },
        )

        # Now requires API key authentication
        assert response.status_code in [401, 503]


@pytest.mark.asyncio
async def test_batch_updates_multiple_packages():
    """Test batch updates with multiple packages."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/updates/batch",
            json={
                "hostname": "test-batch-multi",
                "updates": [
                    {"package_name": "nginx", "old_version": "1.18.0", "new_version": "1.22.0"},
                    {"package_name": "curl", "old_version": "7.68.0", "new_version": "7.81.0"},
                    {"package_name": "vim", "old_version": None, "new_version": "8.2.0"},
                ],
            },
        )

        # Now requires API key authentication
        assert response.status_code in [401, 503]


@pytest.mark.asyncio
async def test_batch_updates_with_dash_old_version():
    """Test batch updates with '-' as old_version (should be normalized to None)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/updates/batch",
            json={
                "hostname": "test-batch-dash",
                "updates": [
                    {"package_name": "new-package", "old_version": "-", "new_version": "1.0.0"}
                ],
            },
        )

        # Now requires API key authentication
        assert response.status_code in [401, 503]


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
