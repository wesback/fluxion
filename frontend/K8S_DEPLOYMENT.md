# Frontend Kubernetes Deployment Documentation

Complete documentation for deploying the Fluxion frontend to Kubernetes.

## Architecture

The frontend deployment consists of:

1. **Next.js Server**: Runs the Next.js application in production mode
2. **Nginx Reverse Proxy**: Sits in front of Next.js for:
   - Static file caching
   - Gzip compression
   - Security headers
   - Health check endpoint
3. **ConfigMap**: Provides runtime configuration for API URL
4. **Service**: ClusterIP service for internal communication
5. **Ingress**: Routes external traffic to the frontend

## Deployment Components

### Dockerfile

The multi-stage Dockerfile:
- **Stage 1**: Install dependencies using npm ci
- **Stage 2**: Build Next.js with standalone output
- **Stage 3**: Production image with Node.js and Nginx

Key features:
- Non-root user (nextjs:1001)
- Multi-architecture support (amd64/arm64)
- Size optimized with standalone output
- Health checks built in

### Nginx Configuration

Located at `frontend/nginx.conf`:

**Features:**
- Reverse proxy to Next.js (port 3000)
- Gzip compression for text assets
- Security headers (CSP, X-Frame-Options, etc.)
- Static asset caching (1 year for /_next/static)
- Health check endpoint at `/health`
- WebSocket support for Next.js hot reload

**Ports:**
- Nginx listens on port 8080 (non-privileged)
- Next.js runs on port 3000 (internal)

### Runtime Configuration

The frontend receives configuration at runtime via ConfigMap:

1. **Environment Variables**: Injected into the container
   - `NEXT_PUBLIC_API_BASE_URL`: Backend API URL

2. **ConfigMap Data**: Available for advanced configurations
   - `api-url`: Backend API URL
   - `app-name`: Application name
   - `runtime-config.json`: JSON configuration

This allows deploying the same image to multiple environments without rebuilding.

## Helm Chart Integration

The frontend is integrated into the main Fluxion Helm chart at `deploy/helm/fluxion/`.

### Templates

- `templates/frontend-deployment.yaml`: Kubernetes Deployment
- `templates/frontend-service.yaml`: ClusterIP Service
- `templates/frontend-configmap.yaml`: Configuration data
- `templates/frontend-hpa.yaml`: Horizontal Pod Autoscaler
- `templates/ingress.yaml`: Updated to route / to frontend

### Values Configuration

Base configuration in `values.yaml`:

```yaml
frontend:
  enabled: true
  replicaCount: 2
  image:
    repository: ghcr.io/wesback/fluxion-frontend
    tag: ""
  resources:
    limits:
      cpu: 200m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 128Mi
  config:
    apiUrl: "http://fluxion-api:8000"
  autoscaling:
    enabled: false
    minReplicas: 2
    maxReplicas: 10
```

## Environment-Specific Deployments

### Development (values-dev.yaml)

```yaml
frontend:
  replicaCount: 1
  image:
    tag: "dev-latest"
  resources:
    limits:
      cpu: 100m
      memory: 128Mi
    requests:
      cpu: 50m
      memory: 64Mi
  config:
    apiUrl: "http://fluxion-api:8000"
```

**Characteristics:**
- Single replica for cost efficiency
- Lower resource limits
- Auto-sync enabled in ArgoCD
- Logs to console

### Staging (values-staging.yaml)

```yaml
frontend:
  replicaCount: 2
  image:
    tag: "staging-latest"
  resources:
    limits:
      cpu: 200m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 128Mi
  config:
    apiUrl: "http://fluxion-api:8000"
```

**Characteristics:**
- 2 replicas for HA testing
- Moderate resources
- Auto-sync enabled
- TLS with Let's Encrypt staging

### Production (values-production.yaml)

```yaml
frontend:
  replicaCount: 3
  image:
    tag: "v1.0.0"
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 200m
      memory: 256Mi
  config:
    apiUrl: "http://fluxion-api:8000"
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
```

**Characteristics:**
- 3+ replicas with HPA
- Higher resource limits
- Manual sync in ArgoCD (requires approval)
- TLS with Let's Encrypt production
- Pod anti-affinity for HA
- Rate limiting at ingress

## Deployment Process

### 1. Prerequisites

- Kubernetes cluster 1.23+
- Helm 3.8+
- kubectl configured
- Container image built and pushed to registry
- ArgoCD installed (optional, but recommended)

