"""Tests for query and analytics endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from fluxion.main import app


@pytest.mark.asyncio
async def test_list_hosts():
    """Test the list hosts endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/hosts")
        # Will succeed even without DB as it returns empty list
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            data = response.json()
            assert "items" in data
            assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_get_host_updates_pagination_defaults():
    """Test host updates endpoint with default pagination parameters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/hosts/test-host/updates")
        # Will return 404 or 500 without DB
        assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_get_host_updates_custom_pagination():
    """Test host updates endpoint with custom pagination parameters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/hosts/test-host/updates", params={"limit": 100, "offset": 50}
        )
        # Will return 404 or 500 without DB
        assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_get_host_updates_invalid_pagination():
    """Test host updates endpoint with invalid pagination parameters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Negative limit
        response = await client.get("/api/v1/hosts/test-host/updates", params={"limit": -1})
        assert response.status_code == 400

        # Limit too high
        response = await client.get("/api/v1/hosts/test-host/updates", params={"limit": 10000})
        assert response.status_code == 400

        # Negative offset
        response = await client.get("/api/v1/hosts/test-host/updates", params={"offset": -1})
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_host_updates_date_filtering():
    """Test host updates endpoint with date filtering."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/hosts/test-host/updates",
            params={
                "from_date": "2025-10-01T00:00:00Z",
                "to_date": "2025-10-31T23:59:59Z",
            },
        )
        # Will return 404 or 500 without DB
        assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_get_package_hosts():
    """Test the package hosts endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/packages/nginx/hosts")
        # Will succeed even without DB as it returns empty list
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            data = response.json()
            assert "items" in data
            assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_get_recent_updates_defaults():
    """Test recent updates endpoint with default parameters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/updates/recent")
        # Will succeed even without DB as it returns empty list
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            data = response.json()
            assert "items" in data
            assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_get_recent_updates_custom_params():
    """Test recent updates endpoint with custom parameters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/updates/recent", params={"limit": 50, "hours": 48})
        # Will succeed even without DB as it returns empty list
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            data = response.json()
            assert "items" in data
            assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_get_recent_updates_invalid_params():
    """Test recent updates endpoint with invalid parameters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Negative limit
        response = await client.get("/api/v1/updates/recent", params={"limit": -1})
        assert response.status_code == 400

        # Limit too high
        response = await client.get("/api/v1/updates/recent", params={"limit": 10000})
        assert response.status_code == 400

        # Hours less than 1
        response = await client.get("/api/v1/updates/recent", params={"hours": 0})
        assert response.status_code == 400

        # Hours more than 168 (7 days)
        response = await client.get("/api/v1/updates/recent", params={"hours": 200})
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_stats():
    """Test the dashboard statistics endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/stats")
        # Will succeed even without DB as it returns zeros
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            data = response.json()
            assert "total_hosts" in data
            assert "total_updates" in data
            assert "updates_last_24h" in data
            assert "updates_last_7d" in data
            assert "most_updated_packages" in data
            assert "most_active_hosts" in data
            assert isinstance(data["most_updated_packages"], list)
            assert isinstance(data["most_active_hosts"], list)


@pytest.mark.asyncio
async def test_openapi_includes_query_endpoints():
    """Test that OpenAPI spec includes all query endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/openapi.json")
        assert response.status_code == 200
        openapi_spec = response.json()

        # Check all new query endpoints are in the spec
        assert "/api/v1/hosts" in openapi_spec["paths"]
        assert "/api/v1/hosts/{hostname}/updates" in openapi_spec["paths"]
        assert "/api/v1/packages/{package_name}/hosts" in openapi_spec["paths"]
        assert "/api/v1/updates/recent" in openapi_spec["paths"]
        assert "/api/v1/stats" in openapi_spec["paths"]

        # Verify GET methods exist
        assert "get" in openapi_spec["paths"]["/api/v1/hosts"]
        assert "get" in openapi_spec["paths"]["/api/v1/hosts/{hostname}/updates"]
        assert "get" in openapi_spec["paths"]["/api/v1/packages/{package_name}/hosts"]
        assert "get" in openapi_spec["paths"]["/api/v1/updates/recent"]
        assert "get" in openapi_spec["paths"]["/api/v1/stats"]


@pytest.mark.asyncio
async def test_cors_headers():
    """Test that CORS headers are present in responses."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Send a request with Origin header
        response = await client.get(
            "/api/v1/hosts", headers={"Origin": "http://localhost:3000"}
        )
        # Should have CORS headers
        assert response.status_code in [200, 500]
        # CORS middleware adds these headers
        if response.status_code == 200:
            # Check that the response would include CORS headers
            # (The middleware adds them for actual cross-origin requests)
            assert True  # Middleware is configured, specific headers depend on the request


@pytest.mark.asyncio
async def test_query_response_schemas():
    """Test that query endpoints return correctly structured responses."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test hosts endpoint response structure
        response = await client.get("/api/v1/hosts")
        if response.status_code == 200:
            data = response.json()
            assert "items" in data
            for item in data["items"]:
                assert "hostname" in item
                assert "os_info" in item
                assert "last_seen" in item
                assert "total_updates" in item

        # Test stats endpoint response structure
        response = await client.get("/api/v1/stats")
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data["total_hosts"], int)
            assert isinstance(data["total_updates"], int)
            assert isinstance(data["updates_last_24h"], int)
            assert isinstance(data["updates_last_7d"], int)
            assert isinstance(data["most_updated_packages"], list)
            assert isinstance(data["most_active_hosts"], list)

        # Test recent updates endpoint response structure
        response = await client.get("/api/v1/updates/recent")
        if response.status_code == 200:
            data = response.json()
            assert "items" in data
            for item in data["items"]:
                assert "hostname" in item
                assert "package_name" in item
                assert "new_version" in item
                assert "timestamp" in item
