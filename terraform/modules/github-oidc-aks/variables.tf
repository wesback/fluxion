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
