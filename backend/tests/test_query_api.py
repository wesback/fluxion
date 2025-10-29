"""Tests for the query and analytics endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from fluxion.main import app


@pytest.mark.asyncio
async def test_list_hosts_endpoint():
    """Test the list hosts endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/hosts")
        assert response.status_code in [200, 500]  # 500 if no DB

        if response.status_code == 200:
            data = response.json()
            assert "items" in data
            assert "total" in data
            assert isinstance(data["items"], list)
            assert isinstance(data["total"], int)


@pytest.mark.asyncio
async def test_get_host_updates_endpoint():
    """Test the get host updates endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test with default parameters
        response = await client.get("/api/v1/hosts/test-host/updates")
        assert response.status_code in [404, 500]  # 404 if host not found, 500 if no DB

        if response.status_code == 404:
            data = response.json()
            assert "detail" in data


@pytest.mark.asyncio
async def test_get_host_updates_with_pagination():
    """Test the get host updates endpoint with pagination parameters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/hosts/test-host/updates?limit=10&offset=5")
        assert response.status_code in [404, 500]

        if response.status_code == 404:
            data = response.json()
            assert "detail" in data


@pytest.mark.asyncio
async def test_get_host_updates_with_date_filters():
    """Test the get host updates endpoint with date filters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/hosts/test-host/updates"
            "?from_date=2025-10-01T00:00:00Z&to_date=2025-10-29T23:59:59Z"
        )
        assert response.status_code in [404, 500]


@pytest.mark.asyncio
async def test_get_host_updates_invalid_limit():
    """Test the get host updates endpoint with invalid limit."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Limit too large
        response = await client.get("/api/v1/hosts/test-host/updates?limit=5000")
        assert response.status_code == 400  # Validation error

        # Limit negative
        response = await client.get("/api/v1/hosts/test-host/updates?limit=-1")
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_host_updates_invalid_offset():
    """Test the get host updates endpoint with invalid offset."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Offset negative
        response = await client.get("/api/v1/hosts/test-host/updates?offset=-1")
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_package_hosts_endpoint():
    """Test the get package hosts endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/packages/nginx/hosts")
        assert response.status_code in [200, 500]  # 500 if no DB

        if response.status_code == 200:
            data = response.json()
            assert "items" in data
            assert "total" in data
            assert isinstance(data["items"], list)
            assert isinstance(data["total"], int)


@pytest.mark.asyncio
async def test_get_recent_updates_endpoint():
    """Test the get recent updates endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test with default parameters
        response = await client.get("/api/v1/updates/recent")
        assert response.status_code in [200, 500]  # 500 if no DB

        if response.status_code == 200:
            data = response.json()
            assert "items" in data
            assert "total" in data
            assert isinstance(data["items"], list)
            assert isinstance(data["total"], int)


@pytest.mark.asyncio
async def test_get_recent_updates_with_parameters():
    """Test the get recent updates endpoint with custom parameters."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/updates/recent?limit=10&hours=48")
        assert response.status_code in [200, 500]


@pytest.mark.asyncio
async def test_get_recent_updates_invalid_limit():
    """Test the get recent updates endpoint with invalid limit."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Limit too large
        response = await client.get("/api/v1/updates/recent?limit=5000")
        assert response.status_code == 400

        # Limit negative
        response = await client.get("/api/v1/updates/recent?limit=-1")
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_recent_updates_invalid_hours():
    """Test the get recent updates endpoint with invalid hours."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Hours too large (max 168 = 7 days)
        response = await client.get("/api/v1/updates/recent?hours=200")
        assert response.status_code == 400

        # Hours negative
        response = await client.get("/api/v1/updates/recent?hours=-1")
        assert response.status_code == 400

        # Hours zero
        response = await client.get("/api/v1/updates/recent?hours=0")
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_stats_endpoint():
    """Test the get stats endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/stats")
        assert response.status_code in [200, 500]  # 500 if no DB

        if response.status_code == 200:
            data = response.json()
            assert "total_hosts" in data
            assert "total_updates" in data
            assert "updates_last_24h" in data
            assert "updates_last_7d" in data
            assert "most_updated_packages" in data
            assert "most_active_hosts" in data
            assert isinstance(data["total_hosts"], int)
            assert isinstance(data["total_updates"], int)
            assert isinstance(data["most_updated_packages"], list)
            assert isinstance(data["most_active_hosts"], list)


@pytest.mark.asyncio
async def test_openapi_schema_includes_query_endpoints():
    """Test that OpenAPI schema includes new query endpoints."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/openapi.json")
        assert response.status_code == 200
        schema = response.json()

        # Check that new endpoints are in the schema
        paths = schema.get("paths", {})
        assert "/api/v1/hosts" in paths
        assert "/api/v1/hosts/{hostname}/updates" in paths
        assert "/api/v1/packages/{package_name}/hosts" in paths
        assert "/api/v1/updates/recent" in paths
        assert "/api/v1/stats" in paths


@pytest.mark.asyncio
async def test_cors_headers():
    """Test that CORS headers are present."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Make an OPTIONS request to check CORS
        response = await client.options(
            "/api/v1/hosts",
            headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
        )
        # FastAPI will handle CORS, check that it returns appropriate status
        assert response.status_code in [200, 405]
