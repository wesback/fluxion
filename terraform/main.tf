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

  cluster_name                = local.cluster_name
  location                    = var.location
  resource_group_name         = azurerm_resource_group.main.name
  retention_days              = var.log_analytics_retention_days
  aks_cluster_id              = module.aks.cluster_id
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  key_vault_access_object_id  = data.azurerm_client_config.current.object_id
  tags                        = local.common_tags

  depends_on = [azurerm_resource_group.main, module.aks]
}

# AKS Module
module "aks" {
  source = "./modules/aks"

  cluster_name                       = local.cluster_name
  location                           = var.location
  resource_group_name                = azurerm_resource_group.main.name
  kubernetes_version                 = var.kubernetes_version
  enable_private_cluster             = var.enable_private_cluster
  system_node_count                  = var.system_node_count
  system_node_vm_size                = var.system_node_vm_size
  user_node_count_min                = var.user_node_count_min
  user_node_count_max                = var.user_node_count_max
  user_node_vm_size                  = var.user_node_vm_size
  aks_nodes_subnet_id                = module.networking.aks_nodes_subnet_id
  aks_pods_subnet_id                 = module.networking.aks_pods_subnet_id
  vnet_id                            = module.networking.vnet_id
  enable_azure_policy                = var.enable_azure_policy
  enable_http_application_routing    = var.enable_http_application_routing
  enable_oms_agent                   = var.enable_oms_agent
  enable_key_vault_secrets_provider  = var.enable_key_vault_secrets_provider
  enable_azure_ad_rbac               = var.enable_azure_ad_rbac
  log_analytics_workspace_id         = module.monitoring.log_analytics_workspace_id
  acr_id                             = module.acr.acr_id
  tags                               = local.common_tags

  depends_on = [azurerm_resource_group.main, module.networking, module.acr, module.monitoring]
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

# Helm release for ingress-nginx
resource "helm_release" "ingress_nginx" {
  count      = var.install_ingress_nginx ? 1 : 0
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  namespace  = "ingress-nginx"
  version    = "4.8.3"

  create_namespace = true

  set {
    name  = "controller.service.loadBalancerIP"
    value = module.networking.ingress_public_ip
  }

  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/azure-load-balancer-resource-group"
    value = azurerm_resource_group.main.name
  }

  depends_on = [module.aks]
}

# Helm release for cert-manager
resource "helm_release" "cert_manager" {
  count      = var.install_cert_manager ? 1 : 0
  name       = "cert-manager"
  repository = "https://charts.jetstack.io"
  chart      = "cert-manager"
  namespace  = "cert-manager"
  version    = "v1.13.2"

  create_namespace = true

  set {
    name  = "installCRDs"
    value = "true"
  }

  depends_on = [module.aks]
}
