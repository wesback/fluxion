"""Tests for webhook functionality."""

import pytest
from httpx import ASGITransport, AsyncClient

from fluxion.main import app
from fluxion.services import WebhookService, is_kernel_package
from fluxion.services.webhook_service import normalize_ntfy_publish_url
from fluxion.services.webhook_service import (
    format_ntfy_message,
    get_ntfy_notification_metadata,
    is_ntfy_webhook,
    sanitize_header_values,
)


# Test kernel package detection
def test_is_kernel_package():
    """Test kernel package detection."""
    assert is_kernel_package("linux-image-5.15.0-91-generic")
    assert is_kernel_package("linux-headers-5.15.0-91-generic")
    assert is_kernel_package("linux-modules-5.15.0-91-generic")
    assert not is_kernel_package("nginx")
    assert not is_kernel_package("curl")
    assert not is_kernel_package("linux")  # Too short


def test_get_event_types_for_package_install():
    """New installs should trigger package_install only for non-kernel packages."""
    service = WebhookService(None)  # type: ignore[arg-type]
    event_types = service.get_event_types_for_package("nginx", None)
    assert event_types == ["package_install"]


def test_get_event_types_for_package_update():
    """Version updates should trigger package_update only for non-kernel packages."""
    service = WebhookService(None)  # type: ignore[arg-type]
    event_types = service.get_event_types_for_package("nginx", "1.18.0")
    assert event_types == ["package_update"]


def test_get_event_types_for_kernel_package_install():
    """Kernel installs should trigger package_install and kernel_update."""
    service = WebhookService(None)  # type: ignore[arg-type]
    event_types = service.get_event_types_for_package("linux-image-6.8.0", None)
    assert event_types == ["package_install", "kernel_update"]


def test_get_event_types_for_kernel_package_update():
    """Kernel updates should trigger package_update and kernel_update."""
    service = WebhookService(None)  # type: ignore[arg-type]
    event_types = service.get_event_types_for_package("linux-image-6.8.0", "6.7.0")
    assert event_types == ["package_update", "kernel_update"]


def test_get_event_types_for_security_package_update():
    """Security package updates should include security_update."""
    service = WebhookService(None)  # type: ignore[arg-type]
    event_types = service.get_event_types_for_package("openssl", "3.0.2", is_security=True)
    assert event_types == ["package_update", "security_update"]


def test_get_event_types_for_kernel_security_package_install():
    """Kernel security installs should trigger install, kernel, and security events."""
    service = WebhookService(None)  # type: ignore[arg-type]
    event_types = service.get_event_types_for_package(
        "linux-image-6.8.0",
        None,
        is_security=True,
    )
    assert event_types == ["package_install", "kernel_update", "security_update"]


def test_normalize_ntfy_publish_url_removes_json_suffix():
    """ntfy /json URL should be normalized to topic publish URL."""
    assert normalize_ntfy_publish_url("https://ntfy.sh/fluxion-alerts/json") == "https://ntfy.sh/fluxion-alerts"


def test_normalize_ntfy_publish_url_keeps_publish_url():
    """Already-correct ntfy publish URL should be unchanged."""
    assert normalize_ntfy_publish_url("https://ntfy.sh/fluxion-alerts") == "https://ntfy.sh/fluxion-alerts"


def test_is_ntfy_webhook():
    """Detect ntfy URLs reliably."""
    assert is_ntfy_webhook("https://ntfy.sh/my-topic")
    assert is_ntfy_webhook("https://Ntfy.sh/my-topic")
    assert not is_ntfy_webhook("https://example.com/webhook")


def test_get_ntfy_notification_metadata_kernel_update():
    """Kernel update metadata should have elevated urgency."""
    title, priority, tags = get_ntfy_notification_metadata("kernel_update")
    assert title == "Kernel Update"
    assert priority == "urgent"
    assert tags == "warning,computer"


def test_sanitize_header_values_removes_non_ascii():
    """Webhook headers should be sanitized to avoid httpx ASCII encoding errors."""
    headers = {
        "Title": "🧪 Fluxion Webhook Test",
        "Priority": "default",
        "X-Custom": "hello",
    }

    sanitized = sanitize_header_values(headers)

    assert sanitized["Title"] == "Fluxion Webhook Test"
    assert sanitized["Priority"] == "default"
    assert sanitized["X-Custom"] == "hello"


def test_format_ntfy_message_is_human_readable():
    """ntfy message should be readable plain text, not JSON."""
    payload = {
        "hostname": "server-01",
        "package_name": "linux-image-6.8.0",
        "old_version": "6.7.0",
        "new_version": "6.8.0",
        "timestamp": "2026-02-16T12:34:56Z",
    }

    message = format_ntfy_message(payload, "kernel_update")

    assert "Host: server-01" in message
    assert "Package: linux-image-6.8.0" in message
    assert "Version: 6.7.0 → 6.8.0" in message
    assert "Time: 2026-02-16T12:34:56Z" in message
    assert "{" not in message


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
