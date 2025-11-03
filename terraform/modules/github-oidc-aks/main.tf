# GitHub OIDC Federation with Azure - AKS Role Assignments
#
# This module sets up OIDC federation between GitHub Actions and Azure,
# and assigns necessary AKS roles to the GitHub Actions service principal

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

# Get the GitHub Actions federated service principal
data "azurerm_service_principal" "github_actions" {
  display_name = var.github_actions_app_name
}

# Assign AKS Cluster User Role to GitHub Actions
resource "azurerm_role_assignment" "aks_cluster_user" {
  scope              = var.aks_cluster_id
  role_definition_name = "Azure Kubernetes Service Cluster User Role"
  principal_id       = data.azurerm_service_principal.github_actions.object_id
}

# Assign AKS Cluster Admin Role to GitHub Actions
resource "azurerm_role_assignment" "aks_cluster_admin" {
  scope              = var.aks_cluster_id
  role_definition_name = "Azure Kubernetes Service Cluster Admin Role"
  principal_id       = data.azurerm_service_principal.github_actions.object_id
}

# Assign ACR Pull role to GitHub Actions (for reading images)
resource "azurerm_role_assignment" "acr_pull" {
  count              = var.acr_id != "" ? 1 : 0
  scope              = var.acr_id
  role_definition_name = "AcrPull"
  principal_id       = data.azurerm_service_principal.github_actions.object_id
}

# Assign ACR Push role to GitHub Actions (for pushing images)
resource "azurerm_role_assignment" "acr_push" {
  count              = var.acr_id != "" ? 1 : 0
  scope              = var.acr_id
  role_definition_name = "AcrPush"
  principal_id       = data.azurerm_service_principal.github_actions.object_id
}
