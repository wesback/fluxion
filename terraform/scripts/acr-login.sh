#!/bin/bash
# ACR Login Helper Script
# This script authenticates with Azure Container Registry

set -e

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed."
    exit 1
fi

# Parse arguments
ENVIRONMENT=${1:-dev}

if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "Usage: $0 <environment>"
    echo "  environment: dev, staging, or production"
    exit 1
fi

echo "🔐 Logging in to Azure Container Registry..."
echo ""

# Get ACR name from Terraform output
cd "$(dirname "$0")/.."
ACR_NAME=$(terraform output -raw acr_name 2>/dev/null || echo "fluxion${ENVIRONMENT}acr")
ACR_LOGIN_SERVER=$(terraform output -raw acr_login_server 2>/dev/null || echo "${ACR_NAME}.azurecr.io")

echo "ACR Name: ${ACR_NAME}"
echo "ACR Login Server: ${ACR_LOGIN_SERVER}"
echo ""

# Login to ACR
az acr login --name "${ACR_NAME}"

echo ""
echo "✅ Successfully logged in to ACR!"
echo ""
echo "You can now push/pull images:"
echo "  docker tag myimage:latest ${ACR_LOGIN_SERVER}/myimage:latest"
echo "  docker push ${ACR_LOGIN_SERVER}/myimage:latest"
echo ""
echo "For AKS integration, the cluster already has pull permissions via managed identity."
