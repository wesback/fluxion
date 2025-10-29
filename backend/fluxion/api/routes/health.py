"""Health check routes."""

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from fluxion.database import get_engine
from fluxion.schemas.package_update import HealthResponse, ReadinessResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Health check",
    description="Basic health check endpoint that always returns healthy if the service is running",
)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.

    Returns:
        HealthResponse indicating the service is healthy
    """
    return HealthResponse(status="healthy")


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    status_code=status.HTTP_200_OK,
    summary="Readiness check",
    description="Readiness check that verifies database connectivity",
)
async def readiness_check() -> ReadinessResponse:
    """
    Readiness check endpoint that verifies database connectivity.

    Returns:
        ReadinessResponse with database connection status

    Raises:
        HTTPException: 503 if database connection fails
    """
    try:
        engine = get_engine()
        async with engine.connect() as conn:
            # Simple query to check database connectivity
            await conn.execute(text("SELECT 1"))
        logger.debug("Database connection check passed")
        return ReadinessResponse(status="ready", database="connected")
    except Exception as e:
        logger.error(f"Database connection check failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database connection failed: {str(e)}",
        ) from e
