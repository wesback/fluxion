# GitHub Integration for Fluxion

This directory contains GitHub Actions workflows and setup documentation for automating container builds and deployments to Azure.

## 📚 Documentation

| Document | Purpose | Start Here? |
|----------|---------|-------------|
| **[QUICKSTART.md](QUICKSTART.md)** | Get up and running in 5 minutes | ⭐ **YES** |
| **[PREREQUISITES.md](PREREQUISITES.md)** | Required tools and installation instructions | If setup script fails |
| **[workflows/README.md](workflows/README.md)** | Detailed workflow configuration and troubleshooting | For advanced setup |

## 🚀 Quick Start

### 1. Check Prerequisites

```bash
cd /home/wesleyb/git/fluxion/.github
./check-prerequisites.sh
```

This will verify you have:
- ✅ Azure CLI (installed and logged in)
- ✅ GitHub CLI (installed and logged in)
- ✅ jq (JSON processor)
- ✅ Terraform state with ACR deployed

### 2. Run Setup Script

```bash
cd workflows
./setup-acr-auth.sh
```

This automated script will:
- Create Azure service principal or federated credentials
- Configure GitHub repository secrets
- Set up all authentication automatically

### 3. Commit and Push

```bash
cd /home/wesleyb/git/fluxion
git add .github/
git commit -m "ci: add GitHub Actions workflows for ACR"
git push origin main
```

### 4. Test It

```bash
# Make a small change
echo "# Test" >> backend/README.md

# Push to trigger workflow
git checkout -b test/build
git add backend/README.md
git commit -m "test: trigger build"
git push origin test/build

# Watch the workflow
gh run watch
```

## 📋 What's Included

### Scripts

| Script | Purpose |
|--------|---------|
| `check-prerequisites.sh` | Verify all required tools are installed |
| `workflows/setup-acr-auth.sh` | Automated setup for GitHub Actions + ACR |

### Workflows

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `build-push-acr.yml` | Build and push containers to ACR | Push to `main`/`develop` |

## 🔧 Tools Required

Before running the setup:

1. **Azure CLI** - For Azure authentication
   ```bash
   # Install: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli
   az login
   ```

2. **GitHub CLI** - For repository configuration
   ```bash
   # Install: https://cli.github.com/
   gh auth login
   ```

3. **jq** - For JSON processing
   ```bash
   # Linux: sudo apt-get install jq
   # macOS: brew install jq
   ```

See [PREREQUISITES.md](PREREQUISITES.md) for detailed installation instructions.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Developer Workflow                       │
└─────────────────────────────────────────────────────────────┘
                              │
                    git push (main/develop)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Actions                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Build Backend│  │Build Frontend│  │Security Scan │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                    docker push to ACR
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Azure Container Registry (ACR)                  │
│  • fluxiondevacr.azurecr.io/fluxion-backend:latest          │
│  • fluxiondevacr.azurecr.io/fluxion-frontend:latest         │
└─────────────────────────────────────────────────────────────┘
                              │
                    Image pull by AKS
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Azure Kubernetes Service                    │
│                      (via ArgoCD)                            │
└─────────────────────────────────────────────────────────────┘
```

## 🔐 Authentication

Two authentication methods are supported:

### Option 1: Service Principal with Secret (Simpler)

```bash
./workflows/setup-acr-auth.sh
# Choose option 1
```

Creates:
- Service principal with AcrPush role
- GitHub secret: `AZURE_CREDENTIALS`

### Option 2: Federated Credentials (Recommended)

```bash
./workflows/setup-acr-auth.sh
# Choose option 2
```

Creates:
- App registration with federated identity
- GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- More secure (no long-lived secrets)

## 📊 Workflow Triggers

| Event | Branches | Actions |
|-------|----------|---------|
| **Push** | `main` | Build + Push (tag: `latest`) + Security Scan + Update manifests |
| **Push** | `develop` | Build + Push (tag: `dev-latest`) + Security Scan + Update manifests |
| **Pull Request** | `main` | Build only (no push) for validation |

## 🏷️ Image Tagging Strategy

Every build creates multiple tags:

| Tag Format | Example | Use Case |
|------------|---------|----------|
| `latest` | `latest` | Production deployments (from `main`) |
| `dev-latest` | `dev-latest` | Development deployments (from `develop`) |
| `{branch}-{sha}` | `main-a1b2c3d` | Specific version tracking |
| `pr-{number}` | `pr-42` | Pull request testing |

## 🔍 Monitoring

### View Workflow Runs

```bash
# List recent runs
gh run list --workflow=build-push-acr.yml

