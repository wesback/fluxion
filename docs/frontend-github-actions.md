# Example GitHub Actions Workflow for Frontend CI/CD

This is a reference GitHub Actions workflow that you can use to build, test, and deploy the Fluxion frontend.

## Workflow File

Save this as `.github/workflows/frontend-ci-cd.yml`:

```yaml
name: Frontend CI/CD

on:
  push:
    branches: [main, develop]
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-ci-cd.yml'
  pull_request:
    branches: [main, develop]
    paths:
      - 'frontend/**'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}-frontend

jobs:
  # Job 1: Lint and test
  lint-and-test:
    name: Lint and Test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Build application
        run: npm run build
        env:
          NEXT_PUBLIC_API_BASE_URL: http://localhost:8000

  # Job 2: Build and push Docker image
  build-and-push:
    name: Build and Push Docker Image
    runs-on: ubuntu-latest
    needs: lint-and-test
    if: github.event_name == 'push'
    permissions:
      contents: read
      packages: write
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
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
            # Branch name
            type=ref,event=branch
            # Semantic versioning
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            # Git SHA
            type=sha,prefix={{branch}}-
            # latest tag for main branch
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
            # dev-latest for develop branch
            type=raw,value=dev-latest,enable=${{ github.ref == 'refs/heads/develop' }}
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            NEXT_PUBLIC_API_BASE_URL=${{ vars.API_BASE_URL || 'http://localhost:8000' }}

  # Job 3: Deploy to development
  deploy-dev:
    name: Deploy to Development
    runs-on: ubuntu-latest
    needs: build-and-push
    if: github.ref == 'refs/heads/develop'
    environment:
      name: development
      url: https://fluxion-dev.example.com
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup kubectl
        uses: azure/setup-kubectl@v3
        with:
          version: 'latest'
      
      - name: Configure kubectl
        run: |
          echo "${{ secrets.KUBECONFIG_DEV }}" | base64 -d > kubeconfig
          echo "KUBECONFIG=$PWD/kubeconfig" >> $GITHUB_ENV
      
      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/fluxion-frontend \
            frontend=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:dev-latest \
            -n fluxion-dev
          kubectl rollout status deployment/fluxion-frontend -n fluxion-dev --timeout=5m
      
      - name: Verify deployment
        run: |
          kubectl get pods -n fluxion-dev -l app.kubernetes.io/component=frontend
          kubectl get svc -n fluxion-dev -l app.kubernetes.io/component=frontend

  # Job 4: Deploy to staging (manual approval required)
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: build-and-push
    if: github.ref == 'refs/heads/main'
    environment:
      name: staging
      url: https://fluxion-staging.example.com
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup kubectl
        uses: azure/setup-kubectl@v3
        with:
          version: 'latest'
      
      - name: Configure kubectl
        run: |
          echo "${{ secrets.KUBECONFIG_STAGING }}" | base64 -d > kubeconfig
          echo "KUBECONFIG=$PWD/kubeconfig" >> $GITHUB_ENV
      
      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/fluxion-frontend \
            frontend=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest \
            -n fluxion-staging
          kubectl rollout status deployment/fluxion-frontend -n fluxion-staging --timeout=5m

  # Job 5: Scan for vulnerabilities
  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: build-and-push
    if: github.event_name == 'push'
    
    steps:
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'
      
      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'
```

## Setup Instructions

### 1. Repository Secrets

Add the following secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

- `KUBECONFIG_DEV`: Base64-encoded kubeconfig for dev cluster
- `KUBECONFIG_STAGING`: Base64-encoded kubeconfig for staging cluster

Generate base64-encoded kubeconfig:
```bash
cat ~/.kube/config | base64 -w 0
```

### 2. Repository Variables (Optional)

**Settings → Secrets and variables → Actions → Variables**

- `API_BASE_URL`: Override default API URL for builds

### 3. Environment Setup

**Settings → Environments**

Create environments:
- `development`: Auto-deploy from `develop` branch
- `staging`: Require manual approval before deployment
- `production`: Require manual approval and protected reviewers

### 4. Branch Protection

**Settings → Branches → Add rule**

For `main` branch:
- ✅ Require pull request reviews
- ✅ Require status checks (lint-and-test)
- ✅ Require branches to be up to date

For `develop` branch:
- ✅ Require status checks (lint-and-test)

## Alternative: ArgoCD Deployment

If using ArgoCD, replace the deploy jobs with:

```yaml
  trigger-argocd:
    name: Trigger ArgoCD Sync
    runs-on: ubuntu-latest
    needs: build-and-push
    if: github.event_name == 'push'
    
    steps:
      - name: Sync ArgoCD Application
        run: |
          # Install ArgoCD CLI
          curl -sSL -o /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
          chmod +x /usr/local/bin/argocd
          
          # Login to ArgoCD
          argocd login argocd.example.com \
            --username admin \
            --password ${{ secrets.ARGOCD_PASSWORD }} \
            --grpc-web
          
          # Determine environment based on branch
          if [ "${{ github.ref }}" == "refs/heads/develop" ]; then
            APP_NAME="fluxion-dev"
          elif [ "${{ github.ref }}" == "refs/heads/main" ]; then
            APP_NAME="fluxion-production"
          fi
          
          # Trigger sync
          argocd app sync $APP_NAME --force
          argocd app wait $APP_NAME --timeout 300
```

## Monitoring and Notifications

### Slack Notifications

Add Slack notifications to jobs:

```yaml
      - name: Notify Slack on Success
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ Frontend deployed to ${{ github.ref_name }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Frontend Deployment*\n✅ Successfully deployed to `${{ github.ref_name }}`"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Testing the Workflow

### Test Locally with act

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run workflow locally
act -j lint-and-test
act -j build-and-push -s GITHUB_TOKEN=<your-token>
```

### Manual Trigger

Add manual workflow dispatch:

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        type: choice
        options:
          - development
          - staging
          - production
```

## Troubleshooting

### Build Failures

- Check Node.js version matches what's used locally (20.x)
- Verify all dependencies are in package-lock.json
- Check build logs for missing environment variables

### Push Failures

- Verify GITHUB_TOKEN has `write:packages` permission
- Check if image name is correct
- Ensure repository allows GitHub Packages

### Deploy Failures

- Verify kubeconfig secret is correct and base64-encoded
- Check cluster connectivity
- Ensure deployment exists in namespace
- Verify image pull permissions

## Best Practices

1. **Always run linting and tests before building Docker images**
2. **Use cache for faster builds** (Docker BuildKit cache)
3. **Scan images for vulnerabilities** before deploying
4. **Use environments for different deployment stages**
5. **Require manual approval for production deployments**
6. **Tag images with multiple tags** (version, SHA, latest)
7. **Monitor deployment status** and rollback if needed
8. **Send notifications** to team channels

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Action](https://github.com/docker/build-push-action)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