### 2. Manual Deployment with Helm

```bash
# Navigate to helm directory
cd deploy/helm

# Install or upgrade
helm upgrade --install fluxion ./fluxion \
  --namespace fluxion-dev \
  --create-namespace \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-dev.yaml \
  --set frontend.image.tag=dev-latest
```

### 3. Deployment with ArgoCD

```bash
# Apply ArgoCD Application
kubectl apply -f deploy/argocd/apps/fluxion-dev.yaml

# Sync the application
argocd app sync fluxion-dev

# Watch the sync progress
argocd app wait fluxion-dev
```

### 4. Verify Deployment

```bash
# Check pods
kubectl get pods -n fluxion-dev -l app.kubernetes.io/component=frontend

# Check service
kubectl get svc -n fluxion-dev -l app.kubernetes.io/component=frontend

# Check ingress
kubectl get ingress -n fluxion-dev

# View logs
kubectl logs -n fluxion-dev -l app.kubernetes.io/component=frontend --tail=50 -f

# Test health endpoint
kubectl port-forward -n fluxion-dev svc/fluxion-frontend 8080:80
curl http://localhost:8080/health
```

## Health Checks

### Liveness Probe

- Path: `/health`
- Initial delay: 10 seconds
- Period: 10 seconds
- Timeout: 3 seconds
- Failure threshold: 3

### Readiness Probe

- Path: `/health`
- Initial delay: 5 seconds
- Period: 5 seconds
- Timeout: 3 seconds
- Failure threshold: 3

The health check endpoint is served by Nginx and returns `200 OK` with body "healthy".

## Ingress Configuration

The ingress routes traffic based on path:

```yaml
ingress:
  hosts:
    - host: fluxion.example.com
      paths:
        - path: /
          pathType: Prefix
          backend: frontend  # Routes to frontend service
        - path: /api/v1
          pathType: Prefix
          backend: api  # Routes to API service
```

**Important**: The frontend path (`/`) must be listed after the API path in the template to ensure API requests are matched first.

## Scaling

### Manual Scaling

```bash
# Scale to 5 replicas
kubectl scale deployment fluxion-frontend --replicas=5 -n fluxion-dev
```

### Horizontal Pod Autoscaler

Enable in values file:

```yaml
frontend:
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80
```

Monitor HPA:

```bash
kubectl get hpa -n fluxion-production
kubectl describe hpa fluxion-frontend -n fluxion-production
```

## Rolling Updates

### Zero-Downtime Deployment

The deployment uses rolling updates by default:

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

### Update Process

```bash
# Update image tag
helm upgrade fluxion ./fluxion \
  --namespace fluxion-dev \
  --reuse-values \
  --set frontend.image.tag=v1.0.1

# Watch rollout status
kubectl rollout status deployment/fluxion-frontend -n fluxion-dev
```

### Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/fluxion-frontend -n fluxion-dev

# Rollback to specific revision
kubectl rollout undo deployment/fluxion-frontend -n fluxion-dev --to-revision=2

# View rollout history
kubectl rollout history deployment/fluxion-frontend -n fluxion-dev
```

## ArgoCD Integration

### Sync Waves

The frontend uses sync waves for ordered deployment:

- Wave 0: ConfigMaps (frontend-config)
- Wave 2: Deployment (frontend deployment)
- Wave 3: Ingress (after all services are ready)

### Image Updater

ArgoCD Image Updater can automatically update the frontend image:

```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: |
      frontend=ghcr.io/wesback/fluxion-frontend
    argocd-image-updater.argoproj.io/frontend.update-strategy: semver
```

This will:
- Watch for new semantic versions
- Automatically update the Application
- Trigger a sync
- Write back the new version to Git

## Security

### Pod Security

- Runs as non-root user (UID 1001)
- Read-only root filesystem where possible
- Drops all capabilities
- No privilege escalation

### Network Security

- Service type: ClusterIP (not externally accessible)
- Ingress provides external access with TLS
- Rate limiting at ingress level
- CORS configured in backend API

### Security Headers

Nginx adds security headers to all responses:

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy`: Restricts resource loading

## Monitoring

### Logs

```bash
# Stream logs
kubectl logs -n fluxion-dev -l app.kubernetes.io/component=frontend -f

# Logs from all replicas
kubectl logs -n fluxion-dev -l app.kubernetes.io/component=frontend --all-containers=true

# Previous pod logs
kubectl logs -n fluxion-dev <pod-name> --previous
```

