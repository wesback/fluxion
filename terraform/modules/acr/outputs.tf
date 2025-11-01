output "acr_id" {
  description = "ACR resource ID"
  value       = azurerm_container_registry.main.id
}

output "acr_name" {
  description = "ACR name"
  value       = azurerm_container_registry.main.name
}

output "acr_login_server" {
  description = "ACR login server URL"
  value       = azurerm_container_registry.main.login_server
}

output "backup_storage_account_name" {
  description = "Backup storage account name"
  value       = azurerm_storage_account.backups.name
}

output "backup_storage_container_name" {
  description = "Backup storage container name"
  value       = azurerm_storage_container.backups.name
}
