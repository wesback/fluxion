variable "cluster_name" {
  description = "Name of the cluster (used for resource naming)"
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

variable "vnet_address_space" {
  description = "Virtual network address space"
  type        = list(string)
}

variable "subnet_address_prefixes" {
  description = "Subnet address prefixes"
  type = object({
    aks_nodes = list(string)
    aks_pods  = list(string)
  })
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
