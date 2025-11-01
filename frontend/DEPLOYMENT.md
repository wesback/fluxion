# Frontend CI/CD Guide

This guide explains how to build, push, and deploy the Fluxion frontend using Docker and Kubernetes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Building the Frontend Image](#building-the-frontend-image)
- [Pushing to Container Registry](#pushing-to-container-registry)
- [Manual Deployment](#manual-deployment)
- [Automated Deployment with ArgoCD](#automated-deployment-with-argocd)
- [CI/CD Pipeline Examples](#cicd-pipeline-examples)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- Docker 20.10+ or Podman
- kubectl 1.23+
- Helm 3.8+
- Access to container registry (e.g., GitHub Container Registry, Docker Hub)
- Access to Kubernetes cluster (for deployment)

### Repository Access

- Read access to the Fluxion repository
- Write access to the container registry
- Kubernetes cluster credentials with appropriate permissions

## Building the Frontend Image

### Local Build

Navigate to the frontend directory and build the Docker image:

```bash
cd frontend

# Build the image
docker build -t fluxion-frontend:latest .

# Tag with version
docker tag fluxion-frontend:latest fluxion-frontend:v1.0.0

# Build with build arguments (optional)
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
  -t fluxion-frontend:v1.0.0 .
```

### Build Arguments

The Dockerfile supports the following build arguments:

- `NEXT_PUBLIC_API_BASE_URL`: API base URL (can be overridden at runtime)

### Multi-Architecture Builds

Build for multiple architectures using Docker Buildx:

```bash
# Create a new builder
docker buildx create --name multiarch --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/wesback/fluxion-frontend:v1.0.0 \
  --push \
  .
```

## Pushing to Container Registry

### GitHub Container Registry (GHCR)

1. **Authenticate to GHCR:**

```bash
# Using GitHub Personal Access Token
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

2. **Tag the image:**

```bash
docker tag fluxion-frontend:v1.0.0 ghcr.io/wesback/fluxion-frontend:v1.0.0
docker tag fluxion-frontend:v1.0.0 ghcr.io/wesback/fluxion-frontend:latest
```

3. **Push the image:**

```bash
docker push ghcr.io/wesback/fluxion-frontend:v1.0.0
docker push ghcr.io/wesback/fluxion-frontend:latest
```

### Docker Hub

```bash
# Authenticate
docker login

# Tag and push
docker tag fluxion-frontend:v1.0.0 username/fluxion-frontend:v1.0.0
docker push username/fluxion-frontend:v1.0.0
```

### Private Registry

```bash
# Authenticate to your registry
docker login registry.example.com

# Tag and push
docker tag fluxion-frontend:v1.0.0 registry.example.com/fluxion-frontend:v1.0.0
docker push registry.example.com/fluxion-frontend:v1.0.0
```

## Manual Deployment

### Using Helm

1. **Update values file:**

Edit `deploy/helm/fluxion/values-dev.yaml`:

```yaml
frontend:
  enabled: true
  image:
    repository: ghcr.io/wesback/fluxion-frontend
    tag: "v1.0.0"
  config:
    apiUrl: "http://fluxion-api:8000"
```

2. **Deploy or upgrade:**

```bash
# Install
helm install fluxion ./deploy/helm/fluxion \
  --namespace fluxion-dev \
  --create-namespace \
  --values ./deploy/helm/fluxion/values.yaml \
  --values ./deploy/helm/fluxion/values-dev.yaml

# Upgrade
helm upgrade fluxion ./deploy/helm/fluxion \
  --namespace fluxion-dev \
  --values ./deploy/helm/fluxion/values.yaml \
  --values ./deploy/helm/fluxion/values-dev.yaml
```

3. **Verify deployment:**

```bash
# Check pods
kubectl get pods -n fluxion-dev -l app.kubernetes.io/component=frontend

# Check service
kubectl get svc -n fluxion-dev -l app.kubernetes.io/component=frontend

# Check logs
kubectl logs -n fluxion-dev -l app.kubernetes.io/component=frontend --tail=50
```

### Using kubectl

1. **Generate manifests:**

```bash
helm template fluxion ./deploy/helm/fluxion \
  --namespace fluxion-dev \
  --values ./deploy/helm/fluxion/values.yaml \
  --values ./deploy/helm/fluxion/values-dev.yaml \
  > frontend-manifests.yaml
```

2. **Apply manifests:**

```bash
kubectl apply -f frontend-manifests.yaml
```

## Automated Deployment with ArgoCD

### Setup ArgoCD Application

The ArgoCD application manifest for frontend is already included in the main Fluxion application. The frontend is deployed as part of the Fluxion chart.

### Image Updater Integration

Configure ArgoCD Image Updater to automatically update the frontend image:

1. **Add annotations to Application manifest:**

The annotations are already configured in `deploy/argocd/apps/fluxion-{env}.yaml`:

```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: |
      frontend=ghcr.io/wesback/fluxion-frontend
    argocd-image-updater.argoproj.io/frontend.update-strategy: semver
    argocd-image-updater.argoproj.io/frontend.force-update: "true"
    argocd-image-updater.argoproj.io/write-back-method: git
```

2. **Verify image updater is running:**

```bash
kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-image-updater
```

### Manual Sync

Trigger a manual sync via ArgoCD:

```bash
# Using ArgoCD CLI
argocd app sync fluxion-dev

# Using kubectl
kubectl patch app fluxion-dev -n argocd -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{}}}' --type merge
```

## CI/CD Pipeline Examples

### GitHub Actions

Create `.github/workflows/frontend-deploy.yml`:

```yaml
name: Build and Deploy Frontend

on:
  push:
    branches: [main, develop]
    paths:
      - 'frontend/**'
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}-frontend

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix={{branch}}-

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-dev:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Trigger ArgoCD Sync
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.ARGOCD_TOKEN }}" \
            https://argocd.example.com/api/v1/applications/fluxion-dev/sync
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
stages:
  - build
  - deploy

