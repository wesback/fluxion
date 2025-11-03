# ArgoCD Image Updater Guide for Fluxion

This guide shows how to automate Docker image updates using ArgoCD Image Updater.

## Overview

ArgoCD Image Updater automatically:
- Monitors container registries for new image versions
- Updates Helm values in Git with new image tags
- Triggers ArgoCD sync to deploy new versions

## Prerequisites

- ArgoCD installed and configured
- Fluxion deployed via ArgoCD Applications
- Git write access (SSH key or Personal Access Token)
- Docker images published to a container registry

## Installation

### Install ArgoCD Image Updater

```bash
# Install Image Updater in ArgoCD namespace
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml

# Verify installation
kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-image-updater

# Check logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-image-updater -f
```

### Configure Git Write Access

Image Updater needs to commit image tag updates to Git.

#### Option 1: SSH Key (Recommended)

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "argocd-image-updater" -f /tmp/argocd-image-updater

# Add public key to GitHub
# Go to: https://github.com/wesback/fluxion/settings/keys
# Add the content of /tmp/argocd-image-updater.pub

# Create secret in Kubernetes
kubectl create secret generic argocd-image-updater-ssh-key \
  --from-file=sshPrivateKey=/tmp/argocd-image-updater \
  -n argocd

# Configure Image Updater to use SSH key
kubectl patch configmap argocd-image-updater-config -n argocd --type merge -p '{
  "data": {
    "git.user": "argocd-image-updater",
    "git.email": "argocd-image-updater@noreply.github.com"
  }
}'
```

#### Option 2: Personal Access Token

```bash
# Create GitHub Personal Access Token
# Go to: https://github.com/settings/tokens
# Scopes: repo (full control)

# Create secret
kubectl create secret generic argocd-image-updater-git-creds \
  --from-literal=username=git \
  --from-literal=password=YOUR_GITHUB_TOKEN \
  -n argocd

# Label the secret
kubectl label secret argocd-image-updater-git-creds \
  -n argocd \
  argocd.argoproj.io/secret-type=git
```

### Configure Registry Access (if private)

```bash
# For private registries, create credentials secret
kubectl create secret docker-registry acr-credentials \
  --docker-server=fluxiondevaksacr.azurecr.io \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_TOKEN \
  -n argocd

# Or create in ConfigMap for image updater
kubectl patch configmap argocd-image-updater-config -n argocd --type merge -p '{
  "data": {
    "registries.conf": |
      registries:
      - name: acr
        api_url: https://fluxiondevaksacr.azurecr.io
        prefix: fluxiondevaksacr.azurecr.io
        credentials: secret:argocd/acr-credentials
        default: true
  }
}'
```

## Configuration

### Semantic Versioning Strategy

Update to latest semantic version (recommended for production):

```yaml
# deploy/argocd/apps/fluxion-production.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-production
  namespace: argocd
  annotations:
    # Enable image updater
    argocd-image-updater.argoproj.io/image-list: api=ghcr.io/wesback/fluxion
    
    # Update strategy: semver (e.g., 1.2.3 -> 1.2.4)
    argocd-image-updater.argoproj.io/api.update-strategy: semver
    
    # Constraint: only patch updates (1.x.x)
    argocd-image-updater.argoproj.io/api.allow-tags: regexp:^1\.\d+\.\d+$
    
    # Helm values to update
    argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
    argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
    
    # Git write-back method
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main
    
    # Optional: Pull secret for private registry
    argocd-image-updater.argoproj.io/api.pull-secret: secret:argocd/ghcr-credentials
spec:
  # ... rest of application spec
```

### Latest Tag Strategy

Always use the latest tag (for development):

```yaml
# deploy/argocd/apps/fluxion-dev.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-dev
  namespace: argocd
  annotations:
    argocd-image-updater.argoproj.io/image-list: api=ghcr.io/wesback/fluxion
    argocd-image-updater.argoproj.io/api.update-strategy: latest
    argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
    argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main
