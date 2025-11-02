"""Tests for webhook functionality."""

import pytest
from httpx import ASGITransport, AsyncClient

from fluxion.main import app
from fluxion.services import is_kernel_package


# Test kernel package detection
def test_is_kernel_package():
    """Test kernel package detection."""
    assert is_kernel_package("linux-image-5.15.0-91-generic")
    assert is_kernel_package("linux-headers-5.15.0-91-generic")
    assert is_kernel_package("linux-modules-5.15.0-91-generic")
    assert not is_kernel_package("nginx")
    assert not is_kernel_package("curl")
    assert not is_kernel_package("linux")  # Too short


@pytest.mark.asyncio
async def test_webhook_endpoints_require_auth():
    """Test that webhook endpoints require authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test create webhook without auth
        response = await client.post(
            "/api/v1/admin/webhooks",
            json={
                "name": "test",
                "url": "https://example.com/webhook",
                "enabled": True,
                "event_types": ["kernel_update"],
            },
        )
        assert response.status_code == 401

        # Test list webhooks without auth
        response = await client.get("/api/v1/admin/webhooks")
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_openapi_includes_webhook_endpoints():
    """Test that OpenAPI schema includes webhook endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/openapi.json")
        assert response.status_code == 200

        openapi = response.json()
        paths = openapi["paths"]

        # Check webhook endpoints are documented
        assert "/api/v1/admin/webhooks" in paths
        assert "post" in paths["/api/v1/admin/webhooks"]
        assert "get" in paths["/api/v1/admin/webhooks"]


@pytest.mark.asyncio
async def test_webhook_config_validation():
    """Test webhook configuration validation."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test create webhook with invalid data (missing required fields)
        response = await client.post(
            "/api/v1/admin/webhooks",
            json={},
        )
        # Should fail with 401 (auth) or 400 (validation) - both are acceptable
        assert response.status_code in [400, 401]


@pytest.mark.asyncio
async def test_webhook_update_validation():
    """Test webhook update validation."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test update non-existent webhook without auth
        response = await client.patch(
            "/api/v1/admin/webhooks/999",
            json={"enabled": False},
        )
        # Should fail with 401 (no auth)
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_webhook_test_endpoint():
    """Test webhook test endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test webhook test without auth
        response = await client.post(
            "/api/v1/admin/webhooks/1/test",
            json={},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_webhook_history_endpoint():
    """Test webhook history endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test webhook history without auth
        response = await client.get("/api/v1/admin/webhooks/1/history")
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_webhook_delete_endpoint():
    """Test webhook delete endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test delete webhook without auth
        response = await client.delete("/api/v1/admin/webhooks/1")
        assert response.status_code == 401
