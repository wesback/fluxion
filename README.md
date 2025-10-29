# Fluxion - Linux Package Update Tracking System

A comprehensive system for tracking Linux package updates across multiple hosts. Designed to run in Kubernetes with support for concurrent writes.

## Architecture

Fluxion is organized into distinct components:

- **backend/**: PostgreSQL database schema, API services, and data processing
- **frontend/**: Web UI for visualizing package updates (to be added)
- **agent/**: Client-side agent for collecting package information (to be added)
- **docs/**: Project-wide documentation

## Features

- **Async SQLAlchemy ORM**: Full async support for high-performance database operations
- **Alembic Migrations**: Database schema versioning and migration management
- **Optimized Indexes**: Composite indexes for efficient querying
- **Kubernetes-Ready**: Connection pooling and concurrent write support
- **Foreign Key Constraints**: CASCADE on delete for referential integrity

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
├── agent/                    # Package collection agent (to be added)
├── docs/                     # Project-wide documentation
├── LICENSE
└── README.md                 # This file
```

**Planned additions:**
- `backend/fluxion/api/` - RESTful API endpoints
- `backend/fluxion/services/` - Business logic layer
- `backend/fluxion/workers/` - Background workers for data processing
- `backend/fluxion/config/` - Configuration management
- `frontend/` - React/Vue web interface
- `agent/` - Host agent for collecting package data
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
