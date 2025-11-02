# ArgoCD Bootstrap for Fluxion

This directory contains reference manifests and instructions for bootstrapping ArgoCD in a new Kubernetes cluster for Fluxion deployment.

## Overview

The bootstrap process sets up ArgoCD and deploys the Fluxion application using the app-of-apps pattern.

## Quick Start

```bash
# 1. Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 2. Wait for ArgoCD to be ready
kubectl wait --for=condition=available --timeout=300s \
  deployment/argocd-server \
  deployment/argocd-repo-server \
  deployment/argocd-applicationset-controller \
  -n argocd

# 3. Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo

# 4. Create Fluxion project
kubectl apply -f ../projects/fluxion-project.yaml

# 5. Deploy root app (app-of-apps)
kubectl apply -f ../root-app.yaml

# 6. Verify deployment
kubectl get applications -n argocd
```

## What Gets Deployed

The root app-of-apps will automatically deploy:

1. **Core Applications**:
   - `fluxion-dev` - Development environment
   - `fluxion-staging` - Staging environment
   - `fluxion-production` - Production environment

2. **Observability Stack**:
   - `prometheus-stack` - Prometheus and Grafana
   - `opentelemetry-operator` - OpenTelemetry operator
   - `otel-collector` - OpenTelemetry collector
   - `jaeger` - Jaeger for distributed tracing
   - `grafana-dashboards` - Custom Grafana dashboards
   - `prometheus-rules` - Custom Prometheus rules

## Prerequisites

- Kubernetes cluster (1.24+) with ingress-nginx and cert-manager installed
  - **Recommended:** Use the Terraform infrastructure setup from `terraform/` directory
  - After running `terraform apply`, run `terraform/scripts/install-k8s-components.sh` 
    which installs ingress-nginx, cert-manager, and ArgoCD automatically
- `kubectl` configured with cluster admin access
- 4GB+ available memory for ArgoCD
- 8GB+ available memory for Fluxion and observability stack

> **Note:** If you used the Terraform setup with the bootstrap script, ArgoCD is already installed!
> Skip to "What Gets Deployed" below and proceed with deploying applications.

## Manual ArgoCD Installation (Alternative)

If you didn't use the Terraform bootstrap script, install ArgoCD manually:

## Manual ArgoCD Installation (Alternative)

If you didn't use the Terraform bootstrap script, install ArgoCD manually:

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=available --timeout=300s \
  deployment/argocd-server \
  deployment/argocd-repo-server \
  deployment/argocd-applicationset-controller \
  -n argocd
```

See **[../ARGOCD-INSTALLATION.md](../ARGOCD-INSTALLATION.md)** for comprehensive installation instructions including:

- Standard vs High Availability installation
- Ingress configuration (Nginx, Traefik, etc.)
- RBAC setup
- Admin password management
- SSO configuration (GitHub, OIDC, SAML)
- Troubleshooting

## Repository Structure

```
deploy/argocd/
├── bootstrap/
│   ├── README.md              # This file
│   └── argocd-install.yaml    # Reference installation manifest
├── projects/
│   └── fluxion-project.yaml   # AppProject definition
├── apps/                      # Application manifests (managed by root app)
│   ├── fluxion-dev.yaml
│   ├── fluxion-staging.yaml
│   ├── fluxion-production.yaml
│   └── ... (observability apps)
└── root-app.yaml              # Root app-of-apps
```

## Bootstrap Variations

### Minimal Bootstrap (Development Only)

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Deploy only development environment
kubectl apply -f ../projects/fluxion-project.yaml
kubectl apply -f ../apps/fluxion-dev.yaml
```

### Full Bootstrap (All Environments)

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Deploy root app (deploys everything)
kubectl apply -f ../projects/fluxion-project.yaml
kubectl apply -f ../root-app.yaml
```

### High Availability Bootstrap

```bash
# Install ArgoCD HA
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/ha/install.yaml

# Deploy root app
kubectl apply -f ../projects/fluxion-project.yaml
kubectl apply -f ../root-app.yaml
```

## Post-Bootstrap Configuration

After bootstrap, configure:

1. **Secrets**: See [../../SECRETS.md](../../SECRETS.md)
   ```bash
   # Create secrets for each environment
   kubectl create secret generic fluxion-api -n fluxion-dev ...
   kubectl create secret generic fluxion-api -n fluxion-staging ...
   kubectl create secret generic fluxion-api -n fluxion-production ...
   ```

2. **Ingress**: Configure ingress for ArgoCD UI
   ```bash
   kubectl apply -f - <<EOF
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     name: argocd-server-ingress
     namespace: argocd
   spec:
     ingressClassName: nginx
     rules:
     - host: argocd.example.com
       http:
         paths:
         - path: /
           pathType: Prefix
           backend:
             service:
               name: argocd-server
               port:
                 name: https
   EOF
   ```

3. **Notifications**: See [../NOTIFICATIONS.md](../NOTIFICATIONS.md)
   ```bash
   kubectl apply -f ../notifications-config.yaml
   ```

4. **Image Updater** (Optional): See [../IMAGE-UPDATER.md](../IMAGE-UPDATER.md)
   ```bash
   kubectl apply -n argocd \
     -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml
   ```

## Verification

### Check ArgoCD Installation

```bash
# Check all pods are running
kubectl get pods -n argocd

