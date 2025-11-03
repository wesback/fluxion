#!/bin/bash
#
# Setup Workload Identity for External Secrets on AKS
#
# This script automates the creation of ServiceAccount and federated credentials
# for AKS Workload Identity integration with Azure Key Vault.
#
# Usage:
#   ./setup-workload-identity.sh \
#     --environment dev \
#     --resource-group fluxion-dev-rg \
#     --cluster fluxion-dev-aks \
#     --identity-name fluxion-keyvault-reader
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
IDENTITY_NAME="fluxion-keyvault-reader"
ENVIRONMENT="${ENVIRONMENT:-dev}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    --cluster)
      CLUSTER_NAME="$2"
      shift 2
      ;;
    --identity-name)
      IDENTITY_NAME="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$RESOURCE_GROUP" ]] || [[ -z "$CLUSTER_NAME" ]]; then
  echo -e "${RED}Error: --resource-group and --cluster are required${NC}"
  echo "Usage: $0 --resource-group <rg> --cluster <cluster> [--environment <env>] [--identity-name <name>]"
  exit 1
fi

SERVICE_ACCOUNT="fluxion-external-secrets-sa"

echo -e "${GREEN}Setting up Workload Identity for External Secrets${NC}"
echo "  Namespace: $ENVIRONMENT"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  AKS Cluster: $CLUSTER_NAME"
echo "  Managed Identity: $IDENTITY_NAME"
echo "  ServiceAccount: $SERVICE_ACCOUNT"
echo ""

# Step 1: Get AKS credentials
echo -e "${YELLOW}Step 1: Getting AKS credentials...${NC}"
az aks get-credentials --resource-group "$RESOURCE_GROUP" --name "$CLUSTER_NAME" --overwrite-existing
echo -e "${GREEN}✓ AKS credentials configured${NC}"
echo ""

# Step 2: Create namespace if it doesn't exist
echo -e "${YELLOW}Step 2: Ensuring namespace exists...${NC}"
kubectl get namespace "$ENVIRONMENT" &>/dev/null || kubectl create namespace "$ENVIRONMENT"
echo -e "${GREEN}✓ Namespace '$ENVIRONMENT' exists${NC}"
echo ""

# Step 3: Create ServiceAccount
echo -e "${YELLOW}Step 3: Creating ServiceAccount...${NC}"
if kubectl get serviceaccount "$SERVICE_ACCOUNT" -n "$ENVIRONMENT" &>/dev/null; then
  echo -e "${GREEN}✓ ServiceAccount already exists${NC}"
else
  kubectl create serviceaccount "$SERVICE_ACCOUNT" -n "$ENVIRONMENT"
  echo -e "${GREEN}✓ ServiceAccount created${NC}"
fi
echo ""

# Step 4: Get managed identity client ID
echo -e "${YELLOW}Step 4: Retrieving managed identity client ID...${NC}"
MANAGED_IDENTITY_CLIENT_ID=$(az identity show \
  --name "$IDENTITY_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query clientId -o tsv)
if [[ -z "$MANAGED_IDENTITY_CLIENT_ID" ]]; then
  echo -e "${RED}Error: Could not retrieve managed identity '$IDENTITY_NAME'${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Managed identity client ID: $MANAGED_IDENTITY_CLIENT_ID${NC}"
echo ""

# Step 5: Add workload identity annotation
echo -e "${YELLOW}Step 5: Adding workload identity annotation...${NC}"
kubectl annotate serviceaccount "$SERVICE_ACCOUNT" \
  -n "$ENVIRONMENT" \
  azure.workload.identity/client-id="$MANAGED_IDENTITY_CLIENT_ID" \
  --overwrite
echo -e "${GREEN}✓ Workload identity annotation added${NC}"
echo ""

# Step 6: Get AKS OIDC issuer URL
echo -e "${YELLOW}Step 6: Retrieving AKS OIDC issuer URL...${NC}"
OIDC_ISSUER=$(az aks show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CLUSTER_NAME" \
  --query "oidcIssuerProfile.issuerUrl" -o tsv)
if [[ -z "$OIDC_ISSUER" ]]; then
  echo -e "${RED}Error: Could not retrieve OIDC issuer URL${NC}"
  exit 1
fi
echo -e "${GREEN}✓ OIDC issuer URL: $OIDC_ISSUER${NC}"
echo ""

# Step 7: Create federated credential
echo -e "${YELLOW}Step 7: Creating federated credential...${NC}"
FEDERATED_CREDENTIAL_NAME="fluxion-keyvault-federated-${ENVIRONMENT}"
SUBJECT="system:serviceaccount:${ENVIRONMENT}:${SERVICE_ACCOUNT}"

# Check if federated credential already exists
if az identity federated-credential show \
  --name "$FEDERATED_CREDENTIAL_NAME" \
  --identity-name "$IDENTITY_NAME" \
  --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  echo -e "${GREEN}✓ Federated credential already exists${NC}"
else
  az identity federated-credential create \
    --name "$FEDERATED_CREDENTIAL_NAME" \
    --identity-name "$IDENTITY_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --issuer "$OIDC_ISSUER" \
    --subject "$SUBJECT"
  echo -e "${GREEN}✓ Federated credential created${NC}"
fi
echo ""

# Step 8: Verification
echo -e "${YELLOW}Step 8: Verifying setup...${NC}"
echo -e "${YELLOW}  Checking ServiceAccount annotation:${NC}"
kubectl get serviceaccount "$SERVICE_ACCOUNT" -n "$ENVIRONMENT" -o yaml | grep -A 1 "azure.workload" || echo "    (annotation will be applied on next sync)"

echo ""
echo -e "${GREEN}✓ Workload Identity setup completed successfully!${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Restart external-secrets operator to pick up the new ServiceAccount:"
echo "     kubectl rollout restart deployment/external-secrets -n external-secrets-system"
echo ""
echo "  2. Verify SecretStore is ready:"
echo "     kubectl get secretstore -n $ENVIRONMENT"
echo ""
echo "  3. Check ExternalSecret status:"
echo "     kubectl get externalsecret -n $ENVIRONMENT"
echo ""
