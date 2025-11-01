#!/bin/bash
# Terraform Backend Setup Script
# This script creates Azure Storage Account for Terraform state management

set -e

# Configuration
RESOURCE_GROUP_NAME="fluxion-tfstate-rg"
STORAGE_ACCOUNT_NAME="fluxiontfstate${RANDOM}"  # Must be globally unique
CONTAINER_NAME="tfstate"
LOCATION="eastus"

echo "🚀 Setting up Terraform backend in Azure..."
echo ""
echo "Resource Group: ${RESOURCE_GROUP_NAME}"
echo "Storage Account: ${STORAGE_ACCOUNT_NAME}"
echo "Container: ${CONTAINER_NAME}"
echo "Location: ${LOCATION}"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first."
    echo "   https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
if ! az account show &> /dev/null; then
    echo "❌ Not logged in to Azure. Running 'az login'..."
    az login
fi

# Get current subscription
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "📋 Using subscription: ${SUBSCRIPTION_ID}"
echo ""

# Create resource group
echo "📦 Creating resource group..."
az group create \
    --name "${RESOURCE_GROUP_NAME}" \
    --location "${LOCATION}" \
    --tags "ManagedBy=Terraform" "Purpose=TerraformState"

# Create storage account
echo "💾 Creating storage account..."
az storage account create \
    --name "${STORAGE_ACCOUNT_NAME}" \
    --resource-group "${RESOURCE_GROUP_NAME}" \
    --location "${LOCATION}" \
    --sku Standard_LRS \
    --encryption-services blob \
    --https-only true \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false

# Get storage account key
ACCOUNT_KEY=$(az storage account keys list \
    --resource-group "${RESOURCE_GROUP_NAME}" \
    --account-name "${STORAGE_ACCOUNT_NAME}" \
    --query '[0].value' -o tsv)

# Create blob container
echo "📂 Creating blob container..."
az storage container create \
    --name "${CONTAINER_NAME}" \
    --account-name "${STORAGE_ACCOUNT_NAME}" \
    --account-key "${ACCOUNT_KEY}"

# Enable versioning for state file protection
echo "🔒 Enabling blob versioning..."
az storage account blob-service-properties update \
    --account-name "${STORAGE_ACCOUNT_NAME}" \
    --resource-group "${RESOURCE_GROUP_NAME}" \
    --enable-versioning true

echo ""
echo "✅ Terraform backend setup complete!"
echo ""
echo "Backend configuration for Terraform:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Create a file named 'backend-config-<environment>.hcl' with:"
echo ""
echo "resource_group_name  = \"${RESOURCE_GROUP_NAME}\""
echo "storage_account_name = \"${STORAGE_ACCOUNT_NAME}\""
echo "container_name       = \"${CONTAINER_NAME}\""
echo "key                  = \"fluxion-<environment>.tfstate\""
echo ""
echo "Then initialize Terraform with:"
echo ""
echo "terraform init -backend-config=backend-config-<environment>.hcl"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
