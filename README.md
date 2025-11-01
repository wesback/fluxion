# Fluxion - Linux Package Update Tracking System

A comprehensive system for tracking Linux package updates across multiple hosts. Designed to run in Kubernetes with support for concurrent writes.

## Architecture

Fluxion is organized into distinct components:

- **backend/**: PostgreSQL database schema, API services, and data processing
- **frontend/**: Web UI for visualizing package updates (to be added)
- **apt-hooks/**: APT hook scripts for automatic package update reporting (to be added)
- **docs/**: Project-wide documentation

## How It Works

1. **APT Hooks**: Lightweight scripts installed on Linux hosts that trigger on package updates
2. **API**: Receives package update data from apt hooks via HTTP POST
3. **Database**: Stores host information and package update history
4. **Frontend**: Visualizes package updates across all hosts
5. **Webhook Alerts**: Send notifications when kernel packages are updated

## Features

- **API Key Authentication**: Secure header-based authentication with bcrypt hashing
- **Rate Limiting**: 1000 requests per hour per API key
- **Role-Based Access Control**: Admin and user roles for granular permissions
- **Webhook Notifications**: Trigger webhooks on kernel package updates with retry logic
- **Async SQLAlchemy ORM**: Full async support for high-performance database operations
- **Alembic Migrations**: Database schema versioning and migration management
- **Optimized Indexes**: Composite indexes for efficient querying
- **Kubernetes-Ready**: Connection pooling and concurrent write support
- **Foreign Key Constraints**: CASCADE on delete for referential integrity
- **OpenTelemetry Integration**: Comprehensive tracing and metrics

## Database Schema

### Tables

#### `hosts`
Tracks Linux hosts that report package updates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique host identifier |
| hostname | VARCHAR(255) | UNIQUE, NOT NULL, INDEXED | Host's hostname |
| os_info | TEXT | NOT NULL | Operating system information (e.g., Ubuntu 22.04) |
| last_seen | TIMESTAMP WITH TIMEZONE | NOT NULL | Last time host reported in |
| created_at | TIMESTAMP WITH TIMEZONE | NOT NULL | Record creation timestamp |
| updated_at | TIMESTAMP WITH TIMEZONE | NOT NULL | Record update timestamp |

#### `package_updates`
Tracks package updates on each host.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique update identifier |
| host_id | INTEGER | FOREIGN KEY (hosts.id) CASCADE, NOT NULL | Reference to host |
| package_name | VARCHAR(255) | NOT NULL, INDEXED | Name of the package |
| old_version | VARCHAR(255) | NULLABLE | Previous version (NULL for new installs) |
| new_version | VARCHAR(255) | NOT NULL | New/current version |
| update_timestamp | TIMESTAMP WITH TIMEZONE | NOT NULL, INDEXED | When the update occurred |
| created_at | TIMESTAMP WITH TIMEZONE | NOT NULL | Record creation timestamp |

### Indexes

- `ix_hosts_hostname`: Index on hostname for fast lookups
- `ix_package_updates_package_name`: Index on package_name
- `ix_package_updates_update_timestamp`: Index on update_timestamp
- `ix_package_updates_host_id_update_timestamp`: Composite index for host-specific queries
- `ix_package_updates_package_name_update_timestamp`: Composite index for package search

#### `api_keys`
API keys for authentication and authorization.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique API key identifier |
| key_hash | TEXT | NOT NULL | Bcrypt hash of the API key |
| name | VARCHAR(255) | NOT NULL | Human-readable name/description |
| created_at | TIMESTAMP WITH TIMEZONE | NOT NULL | When the key was created |
| last_used | TIMESTAMP WITH TIMEZONE | NULLABLE | Last time the key was used |
| is_active | BOOLEAN | NOT NULL | Whether the key is active |
| role | VARCHAR(50) | NOT NULL, INDEXED | Role (user or admin) |

#### `webhook_configs`
Webhook configurations for sending notifications on package updates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique webhook identifier |
| name | VARCHAR(255) | NOT NULL | Human-readable name |
| url | TEXT | NOT NULL | Webhook URL endpoint |
| enabled | BOOLEAN | NOT NULL | Whether webhook is enabled |
| event_types | JSON | NOT NULL | Array of event types (e.g., ["kernel_update"]) |
| headers_json | JSON | NULLABLE | Custom headers for the webhook |
| created_at | TIMESTAMP WITH TIMEZONE | NOT NULL | Record creation timestamp |
| updated_at | TIMESTAMP WITH TIMEZONE | NOT NULL | Record update timestamp |

#### `webhook_delivery_history`
Tracks webhook delivery attempts for debugging.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique delivery record identifier |
| webhook_config_id | INTEGER | FOREIGN KEY (webhook_configs.id) CASCADE, NOT NULL | Reference to webhook config |
| event_type | VARCHAR(100) | NOT NULL | Event type that triggered the webhook |
| payload | JSON | NOT NULL | Payload sent to the webhook |
| status_code | INTEGER | NULLABLE | HTTP status code from webhook response |
| response_body | TEXT | NULLABLE | Response body from webhook |
| error_message | TEXT | NULLABLE | Error message if delivery failed |
| attempt_number | INTEGER | NOT NULL | Attempt number (1-3) |
| delivered_at | TIMESTAMP WITH TIMEZONE | NOT NULL | When delivery was attempted |
| created_at | TIMESTAMP WITH TIMEZONE | NOT NULL | Record creation timestamp |

## Webhook Alerts

Fluxion can automatically send webhook notifications when kernel packages are updated. This is useful for alerting teams about critical security updates.

### Supported Event Types

- **kernel_update**: Triggered when a kernel package is updated (linux-image*, linux-headers*, linux-modules*)

### Setting Up Webhooks

**1. Create a webhook configuration:**

```bash
# Example: ntfy.sh webhook for kernel alerts
curl -X POST http://localhost:8000/api/v1/admin/webhooks \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ntfy.sh kernel alerts",
    "url": "https://ntfy.sh/my-fluxion-alerts",
    "enabled": true,
    "event_types": ["kernel_update"],
    "headers_json": {
      "Title": "🚨 Kernel Update Alert",
      "Priority": "high",
      "Tags": "warning,package"
    }
  }'
```

**2. Test the webhook:**

```bash
# Using the API
curl -X POST http://localhost:8000/api/v1/admin/webhooks/1/test \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Using the CLI tool
cd backend
python scripts/test_webhook.py --ntfy my-topic --title "Test Alert" --priority high
```

**3. View webhook delivery history:**

```bash
curl http://localhost:8000/api/v1/admin/webhooks/1/history \
  -H "X-API-Key: YOUR_ADMIN_KEY"
```

### Webhook Payload Format

When a kernel update is detected, the following payload is sent:

```json
{
  "event": "kernel_update",
  "hostname": "server01",
  "package_name": "linux-image-5.15.0-91-generic",
  "old_version": "5.15.0-88",
  "new_version": "5.15.0-91",
  "timestamp": "2025-10-29T12:00:00Z",
  "severity": "high"
}
```

For ntfy.sh webhooks, an additional `message` field is added for better display.

### Webhook Features

- **Async Delivery**: Webhooks don't block package update processing
- **Retry Logic**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **5-Second Timeout**: Each attempt has a 5-second timeout
- **Delivery History**: All attempts logged in database for debugging
- **OpenTelemetry**: Webhook calls are traced for observability
- **Custom Headers**: Support for authentication tokens and custom headers

See [backend/examples/webhooks/README.md](backend/examples/webhooks/README.md) for more webhook configuration examples.

## Authentication

All API endpoints (except `/health`, `/ready`, and `/docs`) require API key authentication via the `X-API-Key` header.

### API Key Management

**Generate Initial Admin Key**:
```bash
cd backend
python scripts/generate_admin_key.py
```

**Create Additional Keys** (requires admin API key):
```bash
# Create a user key
curl -X POST http://localhost:8000/api/v1/admin/api-keys \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Host Reporter Key", "role": "user"}'

# Create an admin key
curl -X POST http://localhost:8000/api/v1/admin/api-keys \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Admin Key", "role": "admin"}'
```

**List API Keys** (requires admin API key):
```bash
curl http://localhost:8000/api/v1/admin/api-keys \
  -H "X-API-Key: YOUR_ADMIN_KEY"
```

**Delete/Revoke API Key** (requires admin API key):
```bash
curl -X DELETE http://localhost:8000/api/v1/admin/api-keys/1 \
  -H "X-API-Key: YOUR_ADMIN_KEY"
```

### Security Features

- **Hashed Storage**: API keys are hashed using bcrypt before storage
- **Rate Limiting**: 1000 requests per hour per API key
- **Role-Based Access**: Admin endpoints require admin role
- **Audit Trail**: Last used timestamp tracked for each key
- **OpenTelemetry Integration**: API key info included in spans
- **Authentication Logging**: Failed auth attempts are logged

### Using API Keys

**Report Package Update**:
```bash
curl -X POST http://localhost:8000/api/v1/updates \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "server01",
    "package_name": "nginx",
    "old_version": "1.18.0",
    "new_version": "1.22.0"
  }'
```

**Query Stats**:
```bash
curl http://localhost:8000/api/v1/stats \
  -H "X-API-Key: YOUR_API_KEY"
```

**List Hosts**:
```bash
curl http://localhost:8000/api/v1/hosts \
  -H "X-API-Key: YOUR_API_KEY"
```

## Quick Start

For backend setup instructions, see [backend/README.md](backend/README.md).

### Prerequisites

- Python 3.11 or higher
- PostgreSQL 14 or higher
- pip or uv for package management

### Installation (Backend)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/wesback/fluxion.git
   cd fluxion/backend
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up PostgreSQL**:
   ```bash
   # Create database and user
   sudo -u postgres psql
   ```
   
   ```sql
   CREATE DATABASE fluxion;
   CREATE USER fluxion WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE fluxion TO fluxion;
   ```

4. **Configure environment variables**:
   Create a `.env` file in the backend directory:
   ```env
   DATABASE_URL=postgresql+asyncpg://fluxion:your_secure_password@localhost:5432/fluxion
   SQL_ECHO=false
   DB_POOL_SIZE=10
   DB_MAX_OVERFLOW=20
   ```

5. **Run migrations**:
   ```bash
   alembic upgrade head
   ```

6. **Generate initial admin API key**:
   ```bash
   python scripts/generate_admin_key.py
   ```
   
   Save the generated API key securely - it cannot be retrieved later.

7. **Start the API server**:
   ```bash
   python -m fluxion.main
   # Or with uvicorn:
   uvicorn fluxion.main:app --host 0.0.0.0 --port 8000
   ```

## Usage Examples

See [backend/examples/](backend/examples/) for detailed examples.

### Basic Usage

```python
import asyncio
from fluxion.database import get_session
from fluxion.models import Host, PackageUpdate
from sqlalchemy import select

async def main():
    async for session in get_session():
        # Create a new host
        host = Host(
            hostname="server01",
            os_info="Ubuntu 22.04 LTS"
        )
        session.add(host)
        await session.flush()
        
        # Add a package update
        update = PackageUpdate(
            host_id=host.id,
            package_name="nginx",
            old_version="1.18.0",
            new_version="1.22.0"
        )
        session.add(update)
        await session.commit()

if __name__ == "__main__":
    asyncio.run(main())
```

## Kubernetes Deployment

The backend is configured for Kubernetes deployment with:

- **Connection Pooling**: Configurable pool size and max overflow
- **Connection Health Checks**: `pool_pre_ping=True` verifies connections
- **Connection Recycling**: Connections are recycled every hour
- **Concurrent Writes**: Async support enables high concurrency

### Environment Variables for Kubernetes

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: fluxion-db-secret
        key: database-url
  - name: DB_POOL_SIZE
    value: "10"
  - name: DB_MAX_OVERFLOW
    value: "20"
  - name: SQL_ECHO
    value: "false"
```

## Project Structure

```
fluxion/
├── backend/                   # Backend services and database
│   ├── alembic/              # Database migrations
│   │   ├── versions/         # Migration files
│   │   └── env.py            # Alembic environment configuration
│   ├── docs/                 # Backend documentation
│   ├── examples/             # Code examples
│   │   └── basic_usage.py   # Basic CRUD operations
│   ├── fluxion/             # Main Python package
│   │   ├── database/        # Database connection & session management
│   │   │   ├── __init__.py
│   │   │   └── connection.py
│   │   └── models/          # SQLAlchemy ORM models
│   │       ├── __init__.py
│   │       ├── base.py
│   │       ├── host.py
│   │       └── package_update.py
│   ├── scripts/             # Utility scripts for ops
│   ├── tests/               # Test suite
│   ├── alembic.ini          # Alembic configuration
│   ├── pyproject.toml       # Project metadata
│   ├── requirements.txt     # Python dependencies
│   └── README.md            # Backend documentation
├── frontend/                 # Web UI (to be added)
├── apt-hooks/               # APT hook scripts (to be added)
├── docs/                     # Project-wide documentation
├── LICENSE
└── README.md                 # This file
```

**Planned additions:**
- `backend/fluxion/api/` - RESTful API endpoints for receiving package updates
- `backend/fluxion/services/` - Business logic layer
- `backend/fluxion/workers/` - Background workers for data processing
- `backend/fluxion/config/` - Configuration management
- `frontend/` - React/Vue web interface
- `apt-hooks/` - Shell scripts installed on hosts via APT hooks (e.g., `/etc/apt/apt.conf.d/`)
```

## Development

See [backend/README.md](backend/README.md) for backend development instructions.

### Running Tests

```bash
cd backend
pytest

# With coverage
pytest --cov=fluxion --cov-report=html
```

### Linting

```bash
cd backend
ruff check .
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
