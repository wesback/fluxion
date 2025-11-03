# GitHub OIDC + AKS Role Assignments - Terraform Module

## Overview

This Terraform module automates the setup of GitHub Actions OIDC federation with Azure AKS. Instead of managing role assignments manually, they are now declaratively managed as infrastructure code.

## What It Does

The module creates Azure role assignments for the GitHub Actions federated service principal:

1. **Azure Kubernetes Service Cluster User Role** - Allows getting AKS credentials
2. **Azure Kubernetes Service Cluster Admin Role** - Allows managing AKS resources (RBAC, secrets)
3. **AcrPull** (optional) - Allows pulling images from ACR
4. **AcrPush** (optional) - Allows pushing images to ACR

## Usage

The module is automatically invoked in `terraform/main.tf`:

```hcl
module "github_oidc_aks" {
  source = "./modules/github-oidc-aks"

  github_actions_app_name = var.github_actions_app_name
  aks_cluster_id          = module.aks.cluster_id
  acr_id                  = module.acr.acr_id
}
```

## Configuration

### Variables

```hcl
variable "github_actions_app_name" {
  description = "Display name of the GitHub Actions federated service principal"
  type        = string
  default     = "github-fluxion-1762084983"
}

variable "aks_cluster_id" {
  description = "Resource ID of the AKS cluster"
  type        = string
}

variable "acr_id" {
  description = "Resource ID of the Azure Container Registry (optional)"
  type        = string
  default     = ""
}
```

## Deployment

Apply the Terraform configuration to set up the role assignments:

```bash
cd terraform/
terraform apply
```

This is a one-time setup that ensures:
- GitHub Actions can authenticate to AKS
- GitHub Actions can deploy and manage Kubernetes resources
- GitHub Actions can push images to ACR
- All role assignments are tracked in your Terraform state

## Manual Setup (Already Done)

The role assignments have been manually created via Azure CLI:

```bash
az role assignment create \
  --assignee dc92424c-d019-45b4-9539-0def7798aa00 \
  --role "Azure Kubernetes Service Cluster User Role" \
  --scope /subscriptions/.../resourceGroups/fluxion-dev-rg/providers/Microsoft.ContainerService/managedClusters/fluxion-dev-aks

az role assignment create \
  --assignee dc92424c-d019-45b4-9539-0def7798aa00 \
  --role "Azure Kubernetes Service Cluster Admin Role" \
  --scope /subscriptions/.../resourceGroups/fluxion-dev-rg/providers/Microsoft.ContainerService/managedClusters/fluxion-dev-aks
```

This Terraform module codifies these manual steps for future environments or redeployments.

## References

- [Azure Kubernetes Service Cluster User Role](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#azure-kubernetes-service-cluster-user-role)
- [Azure Kubernetes Service Cluster Admin Role](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#azure-kubernetes-service-cluster-admin-role)
- [GitHub Actions - OIDC with Azure](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
