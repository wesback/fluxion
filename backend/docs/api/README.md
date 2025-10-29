# Fluxion API Documentation

## Overview

The Fluxion API is a FastAPI-based service for receiving package update webhooks from APT hooks installed on Linux hosts.

## Base URL

```
http://localhost:8000
```

## Endpoints

### Query & Analytics

#### GET /api/v1/hosts

List all hosts with metadata, sorted by last_seen descending (most recent first).

**Success Response:**

- **Code:** 200 OK
- **Content:**

```json
{
  "items": [
    {
      "hostname": "server01",
      "os_info": "Ubuntu 22.04 LTS",
      "last_seen": "2025-10-29T14:30:00Z",
      "total_updates": 42
    }
  ]
}
```

**Example Request:**

```bash
curl http://localhost:8000/api/v1/hosts
```

#### GET /api/v1/hosts/{hostname}/updates

Get paginated update history for a specific host with optional date filtering.

**URL Parameters:**
- `hostname` (required): Hostname of the server

**Query Parameters:**
- `limit` (optional): Maximum number of results to return (default: 50, min: 1, max: 1000)
- `offset` (optional): Number of results to skip for pagination (default: 0, min: 0)
- `from_date` (optional): Filter updates from this date (ISO8601 UTC format)
- `to_date` (optional): Filter updates to this date (ISO8601 UTC format)

**Success Response:**

- **Code:** 200 OK
- **Content:**

```json
{
  "items": [
    {
      "package_name": "nginx",
      "old_version": "1.18.0",
      "new_version": "1.22.0",
      "update_timestamp": "2025-10-29T14:30:00Z"
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

**Error Responses:**

- **Code:** 404 NOT FOUND
  - **Content:** `{"detail": "Host 'hostname' not found"}`
  - **Reason:** Host does not exist

**Example Requests:**

```bash
# Get first 50 updates for a host
curl http://localhost:8000/api/v1/hosts/server01/updates

# Get updates with custom pagination
curl "http://localhost:8000/api/v1/hosts/server01/updates?limit=100&offset=50"

# Get updates with date filtering
curl "http://localhost:8000/api/v1/hosts/server01/updates?from_date=2025-10-01T00:00:00Z&to_date=2025-10-31T23:59:59Z"
```

#### GET /api/v1/packages/{package_name}/hosts

Get list of hosts that have installed a specific package with the latest version information.

**URL Parameters:**
- `package_name` (required): Name of the package

**Success Response:**

- **Code:** 200 OK
- **Content:**

```json
{
  "items": [
    {
      "hostname": "server01",
      "current_version": "1.22.0",
      "last_updated": "2025-10-29T14:30:00Z"
    }
  ]
}
```

**Example Request:**

```bash
curl http://localhost:8000/api/v1/packages/nginx/hosts
```

#### GET /api/v1/updates/recent

Get recent updates across all hosts with configurable time window.

**Query Parameters:**
- `limit` (optional): Maximum number of results to return (default: 20, min: 1, max: 1000)
- `hours` (optional): Number of hours to look back (default: 24, min: 1, max: 168)

**Success Response:**

- **Code:** 200 OK
- **Content:**

```json
{
  "items": [
    {
      "hostname": "server01",
      "package_name": "nginx",
      "old_version": "1.18.0",
      "new_version": "1.22.0",
      "timestamp": "2025-10-29T14:30:00Z"
    }
  ]
}
```

**Example Requests:**

```bash
# Get last 20 updates in the last 24 hours (defaults)
curl http://localhost:8000/api/v1/updates/recent

# Get last 50 updates in the last 48 hours
curl "http://localhost:8000/api/v1/updates/recent?limit=50&hours=48"
```

#### GET /api/v1/stats

Get comprehensive dashboard statistics including total counts and top packages/hosts.

**Success Response:**

- **Code:** 200 OK
- **Content:**

```json
{
  "total_hosts": 10,
  "total_updates": 1000,
  "updates_last_24h": 50,
  "updates_last_7d": 300,
  "most_updated_packages": [
    {
      "package": "nginx",
      "count": 42
    }
  ],
  "most_active_hosts": [
    {
      "hostname": "server01",
      "count": 100
    }
  ]
}
```

**Example Request:**

```bash
curl http://localhost:8000/api/v1/stats
```

### Package Updates

#### POST /api/v1/updates

Receive a single package update from APT hooks.

**Request Body:**

```json
{
  "hostname": "string",
  "package_name": "string",
  "old_version": "string or null",
  "new_version": "string"
}
```

**Field Descriptions:**
- `hostname` (required): The hostname of the server reporting the update (1-255 characters)
- `package_name` (required): Name of the package being updated (1-255 characters)
- `old_version` (optional): Previous version of the package. Use `null` or `"-"` for new installations
- `new_version` (required): New version of the package being installed (1-255 characters)

**Success Response:**

- **Code:** 201 CREATED
- **Content:**

```json
{
  "id": 123,
  "message": "Package update recorded successfully"
}
```

**Error Responses:**

- **Code:** 400 BAD REQUEST
  - **Content:** `{"detail": "Validation error", "errors": [...]}`
  - **Reason:** Invalid request data (missing required fields, invalid data types, etc.)

- **Code:** 500 INTERNAL SERVER ERROR
  - **Content:** `{"detail": "Failed to record package update"}`
  - **Reason:** Database or server error

**Example Request:**

```bash
curl -X POST http://localhost:8000/api/v1/updates \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "web-server-01",
    "package_name": "nginx",
    "old_version": "1.18.0",
    "new_version": "1.22.0"
  }'
