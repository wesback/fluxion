#!/bin/bash
# Quick fix script for GitHub Actions RBAC permissions
# This grants your GitHub Actions service principal cluster admin access

set -e

echo "🔧 GitHub Actions RBAC Permission Fix"
echo "======================================="
echo ""

# Configuration
SUBSCRIPTION_ID="${1:-}"
SP_OBJECT_ID="dc92424c-d019-45b4-9539-0def7798aa00"
RESOURCE_GROUP="fluxion-dev-rg"
CLUSTER_NAME="fluxion-dev-aks"

# Validate subscription ID
if [ -z "$SUBSCRIPTION_ID" ]; then
    echo "❌ Error: Subscription ID is required"
    echo ""
    echo "Usage: $0 <SUBSCRIPTION_ID>"
    echo ""
    echo "Example:"
    echo "  $0 12345678-1234-1234-1234-123456789012"
    echo ""
    echo "To find your subscription ID:"
    echo "  az account list --output table"
    exit 1
fi

echo "Configuration:"
echo "  Subscription ID: $SUBSCRIPTION_ID"
echo "  Service Principal: $SP_OBJECT_ID"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Cluster: $CLUSTER_NAME"
echo ""

# Construct the scope
SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.ContainerService/managedClusters/$CLUSTER_NAME"

echo "Granting cluster admin role..."
echo "Scope: $SCOPE"
echo ""

# Grant the role
az role assignment create \
  --role "Azure Kubernetes Service Cluster Admin Role" \
  --assignee "$SP_OBJECT_ID" \
  --scope "$SCOPE"

echo ""
echo "✅ Role assignment created successfully!"
echo ""
echo "Verifying role assignment..."

# Verify the role assignment
az role assignment list \
  --assignee "$SP_OBJECT_ID" \
  --scope "$SCOPE" \
  --output table

echo ""
echo "✅ GitHub Actions service principal now has cluster admin access!"
echo ""
echo "Next steps:"
echo "  1. Re-run your GitHub Actions workflow"
echo "  2. The workflow should now have permission to create secrets and resources"
echo ""
echo "To test manually:"
echo "  1. Get fresh AKS credentials: az aks get-credentials --resource-group $RESOURCE_GROUP --name $CLUSTER_NAME"
echo "  2. Check permissions: kubectl auth whoami"
echo "  3. Create a test secret: kubectl create secret generic test --from-literal=test=value -n cert-manager --dry-run=client"