### Metrics

Metrics can be collected via:
- Prometheus annotations on service
- Nginx stub_status module
- Custom metrics from Next.js

### Health Status

```bash
# Check pod health
kubectl get pods -n fluxion-dev -l app.kubernetes.io/component=frontend

# Detailed pod status
kubectl describe pod -n fluxion-dev <pod-name>

# Port forward and test
kubectl port-forward -n fluxion-dev svc/fluxion-frontend 8080:80
curl http://localhost:8080/health
```

## Troubleshooting

### Pods Not Starting

**Check pod status:**
```bash
kubectl get pods -n fluxion-dev -l app.kubernetes.io/component=frontend
kubectl describe pod -n fluxion-dev <pod-name>
```

**Common issues:**
- ImagePullBackOff: Check image name/tag and registry credentials
- CrashLoopBackOff: Check logs for application errors
- Pending: Check resource quotas and node capacity

### Health Checks Failing

**Check health endpoint:**
```bash
kubectl port-forward -n fluxion-dev <pod-name> 8080:8080
curl -v http://localhost:8080/health
```

**Common issues:**
- Next.js not starting: Check logs for build errors
- Nginx misconfiguration: Verify nginx.conf syntax
- Slow startup: Increase `initialDelaySeconds`

### Ingress Not Working

**Check ingress status:**
```bash
kubectl describe ingress -n fluxion-dev fluxion
kubectl get ingress -n fluxion-dev -o yaml
```

**Common issues:**
- No ingress controller: Install nginx-ingress or similar
- Wrong path configuration: Verify path and pathType
- TLS certificate issues: Check cert-manager logs

### Configuration Issues

**Check ConfigMap:**
```bash
kubectl get configmap -n fluxion-dev fluxion-frontend-config -o yaml
```

**Common issues:**
- API URL incorrect: Verify apiUrl in values file
- ConfigMap not mounted: Check volumeMounts in deployment
- Environment variables not set: Check env in deployment

## Performance Optimization

### Resource Tuning

Monitor resource usage:
```bash
kubectl top pods -n fluxion-dev -l app.kubernetes.io/component=frontend
```

Adjust based on actual usage:
```yaml
frontend:
  resources:
    requests:
      cpu: 100m      # Set based on average usage
      memory: 128Mi  # Set based on average usage
    limits:
      cpu: 200m      # Allow bursting
      memory: 256Mi  # Prevent OOM
```

### Caching Strategy

Static assets are cached with different durations:
- `/_next/static/*`: 1 year (immutable)
- Other static files: 1 day
- HTML/dynamic content: No cache

### CDN Integration

For production, consider adding a CDN in front of the ingress:
- CloudFlare
- AWS CloudFront
- Azure CDN
- Google Cloud CDN

## Backup and Recovery

### Configuration Backup

```bash
# Backup all frontend resources
kubectl get deployment,service,configmap,ingress -n fluxion-production \
  -l app.kubernetes.io/component=frontend \
  -o yaml > frontend-backup.yaml
```

### Disaster Recovery

1. **Store Helm values in Git**: Always commit values files
2. **Use ArgoCD**: Git is source of truth, easy to restore
3. **Document custom configurations**: Keep notes on any manual changes
4. **Test recovery process**: Regularly test deploying to clean cluster

## Maintenance

### Regular Tasks

- **Update dependencies**: Keep Node.js, Next.js, and Nginx updated
- **Scan for vulnerabilities**: Use Trivy or similar tools
- **Review logs**: Check for errors and warnings
- **Monitor performance**: Watch response times and resource usage
- **Test rollback**: Ensure you can quickly rollback if needed

### Updating

```bash
# Update to new version
helm upgrade fluxion ./fluxion \
  --namespace fluxion-production \
  --reuse-values \
  --set frontend.image.tag=v1.1.0

# Watch the update
kubectl rollout status deployment/fluxion-frontend -n fluxion-production
```

## Additional Resources

- [CI/CD Guide](DEPLOYMENT.md): Building and pushing images
- [Helm Chart Documentation](../deploy/helm/fluxion/README.md)
- [ArgoCD Setup](../deploy/argocd/README.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [Nginx Documentation](https://nginx.org/en/docs/)
