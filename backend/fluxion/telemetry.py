"""OpenTelemetry instrumentation and configuration."""

import logging
from typing import Optional

from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
    OTLPMetricExporter as OTLPMetricExporterHTTP,
)
from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
    OTLPSpanExporter as OTLPSpanExporterHTTP,
)
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    ConsoleSpanExporter,
)

from fluxion.config import settings

logger = logging.getLogger(__name__)

# Global tracer and meter
_tracer: Optional[trace.Tracer] = None
_meter: Optional[metrics.Meter] = None

# Metrics instruments
_http_request_counter: Optional[metrics.Counter] = None
_http_request_duration: Optional[metrics.Histogram] = None
_db_query_duration: Optional[metrics.Histogram] = None
_package_updates_counter: Optional[metrics.Counter] = None
_db_connections: Optional[metrics.UpDownCounter] = None


def setup_telemetry() -> None:
    """
    Initialize OpenTelemetry tracing and metrics.

    This function should be called once during application startup.
    It configures:
    - Resource attributes (service name, version, environment)
    - Trace provider with appropriate exporters
    - Metric provider with appropriate exporters
    - Instrumentation for FastAPI and SQLAlchemy
    """
    global _tracer, _meter

    if not settings.otel_enabled:
        logger.info("OpenTelemetry is disabled")
        return

    logger.info(f"Initializing OpenTelemetry with exporter: {settings.otel_exporter_type}")

    # Create resource with service information
    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "service.version": settings.app_version,
            "deployment.environment": settings.otel_environment,
        }
    )

    # Setup tracing
    _setup_tracing(resource)

    # Setup metrics
    _setup_metrics(resource)

    # Get global tracer and meter
    _tracer = trace.get_tracer(__name__)
    _meter = metrics.get_meter(__name__)

    # Initialize metric instruments
    _initialize_metrics()

    logger.info("OpenTelemetry initialized successfully")


def _setup_tracing(resource: Resource) -> None:
    """Configure tracing provider and exporters."""
    tracer_provider = TracerProvider(resource=resource)

    # Add span processor based on exporter type
    if settings.otel_exporter_type == "console":
        span_processor = BatchSpanProcessor(ConsoleSpanExporter())
        tracer_provider.add_span_processor(span_processor)
    elif settings.otel_exporter_type == "otlp":
        span_exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint)
        span_processor = BatchSpanProcessor(span_exporter)
        tracer_provider.add_span_processor(span_processor)
    elif settings.otel_exporter_type == "otlp-http":
        span_exporter = OTLPSpanExporterHTTP(endpoint=settings.otel_exporter_otlp_endpoint)
        span_processor = BatchSpanProcessor(span_exporter)
        tracer_provider.add_span_processor(span_processor)

    # Set as global tracer provider
    trace.set_tracer_provider(tracer_provider)


def _setup_metrics(resource: Resource) -> None:
    """Configure metrics provider and exporters."""
    if settings.otel_exporter_type == "console":
        # Console exporter doesn't support metrics well, skip for now
        logger.info("Metrics export to console is not configured")
        return
    elif settings.otel_exporter_type == "otlp":
        metric_exporter = OTLPMetricExporter(endpoint=settings.otel_exporter_otlp_endpoint)
    elif settings.otel_exporter_type == "otlp-http":
        metric_exporter = OTLPMetricExporterHTTP(endpoint=settings.otel_exporter_otlp_endpoint)
    else:
        logger.warning(f"Unknown exporter type: {settings.otel_exporter_type}")
        return

    # Create metric reader with exporter
    metric_reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=60000)

    # Create and set meter provider
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)


def _initialize_metrics() -> None:
    """Initialize metric instruments."""
    global _http_request_counter, _http_request_duration
    global _db_query_duration, _package_updates_counter, _db_connections

    if _meter is None:
        return

    # HTTP metrics
    _http_request_counter = _meter.create_counter(
        name="http_requests_total",
        description="Total number of HTTP requests",
        unit="1",
    )

    _http_request_duration = _meter.create_histogram(
        name="http_request_duration_seconds",
        description="HTTP request duration in seconds",
        unit="s",
    )

    # Database metrics
    _db_query_duration = _meter.create_histogram(
        name="db_query_duration_seconds",
        description="Database query duration in seconds",
        unit="s",
    )

    _db_connections = _meter.create_up_down_counter(
        name="db_connections_active",
        description="Number of active database connections",
        unit="1",
    )

    # Business metrics
    _package_updates_counter = _meter.create_counter(
        name="package_updates_total",
        description="Total number of package updates by hostname",
        unit="1",
    )


def instrument_app(app) -> None:
    """
    Instrument FastAPI application with OpenTelemetry.

    Args:
        app: FastAPI application instance
    """
    if not settings.otel_enabled:
        return

    logger.info("Instrumenting FastAPI application")
    FastAPIInstrumentor.instrument_app(app)


def instrument_sqlalchemy(engine) -> None:
    """
    Instrument SQLAlchemy engine with OpenTelemetry.

    Args:
        engine: SQLAlchemy engine instance
    """
    if not settings.otel_enabled:
        return

    logger.info("Instrumenting SQLAlchemy engine")
    SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)


def get_tracer() -> Optional[trace.Tracer]:
    """
    Get the global tracer instance.

    Returns:
        Tracer instance or None if telemetry is disabled
    """
    return _tracer


def get_meter() -> Optional[metrics.Meter]:
    """
    Get the global meter instance.

    Returns:
        Meter instance or None if telemetry is disabled
    """
    return _meter


def record_http_request(endpoint: str, method: str, status_code: int, duration: float) -> None:
    """
    Record HTTP request metrics.

    Args:
        endpoint: API endpoint path
        method: HTTP method
        status_code: HTTP status code
        duration: Request duration in seconds
    """
    if _http_request_counter is not None:
        _http_request_counter.add(
            1,
            attributes={
                "endpoint": endpoint,
                "method": method,
                "status_code": status_code,
            },
        )

    if _http_request_duration is not None:
        _http_request_duration.record(
            duration,
            attributes={
                "endpoint": endpoint,
                "method": method,
            },
        )


def record_package_update(hostname: str, count: int = 1) -> None:
    """
    Record package update metrics.

    Args:
        hostname: Host that received the update
        count: Number of packages updated (default: 1)
    """
    if _package_updates_counter is not None:
        _package_updates_counter.add(count, attributes={"hostname": hostname})


def record_db_connection_change(delta: int) -> None:
    """
    Record database connection change.

    Args:
        delta: Change in connection count (+1 for new connection, -1 for closed)
    """
    if _db_connections is not None:
        _db_connections.add(delta)


def shutdown_telemetry() -> None:
    """
    Shutdown OpenTelemetry and flush any pending data.

    This function should be called during application shutdown.
    """
    if not settings.otel_enabled:
        return

    logger.info("Shutting down OpenTelemetry")

    # Get tracer provider and force flush
    tracer_provider = trace.get_tracer_provider()
    if hasattr(tracer_provider, "force_flush"):
        tracer_provider.force_flush()

    # Get meter provider and force flush
    meter_provider = metrics.get_meter_provider()
    if hasattr(meter_provider, "force_flush"):
        meter_provider.force_flush()

    logger.info("OpenTelemetry shutdown complete")
