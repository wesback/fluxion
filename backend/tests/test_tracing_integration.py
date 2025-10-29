"""Integration tests for OpenTelemetry tracing."""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch, MagicMock


@pytest.mark.asyncio
async def test_tracing_on_api_request():
    """Test that traces are created for API requests."""
    # Import here to ensure telemetry is initialized
    from fluxion.main import app
    
    # Mock the tracer to capture span creation
    with patch("fluxion.api.routes.updates.get_tracer") as mock_get_tracer:
        mock_tracer = MagicMock()
        mock_span = MagicMock()
        mock_span.__enter__ = MagicMock(return_value=mock_span)
        mock_span.__exit__ = MagicMock(return_value=False)
        mock_tracer.start_as_current_span = MagicMock(return_value=mock_span)
        mock_get_tracer.return_value = mock_tracer
        
        # Make a request
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/updates",
                json={
                    "hostname": "test-trace-host",
                    "package_name": "test-package",
                    "old_version": "1.0.0",
                    "new_version": "2.0.0",
                },
            )
            
            # We expect 500 because there's no database, but we should have attempted to create spans
            assert response.status_code in [201, 500]
            
            # Verify that spans were created
            assert mock_tracer.start_as_current_span.called


@pytest.mark.asyncio
async def test_batch_tracing_on_api_request():
    """Test that traces are created for batch API requests."""
    from fluxion.main import app
    
    with patch("fluxion.api.routes.updates.get_tracer") as mock_get_tracer:
        mock_tracer = MagicMock()
        mock_span = MagicMock()
        mock_span.__enter__ = MagicMock(return_value=mock_span)
        mock_span.__exit__ = MagicMock(return_value=False)
        mock_tracer.start_as_current_span = MagicMock(return_value=mock_span)
        mock_get_tracer.return_value = mock_tracer
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/updates/batch",
                json={
                    "hostname": "test-batch-trace-host",
                    "updates": [
                        {
                            "package_name": "package1",
                            "old_version": "1.0.0",
                            "new_version": "2.0.0",
                        },
                        {
                            "package_name": "package2",
                            "old_version": None,
                            "new_version": "1.0.0",
                        },
                    ],
                },
            )
            
            # We expect 500 because there's no database
            assert response.status_code in [201, 500]
            
            # Verify that spans were created (at minimum process_update should be called)
            assert mock_tracer.start_as_current_span.called
            # We expect at least process_update span to be created
            assert mock_tracer.start_as_current_span.call_count >= 1


@pytest.mark.asyncio
async def test_health_endpoint_does_not_require_tracing():
    """Test that health endpoint works regardless of tracing status."""
    from fluxion.main import app
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}


@pytest.mark.asyncio
async def test_custom_span_attributes():
    """Test that custom span attributes are set correctly."""
    from fluxion.main import app
    
    with patch("fluxion.api.routes.updates.get_tracer") as mock_get_tracer:
        mock_tracer = MagicMock()
        mock_span = MagicMock()
        mock_span.__enter__ = MagicMock(return_value=mock_span)
        mock_span.__exit__ = MagicMock(return_value=False)
        mock_tracer.start_as_current_span = MagicMock(return_value=mock_span)
        mock_get_tracer.return_value = mock_tracer
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/updates",
                json={
                    "hostname": "test-attr-host",
                    "package_name": "test-package",
                    "old_version": "1.0.0",
                    "new_version": "2.0.0",
                },
            )
            
            # Verify that the process_update span was created
            mock_tracer.start_as_current_span.assert_any_call("process_update")
            
            # Verify that attributes were set on the span
            assert mock_span.set_attribute.called
            # Check that hostname attribute was set
            calls = [str(call) for call in mock_span.set_attribute.call_args_list]
            assert any("test-attr-host" in call for call in calls)
