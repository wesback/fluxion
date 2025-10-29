# Project Documentation

Additional documentation for the Fluxion project.

## Component Documentation

- [Backend Documentation](../backend/README.md) - Database, API, and backend services
- Frontend Documentation (to be added)
- APT Hooks Documentation (to be added)

## Architecture

Fluxion uses APT hooks to automatically report package updates:

```
┌─────────────────┐
│   Web Frontend  │  (React/Vue - to be added)
└────────┬────────┘
         │
    ┌────▼─────┐
    │   API    │  (FastAPI - to be added)
    │ Backend  │
    └────┬─────┘
         │
    ┌────▼─────┐
    │PostgreSQL│  (Current implementation)
    │ Database │
    └──────────┘
         ▲
         │ HTTP POST on package updates
    ┌────┴─────┐
    │ APT Hook │  (Shell script - to be added)
    │  Scripts │  (Installed at /etc/apt/apt.conf.d/)
    │  on      │
    │  Hosts   │
    └──────────┘
```

## How It Works

1. **APT Hook Installation**: A shell script is placed in `/etc/apt/apt.conf.d/` on each host
2. **Automatic Triggers**: APT automatically executes the hook when packages are installed/upgraded
3. **Data Collection**: The hook gathers package name, old version, new version, and host info
4. **HTTP POST**: The hook sends data to the Fluxion API endpoint
5. **Database Storage**: API validates and stores the update in PostgreSQL
6. **Visualization**: Frontend displays package updates across all hosts

## Database Schema

See the [main README](../README.md) for detailed schema information.

## Development Workflow

1. Backend changes: Work in `backend/` directory
2. Frontend changes: Work in `frontend/` directory (when added)
3. APT hook changes: Work in `apt-hooks/` directory (when added)

Each component has its own dependencies and testing infrastructure.

## APT Hook Example

The APT hook script will be placed at `/etc/apt/apt.conf.d/99fluxion` on hosts:

```bash
#!/bin/bash
# Example APT hook for Fluxion
# Triggered automatically by APT on package updates

# Configuration - use your actual Fluxion API endpoint
FLUXION_API_URL="https://your-fluxion-api.example.com/api/v1/updates"
HOSTNAME=$(hostname)

# Collect package information from APT
# Send to Fluxion API via HTTP POST
curl -X POST "$FLUXION_API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"hostname\": \"$HOSTNAME\",
    \"package_name\": \"nginx\",
    \"old_version\": \"1.18.0\",
    \"new_version\": \"1.22.0\"
  }"
```

## Deployment

### Local Development
```bash
# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
```

### Production (Kubernetes)
See individual component READMEs for Kubernetes deployment manifests.
