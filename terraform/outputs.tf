# Resource Group Outputs
output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "resource_group_location" {
  description = "Location of the resource group"
  value       = azurerm_resource_group.main.location
}

# Cluster Outputs
output "cluster_id" {
  description = "AKS cluster ID"
  value       = module.aks.cluster_id
}

output "cluster_name" {
  description = "AKS cluster name"
  value       = module.aks.cluster_name
}

output "cluster_fqdn" {
  description = "AKS cluster FQDN"
  value       = module.aks.cluster_fqdn
}

output "kube_config" {
  description = "Kubernetes configuration (use 'terraform output -raw kube_config > kubeconfig')"
  value       = module.aks.kube_config
  sensitive   = true
}

output "node_resource_group" {
  description = "Resource group containing AKS nodes"
  value       = module.aks.node_resource_group
}

# ACR Outputs
output "acr_id" {
  description = "Azure Container Registry ID"
  value       = module.acr.acr_id
}

output "acr_name" {
  description = "Azure Container Registry name"
  value       = module.acr.acr_name
}

output "acr_login_server" {
  description = "Azure Container Registry login server URL"
  value       = module.acr.acr_login_server
}

# Networking Outputs
output "vnet_id" {
  description = "Virtual network ID"
  value       = module.networking.vnet_id
}

output "vnet_name" {
  description = "Virtual network name"
  value       = module.networking.vnet_name
}

output "subnet_ids" {
  description = "Map of subnet IDs"
  value = {
    aks_nodes = module.networking.aks_nodes_subnet_id
    aks_pods  = module.networking.aks_pods_subnet_id
  }
}

output "ingress_public_ip" {
  description = "Public IP address for ingress controller"
  value       = module.networking.ingress_public_ip
}

# Monitoring Outputs
output "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID"
  value       = module.monitoring.log_analytics_workspace_id
}

output "log_analytics_workspace_name" {
  description = "Log Analytics workspace name"
  value       = module.monitoring.log_analytics_workspace_name
}

output "key_vault_id" {
  description = "Key Vault ID"
  value       = module.monitoring.key_vault_id
}

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = module.monitoring.key_vault_uri
}

# Backup Outputs
output "backup_storage_account_name" {
  description = "Backup storage account name"
  value       = module.acr.backup_storage_account_name
}

# Connection Commands
output "get_credentials_command" {
  description = "Command to get AKS credentials"
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.main.name} --name ${module.aks.cluster_name} --admin"
}

output "acr_login_command" {
  description = "Command to login to ACR"
  value       = "az acr login --name ${module.acr.acr_name}"
}
