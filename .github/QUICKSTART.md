# Quick Start: GitHub Actions + ACR for Fluxion

Get your containers building and pushing to Azure Container Registry in 5 minutes!

## Prerequisites

✅ Terraform infrastructure deployed (ACR exists)  
✅ Azure CLI installed and logged in  
✅ GitHub CLI installed and logged in  
✅ Repository cloned locally

### Install Required Tools

If you don't have these tools installed:

**Azure CLI:**
```bash
# Linux
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# macOS
brew install azure-cli

# Verify
az --version
az login
```

**GitHub CLI:**
```bash
# Linux (Debian/Ubuntu)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# macOS
brew install gh

# Verify
gh --version
gh auth login
```

**jq (for setup script):**
```bash
# Linux
sudo apt-get install jq

# macOS
brew install jq
```

## 5-Minute Setup

### Step 1: Run Setup Script (2 minutes)

```bash
cd /home/wesleyb/git/fluxion/.github/workflows
./setup-acr-auth.sh
```

This script will:
- ✅ Verify your Azure and GitHub authentication
- ✅ Get ACR details from Terraform
- ✅ Create Azure service principal (or federated credentials)
- ✅ Add secrets to GitHub repository
- ✅ Configure everything automatically

Choose option **2** (Federated Credentials) for better security.

### Step 2: Commit GitHub Actions Workflow (1 minute)

```bash
cd /home/wesleyb/git/fluxion

# Review the workflow
cat .github/workflows/build-push-acr.yml

# Commit the new workflow
git add .github/
git commit -m "ci: add GitHub Actions workflow for ACR"
git push origin main
```

### Step 3: Test the Workflow (2 minutes)

```bash
# Make a small change to trigger the workflow
echo "# Build test" >> backend/README.md

git checkout -b test/acr-build
git add backend/README.md
git commit -m "test: trigger ACR build workflow"
git push origin test/acr-build

# Watch the workflow run
gh run watch
```

### Step 4: Verify Images in ACR

```bash
cd terraform

# List repositories in ACR
az acr repository list --name $(terraform output -raw acr_name)

# Expected output:
# [
#   "fluxion-backend",
#   "fluxion-frontend"
# ]

# List tags for backend
az acr repository show-tags \
  --name $(terraform output -raw acr_name) \
  --repository fluxion-backend \
  --orderby time_desc
```

## What Just Happened?

1. **Workflow Created** - `.github/workflows/build-push-acr.yml` builds and pushes Docker images
2. **Authentication Configured** - GitHub can now push to your ACR
3. **Automated Builds** - Every push to `main` or `develop` triggers a build
4. **Security Scanning** - Images are automatically scanned for vulnerabilities
5. **GitOps Ready** - Image tags are updated in Helm values for ArgoCD

## Next Steps

### Update Helm Values for ACR

Edit your Helm values to use ACR instead of other registries:

```bash
cd /home/wesleyb/git/fluxion

# Get your ACR login server
ACR_SERVER=$(cd terraform && terraform output -raw acr_login_server)

# Update dev values
cat > deploy/helm/fluxion/values-dev.yaml << YAML
backend:
  image:
    repository: ${ACR_SERVER}/fluxion-backend
    tag: "dev-latest"
    pullPolicy: Always

frontend:
  image:
    repository: ${ACR_SERVER}/fluxion-frontend
    tag: "dev-latest"
    pullPolicy: Always
YAML

# Commit changes
git add deploy/helm/fluxion/values-dev.yaml
git commit -m "chore: update Helm values to use ACR"
git push origin main
```

### Deploy to Kubernetes

If you have ArgoCD set up:

```bash
# ArgoCD will automatically detect the changes and sync
argocd app get fluxion-dev

# Or manually sync
argocd app sync fluxion-dev
```

If deploying manually:

```bash
cd deploy/helm/fluxion

# Get AKS credentials
az aks get-credentials \
  --resource-group $(cd ../../../terraform && terraform output -raw resource_group_name) \
  --name $(cd ../../../terraform && terraform output -raw aks_cluster_name)

# Deploy with Helm
helm upgrade --install fluxion . \
  -f values-dev.yaml \
  --namespace fluxion-dev \
  --create-namespace
```

## Workflow Triggers

The GitHub Actions workflow runs when:

