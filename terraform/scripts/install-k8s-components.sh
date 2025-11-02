#!/bin/bash
set -e

# Post-deployment script for installing Kubernetes infrastructure components
# This script installs core infrastructure (ingress-nginx, cert-manager) and ArgoCD
# after the AKS cluster is ready, preparing it for GitOps application deployment.
#
# Usage:
#   ./scripts/install-k8s-components.sh <environment> [--skip-argocd]
#
# Examples:
#   ./scripts/install-k8s-components.sh dev              # Install everything
#   ./scripts/install-k8s-components.sh dev --skip-argocd  # Infrastructure only
#
# What gets installed:
#   1. cert-manager (TLS certificate management)
#   2. ingress-nginx (Ingress controller)
#   3. ArgoCD (GitOps operator) - unless --skip-argocd is specified

ENVIRONMENT=${1:-dev}
SKIP_ARGOCD=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --skip-argocd)
      SKIP_ARGOCD=true
      shift
      ;;
  esac
done
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Installing Kubernetes Components for ${ENVIRONMENT} ===${NC}"

# Check if we're in the terraform directory
cd "$TERRAFORM_DIR" || exit 1

# Get cluster information from Terraform outputs
echo -e "\n${YELLOW}→ Getting cluster information...${NC}"
RESOURCE_GROUP=$(terraform output -raw resource_group_name 2>/dev/null || echo "fluxion-${ENVIRONMENT}-rg")
CLUSTER_NAME=$(terraform output -raw cluster_name 2>/dev/null || echo "fluxion-${ENVIRONMENT}-aks")
INGRESS_IP=$(terraform output -raw ingress_public_ip 2>/dev/null)

echo "  Resource Group: $RESOURCE_GROUP"
echo "  Cluster Name: $CLUSTER_NAME"
echo "  Ingress IP: $INGRESS_IP"

# Get AKS credentials
echo -e "\n${YELLOW}→ Configuring kubectl access...${NC}"
az aks get-credentials \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CLUSTER_NAME" \
  --overwrite-existing \
  --admin

# Verify cluster access
echo -e "\n${YELLOW}→ Verifying cluster access...${NC}"
if ! kubectl cluster-info &>/dev/null; then
  echo -e "${RED}✗ Failed to connect to cluster${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Cluster is accessible${NC}"

# Install cert-manager
echo -e "\n${YELLOW}→ Installing cert-manager...${NC}"
if helm list -n cert-manager 2>/dev/null | grep -q cert-manager; then
  echo -e "${GREEN}✓ cert-manager is already installed${NC}"
else
  kubectl create namespace cert-manager --dry-run=client -o yaml | kubectl apply -f -
  
  helm repo add jetstack https://charts.jetstack.io --force-update
  helm repo update
  
  helm install cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --version v1.13.2 \
    --set installCRDs=true \
    --wait \
    --timeout 5m
  
  echo -e "${GREEN}✓ cert-manager installed successfully${NC}"
fi

# Install ingress-nginx
echo -e "\n${YELLOW}→ Installing ingress-nginx...${NC}"
if helm list -n ingress-nginx 2>/dev/null | grep -q ingress-nginx; then
  echo -e "${GREEN}✓ ingress-nginx is already installed${NC}"
else
  kubectl create namespace ingress-nginx --dry-run=client -o yaml | kubectl apply -f -
  
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx --force-update
  helm repo update
  
  # Build helm install command
  HELM_CMD="helm install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx \
    --version 4.8.3 \
    --set controller.service.annotations.\"service\.beta\.kubernetes\.io/azure-load-balancer-resource-group\"=$RESOURCE_GROUP"
  
  # Add loadBalancerIP if available
  if [ -n "$INGRESS_IP" ]; then
    HELM_CMD="$HELM_CMD --set controller.service.loadBalancerIP=$INGRESS_IP"
  fi
  
  # Install without waiting (LoadBalancer can take time)
  eval "$HELM_CMD"
  
  echo -e "${GREEN}✓ ingress-nginx installed successfully${NC}"
  echo -e "${YELLOW}  Note: LoadBalancer IP assignment may take a few minutes${NC}"
fi

# Verification
echo -e "\n${YELLOW}→ Verifying infrastructure installations...${NC}"

# Check cert-manager pods
echo -e "\n  cert-manager pods:"
kubectl get pods -n cert-manager

# Check ingress-nginx pods
echo -e "\n  ingress-nginx pods:"
kubectl get pods -n ingress-nginx

# Check ingress service
echo -e "\n  ingress-nginx service:"
kubectl get svc -n ingress-nginx ingress-nginx-controller

