"""Main FastAPI application for Fluxion package update tracking."""

import json
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from fluxion.api.routes import health, query, updates
from fluxion.config import settings
from fluxion.database import close_db, get_engine
from fluxion.telemetry import (
    instrument_app,
    instrument_sqlalchemy,
    setup_telemetry,
    shutdown_telemetry,
)


# Configure structured logging with OpenTelemetry integration
def setup_logging() -> None:
    """Configure structured JSON logging with trace context."""

    class TraceContextFormatter(logging.Formatter):
        """Custom formatter that adds trace context to log records."""

        def format(self, record: logging.LogRecord) -> str:
            # Try to get trace context from OpenTelemetry
            from opentelemetry import trace

            span = trace.get_current_span()
            if span and span.get_span_context().is_valid:
                trace_id = format(span.get_span_context().trace_id, "032x")
                span_id = format(span.get_span_context().span_id, "016x")
                record.trace_id = trace_id
                record.span_id = span_id
            else:
                record.trace_id = "0" * 32
                record.span_id = "0" * 16

            # Create structured log entry
            log_data = {
                "timestamp": self.formatTime(record, self.datefmt),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                "trace_id": record.trace_id,
                "span_id": record.span_id,
            }

            # Add exception info if present
            if record.exc_info:
                log_data["exception"] = self.formatException(record.exc_info)

            return json.dumps(log_data)

    # Create handler with custom formatter
    handler = logging.StreamHandler(sys.stdout)
    formatter = TraceContextFormatter()
    handler.setFormatter(formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.log_level.upper()))
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Set uvicorn loggers to match our log level
    logging.getLogger("uvicorn").setLevel(getattr(logging, settings.log_level.upper()))
    logging.getLogger("uvicorn.access").setLevel(getattr(logging, settings.log_level.upper()))


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

    # Initialize OpenTelemetry
    setup_telemetry()

    # Instrument SQLAlchemy
    engine = get_engine()
    instrument_sqlalchemy(engine)

    # Instrument FastAPI app
    instrument_app(app)

    yield

    # Shutdown
    logger.info("Shutting down application")
    shutdown_telemetry()
    await close_db()


# Initialize logging before creating app
setup_logging()
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API for receiving package update webhooks and querying package data",
    lifespan=lifespan,
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
app.include_router(query.router, prefix="/api/v1", tags=["Query & Analytics"])


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