```

**Example Request (New Installation):**

```bash
curl -X POST http://localhost:8000/api/v1/updates \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "web-server-01",
    "package_name": "redis-server",
    "old_version": null,
    "new_version": "6.2.0"
  }'
```

#### POST /api/v1/updates/batch

**⭐ RECOMMENDED:** Receive multiple package updates in a single request from APT hooks.

This endpoint is more efficient when multiple packages are updated at once, as it requires only a single API call and database transaction. This is the preferred method for APT hooks that report multiple package updates.

**Request Body:**

```json
{
  "hostname": "string",
  "updates": [
    {
      "package_name": "string",
      "old_version": "string or null",
      "new_version": "string"
    }
  ]
}
```

**Field Descriptions:**
- `hostname` (required): The hostname of the server reporting the updates (1-255 characters)
- `updates` (required): Array of package updates (must contain at least 1 item)
  - `package_name` (required): Name of the package being updated (1-255 characters)
  - `old_version` (optional): Previous version of the package. Use `null` or `"-"` for new installations
  - `new_version` (required): New version of the package being installed (1-255 characters)

**Success Response:**

- **Code:** 201 CREATED
- **Content:**

```json
{
  "hostname": "web-server-01",
  "count": 3,
  "ids": [123, 124, 125],
  "message": "3 package updates recorded successfully"
}
```

**Error Responses:**

- **Code:** 400 BAD REQUEST
  - **Content:** `{"detail": "Validation error", "errors": [...]}`
  - **Reason:** Invalid request data (missing required fields, empty updates array, invalid data types, etc.)

- **Code:** 500 INTERNAL SERVER ERROR
  - **Content:** `{"detail": "Failed to record batch package updates"}`
  - **Reason:** Database or server error

**Example Request:**

```bash
curl -X POST http://localhost:8000/api/v1/updates/batch \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "web-server-01",
    "updates": [
      {
        "package_name": "nginx",
        "old_version": "1.18.0",
        "new_version": "1.22.0"
      },
      {
        "package_name": "curl",
        "old_version": "7.68.0",
        "new_version": "7.81.0"
      },
      {
        "package_name": "vim",
        "old_version": null,
        "new_version": "8.2.0"
      }
    ]
  }'
```

**Example Response:**

```json
{
  "hostname": "web-server-01",
  "count": 3,
  "ids": [123, 124, 125],
  "message": "3 package updates recorded successfully"
}
```

### Health Checks

#### GET /health

Basic health check endpoint that returns the service status.

**Success Response:**

- **Code:** 200 OK
- **Content:**

```json
{
  "status": "healthy"
}
```

**Example Request:**

```bash
curl http://localhost:8000/health
```

#### GET /ready

Readiness check endpoint that verifies database connectivity.

**Success Response:**

- **Code:** 200 OK
- **Content:**

```json
{
  "status": "ready",
  "database": "connected"
}
```

**Error Response:**

- **Code:** 503 SERVICE UNAVAILABLE
  - **Content:** `{"detail": "Database connection failed: ..."}`
  - **Reason:** Cannot connect to the database

**Example Request:**

```bash
curl http://localhost:8000/ready
```

## Running the API

### Local Development

1. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Run database migrations:**
   ```bash
   alembic upgrade head
   ```

4. **Start the server:**
   ```bash
   python -m fluxion.main
   # Or with uvicorn directly:
   uvicorn fluxion.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. **Access the API:**
   - API: http://localhost:8000
   - Interactive docs: http://localhost:8000/docs
   - Alternative docs: http://localhost:8000/redoc

### Docker

1. **Build the image:**
   ```bash
   cd backend
   docker build -t fluxion-api .
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     --name fluxion-api \
     -p 8000:8000 \
     -e DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/fluxion \
     -e LOG_LEVEL=info \
     fluxion-api
   ```

3. **Check logs:**
   ```bash
   docker logs -f fluxion-api
   ```

### Docker Compose Example

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: fluxion
      POSTGRES_USER: fluxion
      POSTGRES_PASSWORD: fluxion
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://fluxion:fluxion@postgres:5432/fluxion
      LOG_LEVEL: info
    depends_on:
      - postgres