# Watch current run
gh run watch

# View specific run logs
gh run view {run-id} --log
```

### View Images in ACR

```bash
cd /home/wesleyb/git/fluxion/terraform

# List repositories
az acr repository list --name $(terraform output -raw acr_name)

# List tags for backend
az acr repository show-tags \
  --name $(terraform output -raw acr_name) \
  --repository fluxion-backend \
  --orderby time_desc
```

### View Security Scans

GitHub Security tab: https://github.com/wesback/fluxion/security/code-scanning

## 🐛 Troubleshooting

### Setup Script Fails

1. Run prerequisites check:
   ```bash
   ./check-prerequisites.sh
   ```

2. Fix any issues marked with ❌

3. Re-run setup script

### Workflow Fails to Authenticate

```bash
# Verify secrets are set
gh secret list

# Verify ACR permissions
cd terraform
az role assignment list --scope $(terraform output -raw acr_id)
```

### Images Not Deploying in AKS

```bash
# Verify AKS has pull permissions
cd terraform
az role assignment list \
  --assignee $(terraform output -raw kubelet_identity_object_id) \
  --scope $(terraform output -raw acr_id)
```

See [workflows/README.md](workflows/README.md) for detailed troubleshooting.

## 📖 Related Documentation

- **Terraform ACR Module**: [../terraform/modules/acr/](../terraform/modules/acr/)
- **ArgoCD Setup**: [../deploy/argocd/README.md](../deploy/argocd/README.md)
- **ArgoCD Image Updater**: [../deploy/argocd/IMAGE-UPDATER.md](../deploy/argocd/IMAGE-UPDATER.md)
- **Helm Charts**: [../deploy/helm/fluxion/](../deploy/helm/fluxion/)

## 🤝 Contributing

When adding new workflows:

1. Test locally first (if possible)
2. Use descriptive job and step names
3. Add comments explaining complex logic
4. Update this README with new workflows
5. Document any new secrets/variables needed

## 📝 Notes

- **ACR vs GHCR**: This setup uses Azure Container Registry (ACR) because your infrastructure is on Azure. See [ACR_VS_GHCR.md](ACR_VS_GHCR.md) for comparison.
  
- **Cost**: ACR Standard tier costs ~$20/month. You can switch to Basic ($5/month) if needed.

- **Security**: Images are automatically scanned for vulnerabilities using Trivy. Check results in GitHub Security tab.

- **GitOps**: Workflows automatically update Helm values files, which ArgoCD then syncs to your cluster.

## 🆘 Getting Help

1. Check [QUICKSTART.md](QUICKSTART.md) for common setup steps
2. Review [PREREQUISITES.md](PREREQUISITES.md) for tool installation
3. See [workflows/README.md](workflows/README.md) for detailed configuration
4. Run `./check-prerequisites.sh` to diagnose issues
5. Check GitHub Actions logs: `gh run view --log`

## ✅ Success Checklist

- [ ] Prerequisites verified (`./check-prerequisites.sh` passes)
- [ ] Setup script completed (`./workflows/setup-acr-auth.sh`)
- [ ] GitHub secrets configured (`gh secret list`)
- [ ] Workflows committed and pushed
- [ ] Test build triggered and passed
- [ ] Images visible in ACR (`az acr repository list`)
- [ ] Security scans passing
- [ ] Helm values updated to reference ACR
- [ ] Application deployed in AKS

Once all items are checked, your CI/CD pipeline is fully operational! 🚀
