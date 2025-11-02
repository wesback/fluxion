# GitHub Actions for Fluxion

This directory contains GitHub Actions workflows for building and deploying the Fluxion application.

## Prerequisites

Before setting up the workflows, ensure you have these tools installed:

- **Azure CLI** - For Azure authentication and ACR access
  ```bash
  # Install: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli
  az --version
  az login
  ```

- **GitHub CLI** - For configuring secrets and variables
  ```bash
  # Install: https://cli.github.com/
  gh --version
  gh auth login
  ```

- **jq** - For JSON processing (used by setup script)
  ```bash
  # Linux: sudo apt-get install jq
  # macOS: brew install jq
  ```

## Workflows

### `build-push-acr.yml`

Builds Docker images and pushes them to Azure Container Registry (ACR).

**Triggers:**
- Push to `main` or `develop` branches (when backend/frontend code changes)
- Pull requests to `main` (builds but doesn't push)

**What it does:**
1. **Build Backend** - Builds the FastAPI backend Docker image
2. **Build Frontend** - Builds the Next.js frontend Docker image  
3. **Security Scan** - Scans images for vulnerabilities using Trivy
4. **Update Manifests** - Updates Helm values with new image tags for ArgoCD

**Image Tags Generated:**
- `main` branch → `latest` tag
- `develop` branch → `dev-latest` tag
- Pull requests → `pr-{number}` tag
- All pushes → `{branch}-{sha}` tag

## Setup Instructions

### 1. Configure Azure Service Principal

Create a service principal with permission to push to ACR:

```bash
# Get your ACR resource ID
cd terraform
ACR_ID=$(terraform output -raw acr_id)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

# Create service principal with ACR push permissions
az ad sp create-for-rbac \
  --name "github-actions-fluxion" \
  --role "AcrPush" \
  --scopes "$ACR_ID" \
  --sdk-auth > azure-credentials.json

# The output will be JSON like:
# {
#   "clientId": "...",
#   "clientSecret": "...",
#   "subscriptionId": "...",
#   "tenantId": "...",
#   "activeDirectoryEndpointUrl": "...",
#   "resourceManagerEndpointUrl": "...",
#   ...
# }
```

**Security Note:** Keep `azure-credentials.json` secure and never commit it to Git!

### 2. Add GitHub Secrets

Go to your GitHub repository:
**Settings → Secrets and variables → Actions → New repository secret**

Add the following secret:

**Required:**
- `AZURE_CREDENTIALS` - The entire JSON output from the service principal creation above

### 3. Add GitHub Variables

**Settings → Secrets and variables → Actions → Variables tab**

Add the following variables:

**Required:**
- `ACR_NAME` - Your ACR name (e.g., `fluxiondevacr`, get from `terraform output acr_name`)

**Optional:**
- `API_BASE_URL` - Override API URL for frontend builds (default: `http://localhost:8000`)

### 4. Verify ACR Name

```bash
# Get your ACR name from Terraform
cd terraform
terraform output acr_name
# Example output: fluxiondevacr

# Get ACR login server
terraform output acr_login_server
# Example output: fluxiondevacr.azurecr.io
```

Set the `ACR_NAME` variable to the value from `terraform output acr_name`.

## Alternative: Federated Credentials (Recommended for Production)

For enhanced security, use OpenID Connect (OIDC) instead of service principal secrets:

### 1. Configure Federated Credentials

```bash
# Create app registration
APP_ID=$(az ad app create --display-name "github-fluxion" --query appId -o tsv)

# Create service principal
SP_ID=$(az ad sp create --id $APP_ID --query id -o tsv)

# Assign ACR push role
ACR_ID=$(cd terraform && terraform output -raw acr_id)
az role assignment create \
  --role "AcrPush" \
  --assignee $SP_ID \
  --scope $ACR_ID

# Add federated credential for main branch
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:wesback/fluxion:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Add federated credential for develop branch
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-develop",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:wesback/fluxion:ref:refs/heads/develop",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Add federated credential for pull requests
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-pr",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:wesback/fluxion:pull_request",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

### 2. Update GitHub Secrets for OIDC

Instead of `AZURE_CREDENTIALS`, add these individual secrets:

- `AZURE_CLIENT_ID` - The app ID from above
- `AZURE_TENANT_ID` - Your Azure tenant ID (`az account show --query tenantId -o tsv`)
- `AZURE_SUBSCRIPTION_ID` - Your subscription ID (`az account show --query id -o tsv`)

### 3. Update Workflow File

Comment out the `creds:` line and uncomment the federated credential lines in `build-push-acr.yml`:

```yaml
- name: Azure Login
  uses: azure/login@v1
  with:
    # creds: ${{ secrets.AZURE_CREDENTIALS }}  # Comment this out
    # Uncomment these for federated credentials:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

## Testing the Workflow

### Test Locally

Build images locally and push to ACR:

```bash
# Login to ACR
cd terraform
./scripts/acr-login.sh dev

# Build and tag backend
cd ../backend
docker build -t $(cd ../terraform && terraform output -raw acr_login_server)/fluxion-backend:test .
docker push $(cd ../terraform && terraform output -raw acr_login_server)/fluxion-backend:test

# Build and tag frontend
cd ../frontend
docker build -t $(cd ../terraform && terraform output -raw acr_login_server)/fluxion-frontend:test .
docker push $(cd ../terraform && terraform output -raw acr_login_server)/fluxion-frontend:test

# Verify images in ACR
az acr repository list --name $(cd ../terraform && terraform output -raw acr_name)
az acr repository show-tags --name $(cd ../terraform && terraform output -raw acr_name) --repository fluxion-backend
```

### Trigger Workflow

1. **Make a change to backend or frontend:**

```bash
# Make a small change
echo "# Test" >> backend/README.md

# Commit and push
git add backend/README.md
git commit -m "test: trigger build workflow"
git push origin develop
```

2. **Watch the workflow:**

Go to: `https://github.com/wesback/fluxion/actions`

Or use GitHub CLI:
```bash
gh run list --workflow=build-push-acr.yml
gh run watch
```

### Verify Images in ACR

```bash
# List repositories
az acr repository list --name $(cd terraform && terraform output -raw acr_name)

# List tags for backend
az acr repository show-tags \
  --name $(cd terraform && terraform output -raw acr_name) \
  --repository fluxion-backend \
  --orderby time_desc

# List tags for frontend
az acr repository show-tags \
  --name $(cd terraform && terraform output -raw acr_name) \
  --repository fluxion-frontend \
  --orderby time_desc
```

## Integration with ArgoCD

Once images are pushed to ACR, ArgoCD can deploy them.

### Manual Method

Update Helm values file with new image tag:

```bash
# Edit values file
vim deploy/helm/fluxion/values-dev.yaml

# Update image section:
image:
  repository: fluxiondevacr.azurecr.io/fluxion-backend
  tag: "dev-latest"

# Commit and push
git add deploy/helm/fluxion/values-dev.yaml
git commit -m "chore: update image to dev-latest"
git push
```

ArgoCD will detect the change and sync automatically (if auto-sync is enabled).

### Automatic Method (ArgoCD Image Updater)

The workflow automatically updates image tags in `values-{env}.yaml` files and commits them back to Git.

**How it works:**
1. Workflow builds and pushes images
2. Security scan runs
3. If successful, workflow updates Helm values files
4. Commits changes with `[skip ci]` to avoid triggering another build
5. ArgoCD detects Git change and syncs

See [deploy/argocd/IMAGE-UPDATER.md](../../deploy/argocd/IMAGE-UPDATER.md) for ArgoCD Image Updater setup.

## Monitoring

### GitHub Actions Dashboard

View workflow runs: `https://github.com/wesback/fluxion/actions`

### Check Recent Images

```bash
# View recent builds in ACR
az acr repository show-tags \
  --name $(cd terraform && terraform output -raw acr_name) \
  --repository fluxion-backend \
  --orderby time_desc \
  --top 10

# Get image digest
az acr repository show-manifests \
  --name $(cd terraform && terraform output -raw acr_name) \
  --repository fluxion-backend \
  --top 5
```

### View Security Scan Results

Security scan results are uploaded to GitHub Security tab:

`https://github.com/wesback/fluxion/security/code-scanning`

## Troubleshooting

### Build Fails: "Could not authenticate to ACR"

**Problem:** Service principal doesn't have permission.

**Solution:**
```bash
# Verify role assignment
ACR_ID=$(cd terraform && terraform output -raw acr_id)
az role assignment list --scope "$ACR_ID" --query "[?roleDefinitionName=='AcrPush']"

# If missing, add it:
SP_ID=$(az ad sp list --display-name "github-actions-fluxion" --query "[0].id" -o tsv)
az role assignment create --role "AcrPush" --assignee $SP_ID --scope "$ACR_ID"
```

### Build Fails: "ACR not found"

**Problem:** `ACR_NAME` variable is incorrect.

**Solution:**
```bash
# Get correct ACR name
cd terraform
terraform output acr_name

# Update GitHub variable
gh variable set ACR_NAME --body "$(terraform output -raw acr_name)"
```

### Images Not Deploying in Kubernetes

**Problem:** AKS can't pull from ACR.

**Solution:**
```bash
# Verify AKS has AcrPull role
ACR_ID=$(cd terraform && terraform output -raw acr_id)
AKS_KUBELET_ID=$(cd terraform && terraform output -raw kubelet_identity_object_id)

az role assignment create \
  --role "AcrPull" \
  --assignee $AKS_KUBELET_ID \
  --scope $ACR_ID
```

### Workflow Shows "Skipped"

**Problem:** Path filters not matching changed files.

**Solution:** Workflow only runs when files in `backend/` or `frontend/` change. To force run:

```bash
# Manually trigger workflow
gh workflow run build-push-acr.yml --ref develop
```

Or add `workflow_dispatch` trigger to the workflow file.

## Best Practices

1. ✅ **Always use specific image tags** - Never rely only on `latest` in production
2. ✅ **Run security scans** - Review scan results in GitHub Security tab
3. ✅ **Use multi-stage builds** - Keep images small and efficient
4. ✅ **Enable BuildKit caching** - Speeds up builds (already configured)
5. ✅ **Use federated credentials** - More secure than service principal secrets
6. ✅ **Tag with SHA** - Every build gets unique identifier
7. ✅ **Separate dev/prod images** - Use `dev-latest` vs `latest` tags
8. ✅ **Review PRs before merging** - Workflow builds PR images but doesn't push

## Additional Resources

- [Azure Container Registry Documentation](https://learn.microsoft.com/en-us/azure/container-registry/)
- [GitHub Actions for Azure](https://github.com/Azure/actions)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [ArgoCD Image Updater](https://argocd-image-updater.readthedocs.io/)
- [Azure Federated Credentials](https://learn.microsoft.com/en-us/azure/active-directory/develop/workload-identity-federation)
