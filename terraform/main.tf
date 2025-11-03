# Get current Azure client configuration
data "azurerm_client_config" "current" {}

# Local variables
locals {
  resource_group_name = var.resource_group_name != "" ? var.resource_group_name : "fluxion-${var.environment}-rg"
  cluster_name        = var.cluster_name != "" ? var.cluster_name : "fluxion-${var.environment}-aks"

  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Project     = "Fluxion"
    }
  )
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = local.resource_group_name
  location = var.location
  tags     = local.common_tags
}

# Networking Module
module "networking" {
  source = "./modules/networking"

  cluster_name            = local.cluster_name
  location                = var.location
  resource_group_name     = azurerm_resource_group.main.name
  vnet_address_space      = var.vnet_address_space
  subnet_address_prefixes = var.subnet_address_prefixes
  tags                    = local.common_tags

  depends_on = [azurerm_resource_group.main]
}

# ACR Module
module "acr" {
  source = "./modules/acr"

  cluster_name        = local.cluster_name
  location            = var.location
  resource_group_name = azurerm_resource_group.main.name
  acr_sku             = var.acr_sku
  acr_admin_enabled   = var.acr_admin_enabled
  tags                = local.common_tags

  depends_on = [azurerm_resource_group.main]
}

# Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"

  cluster_name               = local.cluster_name
  location                   = var.location
  resource_group_name        = azurerm_resource_group.main.name
  retention_days             = var.log_analytics_retention_days
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  key_vault_access_object_id = data.azurerm_client_config.current.object_id
  tags                       = local.common_tags

  depends_on = [azurerm_resource_group.main]
}

# AKS Module
module "aks" {
  source = "./modules/aks"

  cluster_name                      = local.cluster_name
  location                          = var.location
  resource_group_name               = azurerm_resource_group.main.name
  kubernetes_version                = var.kubernetes_version
  enable_private_cluster            = var.enable_private_cluster
  system_node_count                 = var.system_node_count
  system_node_count_min             = var.system_node_count_min
  system_node_count_max             = var.system_node_count_max
  system_node_vm_size               = var.system_node_vm_size
  user_node_count_min               = var.user_node_count_min
  user_node_count_max               = var.user_node_count_max
  user_node_vm_size                 = var.user_node_vm_size
  aks_nodes_subnet_id               = module.networking.aks_nodes_subnet_id
  aks_pods_subnet_id                = module.networking.aks_pods_subnet_id
  vnet_id                           = module.networking.vnet_id
  enable_azure_policy               = var.enable_azure_policy
  enable_http_application_routing   = var.enable_http_application_routing
  enable_oms_agent                  = var.enable_oms_agent
  enable_key_vault_secrets_provider = var.enable_key_vault_secrets_provider
  enable_azure_ad_rbac              = var.enable_azure_ad_rbac
  log_analytics_workspace_id        = module.monitoring.log_analytics_workspace_id
  acr_id                            = module.acr.acr_id
  enable_acr_pull_role              = var.enable_acr_pull_role
  tags                              = local.common_tags

  depends_on = [azurerm_resource_group.main, module.networking, module.acr, module.monitoring]
}

# AKS Diagnostic Settings - created here to avoid circular dependency
resource "azurerm_monitor_diagnostic_setting" "aks" {
  name                       = "${local.cluster_name}-aks-diagnostics"
  target_resource_id         = module.aks.cluster_id
  log_analytics_workspace_id = module.monitoring.log_analytics_workspace_id

  enabled_log {
    category = "kube-apiserver"
  }

  enabled_log {
    category = "kube-controller-manager"
  }

  enabled_log {
    category = "kube-scheduler"
  }

  enabled_log {
    category = "kube-audit"
  }

  enabled_log {
    category = "cluster-autoscaler"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }

  depends_on = [module.aks, module.monitoring]
}

# Key Vault access policy for AKS secrets provider
resource "azurerm_key_vault_access_policy" "aks_secrets_provider" {
  count        = var.enable_key_vault_secrets_provider ? 1 : 0
  key_vault_id = module.monitoring.key_vault_id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = module.aks.key_vault_secrets_provider_identity

  secret_permissions = [
    "Get",
  ]
}

# GitHub OIDC + AKS Role Assignments
module "github_oidc_aks" {
  source = "./modules/github-oidc-aks"

  github_actions_app_name = var.github_actions_app_name
  aks_cluster_id          = module.aks.cluster_id
  acr_id                  = module.acr.acr_id

  depends_on = [module.aks, module.acr]
}
