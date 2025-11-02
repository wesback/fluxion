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

# Initialize Terraform with remote state
echo "Initializing Terraform..."
terraform init -backend-config=backend-config-${ENVIRONMENT}.hcl > /dev/null 2>&1

ACR_NAME=$(terraform output -raw acr_name 2>/dev/null || echo "")
ACR_LOGIN_SERVER=$(terraform output -raw acr_login_server 2>/dev/null || echo "")

if [ -z "$ACR_NAME" ]; then
    echo "❌ Could not get ACR name from Terraform."
    echo "   Make sure backend-config-${ENVIRONMENT}.hcl is configured correctly."
    exit 1
fi

echo "ACR Name: ${ACR_NAME}"
echo "ACR Login Server: ${ACR_LOGIN_SERVER}"
echo ""

# Try Docker login first
if command -v docker &> /dev/null && docker info > /dev/null 2>&1; then
    echo "🐳 Attempting Docker login..."
    if az acr login --name "${ACR_NAME}"; then
        echo ""
        echo "✅ Successfully logged in to ACR!"
        echo ""
    else
        echo "❌ Docker login failed. See alternatives below."
    fi
else
    echo "⚠️  Docker is not running or not installed."
fi

echo ""
echo "Alternative methods:"
echo ""
echo "1️⃣  Get a refresh token (no Docker required):"
echo "    az acr login -n ${ACR_NAME} --expose-token"
echo ""
echo "2️⃣  For Docker commands:"
echo "    docker tag myimage:latest ${ACR_LOGIN_SERVER}/myimage:latest"
echo "    docker push ${ACR_LOGIN_SERVER}/myimage:latest"
echo ""
echo "3️⃣  For AKS integration:"
echo "    The cluster already has pull permissions via managed identity."
