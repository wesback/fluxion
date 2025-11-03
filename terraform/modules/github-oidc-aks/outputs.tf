output "github_actions_principal_id" {
  description = "Object ID of the GitHub Actions service principal"
  value       = data.azurerm_service_principal.github_actions.object_id
}

output "github_actions_app_id" {
  description = "App ID of the GitHub Actions service principal"
  value       = data.azurerm_service_principal.github_actions.app_id
}