# Check services
kubectl get svc -n argocd

# Check ArgoCD version
kubectl get deployment argocd-server -n argocd -o jsonpath='{.spec.template.spec.containers[0].image}'
```

### Check Applications

```bash
# List all applications
kubectl get applications -n argocd

# Check root app status
kubectl get application fluxion-apps -n argocd

# Check specific environment
kubectl get application fluxion-production -n argocd

# Using ArgoCD CLI
argocd app list
argocd app get fluxion-apps
```

### Check Application Health

```bash
# Check if applications are synced and healthy
kubectl get applications -n argocd -o wide

# Expected output:
# NAME                    SYNC   HEALTH   STATUS
# fluxion-apps            Synced Healthy  Application
# fluxion-dev             Synced Healthy  Deployment
# fluxion-staging         Synced Healthy  Deployment
# fluxion-production      OutOfSync Healthy Deployment (manual sync)
```

### Access ArgoCD UI

```bash
# Method 1: Port forward
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Access at: https://localhost:8080

# Method 2: Via ingress
# Access at: https://argocd.example.com
```

### Login Credentials

```bash
# Username: admin

# Get initial password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo

# After login, change password in UI or:
argocd account update-password
```

## Troubleshooting

### ArgoCD Pods Not Starting

```bash
# Check pod status and logs
kubectl get pods -n argocd
kubectl logs -n argocd deployment/argocd-server
kubectl describe pod -n argocd <pod-name>

# Check events
kubectl get events -n argocd --sort-by='.lastTimestamp'
```

### Applications Not Syncing

```bash
# Check application status
argocd app get fluxion-apps

# Check repository connection
argocd repo list

# Force refresh
argocd app get fluxion-apps --refresh

# Check ArgoCD logs
kubectl logs -n argocd deployment/argocd-repo-server
kubectl logs -n argocd deployment/argocd-application-controller
```

### Root App Not Creating Child Apps

```bash
# Verify root app is synced
kubectl get application fluxion-apps -n argocd

# Check directory source
argocd app get fluxion-apps

# Manually sync
argocd app sync fluxion-apps

# Check if apps directory has correct YAML files
ls -la ../apps/
```

### Cannot Access ArgoCD UI

```bash
# Check service
kubectl get svc argocd-server -n argocd

# Check if port-forward works
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Check ingress (if configured)
kubectl get ingress -n argocd
kubectl describe ingress argocd-server-ingress -n argocd
```

## Uninstall

To completely remove ArgoCD and all Fluxion applications:

```bash
# Warning: This will delete all applications and data!

# Delete root app (cascades to child apps)
kubectl delete application fluxion-apps -n argocd

# Wait for all applications to be deleted
kubectl get applications -n argocd --watch

# Delete ArgoCD
kubectl delete namespace argocd

# Delete application namespaces
kubectl delete namespace fluxion-dev
kubectl delete namespace fluxion-staging
kubectl delete namespace fluxion-production
kubectl delete namespace monitoring
kubectl delete namespace opentelemetry-operator-system
```

## Production Considerations

### Before deploying to production:

1. **Configure secrets** using Sealed Secrets or External Secrets Operator
2. **Set up backups** for PostgreSQL database
3. **Configure monitoring** with Prometheus and Grafana
4. **Set up alerts** via ArgoCD notifications
5. **Configure ingress** with TLS certificates
6. **Enable network policies** for security
7. **Review RBAC** settings
8. **Test disaster recovery** procedures
9. **Document runbooks** for operations team
10. **Set up CI/CD** integration

## Additional Resources

- **[ArgoCD Installation Guide](../ARGOCD-INSTALLATION.md)** - Comprehensive installation guide
- **[GitOps Workflow](../GITOPS-WORKFLOW.md)** - Development and deployment workflow
- **[Disaster Recovery](../DISASTER-RECOVERY.md)** - Backup and recovery procedures
- **[Secrets Management](../../SECRETS.md)** - Managing secrets securely
- [ArgoCD Official Documentation](https://argo-cd.readthedocs.io/)
- [Fluxion Repository](https://github.com/wesback/fluxion)

## Support

For issues and questions:
- Open an issue: https://github.com/wesback/fluxion/issues
- Check documentation: https://github.com/wesback/fluxion/tree/main/deploy
