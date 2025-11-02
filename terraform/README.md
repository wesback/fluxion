# Fluxion Azure Kubernetes Service (AKS) Infrastructure

Terraform infrastructure-as-code for provisioning and managing Azure Kubernetes Service clusters to host Fluxion.

## Architecture Philosophy

This Terraform configuration follows best practices by **separating infrastructure from application concerns**:

- **Terraform manages Azure infrastructure**: AKS cluster, networking, ACR, monitoring, Key Vault, etc.
- **Kubernetes tools manage K8s resources**: Use Helm CLI or ArgoCD for ingress-nginx, cert-manager, and applications

This separation enables:
- ✅ Fully automated infrastructure deployment (no manual kubectl steps during `terraform apply`)
- ✅ GitOps workflows for application deployment (ArgoCD, FluxCD)
- ✅ CI/CD friendly (no cluster credentials needed for infrastructure provisioning)
- ✅ Clear separation between platform and application layers

## Table of Contents

- [Architecture Philosophy](#architecture-philosophy)
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Post-Deployment](#post-deployment)
- [Infrastructure Components](#infrastructure-components)
- [Environment Management](#environment-management)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Cost Management](#cost-management)
- [Security](#security)
- [Additional Documentation](#additional-documentation)

## Overview

This Terraform configuration creates Azure infrastructure for running Fluxion on Kubernetes:

- **AKS Cluster**: Managed Kubernetes cluster with system and user node pools
- **Networking**: Virtual network, subnets, NSGs, and public IP for ingress
- **Container Registry**: Azure Container Registry with managed identity integration
- **Monitoring**: Log Analytics workspace and Azure Monitor integration
- **Security**: Key Vault for secrets, Azure AD RBAC, network policies
- **Ingress**: nginx-ingress controller and cert-manager (optional)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Azure Subscription                          │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Resource Group (fluxion-{env}-rg)                 │ │
│  │                                                                 │ │
│  │  ┌──────────────────────┐      ┌───────────────────────────┐  │ │
│  │  │  Virtual Network     │      │  AKS Cluster              │  │ │
│  │  │  - Node Subnet       │◄─────┤  - System Node Pool (2-3) │  │ │
│  │  │  - Pod Subnet        │      │  - User Node Pool (2-6)   │  │ │
│  │  └──────────────────────┘      │  - Azure CNI + Calico     │  │ │
│  │                                 └───────────────────────────┘  │ │
│  │  ┌──────────────────────┐      ┌───────────────────────────┐  │ │
│  │  │  Public IP           │      │  Azure Container Registry │  │ │
│  │  │  (Ingress)           │      │  - Managed Identity       │  │ │
│  │  └──────────────────────┘      │  - Geo-replication (Prem) │  │ │
│  │                                 └───────────────────────────┘  │ │
│  │  ┌──────────────────────┐      ┌───────────────────────────┐  │ │
│  │  │  Log Analytics       │      │  Key Vault                │  │ │
│  │  │  Workspace           │      │  - Secrets                │  │ │
│  │  └──────────────────────┘      │  - CSI Driver Integration │  │ │
│  │                                 └───────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Software

- **Terraform** >= 1.5.0 ([Install](https://www.terraform.io/downloads))
- **Azure CLI** >= 2.50.0 ([Install](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
- **kubectl** >= 1.28 ([Install](https://kubernetes.io/docs/tasks/tools/))
- **Helm** >= 3.12 ([Install](https://helm.sh/docs/intro/install/))

### Azure Requirements

- Azure subscription with appropriate permissions
- Service Principal or User Account with:
  - Contributor role on subscription or resource group
  - User Access Administrator (for role assignments)

### Authentication

Login to Azure CLI:

```bash
az login

# Set subscription (if you have multiple)
az account set --subscription "Your Subscription Name"

# Verify current subscription
az account show
```

## Quick Start

### TL;DR - Complete Deployment

```bash
# 1. Setup and deploy infrastructure
cd terraform
./scripts/setup-backend.sh
cp backend-config-dev.hcl.example backend-config-dev.hcl
# Edit backend-config-dev.hcl with your storage account name

terraform init -backend-config=backend-config-dev.hcl
terraform apply -var-file="environments/dev.tfvars"

# 2. Bootstrap Kubernetes (infrastructure + ArgoCD)
./scripts/install-k8s-components.sh dev

# 3. Deploy applications via GitOps
cd ../deploy/argocd
kubectl apply -f projects/fluxion-project.yaml
kubectl apply -f root-app.yaml
```

**That's it!** Your infrastructure is deployed and ArgoCD is managing your applications.

### Detailed Steps

For step-by-step instructions with explanations, see [QUICKSTART.md](./QUICKSTART.md).

### What Gets Deployed

**Phase 1: Terraform (Azure Infrastructure)**
- AKS cluster with system and user node pools
- Virtual network and subnets
- Azure Container Registry
- Log Analytics workspace
- Key Vault
- Public IP for ingress

**Phase 2: Bootstrap Script (Kubernetes Infrastructure)**
- cert-manager (TLS certificate management)
- ingress-nginx (Ingress controller)
- ArgoCD (GitOps operator)

**Phase 3: ArgoCD (Applications)**
- Fluxion application (dev/staging/production environments)
- Observability stack (Prometheus, Grafana, Jaeger, OpenTelemetry)

---

## Detailed Documentation

### 1. Setup Terraform Backend

Create Azure Storage for Terraform state:

```bash
cd terraform
./scripts/setup-backend.sh
```

This creates a storage account and outputs the backend configuration.

### 2. Configure Backend

Create backend config file (e.g., `backend-config-dev.hcl`):

```hcl
resource_group_name  = "fluxion-tfstate-rg"
storage_account_name = "fluxiontfstateXXXXX"  # From setup script
container_name       = "tfstate"
key                  = "fluxion-dev.tfstate"
```

### 3. Initialize Terraform

```bash
terraform init -backend-config=backend-config-dev.hcl
```

### 4. Review and Customize Configuration

Edit `environments/dev.tfvars` to customize your deployment.

### 5. Deploy Infrastructure

```bash
terraform apply -var-file="environments/dev.tfvars"
```

Deployment takes approximately 10-15 minutes and creates all Azure infrastructure.

### 6. Bootstrap Kubernetes Infrastructure

After Terraform completes, run the bootstrap script to install infrastructure components and ArgoCD:

```bash
./scripts/install-k8s-components.sh dev
```

This installs:
- cert-manager v1.13.2
- ingress-nginx v4.8.3
- ArgoCD (latest stable)

Save the ArgoCD admin password from the script output!

### 7. Deploy Applications with ArgoCD

```bash
cd ../deploy/argocd

# Create Fluxion project
kubectl apply -f projects/fluxion-project.yaml

# Deploy app-of-apps
kubectl apply -f root-app.yaml

# Watch deployments
kubectl get applications -n argocd -w
```

### 8. Access ArgoCD UI

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Open https://localhost:8080 and login with:
- Username: `admin`
- Password: (from bootstrap script)

---

## Post-Deployment
az aks get-credentials \
  --resource-group fluxion-dev-rg \
  --name fluxion-dev-aks \
  --overwrite-existing \
  --admin
```

**Why is this needed?**
- The AKS cluster uses Azure AD RBAC for authorization
- Terraform's Helm and Kubernetes providers use the local kubeconfig (`~/.kube/config`)
- Admin credentials provide certificate-based authentication that works reliably with Terraform
- This step must be done AFTER the cluster is created but BEFORE Terraform manages Helm releases

### 7. Apply Helm Releases (if previously failed)

If you ran `terraform apply` before step 6, the Helm releases may have failed. Re-run terraform apply:

```bash
terraform apply -var-file="environments/dev.tfvars"
```

### 8. Verify Deployment

```bash
kubectl get nodes
kubectl get pods -A
helm list -A
```

## Infrastructure Components

### Networking Module

- Virtual Network with configurable CIDR
- Dedicated subnets for nodes and pods (Azure CNI)
- Network Security Groups
- Public IP for ingress controller

**Default Configuration:**
- VNet: `10.0.0.0/16` (dev), `10.1.0.0/16` (staging), `10.2.0.0/16` (production)
- Node Subnet: `10.X.1.0/24`
- Pod Subnet: `10.X.2.0/23`

### AKS Module

**System Node Pool:**
- Purpose: Run system workloads (kube-system, monitoring)
- Default Size: 2-3 nodes
- VM Size: `Standard_D2s_v3`
- No autoscaling (stable system workloads)

**User Node Pool:**
- Purpose: Run application workloads
- Default Size: 2-6 nodes (autoscaling)
- VM Size: `Standard_D4s_v3`
- Autoscaling enabled

**Features:**
- Kubernetes version: 1.28+ (configurable)
- Network plugin: Azure CNI
- Network policy: Calico
- Managed identity (no service principals)
- Azure AD RBAC integration
- Private cluster option (production)

### ACR Module

- Container registry for Docker images
- SKU: Basic (dev), Standard (staging), Premium (production)
- Managed identity integration (no admin account)
- Geo-replication support (Premium SKU)
- Backup storage account for cluster backups

### Monitoring Module

**Log Analytics:**
- Centralized logging for AKS
- Configurable retention (30-90 days)
- Integration with Azure Monitor

**Key Vault:**
- Secrets management
- CSI driver integration with AKS
- Access policies for cluster identities

**Diagnostics:**
- AKS control plane logs (api-server, controller-manager, scheduler)
- Audit logs
- Cluster autoscaler logs

## Usage

### Common Commands

**Initialize (first time or after changes to backend):**
```bash
terraform init -backend-config=backend-config-<env>.hcl
```

**Plan changes:**
```bash
terraform plan -var-file="environments/<env>.tfvars"
```

**Apply changes:**
```bash
terraform apply -var-file="environments/<env>.tfvars"
```

**Show outputs:**
```bash
terraform output
terraform output -raw kube_config > kubeconfig
```

**Destroy infrastructure:**
```bash
terraform destroy -var-file="environments/<env>.tfvars"
```

### Working with Multiple Environments

Use separate backend configs and tfvars for each environment:

```bash
# Development
terraform init -backend-config=backend-config-dev.hcl
terraform apply -var-file="environments/dev.tfvars"

# Staging
terraform init -backend-config=backend-config-staging.hcl
terraform apply -var-file="environments/staging.tfvars"

# Production
terraform init -backend-config=backend-config-production.hcl
terraform apply -var-file="environments/production.tfvars"
```

## Environment Management

### Development Environment

- **Purpose**: Testing and development
- **Configuration**: `environments/dev.tfvars`
- **Features**:
  - Minimal node counts (cost optimization)
  - Public cluster access
  - Basic ACR SKU
  - 30-day log retention

### Staging Environment

- **Purpose**: Pre-production testing
- **Configuration**: `environments/staging.tfvars`
- **Features**:
  - Moderate node counts
  - Public cluster with Azure AD RBAC
  - Standard ACR SKU
  - 60-day log retention
  - cert-manager enabled

### Production Environment

- **Purpose**: Production workloads
- **Configuration**: `environments/production.tfvars`
- **Features**:
  - Higher node counts with autoscaling
  - Private cluster (no public endpoint)
  - Premium ACR with geo-replication
  - Azure Policy enabled
  - 90-day log retention
  - Full monitoring and security

## Post-Deployment

### 1. Configure kubectl Access

```bash
./scripts/configure-access.sh <environment> [admin]
```

### 2. Verify Cluster

```bash
kubectl cluster-info
kubectl get nodes
kubectl get pods -A
```

### 3. Login to ACR

```bash
./scripts/acr-login.sh <environment>
```

### 4. Deploy Fluxion Application

Option A: Using Helm (see [deploy/helm/fluxion/README.md](../deploy/helm/fluxion/README.md))

```bash
cd ../deploy/helm
helm install fluxion ./fluxion -n fluxion --create-namespace
```

Option B: Using ArgoCD (see [deploy/argocd/README.md](../deploy/argocd/README.md))

```bash
kubectl apply -f ../deploy/argocd/apps/fluxion-<environment>.yaml
```

### 5. Configure DNS (if using custom domain)

Get ingress IP:
```bash
terraform output ingress_public_ip
```

Create DNS A record pointing to the ingress IP.

### 6. Configure TLS (using cert-manager)

See [SECURITY.md](SECURITY.md) for cert-manager and Let's Encrypt setup.

## Maintenance

### Upgrading Kubernetes Version

1. Check available versions:
```bash
az aks get-versions --location swedencentral --output table
```

2. Update `kubernetes_version` in tfvars file

3. Apply changes:
```bash
terraform apply -var-file="environments/<env>.tfvars"
```

### Scaling Node Pools

User node pool scales automatically within min/max bounds.

To change bounds:
1. Update `user_node_count_min` and `user_node_count_max` in tfvars
2. Apply changes

System node pool scaling:
1. Update `system_node_count` in tfvars
2. Apply changes (gradual, no downtime)

### Backup and Disaster Recovery

**Terraform State Backup:**
- Automatically versioned in Azure Storage
- Enable soft delete on storage account

**Cluster Backup:**
Use Velero for cluster backups (recommended):

```bash
# Install Velero
kubectl apply -f https://github.com/vmware-tanzu/velero/releases/latest/download/velero.yaml

# Configure with backup storage account
# See backup_storage_account_name output
```

**Database Backups:**
Configure PostgreSQL backups in Fluxion Helm chart.

## Troubleshooting

### Common Issues

**1. Terraform init fails with backend error**

Check backend configuration and ensure storage account exists:
```bash
az storage account show --name <storage-account-name> --resource-group fluxion-tfstate-rg
```

**2. AKS cluster creation fails**

Check quota limits:
```bash
```bash
az vm list-usage --location swedencentral -o table
```

### Getting Support
```

**3. kubectl access denied**

Ensure you have appropriate Azure AD permissions:
```bash
az aks get-credentials --resource-group <rg> --name <cluster> --admin
```

**4. ACR pull errors**

Verify role assignment:
```bash
az role assignment list --scope $(terraform output -raw acr_id)
```

**5. Ingress controller not getting public IP**

Check that public IP is in the node resource group:
```bash
az network public-ip list --resource-group $(terraform output -raw node_resource_group)
```

### Viewing Logs

**Cluster logs:**
```bash
kubectl logs -n kube-system <pod-name>
```

**Azure Monitor logs:**
```bash
az monitor log-analytics query \
  --workspace $(terraform output -raw log_analytics_workspace_id) \
  --analytics-query "ContainerLog | limit 100"
```

### Getting Support

- GitHub Issues: [wesback/fluxion/issues](https://github.com/wesback/fluxion/issues)
- Documentation: [Additional Documentation](#additional-documentation)

## Cost Management

### Estimated Monthly Costs (Sweden Central)

**Development:**
- AKS: ~$150/month (2 D2s_v3 + 2 D4s_v3 nodes)
- ACR Basic: ~$5/month
- Log Analytics: ~$20/month
- Storage: ~$5/month
- **Total: ~$180/month**

**Production:**
- AKS: ~$600/month (3 D2s_v3 + 4 D4s_v3 nodes)
- ACR Premium: ~$670/month
- Log Analytics: ~$50/month
- Storage: ~$10/month
- **Total: ~$1,330/month**

### Cost Optimization Tips

1. **Use Azure Reserved Instances** (1 or 3 year commitment) for production
2. **Shut down dev/staging** after hours (see below)
3. **Use spot instances** for non-critical user node pool
4. **Right-size VMs** based on actual usage
5. **Monitor and optimize** Log Analytics queries

**Shutdown Script (Dev/Staging):**
```bash
# Stop AKS cluster
az aks stop --resource-group <rg> --name <cluster>

# Start AKS cluster
az aks start --resource-group <rg> --name <cluster>
```

## Security

### Best Practices

✅ **Implemented:**
- Managed identities (no service principals)
- Azure AD RBAC for cluster access
- Network policies (Calico)
- Private cluster option (production)
- Key Vault for secrets
- Encrypted storage
- Role-based access control

🔒 **Recommendations:**
- Enable Azure Policy for Kubernetes
- Implement Pod Security Standards
- Use Azure Defender for Containers
- Regular security scanning (Azure Security Center)
- Implement network segmentation
- Enable audit logging

See [SECURITY.md](SECURITY.md) for detailed security configuration.

## Additional Documentation

- [Automation Guide](AUTOMATION.md) - **CI/CD pipelines and full automation setup**
- [Quick Start Guide](QUICKSTART.md) - Get started in 15 minutes
- [Architecture Diagram](ARCHITECTURE.md) - Detailed infrastructure architecture
- [Cost Estimation](COST-ESTIMATION.md) - Detailed cost breakdown and optimization
- [Security Checklist](SECURITY-CHECKLIST.md) - Production security requirements
- [Post-Deployment Validation](POST-DEPLOYMENT.md) - Validation steps and tests
- [Disaster Recovery](../deploy/argocd/DISASTER-RECOVERY.md) - Backup and recovery procedures

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see [LICENSE](../LICENSE) file for details.

## Acknowledgments

- Terraform Azure Provider documentation
- Azure AKS best practices
- Fluxion development team