# Install ArgoCD (unless --skip-argocd flag is set)
if [ "$SKIP_ARGOCD" = false ]; then
  echo -e "\n${YELLOW}→ Installing ArgoCD...${NC}"
  
  if kubectl get namespace argocd &>/dev/null; then
    echo -e "${GREEN}✓ ArgoCD namespace already exists${NC}"
  else
    kubectl create namespace argocd
  fi
  
  # Check if ArgoCD is already installed
  if kubectl get deployment argocd-server -n argocd &>/dev/null; then
    echo -e "${GREEN}✓ ArgoCD is already installed${NC}"
  else
    # Install ArgoCD
    kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
    
    echo -e "${YELLOW}  Waiting for ArgoCD to be ready (this may take 2-3 minutes)...${NC}"
    
    # Wait for ArgoCD components to be ready
    kubectl wait --for=condition=available --timeout=300s \
      deployment/argocd-server \
      deployment/argocd-repo-server \
      deployment/argocd-applicationset-controller \
      -n argocd
    
    echo -e "${GREEN}✓ ArgoCD installed successfully${NC}"
  fi
  
  # Get ArgoCD admin password
  echo -e "\n${YELLOW}→ Retrieving ArgoCD credentials...${NC}"
  
  # Wait for secret to exist
  for i in {1..30}; do
    if kubectl get secret argocd-initial-admin-secret -n argocd &>/dev/null; then
      break
    fi
    sleep 2
  done
  
  ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" 2>/dev/null | base64 -d)
  
  if [ -n "$ARGOCD_PASSWORD" ]; then
    echo -e "${GREEN}✓ ArgoCD admin password retrieved${NC}"
    echo -e "\n${YELLOW}ArgoCD Credentials:${NC}"
    echo "  Username: admin"
    echo "  Password: $ARGOCD_PASSWORD"
    echo ""
    echo -e "${YELLOW}Access ArgoCD UI:${NC}"
    echo "  1. Port-forward: kubectl port-forward svc/argocd-server -n argocd 8080:443"
    echo "  2. Open browser: https://localhost:8080"
    echo "  3. Login with credentials above"
    echo ""
    echo -e "${YELLOW}Or use ArgoCD CLI:${NC}"
    echo "  argocd login localhost:8080 --username admin --password '$ARGOCD_PASSWORD' --insecure"
  fi
  
  # Check ArgoCD pods
  echo -e "\n${YELLOW}→ Verifying ArgoCD installation...${NC}"
  echo -e "\n  ArgoCD pods:"
  kubectl get pods -n argocd
else
  echo -e "\n${YELLOW}⊗ Skipping ArgoCD installation (--skip-argocd flag set)${NC}"
fi

echo -e "\n${GREEN}=== Installation Complete ===${NC}"

# Summary of what was installed
echo -e "\n${YELLOW}Installed components:${NC}"
echo "  ✓ cert-manager v1.13.2 (TLS certificate management)"
echo "  ✓ ingress-nginx v4.8.3 (Ingress controller)"
if [ "$SKIP_ARGOCD" = false ]; then
  echo "  ✓ ArgoCD (GitOps operator)"
fi

echo -e "\n${YELLOW}Next steps:${NC}"
echo "  1. Wait for LoadBalancer external IP (may take 2-3 minutes):"
echo "     kubectl get svc -n ingress-nginx ingress-nginx-controller -w"
echo ""

if [ "$SKIP_ARGOCD" = false ]; then
  # Check if ArgoCD app-of-apps exists in the repo
  if [ -d "$TERRAFORM_DIR/../deploy/argocd" ]; then
    echo "  2. Deploy applications using ArgoCD app-of-apps pattern:"
    echo "     cd $TERRAFORM_DIR/../deploy/argocd"
    echo "     kubectl apply -f projects/fluxion-project.yaml"
    echo "     kubectl apply -f root-app.yaml"
    echo ""
    echo "  3. Monitor ArgoCD applications:"
    echo "     kubectl get applications -n argocd"
    echo "     # Or use the ArgoCD UI at https://localhost:8080"
  else
    echo "  2. Deploy your applications using ArgoCD:"
    echo "     kubectl apply -f your-application.yaml"
  fi
else
  echo "  2. Install ArgoCD manually if needed:"
  echo "     cd $TERRAFORM_DIR/../deploy/argocd"
  echo "     kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml"
  echo ""
  echo "  3. Deploy your applications using Helm or kubectl"
fi

echo ""
echo "  Final: Configure DNS to point to the LoadBalancer IP"

