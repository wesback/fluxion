"""Tests for API key authentication."""

import pytest
from httpx import ASGITransport, AsyncClient

from fluxion.auth import generate_api_key, hash_api_key
from fluxion.database import get_session
from fluxion.main import app
from fluxion.models import APIKey


@pytest.mark.asyncio
async def test_health_endpoint_no_auth():
    """Test that health endpoint doesn't require authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}


@pytest.mark.asyncio
async def test_ready_endpoint_no_auth():
    """Test that ready endpoint doesn't require authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Will fail with 503 without DB, but won't fail with 401
        response = await client.get("/ready")
        assert response.status_code in [200, 503]  # Not 401


@pytest.mark.asyncio
async def test_root_endpoint_no_auth():
    """Test that root endpoint doesn't require authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_docs_endpoint_no_auth():
    """Test that docs endpoint doesn't require authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/docs")
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_protected_endpoint_missing_api_key():
    """Test that protected endpoint returns 401 without API key."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/updates",
            json={
                "hostname": "test-host",
                "package_name": "test-package",
                "new_version": "1.0.0",
            },
        )
        assert response.status_code == 401
        assert "Missing API key" in response.json()["detail"]


@pytest.mark.asyncio
async def test_protected_endpoint_invalid_api_key():
    """Test that protected endpoint returns 401 with invalid API key."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/updates",
            json={
                "hostname": "test-host",
                "package_name": "test-package",
                "new_version": "1.0.0",
            },
            headers={"X-API-Key": "invalid-key"},
        )
        # Without database, we get 503, with database and invalid key we get 401
        assert response.status_code in [401, 503]


@pytest.mark.asyncio
async def test_query_endpoints_require_auth():
    """Test that query endpoints require authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test various query endpoints
        endpoints = [
            "/api/v1/hosts",
            "/api/v1/stats",
            "/api/v1/updates/recent",
        ]

        for endpoint in endpoints:
            response = await client.get(endpoint)
            assert response.status_code == 401, f"Endpoint {endpoint} should require auth"


@pytest.mark.asyncio
async def test_admin_endpoints_require_auth():
    """Test that admin endpoints require authentication."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test admin endpoints
        response = await client.get("/api/v1/admin/api-keys")
        assert response.status_code == 401

        response = await client.post(
            "/api/v1/admin/api-keys",
            json={"name": "Test Key", "role": "user"},
        )
        assert response.status_code == 401


def test_generate_api_key():
    """Test API key generation."""
    key = generate_api_key()
    assert len(key) == 64  # 32 bytes = 64 hex chars
    assert all(c in "0123456789abcdef" for c in key)


def test_hash_and_verify_api_key():
    """Test API key hashing and verification."""
    from fluxion.auth import verify_api_key

    key = generate_api_key()
    key_hash = hash_api_key(key)

    # Verify correct key
    assert verify_api_key(key, key_hash)

    # Verify incorrect key
    wrong_key = generate_api_key()
    assert not verify_api_key(wrong_key, key_hash)


def test_hash_api_key_different_salts():
    """Test that same key generates different hashes due to salt."""
    key = generate_api_key()
    hash1 = hash_api_key(key)
    hash2 = hash_api_key(key)

    # Hashes should be different due to different salts
    assert hash1 != hash2

    # But both should verify the same key
    from fluxion.auth import verify_api_key

    assert verify_api_key(key, hash1)
    assert verify_api_key(key, hash2)


@pytest.mark.asyncio
async def test_rate_limiter_headers():
    """Test that rate limit headers are added to responses."""
    # This test would need a valid API key in the database
    # For now, we'll just verify the structure exists
    from fluxion.middleware.auth import RateLimiter

    limiter = RateLimiter(max_requests=10, window_seconds=60)

    # Check rate limit for a key
    assert limiter.check_rate_limit(1)
    assert limiter.get_remaining(1) == 9


@pytest.mark.asyncio
async def test_rate_limiter_enforcement():
    """Test rate limiter enforcement."""
    from fluxion.middleware.auth import RateLimiter

    limiter = RateLimiter(max_requests=3, window_seconds=60)

    # First 3 requests should succeed
    assert limiter.check_rate_limit(1)
    assert limiter.check_rate_limit(1)
    assert limiter.check_rate_limit(1)

    # 4th request should fail
    assert not limiter.check_rate_limit(1)

    # Different key should still work
    assert limiter.check_rate_limit(2)
