# Fluxion - Linux Package Update Tracking System

A PostgreSQL-based system for tracking Linux package updates across multiple hosts. Designed to run in Kubernetes with support for concurrent writes.

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

## Setup Instructions

### Prerequisites

- Python 3.11 or higher
- PostgreSQL 14 or higher
- pip or uv for package management

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/wesback/fluxion.git
   cd fluxion
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

   Or using uv:
   ```bash
   uv pip install -r requirements.txt
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
   Create a `.env` file in the project root:
   ```env
   DATABASE_URL=postgresql+asyncpg://fluxion:your_secure_password@localhost:5432/fluxion
   SQL_ECHO=false
   DB_POOL_SIZE=10
   DB_MAX_OVERFLOW=20
   ```

   For Kubernetes deployment, set these as environment variables or use ConfigMaps/Secrets.

### Database Migration

1. **Run migrations**:
   ```bash
   alembic upgrade head
   ```

2. **Verify migration status**:
   ```bash
   alembic current
   ```

3. **View migration history**:
   ```bash
   alembic history
   ```

### Creating New Migrations

When you modify the models:

1. **Generate a new migration**:
   ```bash
   alembic revision --autogenerate -m "Description of changes"
   ```

2. **Review the generated migration** in `alembic/versions/`

3. **Apply the migration**:
   ```bash
   alembic upgrade head
   ```

### Rollback Migrations

To rollback the last migration:
```bash
alembic downgrade -1
```

To rollback to a specific revision:
```bash
alembic downgrade <revision_id>
```

## Usage Examples

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
        
        # Query hosts
        result = await session.execute(select(Host))
        hosts = result.scalars().all()
        for host in hosts:
            print(f"Host: {host.hostname}")

if __name__ == "__main__":
    asyncio.run(main())
```

### Query Examples

```python
from datetime import datetime, timedelta
from sqlalchemy import select, and_

# Get recent updates for a specific host
async def get_recent_updates(session, hostname: str, hours: int = 24):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    result = await session.execute(
        select(PackageUpdate)
        .join(Host)
        .where(
            and_(
                Host.hostname == hostname,
                PackageUpdate.update_timestamp >= since
            )
        )
        .order_by(PackageUpdate.update_timestamp.desc())
    )
    return result.scalars().all()

# Get all updates for a specific package
async def get_package_history(session, package_name: str):
    result = await session.execute(
        select(PackageUpdate)
        .where(PackageUpdate.package_name == package_name)
        .order_by(PackageUpdate.update_timestamp.desc())
    )
    return result.scalars().all()
```

## Kubernetes Deployment

The database connection module is configured for Kubernetes deployment:

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

## Development

### Project Structure

```
fluxion/
├── alembic/                    # Alembic migrations
│   ├── versions/              # Migration files
│   ├── env.py                 # Alembic environment configuration
│   └── script.py.mako         # Migration template
├── fluxion/                   # Main package
│   ├── __init__.py
│   ├── database/              # Database connection
│   │   ├── __init__.py
│   │   └── connection.py
│   └── models/                # SQLAlchemy models
│       ├── __init__.py
│       ├── base.py
│       ├── host.py
│       └── package_update.py
├── alembic.ini                # Alembic configuration
├── requirements.txt           # Python dependencies
└── README.md                  # This file
```

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-cov

# Run tests
pytest

# Run tests with coverage
pytest --cov=fluxion
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
