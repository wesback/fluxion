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

The backend is designed to receive package update information from APT hooks installed on Linux hosts. When a package is installed or upgraded, the APT hook automatically sends the update information to the Fluxion API.

## Quick Start

### Prerequisites

- Python 3.11 or higher
- PostgreSQL 14 or higher
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
│   ├── api/                 # API endpoints for receiving updates (to be added)
│   ├── services/            # Business logic (to be added)
│   └── workers/             # Background workers (to be added)
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

## Kubernetes Deployment

The backend is designed to run in Kubernetes with:
- Connection pooling for concurrent requests
- Health checks via pool pre-ping
- Automatic connection recycling
- Environment-based configuration

See the [main README](../README.md) for Kubernetes deployment examples.

## Contributing

Please see the [Contributing Guidelines](../CONTRIBUTING.md) (to be added).

## License

MIT License - see [LICENSE](../LICENSE) file for details.
