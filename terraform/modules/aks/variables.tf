variable "cluster_name" {
  description = "Name of the AKS cluster"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
}

variable "enable_private_cluster" {
  description = "Enable private cluster"
  type        = bool
}

variable "system_node_count" {
  description = "Number of nodes in system pool"
  type        = number
}

variable "system_node_vm_size" {
  description = "VM size for system pool"
  type        = string
}

variable "user_node_count_min" {
  description = "Minimum nodes in user pool"
  type        = number
}

variable "user_node_count_max" {
  description = "Maximum nodes in user pool"
  type        = number
}

variable "user_node_vm_size" {
  description = "VM size for user pool"
  type        = string
}

variable "aks_nodes_subnet_id" {
  description = "Subnet ID for AKS nodes"
  type        = string
}

variable "aks_pods_subnet_id" {
  description = "Subnet ID for AKS pods"
  type        = string
}

variable "vnet_id" {
  description = "Virtual network ID"
  type        = string
}

variable "enable_azure_policy" {
  description = "Enable Azure Policy"
  type        = bool
}

variable "enable_http_application_routing" {
  description = "Enable HTTP application routing"
  type        = bool
}

variable "enable_oms_agent" {
  description = "Enable OMS agent"
  type        = bool
}

variable "enable_key_vault_secrets_provider" {
  description = "Enable Key Vault secrets provider"
  type        = bool
}

variable "enable_azure_ad_rbac" {
  description = "Enable Azure AD RBAC"
  type        = bool
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID"
  type        = string
  default     = ""
}

variable "acr_id" {
  description = "Azure Container Registry ID"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
