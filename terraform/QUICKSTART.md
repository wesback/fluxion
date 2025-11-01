# Quick Start Guide

Get your Fluxion AKS cluster up and running in 15 minutes.

## Prerequisites Checklist

Before you begin, ensure you have:

- [ ] Azure subscription with appropriate permissions
- [ ] [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed (>= 2.50.0)
- [ ] [Terraform](https://www.terraform.io/downloads) installed (>= 1.5.0)
- [ ] [kubectl](https://kubernetes.io/docs/tasks/tools/) installed (>= 1.28)
- [ ] Logged in to Azure: `az login`

## Step 1: Clone Repository (2 minutes)

```bash
git clone https://github.com/wesback/fluxion.git
cd fluxion/terraform
```

## Step 2: Setup Terraform Backend (3 minutes)

Create Azure Storage for Terraform state:

```bash
./scripts/setup-backend.sh
```

This script will:
- Create a resource group for Terraform state
- Create a storage account
- Create a blob container
- Output your backend configuration

**Save the output!** You'll need the storage account name for the next step.

## Step 3: Configure Backend (1 minute)

Create your backend config file:

```bash
cp backend-config-dev.hcl.example backend-config-dev.hcl
```

Edit `backend-config-dev.hcl` with your storage account name from Step 2:

```hcl
resource_group_name  = "fluxion-tfstate-rg"
storage_account_name = "fluxiontfstate12345"  # Replace with your actual name
container_name       = "tfstate"
key                  = "fluxion-dev.tfstate"
```

## Step 4: Review Configuration (2 minutes)

Check the development environment settings in `environments/dev.tfvars`:

```bash
cat environments/dev.tfvars
```

**Customize if needed:**
- Change Azure region (default: `eastus`)
- Adjust node counts
- Modify VM sizes

## Step 5: Initialize Terraform (2 minutes)

```bash
terraform init -backend-config=backend-config-dev.hcl
```

**Expected output:**
```
Initializing modules...
Initializing the backend...
Initializing provider plugins...
Terraform has been successfully initialized!
```

## Step 6: Plan Deployment (2 minutes)

Review what will be created:

```bash
terraform plan -var-file="environments/dev.tfvars"
```

**Review the plan:**
- Resource group
- Virtual network and subnets
- AKS cluster with 2 node pools
- Container registry
- Log Analytics workspace
- Key Vault
- Public IP for ingress

## Step 7: Deploy Infrastructure (10-15 minutes)

Apply the configuration:

```bash
terraform apply -var-file="environments/dev.tfvars"
```

Type `yes` when prompted.

**Deployment takes 10-15 minutes.** Grab a coffee! ☕

## Step 8: Configure kubectl Access (1 minute)

Once deployment completes:

```bash
./scripts/configure-access.sh dev
```

**Verify cluster access:**

```bash
kubectl get nodes
kubectl cluster-info
```

**Expected output:**
```
NAME                                STATUS   ROLES   AGE     VERSION
aks-system-12345678-vmss000000     Ready    agent   5m      v1.28.x
aks-system-12345678-vmss000001     Ready    agent   5m      v1.28.x
aks-user-12345678-vmss000000       Ready    agent   5m      v1.28.x
```

## Step 9: Login to ACR (1 minute)

Authenticate with Azure Container Registry:

```bash
./scripts/acr-login.sh dev
```

## Step 10: Deploy Fluxion Application (5 minutes)

Now deploy the Fluxion application using Helm:

```bash
cd ../deploy/helm

# Create namespace
kubectl create namespace fluxion

# Install Fluxion
helm install fluxion ./fluxion \
  --namespace fluxion \
  --set image.repository=$(cd ../../terraform && terraform output -raw acr_login_server)/fluxion \
  --set image.tag=latest
```

Or use ArgoCD (see [deploy/argocd/README.md](../deploy/argocd/README.md))

## Verification

### Check Infrastructure

```bash
cd ../../terraform

# View all outputs
terraform output

# Get specific values
terraform output cluster_name
terraform output acr_login_server
terraform output ingress_public_ip
```

### Check Kubernetes Resources

```bash
# Nodes
kubectl get nodes

# System pods
kubectl get pods -n kube-system

# Ingress controller
kubectl get pods -n ingress-nginx

# Storage classes
kubectl get storageclass

# Services
kubectl get svc -A
```

### Check Azure Resources

```bash
# Resource group
az group show --name fluxion-dev-rg

# AKS cluster
az aks show \
  --resource-group fluxion-dev-rg \
  --name fluxion-dev-aks

# Container registry
az acr show \
  --name fluxiondevacr
```

## Common Issues

### Issue: Backend initialization fails

**Solution:** Ensure storage account was created successfully:

```bash
az storage account show --name <storage-account-name> --resource-group fluxion-tfstate-rg
```

### Issue: Insufficient quota

**Error:** `Cores quota exceeded`

**Solution:** Check and request quota increase:

```bash
az vm list-usage --location eastus -o table
```

Request increase: [Azure Portal → Quotas](https://portal.azure.com/#blade/Microsoft_Azure_Capacity/QuotaMenuBlade)

### Issue: kubectl authentication fails

**Solution:** Re-run access configuration:

```bash
./scripts/configure-access.sh dev admin
```

### Issue: ACR authentication fails

**Solution:** Verify role assignment:

```bash
az role assignment list --scope $(terraform output -raw acr_id)
```

## Next Steps

After successful deployment:

1. **Configure DNS** (if using custom domain)
   ```bash
   # Get ingress IP
   terraform output ingress_public_ip
   
   # Create DNS A record pointing to this IP
   ```

2. **Set up TLS certificates**
   - cert-manager is already installed
   - See [SECURITY.md](SECURITY.md) for Let's Encrypt setup

3. **Deploy Fluxion application**
   - Use Helm: See [deploy/helm/fluxion/README.md](../deploy/helm/fluxion/README.md)
   - Use ArgoCD: See [deploy/argocd/README.md](../deploy/argocd/README.md)

4. **Configure monitoring**
   - Access Azure Monitor dashboards
   - Set up alerts
   - Configure log queries

5. **Set up backups**
   - Install Velero for cluster backups
   - Configure database backups

## Cost Optimization for Development

To save costs when not using the dev cluster:

```bash
# Stop the cluster (releases compute resources)
az aks stop --resource-group fluxion-dev-rg --name fluxion-dev-aks

# Start the cluster when needed
az aks start --resource-group fluxion-dev-rg --name fluxion-dev-aks
```

**Savings:** ~$90/month for dev environment

## Cleanup

When you're done testing and want to destroy the infrastructure:

```bash
terraform destroy -var-file="environments/dev.tfvars"
```

Type `yes` when prompted.

**Note:** This will delete all resources including data. Make sure you have backups!

## Production Deployment

For production deployment:

1. **Use production tfvars:**
   ```bash
   terraform init -backend-config=backend-config-production.hcl
   terraform plan -var-file="environments/production.tfvars"
   terraform apply -var-file="environments/production.tfvars"
   ```

2. **Review security checklist:**
   See [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md)

3. **Enable all security features:**
   - Private cluster
   - Azure Policy
   - Azure AD RBAC
   - Network policies

4. **Set up monitoring and alerts:**
   - Configure Azure Monitor
   - Set up PagerDuty/Slack alerts
   - Create dashboards

## Getting Help

- **Documentation:** [README.md](README.md) - Full documentation
- **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md) - Detailed architecture
- **Security:** [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md) - Security best practices
- **Costs:** [COST-ESTIMATION.md](COST-ESTIMATION.md) - Cost breakdown
- **Validation:** [POST-DEPLOYMENT.md](POST-DEPLOYMENT.md) - Validation steps
- **Issues:** [GitHub Issues](https://github.com/wesback/fluxion/issues)

## Success Checklist

- [ ] Backend storage created
- [ ] Terraform initialized successfully
- [ ] Infrastructure deployed (terraform apply)
- [ ] kubectl configured and working
- [ ] All nodes are Ready
- [ ] System pods are Running
- [ ] Ingress controller has external IP
- [ ] ACR authentication working
- [ ] Can deploy pods to cluster
- [ ] Monitoring data flowing to Log Analytics

## Congratulations! 🎉

Your Fluxion AKS infrastructure is now ready!

**What you've deployed:**
- AKS cluster with 2 node pools (system + user)
- Azure Container Registry
- Virtual network with proper segmentation
- Log Analytics workspace
- Key Vault for secrets
- nginx-ingress controller
- All necessary monitoring and security components

**Total deployment time:** ~25 minutes
**Monthly cost:** ~$180 (development)

Now proceed to deploy the Fluxion application!
