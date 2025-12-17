# Running Fluxion from DockerHub

This guide shows how to run Fluxion using pre-built Docker images from DockerHub.

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- Your DockerHub username (or use the default `wesback`)
- A Fluxion API key (generated from the backend)

### 2. Setup Environment

```bash
# Copy the example environment file
cp .env.dockerhub.example .env

# Edit the .env file with your settings
nano .env
```

**Important settings to configure:**

- `DOCKERHUB_USERNAME`: Your DockerHub username (default: `wesback`)
- `FLUXION_API_KEY`: Your API key for authentication
- `POSTGRES_PASSWORD`: Strong password for PostgreSQL
- `BACKEND_TAG` and `FRONTEND_TAG`: Image tags (e.g., `latest`, `dev-latest`, or specific version)

### 3. Start the Services

```bash
# Start all services
docker-compose -f docker-compose.dockerhub.yml up -d

# View logs
docker-compose -f docker-compose.dockerhub.yml logs -f

# Check service status
docker-compose -f docker-compose.dockerhub.yml ps
```

### 4. Initialize the Database

```bash
# Run database migrations
docker exec -it fluxion-backend alembic upgrade head

# Generate an admin API key (note: use 'sudo' if needed on Linux)
docker exec -it fluxion-backend bash -c "PYTHONPATH=/app python scripts/generate_admin_key.py"
```

Copy the generated API key and update your `.env` file:

```bash
# Update FLUXION_API_KEY in .env
nano .env

# Restart the frontend to pick up the new configuration
docker-compose -f docker-compose.dockerhub.yml restart frontend
```

**Note on Runtime Configuration:** The frontend now supports runtime configuration of the API base URL. You can change `NEXT_PUBLIC_API_BASE_URL` in your `.env` file and restart the frontend container - no rebuild required! The frontend fetches its configuration from `/api/config` which reads the environment variable at request time.

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Jaeger UI**: http://localhost:16686

## Using Specific Image Versions

You can specify exact versions by setting the tags in your `.env` file:

```bash
# Use specific version tags
BACKEND_TAG=main-abc1234
FRONTEND_TAG=main-abc1234

# Or use dev builds
BACKEND_TAG=dev-latest
FRONTEND_TAG=dev-latest
```

Then restart the services:

```bash
docker-compose -f docker-compose.dockerhub.yml pull
docker-compose -f docker-compose.dockerhub.yml up -d
```

## Available Images

The following images are available on DockerHub:

- `${DOCKERHUB_USERNAME}/fluxion-backend:latest` - Latest stable backend
- `${DOCKERHUB_USERNAME}/fluxion-backend:dev-latest` - Latest development backend
- `${DOCKERHUB_USERNAME}/fluxion-frontend:latest` - Latest stable frontend
- `${DOCKERHUB_USERNAME}/fluxion-frontend:dev-latest` - Latest development frontend

Branch-specific and commit-specific tags are also available (e.g., `main-abc1234`).

## Management Commands

### Stop Services

```bash
docker-compose -f docker-compose.dockerhub.yml stop
```

### Restart Services

```bash
docker-compose -f docker-compose.dockerhub.yml restart
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.dockerhub.yml logs -f

# Specific service
docker-compose -f docker-compose.dockerhub.yml logs -f backend
docker-compose -f docker-compose.dockerhub.yml logs -f frontend
```

### Update to Latest Images

```bash
# Pull latest images
docker-compose -f docker-compose.dockerhub.yml pull

# Restart with new images
docker-compose -f docker-compose.dockerhub.yml up -d
```

### Clean Up

```bash
# Stop and remove containers
docker-compose -f docker-compose.dockerhub.yml down

# Remove containers and volumes (WARNING: deletes database data)
docker-compose -f docker-compose.dockerhub.yml down -v
```

## Configuration Options

### Environment Variables

All configuration is done through the `.env` file. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCKERHUB_USERNAME` | Your DockerHub username | `wesback` |
| `BACKEND_TAG` | Backend image tag | `latest` |
| `FRONTEND_TAG` | Frontend image tag | `latest` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `fluxion_secure_password` |
| `FLUXION_API_KEY` | API key for authentication | `your-api-key-here` |
| `BACKEND_PORT` | Backend port | `8000` |
| `FRONTEND_PORT` | Frontend port | `3000` |
| `OTEL_ENABLED` | Enable OpenTelemetry | `true` |
| `LOG_LEVEL` | Log level (debug, info, warning, error) | `info` |

### Port Mapping

If you need to use different ports:

```bash
# Edit .env file
BACKEND_PORT=9000
FRONTEND_PORT=4000
JAEGER_UI_PORT=16687
```

### CORS Configuration

To restrict CORS origins (must use JSON array format):

```bash
# Edit .env file
# Allow all origins (development only)
CORS_ORIGINS=["*"]

# Restrict to specific origins (production)
CORS_ORIGINS=["http://localhost:3000","https://yourdomain.com"]
```

### Runtime API Configuration

The frontend supports runtime configuration of the API base URL. This means you can change where the frontend connects to the backend without rebuilding the Docker image:

```bash
# For local development
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# For production with reverse proxy (recommended)
NEXT_PUBLIC_API_BASE_URL=https://yourdomain.com

# For production with separate backend domain
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

After changing this value, simply restart the frontend:

```bash
docker-compose -f docker-compose.dockerhub.yml restart frontend
```

The frontend will fetch its configuration from the `/api/config` endpoint, which reads the environment variable at request time. No rebuild required!

## Troubleshooting

### Backend won't start

Check database connection:
```bash
docker-compose -f docker-compose.dockerhub.yml logs postgres
docker-compose -f docker-compose.dockerhub.yml logs backend
```

### Frontend can't connect to backend

1. Verify backend is running:
   ```bash
   curl http://localhost:8000/health
   ```

2. Check `NEXT_PUBLIC_API_BASE_URL` in `.env` matches your backend URL

3. Verify API key is correct:
   ```bash
   docker-compose -f docker-compose.dockerhub.yml logs frontend
   ```

### Database migrations needed

```bash
docker exec -it fluxion-backend alembic upgrade head
```

### Reset everything

```bash
docker-compose -f docker-compose.dockerhub.yml down -v
docker-compose -f docker-compose.dockerhub.yml up -d
docker exec -it fluxion-backend alembic upgrade head
# Note: use 'sudo' before docker commands if needed on Linux
docker exec -it fluxion-backend python scripts/generate_admin_key.py
```

## Production Considerations

For production deployments:

1. **Use strong passwords**: Update `POSTGRES_PASSWORD` with a strong, random password
2. **Secure API keys**: Generate and rotate API keys regularly
3. **Configure CORS**: Restrict `CORS_ORIGINS` to your actual domains (use JSON array format: `["https://example.com"]`)
4. **Use specific tags**: Pin to specific image versions instead of `latest`
5. **Enable SSL**: Use a reverse proxy (nginx, Traefik) with SSL certificates
6. **Backup database**: Set up regular backups of the PostgreSQL volume
7. **Monitor resources**: Use Docker stats or external monitoring tools
8. **Review logs**: Set appropriate `LOG_LEVEL` and centralize logs

## Next Steps

- [API Documentation](http://localhost:8000/docs)
- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
- [Deployment Guide](./deploy/README.md)
