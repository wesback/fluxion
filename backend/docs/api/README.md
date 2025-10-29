# Fluxion API Documentation

## Overview

The Fluxion API is a FastAPI-based service for receiving package update webhooks from APT hooks installed on Linux hosts.

## Base URL

```
http://localhost:8000
```

## Endpoints

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
