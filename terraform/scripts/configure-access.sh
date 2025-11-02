#!/bin/bash
# AKS Cluster Access Configuration Script
# This script configures kubectl to access the AKS cluster

set -e

# Check if required tools are installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed."
    exit 1
fi

if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed."
    exit 1
fi

# Parse arguments
ENVIRONMENT=${1:-dev}
ADMIN_ACCESS=${2:-false}

if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "Usage: $0 <environment> [admin]"
    echo "  environment: dev, staging, or production"
    echo "  admin: true to get admin credentials (optional, default: false)"
    exit 1
fi

echo "🔧 Configuring kubectl access to fluxion-${ENVIRONMENT}-aks..."
echo ""

# Get resource group and cluster name from Terraform output
cd "$(dirname "$0")/.."
RESOURCE_GROUP=$(terraform output -raw resource_group_name 2>/dev/null || echo "fluxion-${ENVIRONMENT}-rg")
CLUSTER_NAME=$(terraform output -raw cluster_name 2>/dev/null || echo "fluxion-${ENVIRONMENT}-aks")

echo "Resource Group: ${RESOURCE_GROUP}"
echo "Cluster Name: ${CLUSTER_NAME}"
echo ""

# Get credentials
if [ "$ADMIN_ACCESS" = "true" ] || [ "$ADMIN_ACCESS" = "admin" ]; then
    echo "📥 Getting admin credentials..."
    az aks get-credentials \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${CLUSTER_NAME}" \
        --admin \
        --overwrite-existing
else
    echo "📥 Getting user credentials..."
    az aks get-credentials \
        --resource-group "${RESOURCE_GROUP}" \
        --name "${CLUSTER_NAME}" \
        --overwrite-existing
fi

echo ""
echo "✅ kubectl configured successfully!"
echo ""
echo "Testing cluster access..."
kubectl cluster-info
echo ""
kubectl get nodes
echo ""
echo "Current context: $(kubectl config current-context)"
