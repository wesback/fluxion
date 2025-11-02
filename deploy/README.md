# Fluxion Kubernetes Deployment Guide

Complete guide for deploying Fluxion on Kubernetes with Helm and ArgoCD.

## Quick Links

- [Helm Chart Documentation](helm/fluxion/README.md)
- [ArgoCD Setup Guide](argocd/README.md)
- [Secrets Management](SECRETS.md)
- [Image Updater Guide](argocd/IMAGE-UPDATER.md)

## Overview

Fluxion provides multiple deployment options:

1. **Direct Helm Install**: Quick deployment using Helm CLI
2. **ArgoCD GitOps**: Automated, declarative deployments with GitOps
3. **Manual Manifests**: Raw Kubernetes manifests (generated from Helm)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                    │
│                                                              │
│  ┌──────────────────┐         ┌─────────────────────────┐  │
│  │                  │         │                         │  │
│  │  Ingress         │────────▶│  API Service            │  │
│  │  (nginx)         │         │  (ClusterIP)            │  │
│  │  /api/v1/*       │         │                         │  │
│  │                  │         └─────────┬───────────────┘  │
│  └──────────────────┘                   │                   │
│           │                             │                   │
│           │                             ▼                   │
│           │                   ┌─────────────────────────┐  │
│           │                   │  API Deployment         │  │
│           │                   │  (2-3 replicas)         │  │
│           │                   │  - Health: /health      │  │
│           │                   │  - Ready: /ready        │  │
│           │                   └─────────┬───────────────┘  │
│           │                             │                   │
│           │                             │                   │
│           │                             ▼                   │
│           │                   ┌─────────────────────────┐  │
│           │                   │  PostgreSQL             │  │
│           │                   │  StatefulSet            │  │
│           │                   │  (PVC: 10Gi)            │  │
│           │                   └─────────────────────────┘  │
│           │                                                 │
│           │                   ┌─────────────────────────┐  │
│           └──────────────────▶│  OTEL Collector         │  │
│                               │  (optional)             │  │
│                               │  - Traces               │  │
│                               │  - Metrics              │  │
│                               └─────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required

- Kubernetes cluster 1.23+
- kubectl configured
- Helm 3.8+ (for Helm deployments)
- StorageClass with dynamic provisioning

### Optional

- ArgoCD (for GitOps)
- Ingress controller (nginx, traefik, etc.)
- cert-manager (for TLS certificates)
- Sealed Secrets or External Secrets Operator

### Resource Requirements

**Minimum (Development):**
- 2 CPU cores
- 4 GB RAM
- 10 GB storage

**Recommended (Production):**
- 6 CPU cores
- 8 GB RAM
- 50 GB storage

## Deployment Methods

### Method 1: Helm (Quick Start)

**Pros:**
- Fast deployment
- Easy to customize
- Good for testing

**Cons:**
- Manual updates required
- No GitOps benefits
- Less visibility

**Steps:**

1. **Clone repository:**
   ```bash
   git clone https://github.com/wesback/fluxion.git
   cd fluxion/deploy/helm
   ```

2. **Create namespace:**
   ```bash
   kubectl create namespace fluxion
   ```

3. **Set up secrets:**
   ```bash
   # Generate PostgreSQL password
   POSTGRES_PASSWORD=$(openssl rand -base64 32)
   
   # Generate admin API key
   cd ../../backend
   ADMIN_API_KEY=$(python scripts/generate_admin_key.py)
   cd ../deploy/helm
   
   # Create secrets
   kubectl create secret generic fluxion-postgresql \
     --namespace=fluxion \
     --from-literal=postgres-password="${POSTGRES_PASSWORD}"
   
   kubectl create secret generic fluxion-api \
     --namespace=fluxion \
     --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
     --from-literal=admin-api-key="${ADMIN_API_KEY}"
   ```

4. **Install chart:**
   ```bash
   helm install fluxion ./fluxion \
     --namespace fluxion \
     --set postgresql.auth.existingSecret=fluxion-postgresql \
     --set secrets.postgresPassword="" \
     --set image.tag=latest
   ```

5. **Verify deployment:**
   ```bash
   kubectl get pods -n fluxion
   kubectl get svc -n fluxion
   
   # Port-forward to test
   kubectl port-forward -n fluxion svc/fluxion-api 8000:8000
   
   # Test health endpoint
   curl http://localhost:8000/health
   ```

### Method 2: ArgoCD (Recommended for Production)

**Pros:**
- GitOps workflow
- Automated deployments
- Easy rollbacks
- Multi-environment support
- Audit trail

**Cons:**
- Requires ArgoCD setup
- More initial complexity

**Steps:**

1. **Install ArgoCD** (if not already installed):
   ```bash
   kubectl create namespace argocd
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   ```

2. **Follow the complete guide:**
   - See [ArgoCD Setup Guide](argocd/README.md) for detailed instructions
   - Includes secret management
   - Multi-environment setup
   - Image auto-updates

3. **Quick deployment:**
   ```bash
   # Create project
   kubectl apply -f argocd/projects/fluxion-project.yaml
   
   # Set up secrets first (see SECRETS.md)
   
   # Deploy to development
   kubectl apply -f argocd/apps/fluxion-dev.yaml
   
   # Deploy to production
   kubectl apply -f argocd/apps/fluxion-production.yaml
   ```

### Method 3: Manual Manifests

Generate raw Kubernetes manifests from Helm:

```bash
# Generate manifests
helm template fluxion ./fluxion \
  --namespace fluxion-production \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-production.yaml \
  > fluxion-production-manifests.yaml

# Review and edit secrets
# Apply manifests
kubectl apply -f fluxion-production-manifests.yaml
```

## Environment-Specific Deployments

### Development

- 1 API replica
- 1 PostgreSQL replica
- Debug logging
- Auto-sync enabled
- OTLP collector enabled

```bash
helm install fluxion ./fluxion \
  --namespace fluxion-dev \
  --create-namespace \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-dev.yaml
```

### Staging

- 2 API replicas
- 1 PostgreSQL replica
- Info logging
- TLS enabled
- Rate limiting
- Auto-sync enabled

```bash
helm install fluxion ./fluxion \
  --namespace fluxion-staging \
  --create-namespace \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-staging.yaml
```

### Production

- 3 API replicas (with HPA)
- 1 PostgreSQL replica (consider managed DB)
- Warning logging
- TLS enforced
- Pod disruption budget
- Network policies
- Manual sync (via ArgoCD)

```bash
helm install fluxion ./fluxion \
  --namespace fluxion-production \
  --create-namespace \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-production.yaml
```

## Configuration

### Essential Configuration

Before deploying, configure these in your values file or via `--set`:

```yaml
# Image configuration
image:
  repository: ghcr.io/wesback/fluxion
  tag: "v1.0.0"  # Use specific version for production

# Secrets (use existing secrets!)
postgresql:
  auth:
    existingSecret: "fluxion-postgresql"
    secretKey: "postgres-password"

# Ingress (if needed)
ingress:
  enabled: true
  className: "nginx"
  hosts:
    - host: fluxion.example.com
      paths:
        - path: /api/v1
          pathType: Prefix
  tls:
    enabled: true
```

### Advanced Configuration

See [values.yaml](helm/fluxion/values.yaml) for all options:

- Resource limits and requests
- Autoscaling settings
- OpenTelemetry configuration
- Network policies
- Security contexts
- Affinity rules

## Post-Deployment Tasks

### 1. Verify Deployment

```bash
# Check pod status
kubectl get pods -n fluxion-production

# Check services
kubectl get svc -n fluxion-production

# Check ingress
kubectl get ingress -n fluxion-production

# View logs
kubectl logs -n fluxion-production -l app.kubernetes.io/component=api --tail=50

# Test health endpoints
kubectl exec -n fluxion-production deployment/fluxion-api -- \
  curl -f http://localhost:8000/health
```

### 2. Configure DNS

Point your domain to the ingress:

```bash
# Get ingress IP/hostname
kubectl get ingress -n fluxion-production

# Create DNS A or CNAME record
# Example: fluxion.example.com -> <ingress-ip>
```

### 3. Set Up TLS

Using cert-manager:

```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  tls:
    enabled: true
```

### 4. Configure Monitoring

Set up Prometheus scraping:

```yaml
api:
  service:
    annotations:
      prometheus.io/scrape: "true"
      prometheus.io/port: "8000"
      prometheus.io/path: "/metrics"
```

### 5. Set Up Backups

PostgreSQL backups:

```bash
# Manual backup
kubectl exec -n fluxion-production fluxion-postgresql-0 -- \
  pg_dump -U fluxion fluxion > backup-$(date +%Y%m%d).sql

# Or use a backup solution like:
# - Velero (cluster-wide backups)
# - PostgreSQL operators (automated backups)
# - Managed database service (cloud provider backups)
```

## Upgrading

### Helm Upgrade

```bash
# Update chart
helm upgrade fluxion ./fluxion \
  --namespace fluxion-production \
  --values ./fluxion/values.yaml \
  --values ./fluxion/values-production.yaml

# Rollback if needed
helm rollback fluxion -n fluxion-production
```

### ArgoCD Upgrade

```bash
# Sync to new version
argocd app sync fluxion-production

# Or let auto-sync handle it (if enabled)
```

### Database Migrations

If schema changes are needed:

```bash
# Run migrations in init container or job
kubectl exec -n fluxion-production deployment/fluxion-api -- \
  alembic upgrade head
```

## Monitoring and Observability

### Health Checks

- Liveness: `GET /health`
- Readiness: `GET /ready`

### Logs

Structured JSON logs with trace context:

```bash
# View logs
kubectl logs -n fluxion-production -l app.kubernetes.io/name=fluxion -f

# Filter by level
kubectl logs -n fluxion-production deployment/fluxion-api | jq 'select(.level=="ERROR")'
```

### Metrics

OpenTelemetry metrics exposed at `:8888/metrics`

### Tracing

Traces sent to OTLP collector (if enabled)

## Troubleshooting

### Common Issues

**1. Pods not starting**

```bash
kubectl describe pod -n fluxion-production <pod-name>
kubectl logs -n fluxion-production <pod-name>
```

**2. Database connection issues**

```bash
# Test DB connectivity
kubectl exec -n fluxion-production deployment/fluxion-api -- \
  nc -zv fluxion-postgresql 5432

# Check DB logs
kubectl logs -n fluxion-production statefulset/fluxion-postgresql
```

**3. Ingress not working**

```bash
# Check ingress status
kubectl describe ingress -n fluxion-production fluxion

# Check ingress controller
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

See [Troubleshooting Guide](helm/fluxion/README.md#troubleshooting) for more.

## Security Best Practices

1. **Secrets Management**: Use Sealed Secrets or External Secrets Operator
2. **Network Policies**: Enable in production
3. **RBAC**: Limit access to resources
4. **Pod Security**: Use security contexts
5. **Image Scanning**: Scan images for vulnerabilities
6. **TLS**: Always use TLS in production
7. **Rate Limiting**: Configure at ingress level
8. **Audit Logging**: Enable Kubernetes audit logs

## Production Checklist

- [ ] Secrets properly managed (not in Git)
- [ ] TLS certificates configured
- [ ] Resource limits set
- [ ] Autoscaling configured
- [ ] Pod disruption budget set
- [ ] Network policies enabled
- [ ] Monitoring/alerting set up
- [ ] Backups configured
- [ ] Disaster recovery plan documented
- [ ] Health checks working
- [ ] Logging centralized
- [ ] DNS configured
- [ ] Rate limiting enabled
- [ ] Security scans passing

## Support and Resources

- **Documentation**: [GitHub Wiki](https://github.com/wesback/fluxion/wiki)
- **Issues**: [GitHub Issues](https://github.com/wesback/fluxion/issues)
- **Helm Chart**: [README](helm/fluxion/README.md)
- **ArgoCD Guide**: [README](argocd/README.md)
- **Secrets Guide**: [SECRETS.md](SECRETS.md)

## Next Steps

1. Choose deployment method (Helm or ArgoCD)
2. Set up secrets management
3. Deploy to development environment
4. Test and validate
5. Deploy to staging
6. Configure monitoring
7. Deploy to production
8. Set up backups
9. Document your deployment

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.