variables:
  IMAGE_NAME: registry.gitlab.com/$CI_PROJECT_NAMESPACE/$CI_PROJECT_NAME/frontend

build-frontend:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - cd frontend
    - docker build -t $IMAGE_NAME:$CI_COMMIT_SHORT_SHA .
    - docker tag $IMAGE_NAME:$CI_COMMIT_SHORT_SHA $IMAGE_NAME:latest
    - docker push $IMAGE_NAME:$CI_COMMIT_SHORT_SHA
    - docker push $IMAGE_NAME:latest
  only:
    changes:
      - frontend/**

deploy-dev:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl config use-context $K8S_CONTEXT
    - |
      kubectl set image deployment/fluxion-frontend \
        frontend=$IMAGE_NAME:$CI_COMMIT_SHORT_SHA \
        -n fluxion-dev
    - kubectl rollout status deployment/fluxion-frontend -n fluxion-dev
  only:
    - develop
  needs:
    - build-frontend
```

### Jenkins Pipeline

Create `Jenkinsfile`:

```groovy
pipeline {
    agent any
    
    environment {
        REGISTRY = 'ghcr.io'
        IMAGE_NAME = 'wesback/fluxion-frontend'
        DOCKER_CREDENTIALS = credentials('github-token')
    }
    
    stages {
        stage('Build') {
            steps {
                dir('frontend') {
                    script {
                        def image = docker.build("${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER}")
                        docker.withRegistry("https://${REGISTRY}", 'github-token') {
                            image.push()
                            image.push('latest')
                        }
                    }
                }
            }
        }
        
        stage('Deploy to Dev') {
            when {
                branch 'develop'
            }
            steps {
                script {
                    sh """
                        kubectl set image deployment/fluxion-frontend \
                          frontend=${REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER} \
                          -n fluxion-dev
                        kubectl rollout status deployment/fluxion-frontend -n fluxion-dev
                    """
                }
            }
        }
    }
}
```

## Image Tagging Strategy

### Development

- `dev-latest`: Latest build from develop branch
- `dev-<sha>`: Specific commit SHA from develop

### Staging

- `staging-latest`: Latest build from staging branch
- `v<version>-rc<number>`: Release candidates

### Production

- `v<major>.<minor>.<patch>`: Semantic versioning
- `latest`: Latest stable release

### Example

```bash
# Development
ghcr.io/wesback/fluxion-frontend:dev-latest
ghcr.io/wesback/fluxion-frontend:dev-abc1234

# Staging
ghcr.io/wesback/fluxion-frontend:staging-latest
ghcr.io/wesback/fluxion-frontend:v1.0.0-rc1

# Production
ghcr.io/wesback/fluxion-frontend:v1.0.0
ghcr.io/wesback/fluxion-frontend:latest
```

## Troubleshooting

### Build Failures

**Issue**: Build fails with "npm install" errors

**Solution**:
- Clear Docker build cache: `docker builder prune`
- Check network connectivity
- Verify package.json and package-lock.json are in sync

**Issue**: Build fails with memory errors

**Solution**:
- Increase Docker memory limit
- Use `--memory` flag: `docker build --memory 4g .`

### Push Failures

**Issue**: Unauthorized error when pushing

**Solution**:
- Re-authenticate: `docker login ghcr.io`
- Check token permissions (read:packages, write:packages)

**Issue**: Layer already exists but push fails

**Solution**:
- Try pushing with `--disable-content-trust` flag
- Re-tag and push: `docker tag ... && docker push ...`

### Deployment Failures

**Issue**: Pods stuck in ImagePullBackOff

**Solution**:
- Check image name and tag are correct
- Verify image registry credentials: `kubectl get secret -n fluxion-dev`
- Create image pull secret if needed:
  ```bash
  kubectl create secret docker-registry ghcr-secret \
    --docker-server=ghcr.io \
    --docker-username=USERNAME \
    --docker-password=TOKEN \
    -n fluxion-dev
  ```

**Issue**: Pods crash on startup

**Solution**:
- Check logs: `kubectl logs -n fluxion-dev <pod-name>`
- Verify environment variables are set correctly
- Check resource limits are sufficient

**Issue**: Health checks failing

**Solution**:
- Verify Next.js server is starting: `kubectl logs -n fluxion-dev <pod-name>`
- Increase `initialDelaySeconds` in probe configuration
- Test health endpoint manually: `kubectl port-forward <pod> 8080:8080`

## Best Practices

1. **Always tag with version numbers**: Don't rely on `latest` in production
2. **Use image digests**: For immutable deployments, use image SHA256 digests
3. **Scan images for vulnerabilities**: Use tools like Trivy or Snyk
4. **Keep images small**: Multi-stage builds and minimal base images
5. **Test before deploying**: Always test in dev/staging before production
6. **Monitor deployments**: Use ArgoCD UI or kubectl to watch rollout status
7. **Have rollback plan**: Know how to quickly rollback failed deployments
8. **Use image pull secrets**: Especially for private registries

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Helm Documentation](https://helm.sh/docs/)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
