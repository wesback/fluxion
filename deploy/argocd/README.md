# ArgoCD Deployment Guide for Fluxion

This guide covers deploying Fluxion using ArgoCD for GitOps workflows.

## Documentation Index

📖 **Comprehensive Guides:**
- **[ArgoCD Installation Guide](ARGOCD-INSTALLATION.md)** - Complete installation with ingress, RBAC, and SSO
- **[GitOps Workflow](GITOPS-WORKFLOW.md)** - End-to-end development and deployment workflow
- **[Sync Policies](SYNC-POLICIES.md)** - Understanding and configuring sync policies
- **[Notifications Setup](NOTIFICATIONS.md)** - Configure alerts for Slack, Discord, email, etc.
- **[Disaster Recovery](DISASTER-RECOVERY.md)** - Backup and recovery procedures
- **[Image Updater](IMAGE-UPDATER.md)** - Automated image updates configuration
- **[Secrets Management](../SECRETS.md)** - Managing secrets securely

## Overview

ArgoCD provides:
- **Declarative GitOps**: All infrastructure as code in Git
- **Automated Sync**: Automatic deployment when Git changes
- **Self-Healing**: Automatically corrects drift from desired state
- **Rollback**: Easy rollback to previous versions
- **Multi-Environment**: Separate apps for dev, staging, and production

## Prerequisites

