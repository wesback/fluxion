# Fluxion Helm Chart

This Helm chart deploys the Fluxion Linux Package Update Tracking System on Kubernetes, optimized for ArgoCD GitOps workflows.

## Components

The chart deploys the following components:

- **PostgreSQL StatefulSet**: Database for storing package update history
- **API Deployment**: FastAPI backend service with configurable replicas
- **Ingress**: Optional ingress for external access with rate limiting
- **OpenTelemetry Collector**: Optional observability collector for traces and metrics
- **ConfigMaps & Secrets**: Configuration and sensitive data management

## Prerequisites

- Kubernetes 1.23+
- Helm 3.8+
- PostgreSQL 14+ (or use built-in StatefulSet)
- Optional: cert-manager for TLS certificates
- Optional: ArgoCD for GitOps deployment

## Installation

### Quick Start with Helm

```bash
# Add the repository (if published to a Helm repository)
# helm repo add fluxion https://charts.example.com
# helm repo update

# Install from local chart
cd deploy/helm
helm install fluxion ./fluxion \
  --namespace fluxion \
  --create-namespace \
  --values ./fluxion/values.yaml
```

### Installation with Custom Values

```bash
# Development environment
helm install fluxion ./fluxion \
  --namespace fluxion-dev \
  --create-namespace \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-dev.yaml

# Staging environment
helm install fluxion ./fluxion \
  --namespace fluxion-staging \
  --create-namespace \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-staging.yaml

# Production environment
helm install fluxion ./fluxion \
  --namespace fluxion-production \
  --create-namespace \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-production.yaml
```

### Installation with ArgoCD

See [ArgoCD Deployment Guide](../argocd/README.md) for GitOps deployment instructions.

## Configuration

### Required Configuration

Before deploying, you **must** configure:

1. **Database Password**
   ```yaml
   secrets:
     postgresPassword: "your-secure-password"
   ```

2. **Admin API Key**
   ```yaml
   secrets:
     adminApiKey: "your-admin-api-key"
   ```
   
   Generate an admin API key:
   ```bash
   cd backend
   python scripts/generate_admin_key.py
   ```

3. **Ingress Hostname** (if using ingress)
   ```yaml
   ingress:
     enabled: true
     hosts:
       - host: fluxion.example.com
         paths:
           - path: /api/v1
             pathType: Prefix
   ```

### Key Configuration Options

#### API Configuration

```yaml
api:
  replicaCount: 2  # Number of API replicas
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 250m
      memory: 256Mi
```

#### Database Configuration

```yaml
postgresql:
  enabled: true  # Set to false if using external PostgreSQL
  replicaCount: 1  # Set to 3 for HA (requires PVC support)
  persistence:
    enabled: true
    size: 10Gi
    storageClass: ""  # Use default storage class
```

#### OpenTelemetry Configuration

```yaml
otelCollector:
  enabled: true  # Enable OpenTelemetry collector
  
config:
  otel:
    enabled: true
    exporterType: "otlp"  # console, otlp, or otlp-http
    serviceName: "fluxion"
    environment: "production"
```

#### Ingress with TLS

```yaml
ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/limit-rps: "10"
  hosts:
    - host: fluxion.example.com
      paths:
        - path: /api/v1
          pathType: Prefix
  tls:
    enabled: true
```

### Environment-Specific Values

The chart includes pre-configured values files for different environments:

- `values-dev.yaml`: Development environment (1 replica, debug logging)
- `values-staging.yaml`: Staging environment (2 replicas, TLS enabled)
- `values-production.yaml`: Production environment (3 replicas, HA, autoscaling)

## Secrets Management

### Option 1: Helm Values (Testing Only)

**⚠️ WARNING: Never commit secrets to Git!**

```yaml
secrets:
  postgresPassword: "test-password"
  adminApiKey: "test-api-key"
```

### Option 2: Sealed Secrets (Recommended)

```bash
# Install sealed-secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Create a secret
kubectl create secret generic fluxion-secrets \
  --from-literal=postgres-password='YOUR_PASSWORD' \
  --from-literal=admin-api-key='YOUR_API_KEY' \
  --dry-run=client -o yaml | \
  kubeseal -o yaml > sealed-secret.yaml

# Apply the sealed secret
kubectl apply -f sealed-secret.yaml
```

Then reference it in values:
```yaml
postgresql:
  auth:
    existingSecret: "fluxion-secrets"
    secretKey: "postgres-password"
```

### Option 3: External Secrets Operator

```yaml
secrets:
  externalSecret:
    enabled: true
    backendType: "azurekv"  # Azure Key Vault
    name: "fluxion-secrets"
    data:
      postgresPassword: "postgres-password"
      adminApiKey: "admin-api-key"
```

## Upgrading

### Helm Upgrade

```bash
helm upgrade fluxion ./fluxion \
  --namespace fluxion-production \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-production.yaml
```

### With ArgoCD

ArgoCD will automatically detect changes in Git and sync them. For production, manual approval is required by default.

## Rollback

### Helm Rollback

```bash
# List releases
helm history fluxion -n fluxion-production

# Rollback to previous version
helm rollback fluxion -n fluxion-production

# Rollback to specific revision
helm rollback fluxion 3 -n fluxion-production
```

### ArgoCD Rollback

```bash
# Via CLI
argocd app rollback fluxion-production

# Via UI
# Navigate to application -> History and Rollback -> Select revision -> Rollback
```

## Monitoring & Observability

### Health Checks

The API includes built-in health check endpoints:

- `/health`: Basic health check (always returns healthy if service is running)
- `/ready`: Readiness check (verifies database connectivity)

These are configured as Kubernetes probes:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: http
readinessProbe:
  httpGet:
    path: /ready
    port: http
```

### OpenTelemetry Integration

When OpenTelemetry collector is enabled:

1. Traces are sent to the collector via OTLP
2. Collector can export to backends like Jaeger, Zipkin, or cloud providers
3. Metrics are exposed on port 8888

### Logs

Structured JSON logs with trace context:

```bash
# View API logs
kubectl logs -n fluxion-production deployment/fluxion-api -f

# View PostgreSQL logs
kubectl logs -n fluxion-production statefulset/fluxion-postgresql -f
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL pod status
kubectl get pods -n fluxion-production -l app.kubernetes.io/component=postgresql

# Test database connectivity
kubectl exec -it -n fluxion-production deployment/fluxion-api -- \
  python -c "import asyncpg; import asyncio; asyncio.run(asyncpg.connect('postgresql://...'))"
```

### API Not Ready

```bash
# Check readiness probe
kubectl describe pod -n fluxion-production -l app.kubernetes.io/component=api

# Check logs for errors
kubectl logs -n fluxion-production -l app.kubernetes.io/component=api --tail=100
```

### Ingress Not Working

```bash
# Check ingress status
kubectl get ingress -n fluxion-production

# Describe ingress for events
kubectl describe ingress -n fluxion-production fluxion

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

## Uninstallation

### With Helm

```bash
helm uninstall fluxion -n fluxion-production

# Delete namespace (if desired)
kubectl delete namespace fluxion-production
```

### With ArgoCD

```bash
# Delete application (this will delete all resources)
argocd app delete fluxion-production

# Or via kubectl
kubectl delete application fluxion-production -n argocd
```

## Values Reference

See [values.yaml](values.yaml) for a complete list of configuration options with descriptions.

## Contributing

Contributions are welcome! Please submit issues and pull requests to the [Fluxion repository](https://github.com/wesback/fluxion).

## License

MIT License - see [LICENSE](../../../LICENSE) file for details.