volumes:
  postgres_data:
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://fluxion:fluxion@localhost:5432/fluxion` |
| `DB_POOL_SIZE` | Database connection pool size | `10` |
| `DB_MAX_OVERFLOW` | Maximum overflow connections | `20` |
| `SQL_ECHO` | Enable SQL query logging | `false` |
| `API_PORT` | API server port | `8000` |
| `API_HOST` | API server host | `0.0.0.0` |
| `LOG_LEVEL` | Logging level (debug, info, warning, error) | `info` |
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `*` |
| `OTEL_ENABLED` | Enable OpenTelemetry tracing | `true` |
| `OTEL_EXPORTER_TYPE` | OpenTelemetry exporter type (console, otlp, otlp-http) | `console` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint URL | `http://localhost:4317` |
| `OTEL_SERVICE_NAME` | Service name for tracing | `fluxion` |
| `OTEL_ENVIRONMENT` | Environment name for tracing | `development` |

## Error Handling

The API uses standard HTTP status codes:

- **2xx**: Success
  - `200 OK`: Successful GET request
  - `201 CREATED`: Successful POST request

- **4xx**: Client errors
  - `400 BAD REQUEST`: Invalid request data
  - `404 NOT FOUND`: Resource not found

- **5xx**: Server errors
  - `500 INTERNAL SERVER ERROR`: Server error
  - `503 SERVICE UNAVAILABLE`: Service temporarily unavailable (e.g., database down)

## Logging

The API uses structured logging with the following format:

```
2024-01-15 10:30:45,123 - fluxion.api.routes.updates - INFO - Package update recorded: host=server01, package=nginx, version=1.18.0->1.22.0, id=123
```

Log levels can be configured via the `LOG_LEVEL` environment variable.

## Host Management

When a package update is received:

1. The API checks if the host exists in the database
2. If the host exists, it updates the `last_seen` timestamp
3. If the host doesn't exist, it creates a new host record with `os_info="Unknown"`
4. The package update is then recorded and linked to the host

This "upsert" behavior ensures that hosts are automatically registered when they first report a package update.

## Interactive API Documentation

FastAPI automatically generates interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
  - Interactive interface to test API endpoints
  - View request/response schemas
  - Try out requests directly from the browser

- **ReDoc**: http://localhost:8000/redoc
  - Alternative documentation interface
  - Better for reading and sharing

## Testing the API

### Using curl

```bash
# Health check
curl http://localhost:8000/health

# Readiness check
curl http://localhost:8000/ready

# Create package update
curl -X POST http://localhost:8000/api/v1/updates \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "server01",
    "package_name": "nginx",
    "old_version": "1.18.0",
    "new_version": "1.22.0"
  }'
```

### Using Python requests

```python
import requests

# Health check
response = requests.get('http://localhost:8000/health')
print(response.json())

# Package update
payload = {
    'hostname': 'server01',
    'package_name': 'nginx',
    'old_version': '1.18.0',
    'new_version': '1.22.0'
}
response = requests.post('http://localhost:8000/api/v1/updates', json=payload)
print(response.status_code, response.json())
```

## Rate Limiting

Currently, the API does not implement rate limiting. For production deployments, consider:

- Using a reverse proxy (e.g., nginx) with rate limiting
- Implementing API authentication
- Adding request throttling middleware

## Security Considerations

For production deployments:

1. **Database Credentials**: Use secrets management (e.g., Kubernetes secrets, AWS Secrets Manager)
2. **TLS/HTTPS**: Run behind a reverse proxy with TLS termination
3. **Authentication**: Add API key or OAuth authentication
4. **Network Security**: Restrict access using firewall rules or VPC
5. **Input Validation**: The API validates all inputs using Pydantic schemas
6. **SQL Injection**: Using SQLAlchemy ORM prevents SQL injection attacks

## Monitoring and Observability

The API includes comprehensive observability features:

### OpenTelemetry Integration

All query and analytics endpoints include OpenTelemetry spans for distributed tracing:
- Automatic span creation for each endpoint
- Custom attributes for query parameters (hostname, package_name, limit, offset, etc.)
- Database query tracing via SQLAlchemy instrumentation
- Support for OTLP, OTLP-HTTP, and console exporters

### Health Endpoints

The API exposes health and readiness endpoints suitable for:

- **Kubernetes**: Use `/health` for liveness probe and `/ready` for readiness probe
- **Load Balancers**: Use `/health` for health checks
- **Monitoring Systems**: Use `/ready` to check database connectivity

Example Kubernetes probe configuration:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Query Performance Optimizations

The query endpoints implement several SQL optimizations:

1. **Indexed Queries**: All queries use existing database indexes
   - `ix_hosts_hostname` for hostname lookups
   - `ix_package_updates_package_name` for package searches
   - `ix_package_updates_update_timestamp` for time-based queries
   - `ix_package_updates_host_id_update_timestamp` for host-specific queries

2. **Efficient Aggregations**: Uses database-level aggregations for statistics
   - Subqueries for counting updates per host
   - Window functions (ROW_NUMBER) for getting latest versions
   - GROUP BY for top packages and hosts

3. **Pagination**: All list endpoints support pagination to limit result size

4. **UTC Timestamps**: All timestamps are stored and returned in UTC (ISO8601 format)

### HTTP Caching Headers

Query endpoints include appropriate cache headers:
- Immutable historical data can be cached longer
- Recent/stats endpoints should have shorter cache TTLs
- CORS headers are configured for frontend access