- Kubernetes cluster with ArgoCD installed (see [ARGOCD-INSTALLATION.md](ARGOCD-INSTALLATION.md))
- kubectl configured to access your cluster
- Git repository access (https://github.com/wesback/fluxion)
- Optional: ArgoCD CLI for command-line operations

## ArgoCD Installation

For comprehensive installation instructions including ingress, RBAC, and SSO configuration, see **[ARGOCD-INSTALLATION.md](ARGOCD-INSTALLATION.md)**.

### Quick Start

If ArgoCD is not already installed:

```bash
# Create namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
kubectl wait --for=condition=available --timeout=300s \
  deployment/argocd-server -n argocd

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo

# Port-forward to access UI (or configure ingress)
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Access ArgoCD UI at https://localhost:8080

## Project Setup

### 1. Create the AppProject

The AppProject defines permissions and allowed resources:

```bash
kubectl apply -f deploy/argocd/projects/fluxion-project.yaml
```

This creates a project with:
- Access to the Fluxion repository
- Deployment to `fluxion-*` namespaces
- RBAC roles for developers and admins

### 2. Configure Secrets

**⚠️ IMPORTANT: Never commit secrets to Git!**

#### Option A: Manual Secret Creation

```bash
# Create secrets for each environment
for ENV in dev staging production; do
  # Generate a random password
  POSTGRES_PASSWORD=$(openssl rand -base64 32)
  
  # Generate admin API key (or use the script)
  ADMIN_API_KEY=$(python backend/scripts/generate_admin_key.py)
  
  # Create secret
  kubectl create namespace fluxion-${ENV} --dry-run=client -o yaml | kubectl apply -f -
  kubectl create secret generic fluxion-api \
    --namespace=fluxion-${ENV} \
    --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
    --from-literal=admin-api-key="${ADMIN_API_KEY}" \
    --dry-run=client -o yaml | kubectl apply -f -
  
  # Also create PostgreSQL secret
  kubectl create secret generic fluxion-postgresql \
    --namespace=fluxion-${ENV} \
    --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
    --dry-run=client -o yaml | kubectl apply -f -
done
```

#### Option B: Sealed Secrets (Recommended)

```bash
# Install Sealed Secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# For each environment
for ENV in dev staging production; do
  # Create and seal the secret
  kubectl create secret generic fluxion-api \
    --namespace=fluxion-${ENV} \
    --from-literal=postgres-password="YOUR_PASSWORD" \
    --from-literal=admin-api-key="YOUR_API_KEY" \
    --dry-run=client -o yaml | \
    kubeseal --controller-namespace=kube-system --format=yaml > \
    deploy/argocd/secrets/fluxion-${ENV}-sealed.yaml
  
  # Apply sealed secret
  kubectl apply -f deploy/argocd/secrets/fluxion-${ENV}-sealed.yaml
done
```

#### Option C: External Secrets Operator

```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets-system \
  --create-namespace

# Configure SecretStore (example for Azure Key Vault)
cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: azure-keyvault
  namespace: fluxion-production
spec:
  provider:
    azurekv:
      authType: WorkloadIdentity
      vaultUrl: "https://fluxion-kv-prod.vault.azure.net/"
      serviceAccountRef:
        name: external-secrets-sa
EOF

# Create ExternalSecret
cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: fluxion-secrets
  namespace: fluxion-production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-keyvault
    kind: SecretStore
  target:
    name: fluxion-api
  data:
    - secretKey: postgres-password
      remoteRef:
        key: postgres-password
    - secretKey: admin-api-key
      remoteRef:
        key: admin-api-key
EOF
```

### 3. Deploy Applications

#### Development Environment

```bash
kubectl apply -f deploy/argocd/apps/fluxion-dev.yaml
```

This will:
- Create the `fluxion-dev` namespace
- Deploy PostgreSQL StatefulSet
- Deploy API with 1 replica
- Enable OpenTelemetry collector
- Auto-sync and self-heal enabled

#### Staging Environment

```bash
kubectl apply -f deploy/argocd/apps/fluxion-staging.yaml
```

This will:
- Create the `fluxion-staging` namespace
- Deploy PostgreSQL StatefulSet
- Deploy API with 2 replicas
- Configure ingress with TLS
- Auto-sync and self-heal enabled

#### Production Environment

```bash
kubectl apply -f deploy/argocd/apps/fluxion-production.yaml
```

This will:
- Create the `fluxion-production` namespace
- Deploy PostgreSQL StatefulSet with larger storage
- Deploy API with 3 replicas
- Enable HPA for autoscaling
- Configure PodDisruptionBudget
- **Manual sync required** (no auto-sync)

### 4. Verify Deployment

```bash
# Check ArgoCD application status
argocd app list

# Get detailed status
argocd app get fluxion-production

# Or via kubectl
kubectl get applications -n argocd
```

## Sync Waves

The deployment uses sync waves for proper ordering:

- **Wave 0**: Namespaces, Secrets, ServiceAccount
- **Wave 1**: PostgreSQL StatefulSet, OpenTelemetry Collector
- **Wave 2**: API Deployment
- **Wave 3**: Ingress

This ensures dependencies are created before dependent resources.

## Operations

### Manual Sync

For production or when auto-sync is disabled:

```bash
# Via CLI
argocd app sync fluxion-production

# Via UI
# Navigate to application -> Sync -> Synchronize
```

### Sync with Options

```bash
# Dry run (preview changes)
argocd app sync fluxion-production --dry-run

# Force sync (ignore health checks)
argocd app sync fluxion-production --force

# Prune (delete removed resources)
argocd app sync fluxion-production --prune

# Sync specific resources
argocd app sync fluxion-production --resource Deployment:fluxion-api
```

### Refresh Application

Force ArgoCD to check Git for changes:

```bash
argocd app get fluxion-production --refresh
```

### Rollback

```bash
# List history
argocd app history fluxion-production

# Rollback to previous version
argocd app rollback fluxion-production

# Rollback to specific revision
argocd app rollback fluxion-production 5
```

### Diff

See what would change on sync:

```bash
argocd app diff fluxion-production
```

### Logs

View application logs:

```bash
# Via ArgoCD CLI
argocd app logs fluxion-production

# Via kubectl
kubectl logs -n fluxion-production -l app.kubernetes.io/name=fluxion --tail=100 -f
```

## Image Updates

### Manual Image Update

Update the image tag in Git:

```yaml
# In deploy/helm/fluxion/values.yaml or environment-specific values
image:
  tag: "v1.2.3"  # New version
```

Commit and push. ArgoCD will detect and sync (if auto-sync enabled).

### Automated Image Updates with ArgoCD Image Updater

Install ArgoCD Image Updater:

```bash
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml
```

Annotate the application:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-production
  annotations:
    argocd-image-updater.argoproj.io/image-list: api=ghcr.io/wesback/fluxion
    argocd-image-updater.argoproj.io/api.update-strategy: semver
    argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
    argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
```

Image updater will:
- Poll the registry for new images
- Update the Helm values in Git
- Trigger a sync

## Notifications

Configure notifications for sync events:

```bash
# Install ArgoCD Notifications
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/notifications_catalog/install.yaml

# Configure Slack notifications (example)
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: $slack-token
  subscriptions: |
    - recipients:
      - slack:fluxion-alerts
      triggers:
      - on-sync-failed
      - on-sync-succeeded
      - on-health-degraded
EOF
```

Annotate applications to enable notifications:

```yaml
metadata:
  annotations:
    notifications.argoproj.io/subscribe.on-sync-succeeded.slack: fluxion-alerts
    notifications.argoproj.io/subscribe.on-sync-failed.slack: fluxion-alerts
```

## Sync Windows

Restrict when production can be synced:

```yaml
# In fluxion-production.yaml
spec:
  syncPolicy:
    syncWindows:
      - kind: allow
        schedule: '0 9 * * 1-5'  # Mon-Fri at 9am
        duration: 8h
        applications:
          - fluxion-production
        manualSync: true
```

## Health Checks

ArgoCD monitors application health using:

1. **Built-in checks**: Deployment, StatefulSet, Service status
2. **Custom health checks**: Defined in ConfigMap
3. **Liveness/Readiness probes**: From Kubernetes

## Disaster Recovery

### Backup

ArgoCD applications are stored in Git, so backing up Git is sufficient. However, you may want to backup:

```bash
# Export all applications
argocd app list -o yaml > argocd-apps-backup.yaml

# Export all projects
kubectl get appproject -n argocd -o yaml > argocd-projects-backup.yaml
```

### Restore

```bash
# Restore projects
kubectl apply -f argocd-projects-backup.yaml

# Restore applications
kubectl apply -f argocd-apps-backup.yaml
```

## Multi-Cluster Deployment

To deploy to multiple clusters:

```bash
# Add cluster to ArgoCD
argocd cluster add my-cluster-context

# Update application destination
# In fluxion-production.yaml:
spec:
  destination:
    server: https://my-cluster-api-server
    namespace: fluxion-production
```

## Security Best Practices

1. **Use RBAC**: Define AppProject roles for least-privilege access
2. **Separate environments**: Use different namespaces and clusters
3. **Secrets management**: Use Sealed Secrets or External Secrets Operator
4. **Network policies**: Enable network policies in production
5. **Image scanning**: Scan images before deployment
6. **Audit logging**: Enable ArgoCD audit logs

## Monitoring ArgoCD

```bash
# Check ArgoCD health
kubectl get pods -n argocd

# View ArgoCD metrics (Prometheus format)
kubectl port-forward svc/argocd-metrics -n argocd 8082:8082
curl http://localhost:8082/metrics

# View application metrics
kubectl port-forward svc/argocd-server -n argocd 8083:8083
curl http://localhost:8083/metrics
```

## Troubleshooting

### Application OutOfSync

```bash
# Check what's different
argocd app diff fluxion-production

# Hard refresh
argocd app get fluxion-production --hard-refresh

# Sync with force
argocd app sync fluxion-production --force
```

### Sync Fails

```bash
# Check sync status
argocd app get fluxion-production

# View sync operation details
kubectl get application fluxion-production -n argocd -o yaml

# Check events
kubectl describe application fluxion-production -n argocd
```

### Application Degraded

```bash
# Check pod status
kubectl get pods -n fluxion-production

# Check events
kubectl get events -n fluxion-production --sort-by='.lastTimestamp'

# Check logs
kubectl logs -n fluxion-production -l app.kubernetes.io/name=fluxion
```

## App-of-Apps Pattern

Fluxion uses the app-of-apps pattern to manage all applications from a single root application.

### Root Application

The root application (`root-app.yaml`) manages all Fluxion applications:

```bash
# Deploy the root application
kubectl apply -f deploy/argocd/root-app.yaml

# This automatically deploys all applications in deploy/argocd/apps/
```

The root app:
- Monitors the `deploy/argocd/apps/` directory
- Automatically discovers and deploys all application manifests
- Provides centralized management of all Fluxion applications
- Enables easy addition of new applications by simply adding files to the apps directory

### Bootstrap Process

To bootstrap a new cluster with Fluxion:

```bash
# 1. Install ArgoCD (see ARGOCD-INSTALLATION.md)
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 2. Wait for ArgoCD to be ready
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd

# 3. Create the Fluxion project
kubectl apply -f deploy/argocd/projects/fluxion-project.yaml

# 4. Deploy the root app (app-of-apps)
kubectl apply -f deploy/argocd/root-app.yaml

# 5. Monitor deployment
kubectl get applications -n argocd
argocd app list
```

For reference manifests and detailed bootstrap procedures, see the [bootstrap/](bootstrap/) directory.

## Additional Resources

- **[ArgoCD Installation Guide](ARGOCD-INSTALLATION.md)** - Comprehensive installation with all options
- **[GitOps Workflow](GITOPS-WORKFLOW.md)** - Complete development workflow
- **[Sync Policies](SYNC-POLICIES.md)** - Sync policy configuration
- **[Notifications Setup](NOTIFICATIONS.md)** - Alert configuration
- **[Disaster Recovery](DISASTER-RECOVERY.md)** - Backup and recovery
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [ArgoCD Best Practices](https://argo-cd.readthedocs.io/en/stable/user-guide/best_practices/)
- [Helm Chart Documentation](../helm/fluxion/README.md)
- [Fluxion Repository](https://github.com/wesback/fluxion)

## Support

For issues and questions:
- Open an issue: https://github.com/wesback/fluxion/issues
- Check documentation: https://github.com/wesback/fluxion/tree/main/docs