spec:
  # ... rest of application spec
```

### Name-Based Strategy

Use specific naming pattern (e.g., staging builds):

```yaml
# deploy/argocd/apps/fluxion-staging.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-staging
  namespace: argocd
  annotations:
    argocd-image-updater.argoproj.io/image-list: api=ghcr.io/wesback/fluxion
    argocd-image-updater.argoproj.io/api.update-strategy: name
    argocd-image-updater.argoproj.io/api.allow-tags: regexp:^v\d+\.\d+\.\d+-rc\.\d+$
    argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
    argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
    argocd-image-updater.argoproj.io/write-back-method: git
spec:
  # ... rest of application spec
```

### Digest-Based Strategy

Pin to specific digest (most secure):

```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: api=ghcr.io/wesback/fluxion:v1.0.0
    argocd-image-updater.argoproj.io/api.update-strategy: digest
    argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
    argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
```

## Update Strategies Comparison

| Strategy | Use Case | Example |
|----------|----------|---------|
| `semver` | Production - controlled updates | `v1.2.3` → `v1.2.4` |
| `latest` | Development - always newest | `latest` |
| `name` | Staging - specific patterns | `v1.0.0-rc.1` → `v1.0.0-rc.2` |
| `digest` | Security - immutable versions | `sha256:abc123` |

## Advanced Configuration

### Multiple Images

Update multiple images in the same application:

```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: |
      api=ghcr.io/wesback/fluxion,
      otel=otel/opentelemetry-collector-contrib
    argocd-image-updater.argoproj.io/api.update-strategy: semver
    argocd-image-updater.argoproj.io/otel.update-strategy: semver
    argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
    argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
    argocd-image-updater.argoproj.io/otel.helm.image-name: otelCollector.image.repository
    argocd-image-updater.argoproj.io/otel.helm.image-tag: otelCollector.image.tag
```

### Custom Update Schedule

Control update frequency:

```yaml
metadata:
  annotations:
    # Check every 5 minutes (default: 2 minutes)
    argocd-image-updater.argoproj.io/update-interval: 5m
```

### Kustomize Applications

For Kustomize instead of Helm:

```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: api=ghcr.io/wesback/fluxion
    argocd-image-updater.argoproj.io/api.update-strategy: semver
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/api.kustomize.image-name: ghcr.io/wesback/fluxion
```

### Skip Auto-Sync

Update Git but don't auto-sync:

```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: api=ghcr.io/wesback/fluxion
    argocd-image-updater.argoproj.io/api.update-strategy: semver
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/api.ignore-tags: latest,dev
```

## CI/CD Integration

### GitHub Actions Example

Automatic image build and push on main branch:

```yaml
# .github/workflows/build-and-push.yml
name: Build and Push Docker Image

on:
  push:
    branches:
      - main
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Once pushed, ArgoCD Image Updater will:
1. Detect new image tag
2. Update Helm values in Git
3. Commit changes
4. ArgoCD syncs automatically

## Monitoring

### Check Image Updater Status

```bash
# View logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-image-updater -f

# Check which images are being tracked
argocd app get fluxion-production -o yaml | grep -A 10 "image-updater"

# View last update time
kubectl get application fluxion-production -n argocd -o jsonpath='{.status.summary.images}'
```

### Verify Git Commits

```bash
# Check Git commits from image updater
git log --author="argocd-image-updater" --oneline

# View latest image update commit
git log --grep="build: automatic update" -1 --stat
```

### Application Status

```bash
# Check if update is pending
argocd app get fluxion-production

# View image versions
kubectl get application fluxion-production -n argocd \
  -o jsonpath='{.status.summary.images}' | jq .
```

## Rollback

If an image update causes issues:

### Via ArgoCD

```bash
# Rollback to previous revision
argocd app rollback fluxion-production

# Or rollback to specific revision
argocd app history fluxion-production
argocd app rollback fluxion-production 5
```

### Via Git