- ✅ Push to `main` branch (builds and pushes `latest` tag)
- ✅ Push to `develop` branch (builds and pushes `dev-latest` tag)
- ✅ Pull request to `main` (builds but doesn't push)
- ✅ Changes to `backend/**` or `frontend/**` directories

## Monitoring

### View Workflow Runs

```bash
# List recent runs
gh run list --workflow=build-push-acr.yml

# Watch latest run
gh run watch

# View logs
gh run view --log
```

### View Images in ACR

```bash
cd terraform

# List all images
az acr repository list \
  --name $(terraform output -raw acr_name) \
  --output table

# Show image details
az acr repository show \
  --name $(terraform output -raw acr_name) \
  --repository fluxion-backend

# List tags with timestamps
az acr repository show-tags \
  --name $(terraform output -raw acr_name) \
  --repository fluxion-backend \
  --orderby time_desc \
  --detail
```

### View Security Scan Results

GitHub Security tab: `https://github.com/wesback/fluxion/security/code-scanning`

## Troubleshooting

### "Could not authenticate to ACR"

```bash
# Verify secrets are set
gh secret list

# Should see:
# AZURE_CREDENTIALS (or AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID)

# Verify service principal has permissions
cd terraform
az role assignment list \
  --scope $(terraform output -raw acr_id) \
  --query "[?roleDefinitionName=='AcrPush']"
```

### Workflow Not Triggering

Check path filters:

```bash
# Workflow only runs when these files change:
git status backend/
git status frontend/
git status .github/workflows/build-push-acr.yml
```

### Images Not Deploying in AKS

```bash
# Verify AKS has pull permissions
cd terraform

az role assignment list \
  --assignee $(terraform output -raw kubelet_identity_object_id) \
  --scope $(terraform output -raw acr_id) \
  --query "[?roleDefinitionName=='AcrPull']"

# If missing, add it:
az role assignment create \
  --role "AcrPull" \
  --assignee $(terraform output -raw kubelet_identity_object_id) \
  --scope $(terraform output -raw acr_id)
```

## Manual Build and Push (for testing)

```bash
cd /home/wesleyb/git/fluxion/terraform

# Login to ACR
./scripts/acr-login.sh dev

# Build backend
cd ../backend
docker build -t $(cd ../terraform && terraform output -raw acr_login_server)/fluxion-backend:manual-test .

# Push to ACR
docker push $(cd ../terraform && terraform output -raw acr_login_server)/fluxion-backend:manual-test

# Build frontend
cd ../frontend
docker build -t $(cd ../terraform && terraform output -raw acr_login_server)/fluxion-frontend:manual-test .

# Push to ACR
docker push $(cd ../terraform && terraform output -raw acr_login_server)/fluxion-frontend:manual-test
```

## Additional Documentation

- **Setup Details**: [.github/workflows/README.md](.github/workflows/README.md)
- **ACR vs GHCR**: [.github/ACR_VS_GHCR.md](.github/ACR_VS_GHCR.md)
- **ArgoCD Integration**: [../deploy/argocd/IMAGE-UPDATER.md](../deploy/argocd/IMAGE-UPDATER.md)
- **Terraform ACR Module**: [../terraform/modules/acr/](../terraform/modules/acr/)

## Success Checklist

- [ ] Setup script completed successfully
- [ ] GitHub secrets configured (`gh secret list`)
- [ ] Workflow file committed and pushed
- [ ] Test workflow triggered and passed
- [ ] Images visible in ACR (`az acr repository list`)
- [ ] Security scan results available in GitHub
- [ ] Helm values updated to reference ACR
- [ ] Application deployed and running in AKS

## Need Help?

Run this diagnostic script:

```bash
cd /home/wesleyb/git/fluxion/terraform

echo "=== Azure Configuration ==="
echo "ACR Name: $(terraform output -raw acr_name)"
echo "ACR Login Server: $(terraform output -raw acr_login_server)"
echo "ACR ID: $(terraform output -raw acr_id)"

echo ""
echo "=== GitHub Configuration ==="
gh secret list
gh variable list

echo ""
echo "=== ACR Repositories ==="
az acr repository list --name $(terraform output -raw acr_name)

echo ""
echo "=== Recent Workflow Runs ==="
gh run list --workflow=build-push-acr.yml --limit 5
```

Happy building! 🚀
