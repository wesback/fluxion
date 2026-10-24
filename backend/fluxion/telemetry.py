"""OpenTelemetry instrumentation and configuration."""

import logging


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
from opentelemetry.sdk.metrics.export import ConsoleMetricExporter
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
_tracer: trace.Tracer | None = None
_meter: metrics.Meter | None = None

# Metrics instruments
_http_request_counter: metrics.Counter | None = None
_http_request_duration: metrics.Histogram | None = None
_db_query_duration: metrics.Histogram | None = None
_package_updates_counter: metrics.Counter | None = None
_package_batch_rows: metrics.Counter | None = None
_package_batch_transaction: metrics.Histogram | None = None
_webhook_delivery_counter: metrics.Counter | None = None
_db_connections: metrics.UpDownCounter | None = None
_pool_active: metrics.UpDownCounter | None = None
_pool_idle: metrics.UpDownCounter | None = None
_pool_overflow: metrics.UpDownCounter | None = None
_pool_checkout_waits: metrics.Counter | None = None
_pool_last_active = 0
_pool_last_idle = 0
_pool_last_overflow = 0
_pool_last_waited = 0


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
        _tracer = None
        _meter = None
        for name in ("_http_request_counter", "_http_request_duration", "_db_query_duration",
                     "_package_updates_counter", "_package_batch_rows", "_package_batch_transaction", "_db_connections", "_pool_active", "_pool_idle",
                     "_pool_overflow", "_pool_checkout_waits"):
            globals()[name] = None
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
    """Configure an in-process metric provider with a console exporter."""
    metric_reader = PeriodicExportingMetricReader(ConsoleMetricExporter())
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)


def _initialize_metrics() -> None:
    """Initialize metric instruments."""
    global _http_request_counter, _http_request_duration, _webhook_delivery_counter
    global _db_query_duration, _package_updates_counter
    global _package_batch_rows, _package_batch_transaction, _db_connections
    global _pool_active, _pool_idle, _pool_overflow, _pool_checkout_waits

    if _meter is None:
        return

    # HTTP metrics
    _http_request_counter = _meter.create_counter(
        name="http_requests_total",
        description="Total number of HTTP requests",
        unit="1",
    )

    _http_request_duration = _meter.create_histogram(
        name="http_request_duration",
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
    _pool_active = _meter.create_up_down_counter(name="db_pool_active", description="Active pool connections", unit="1")
    _pool_idle = _meter.create_up_down_counter(name="db_pool_idle", description="Idle pool connections", unit="1")
    _pool_overflow = _meter.create_up_down_counter(name="db_pool_overflow", description="Pool overflow connections", unit="1")
    _pool_checkout_waits = _meter.create_counter(name="db_pool_checkout_waits_total", description="Pool checkout saturation events", unit="1")

    # Business metrics
    _package_updates_counter = _meter.create_counter(
        name="package_updates_total",
        description="Total number of package updates by hostname",
        unit="1",
    )
    _package_batch_rows = _meter.create_counter(
        name="package_batch_rows_total",
        description="Package batch rows accepted or rejected",
        unit="1",
    )
    _webhook_delivery_counter = _meter.create_counter(
        name="webhook_delivery_total",
        description="Total webhook delivery attempts",
        unit="1",
    )
    _package_batch_transaction = _meter.create_histogram(
        name="package_batch_transaction_seconds",
        description="Package batch database transaction duration",
        unit="s",
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


def get_tracer() -> trace.Tracer | None:
    """
    Get the global tracer instance.

    Returns:
        Tracer instance or None if telemetry is disabled
    """
    return _tracer


def get_meter() -> metrics.Meter | None:
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


def record_webhook_delivery(outcome: str) -> None:
    """Record a webhook delivery outcome without destination or header attributes."""
    if _webhook_delivery_counter is not None and outcome in {"delivered", "failed", "destination_rejected"}:
        _webhook_delivery_counter.add(1, attributes={"outcome": outcome})


def record_package_update(hostname: str, count: int = 1) -> None:
    """Record package updates without request-derived metric attributes."""
    if _package_updates_counter is not None:
        _package_updates_counter.add(count)


def record_package_batch_rows(result: str, count: int) -> None:
    """Record accepted or rejected package batch rows."""
    if _package_batch_rows is not None and result in {"accepted", "rejected"}:
        _package_batch_rows.add(count, attributes={"result": result})


def record_package_batch_transaction(outcome: str, duration: float) -> None:
    """Record a package batch transaction outcome and duration."""
    if _package_batch_transaction is not None and outcome in {"committed", "rolled_back"}:
        _package_batch_transaction.record(duration, attributes={"outcome": outcome})


def record_db_connection_change(delta: int) -> None:
    """
    Record database connection change.

    Args:
        delta: Change in connection count (+1 for new connection, -1 for closed)
    """
    if _db_connections is not None:
        _db_connections.add(delta)


def record_pool_observability(active: int, idle: int, overflow: int, waited: int = 0) -> None:
    """Record pool state changes and checkout saturation without caller data."""
    global _pool_last_active, _pool_last_idle, _pool_last_overflow, _pool_last_waited

    if _pool_active is not None:
        _pool_active.add(active - _pool_last_active)
    if _pool_idle is not None:
        _pool_idle.add(idle - _pool_last_idle)
    if _pool_overflow is not None:
        _pool_overflow.add(overflow - _pool_last_overflow)
    _pool_last_active = active
    _pool_last_idle = idle
    _pool_last_overflow = overflow

    if _pool_checkout_waits is not None and waited > _pool_last_waited:
        _pool_checkout_waits.add(waited - _pool_last_waited)
    _pool_last_waited = waited


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