```bash
# Revert the image update commit
git revert HEAD
git push

# ArgoCD will sync to the reverted state
```

## Troubleshooting

### Image Updater Not Working

```bash
# Check image updater logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-image-updater --tail=100

# Verify annotations
kubectl get application fluxion-production -n argocd -o yaml | grep -A 20 "annotations"

# Check if image updater can access registry
kubectl exec -n argocd deployment/argocd-image-updater -- \
  argocd-image-updater test ghcr.io/wesback/fluxion --semver-constraint ">= 0.1.0"
```

### Git Write-Back Fails

```bash
# Check SSH key permissions
kubectl get secret argocd-image-updater-ssh-key -n argocd

# Verify Git user configuration
kubectl get configmap argocd-image-updater-config -n argocd -o yaml

# Test Git write access
kubectl exec -n argocd deployment/argocd-image-updater -- \
  git ls-remote git@github.com:wesback/fluxion.git
```

### Registry Authentication Issues

```bash
# Verify registry credentials
kubectl get secret ghcr-credentials -n argocd

# Test registry access
kubectl run test-pull --rm -i --tty --restart=Never \
  --image=ghcr.io/wesback/fluxion:latest \
  --overrides='{"spec":{"imagePullSecrets":[{"name":"ghcr-credentials"}]}}'
```

## Best Practices

1. **Use semver for production**: Predictable, controlled updates
2. **Test in dev/staging first**: Use different strategies per environment
3. **Set version constraints**: Prevent breaking changes (e.g., `>= 1.0.0, < 2.0.0`)
4. **Monitor updates**: Set up alerts for image update failures
5. **Review commits**: Regularly audit image update commits
6. **Use digests for security**: Pin to specific digests in production
7. **Enable notifications**: Get alerted when images are updated
8. **Document rollback procedures**: Have a plan for reverting bad updates

## Security Considerations

1. **Scan images**: Use tools like Trivy or Snyk to scan before deployment
2. **Sign images**: Use Cosign for image signing and verification
3. **Use private registries**: Host images in private registries when possible
4. **Limit update window**: Use sync windows to control when updates happen
5. **Audit trail**: Keep track of what images were deployed when
6. **Least privilege**: Image updater only needs registry read and Git write access

## Example: Complete Production Setup

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-production
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
  labels:
    environment: production
    application: fluxion
  annotations:
    # Image updater configuration
    argocd-image-updater.argoproj.io/image-list: api=ghcr.io/wesback/fluxion
    argocd-image-updater.argoproj.io/api.update-strategy: semver
    argocd-image-updater.argoproj.io/api.allow-tags: regexp:^v1\.\d+\.\d+$
    argocd-image-updater.argoproj.io/api.helm.image-name: image.repository
    argocd-image-updater.argoproj.io/api.helm.image-tag: image.tag
    argocd-image-updater.argoproj.io/write-back-method: git:secret:argocd/argocd-image-updater-ssh-key
    argocd-image-updater.argoproj.io/git-branch: main
    argocd-image-updater.argoproj.io/update-interval: 10m
    
    # Notifications
    notifications.argoproj.io/subscribe.on-sync-succeeded.slack: fluxion-prod
    notifications.argoproj.io/subscribe.on-sync-failed.slack: fluxion-prod
spec:
  project: fluxion
  source:
    repoURL: https://github.com/wesback/fluxion.git
    targetRevision: v1.0.0
    path: deploy/helm/fluxion
    helm:
      valueFiles:
        - values.yaml
        - values-production.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: fluxion-production
  syncPolicy:
    automated: null  # Manual sync for production
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
```

## Additional Resources

- [ArgoCD Image Updater Documentation](https://argocd-image-updater.readthedocs.io/)
- [Update Strategies](https://argocd-image-updater.readthedocs.io/en/stable/basics/update-strategies/)
- [Configuration Options](https://argocd-image-updater.readthedocs.io/en/stable/configuration/applications/)
- [Fluxion Helm Chart](../helm/fluxion/README.md)
