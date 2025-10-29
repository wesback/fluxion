"""Main FastAPI application for Fluxion package update tracking."""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from fluxion.api.routes import health, updates
from fluxion.config import settings
from fluxion.database import close_db


# Configure structured logging
def setup_logging() -> None:
    """Configure structured JSON logging."""
    # Create a custom formatter for JSON-like structured logs
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # Configure root logger
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper()),
        format=log_format,
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # Set uvicorn loggers to match our log level
    logging.getLogger("uvicorn").setLevel(getattr(logging, settings.log_level.upper()))
    logging.getLogger("uvicorn.access").setLevel(getattr(logging, settings.log_level.upper()))


setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.

    Args:
        app: FastAPI application instance
    """
    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Database URL: {settings.database_url.split('@')[-1]}")  # Log without credentials
    yield
    # Shutdown
    logger.info("Shutting down application")
    await close_db()


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API for receiving package update webhooks from APT hooks",
    lifespan=lifespan,
)


# Exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handle validation errors with structured error response.

    Args:
        request: The request that caused the error
        exc: The validation error exception

    Returns:
        JSONResponse with validation error details
    """
    logger.warning(f"Validation error on {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": "Validation error", "errors": exc.errors()},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """
    Handle general exceptions with structured error response.

    Args:
        request: The request that caused the error
        exc: The exception

    Returns:
        JSONResponse with error details
    """
    logger.error(f"Unhandled exception on {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(updates.router, prefix="/api/v1", tags=["Package Updates"])


# Root endpoint
@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint redirects to docs."""
    return {
        "message": f"Welcome to {settings.app_name} API",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
        "ready": "/ready",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "fluxion.main:app",
        host=settings.api_host,
        port=settings.api_port,
        log_level=settings.log_level.lower(),
        reload=False,
    )
