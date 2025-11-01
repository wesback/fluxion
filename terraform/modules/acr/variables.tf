variable "cluster_name" {
  description = "Name of the cluster (used for ACR naming)"
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

variable "acr_sku" {
  description = "ACR SKU"
  type        = string
}

variable "acr_admin_enabled" {
  description = "Enable ACR admin account"
  type        = bool
}

variable "geo_replication_locations" {
  description = "Locations for ACR geo-replication (Premium only)"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
