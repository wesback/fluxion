"""Authentication middleware for API key validation."""

import logging
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from fluxion.auth import update_last_used, validate_api_key
from fluxion.database import get_session
from fluxion.models import APIKey

logger = logging.getLogger(__name__)


class RateLimiter:
    """Simple in-memory rate limiter for API keys."""

    def __init__(self, max_requests: int = 1000, window_seconds: int = 3600):
        """
        Initialize rate limiter.

        Args:
            max_requests: Maximum requests allowed per window
            window_seconds: Time window in seconds (default 3600 = 1 hour)
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # Dict mapping api_key_id to (request_count, window_start)
        self.requests: dict[int, tuple[int, datetime]] = defaultdict(lambda: (0, datetime.now()))

    def check_rate_limit(self, api_key_id: int) -> bool:
        """
        Check if request is within rate limit.

        Args:
            api_key_id: The API key ID

        Returns:
            True if request is allowed, False if rate limited
        """
        now = datetime.now()
        count, window_start = self.requests[api_key_id]

        # Reset window if expired
        if now - window_start > timedelta(seconds=self.window_seconds):
            self.requests[api_key_id] = (1, now)
            return True

        # Check if within limit
        if count >= self.max_requests:
            return False

        # Increment counter
        self.requests[api_key_id] = (count + 1, window_start)
        return True

    def get_remaining(self, api_key_id: int) -> int:
        """Get remaining requests for an API key."""
        count, window_start = self.requests[api_key_id]
        now = datetime.now()

        # Reset if window expired
        if now - window_start > timedelta(seconds=self.window_seconds):
            return self.max_requests

        return max(0, self.max_requests - count)


# Global rate limiter instance
rate_limiter = RateLimiter(max_requests=1000, window_seconds=3600)


class APIKeyAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to validate API keys on protected endpoints.

    Exempt endpoints:
    - /health
    - /ready
    - /docs
    - /openapi.json
    - /redoc
    - / (root)
    """

    EXEMPT_PATHS = {"/health", "/ready", "/docs", "/openapi.json", "/redoc", "/"}

    async def dispatch(self, request: Request, call_next):
        """
        Process the request and validate API key if needed.

        Args:
            request: The incoming request
            call_next: The next middleware or route handler

        Returns:
            Response from the route handler or error response
        """
        # Check if path is exempt
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        # Get API key from header
        api_key = request.headers.get("X-API-Key")
        if not api_key:
            logger.warning(f"Missing API key for {request.url.path}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Missing API key. Provide X-API-Key header."},
            )

        # Validate API key
        try:
            async for session in get_session():
                # Check if admin role is required
                required_role = None
                if request.url.path.startswith("/api/v1/admin"):
                    required_role = "admin"

                key_obj: APIKey | None = await validate_api_key(api_key, session, required_role)

                if not key_obj:
                    logger.warning(f"Invalid API key for {request.url.path}")
                    return JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={"detail": "Invalid or inactive API key"},
                    )

                # Check rate limit
                if not rate_limiter.check_rate_limit(key_obj.id):
                    logger.warning(
                        f"Rate limit exceeded for API key {key_obj.id} ({key_obj.name})"
                    )
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "detail": "Rate limit exceeded. Maximum 1000 requests per hour."
                        },
                    )

                # Store API key info in request state for use in routes and telemetry
                request.state.api_key_id = key_obj.id
                request.state.api_key_name = key_obj.name
                request.state.api_key_role = key_obj.role

                # Add API key info to OpenTelemetry span if available
                try:
                    from opentelemetry import trace

                    span = trace.get_current_span()
                    if span and span.is_recording():
                        span.set_attribute("api_key.id", key_obj.id)
                        span.set_attribute("api_key.name", key_obj.name)
                        span.set_attribute("api_key.role", key_obj.role)
                except Exception as e:
                    logger.debug(f"Failed to add API key to span: {e}")

                # Process request
                response: Response = await call_next(request)

                # Update last_used timestamp after request (non-blocking)
                try:
                    await self._update_last_used_async(key_obj.id)
                except Exception as e:
                    logger.debug(f"Failed to update last_used: {e}")

                # Add rate limit headers
                remaining = rate_limiter.get_remaining(key_obj.id)
                response.headers["X-RateLimit-Limit"] = str(rate_limiter.max_requests)
                response.headers["X-RateLimit-Remaining"] = str(remaining)

                return response
        except Exception as e:
            # Database connection failed or other error
            logger.error(f"Error during authentication: {e}")
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"detail": "Service temporarily unavailable"},
            )

    async def _update_last_used_async(self, api_key_id: int) -> None:
        """
        Update last_used timestamp in background.

        Args:
            api_key_id: The API key ID to update
        """
        try:
            async for session in get_session():
                await update_last_used(api_key_id, session)
        except Exception as e:
            logger.error(f"Failed to update last_used for API key {api_key_id}: {e}")
