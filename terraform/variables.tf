# Core variables
variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "swedencentral"
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = ""
}

variable "cluster_name" {
  description = "Name of the AKS cluster"
  type        = string
  default     = ""
}

variable "kubernetes_version" {
  description = "Kubernetes version for the AKS cluster"
  type        = string
  default     = "1.28"
}

# Networking variables
variable "vnet_address_space" {
  description = "Address space for the virtual network"
  type        = list(string)
  default     = ["10.0.0.0/16"]
}

variable "subnet_address_prefixes" {
  description = "Address prefixes for subnets"
  type = object({
    aks_nodes = list(string)
    aks_pods  = list(string)
  })
  default = {
    aks_nodes = ["10.0.1.0/24"]
    aks_pods  = ["10.0.2.0/23"]
  }
}

variable "enable_private_cluster" {
  description = "Enable private cluster (no public API endpoint)"
  type        = bool
  default     = false
}

# Node pool variables
variable "system_node_count" {
  description = "Initial number of nodes in system node pool (ignored when autoscaling is enabled)"
  type        = number
  default     = 2
}

variable "system_node_count_min" {
  description = "Minimum number of nodes in system node pool"
  type        = number
  default     = 2
}

variable "system_node_count_max" {
  description = "Maximum number of nodes in system node pool"
  type        = number
  default     = 5
}

variable "system_node_vm_size" {
  description = "VM size for system node pool"
  type        = string
  default     = "Standard_D2s_v3"
}

variable "user_node_count_min" {
  description = "Minimum number of nodes in user node pool"
  type        = number
  default     = 2
}

variable "user_node_count_max" {
  description = "Maximum number of nodes in user node pool"
  type        = number
  default     = 4
}

variable "user_node_vm_size" {
  description = "VM size for user node pool"
  type        = string
  default     = "Standard_D4s_v3"
}

# Feature flags
variable "enable_azure_policy" {
  description = "Enable Azure Policy for AKS"
  type        = bool
  default     = false
}

variable "enable_http_application_routing" {
  description = "Enable HTTP application routing (deprecated, not recommended)"
  type        = bool
  default     = false
}

variable "enable_oms_agent" {
  description = "Enable OMS agent for container monitoring"
  type        = bool
  default     = true
}

variable "enable_key_vault_secrets_provider" {
  description = "Enable Key Vault secrets provider"
  type        = bool
  default     = true
}

variable "enable_azure_ad_rbac" {
  description = "Enable Azure AD RBAC for Kubernetes"
  type        = bool
  default     = true
}

# ACR variables
variable "acr_sku" {
  description = "ACR SKU (Basic, Standard, Premium)"
  type        = string
  default     = "Standard"
  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.acr_sku)
    error_message = "ACR SKU must be Basic, Standard, or Premium."
  }
}

variable "acr_admin_enabled" {
  description = "Enable ACR admin account (not recommended, use managed identity)"
  type        = bool
  default     = false
}

variable "enable_acr_pull_role" {
  description = "Enable AcrPull role assignment for AKS kubelet identity"
  type        = bool
  default     = true
}

# Monitoring variables
variable "log_analytics_retention_days" {
  description = "Log Analytics workspace retention in days"
  type        = number
  default     = 30
}

# Tags
variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
