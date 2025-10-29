# Project Documentation

Additional documentation for the Fluxion project.

## Component Documentation

- [Backend Documentation](../backend/README.md) - Database, API, and backend services
- Frontend Documentation (to be added)
- Agent Documentation (to be added)

## Architecture

Fluxion follows a microservices architecture:

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
         │
    ┌────▼─────┐
    │  Agents  │  (Python agents - to be added)
    │  on      │
    │  Hosts   │
    └──────────┘
```

## Database Schema

See the [main README](../README.md) for detailed schema information.

## Development Workflow

1. Backend changes: Work in `backend/` directory
2. Frontend changes: Work in `frontend/` directory (when added)
3. Agent changes: Work in `agent/` directory (when added)

Each component has its own dependencies and testing infrastructure.

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
