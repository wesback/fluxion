resource "azurerm_container_registry" "main" {
  name                = replace("${var.cluster_name}acr", "-", "")
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = var.acr_sku
  admin_enabled       = var.acr_admin_enabled

  identity {
    type = "SystemAssigned"
  }

  dynamic "georeplications" {
    for_each = var.acr_sku == "Premium" ? var.geo_replication_locations : []
    content {
      location = georeplications.value
      tags     = var.tags
    }
  }

  tags = var.tags
}

# Storage account for backups
resource "azurerm_storage_account" "backups" {
  name                     = replace("${var.cluster_name}backup", "-", "")
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  
  blob_properties {
    versioning_enabled = true
    
    delete_retention_policy {
      days = 30
    }
  }

  tags = var.tags
}

resource "azurerm_storage_container" "backups" {
  name                  = "aks-backups"
  storage_account_name  = azurerm_storage_account.backups.name
  container_access_type = "private"
}
