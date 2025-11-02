# Fluxion Backend

Backend service for tracking Linux package updates across multiple hosts.

## Overview

The backend provides:
- PostgreSQL database schema for tracking hosts and package updates
- Async SQLAlchemy ORM models
- Database migrations using Alembic
- **FastAPI REST API** for receiving package update data
- Health and readiness check endpoints
- Structured JSON logging
- **OpenTelemetry instrumentation for observability**

The backend is designed to receive package update information from APT hooks installed on Linux hosts. When a package is installed or upgraded, the APT hook automatically sends the update information to the Fluxion API.

## Quick Start

### Prerequisites

- Python 3.11 or higher
- PostgreSQL 18 or higher
- pip or uv for package management

### Installation

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure database**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Run migrations**:
   ```bash
   alembic upgrade head
   ```

5. **Start the API server**:
   ```bash
   python -m fluxion.main
   ```

   The API will be available at http://localhost:8000

### Using Docker Compose (Recommended for Local Development)

The easiest way to run Fluxion with full observability is using Docker Compose:

```bash
# From the repository root
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

This will start:
- PostgreSQL database on port 5432
- Fluxion API on port 8000
- Jaeger UI on port 16686 (http://localhost:16686)

### Using Docker

1. **Build the Docker image**:
   ```bash
   docker build -t fluxion-api .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     --name fluxion-api \
     -p 8000:8000 \
     -e DATABASE_URL=postgresql+asyncpg://fluxion:fluxion@localhost:5432/fluxion \
     fluxion-api
   ```

### API Documentation

Once the server is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

For detailed API documentation, see [docs/api/README.md](docs/api/README.md)

### API Endpoints

- `POST /api/v1/updates` - Receive package update webhooks
- `GET /health` - Health check endpoint
- `GET /ready` - Readiness check (verifies database connection)

### Database Schema

See the [main README](../README.md) for detailed schema documentation.

### Development

```bash
# Install development dependencies
pip install -r requirements.txt -e .

# Run linting
ruff check .

# Run tests
pytest

# Run tests with coverage
pytest --cov=fluxion --cov-report=html
```

## Observability Setup

Fluxion includes comprehensive OpenTelemetry instrumentation for observability:

### Features

- **Automatic HTTP Tracing**: All FastAPI endpoints are automatically traced
- **Database Query Tracing**: SQLAlchemy queries are instrumented
- **Custom Business Logic Spans**:
  - `process_update` - Complete update processing flow
  - `upsert_host` - Host creation/update operations
  - `insert_package_update` - Package update insertion
- **Metrics Collection**:
  - HTTP request count by endpoint and status code
  - HTTP request duration histogram
  - Database query duration
  - Package updates count by hostname
  - Active database connections
- **Structured JSON Logging**: All logs include trace_id and span_id for correlation

### Configuration

OpenTelemetry can be configured via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_ENABLED` | Enable/disable OpenTelemetry | `true` |
| `OTEL_EXPORTER_TYPE` | Exporter type: `console`, `otlp`, or `otlp-http` | `console` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint for traces/metrics | `http://localhost:4317` |
| `OTEL_SERVICE_NAME` | Service name in traces | `fluxion` |
| `OTEL_ENVIRONMENT` | Environment name | `development` |

### Local Development with Jaeger

The included `docker-compose.yml` sets up Jaeger for local trace visualization:

1. **Start services**:
   ```bash
   docker-compose up -d
   ```

2. **Access Jaeger UI**:
   Open http://localhost:16686 in your browser

3. **Generate some traces**:
   ```bash
   # Send a test package update
   curl -X POST http://localhost:8000/api/v1/updates \
     -H "Content-Type: application/json" \
     -d '{
       "hostname": "test-server",
       "package_name": "nginx",
       "old_version": "1.18.0",
       "new_version": "1.22.0"
     }'
   ```

4. **View traces in Jaeger**:
   - Select "fluxion" from the Service dropdown
   - Click "Find Traces"
   - Click on a trace to see the detailed span hierarchy

### Console Exporter (Local Development)

For quick local testing without Jaeger:

```bash
# Set in .env or export
export OTEL_EXPORTER_TYPE=console
export OTEL_ENABLED=true

# Run the application
python -m fluxion.main
```

Traces will be printed to the console output.

### Production Deployment

For production, use OTLP exporters to send data to your observability backend:

**Using OTLP gRPC** (recommended):
```bash
export OTEL_EXPORTER_TYPE=otlp
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector:4317
export OTEL_SERVICE_NAME=fluxion
export OTEL_ENVIRONMENT=production
```

**Using OTLP HTTP**:
```bash
export OTEL_EXPORTER_TYPE=otlp-http
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector:4318
export OTEL_SERVICE_NAME=fluxion
export OTEL_ENVIRONMENT=production
```

Compatible with:
- Jaeger
- Grafana Tempo
- Elastic APM
- Honeycomb
- Datadog
- New Relic
- Any OTLP-compatible backend

### Trace Context Propagation

Fluxion automatically propagates trace context from incoming HTTP requests. If your APT hooks or clients include W3C Trace Context headers (`traceparent`, `tracestate`), the traces will be properly linked.

### Log Correlation

All logs include trace context:

```json
{
  "timestamp": "2025-10-29T13:57:24.325Z",
  "level": "INFO",
  "logger": "fluxion.api.routes.updates",
  "message": "Package update recorded: host=test-server, package=nginx, version=1.18.0->1.22.0, id=123",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7"
}
```

You can use the trace_id to correlate logs with traces in your observability platform.

## Project Structure

```
backend/
├── alembic/                   # Database migrations
│   ├── versions/             # Migration files
│   └── env.py                # Alembic environment
├── docs/                     # Backend-specific documentation
├── examples/                 # Usage examples
├── fluxion/                  # Main Python package
│   ├── database/            # Database connection & session management
│   ├── models/              # SQLAlchemy ORM models
│   ├── api/                 # API endpoints for receiving updates
│   ├── telemetry.py         # OpenTelemetry instrumentation
│   ├── config.py            # Configuration management
│   └── main.py              # FastAPI application
├── scripts/                  # Utility scripts
├── tests/                    # Test suite
├── alembic.ini              # Alembic configuration
├── pyproject.toml           # Project metadata
├── requirements.txt         # Python dependencies
└── README.md                # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://fluxion:fluxion@localhost:5432/fluxion` |
| `DB_POOL_SIZE` | Connection pool size | `10` |
| `DB_MAX_OVERFLOW` | Max overflow connections | `20` |
| `SQL_ECHO` | Enable SQL query logging | `false` |
| `OTEL_ENABLED` | Enable OpenTelemetry | `true` |
| `OTEL_EXPORTER_TYPE` | Exporter type | `console` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint | `http://localhost:4317` |
| `OTEL_SERVICE_NAME` | Service name | `fluxion` |
| `OTEL_ENVIRONMENT` | Environment | `development` |

## Kubernetes Deployment

The backend is designed to run in Kubernetes with:
- Connection pooling for concurrent requests
- Health checks via pool pre-ping
- Automatic connection recycling
- Environment-based configuration
- OpenTelemetry sidecar or collector integration

See the [main README](../README.md) for Kubernetes deployment examples.

## Contributing

Please see the [Contributing Guidelines](../CONTRIBUTING.md) (to be added).

## License

MIT License - see [LICENSE](../LICENSE) file for details.
