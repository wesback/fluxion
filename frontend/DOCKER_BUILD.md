# Frontend Docker Build Notes

## Build Status

The Dockerfile has been created and validated for structure and syntax. It follows Next.js best practices for containerization.

## Building Locally

To build the Docker image locally:

```bash
cd frontend
docker build -t fluxion-frontend:latest .
```

### Build Requirements

- Docker 20.10+ or compatible container runtime
- Good network connectivity for npm package downloads
- At least 2GB of RAM for the build process
- Approximately 5-10 minutes build time (depending on system)

### Expected Build Output

The build process:
1. Installs Node.js dependencies (~400+ packages)
2. Builds Next.js application with standalone output
3. Creates optimized production image with Nginx
4. Final image size: ~150-200MB

### Build Arguments

The build supports the following arguments:

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  -t fluxion-frontend:v1.0.0 \
  .
```

## CI/CD Build

The Docker image is designed to be built in CI/CD pipelines such as:
- GitHub Actions
- GitLab CI
- Jenkins
- CircleCI
- Any Docker-compatible CI system

See `DEPLOYMENT.md` for complete CI/CD examples.

## Testing the Image

Once built, test the image locally:

```bash
# Run the container
docker run -p 8080:8080 \
  -e NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 \
  fluxion-frontend:latest

# Test health endpoint
curl http://localhost:8080/health

# Access the application
open http://localhost:8080
```

## Multi-Architecture Builds

For production, build multi-architecture images:

```bash
docker buildx create --name multiarch --use

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/wesback/fluxion-frontend:v1.0.0 \
  --push \
  .
```

## Troubleshooting

### npm ci Timeouts

If you encounter npm install timeouts during build:
- Check your network connectivity
- Try using a different npm registry mirror
- Increase Docker build timeout limits
- Use Docker BuildKit caching to resume failed builds

### Build Memory Issues

If builds fail with out-of-memory errors:
- Increase Docker memory limits (Settings → Resources)
- Use `docker build --memory 4g` to set memory limit
- Close other applications to free memory

### Image Size

To check the image size:
```bash
docker images fluxion-frontend
```

To analyze layers:
```bash
docker history fluxion-frontend:latest
```

## Production Deployment

For production deployments:
1. Always use specific version tags (not `latest`)
2. Scan images for vulnerabilities
3. Sign images for supply chain security
4. Store in secure container registries
5. Use image pull secrets in Kubernetes

See `K8S_DEPLOYMENT.md` for Kubernetes deployment details.
