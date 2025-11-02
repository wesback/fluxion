output "vnet_id" {
  description = "Virtual network ID"
  value       = azurerm_virtual_network.main.id
}

output "vnet_name" {
  description = "Virtual network name"
  value       = azurerm_virtual_network.main.name
}

output "aks_nodes_subnet_id" {
  description = "AKS nodes subnet ID"
  value       = azurerm_subnet.aks_nodes.id
}

output "aks_pods_subnet_id" {
  description = "AKS pods subnet ID"
  value       = azurerm_subnet.aks_pods.id
}

output "ingress_public_ip" {
  description = "Public IP address for ingress"
  value       = azurerm_public_ip.ingress.ip_address
}

output "ingress_public_ip_id" {
  description = "Public IP ID for ingress"
  value       = azurerm_public_ip.ingress.id
}
