#!/bin/bash
# ArgoCD Bootstrap Validation Script
# This script validates the ArgoCD bootstrap setup for Fluxion

set -e

echo "================================================"
echo "ArgoCD Bootstrap Validation for Fluxion"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1 (missing)"
        return 1
    fi
}

# Function to validate YAML syntax
validate_yaml() {
    if python3 -c "import yaml; yaml.safe_load(open('$1'))" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Valid YAML: $1"
        return 0
    else
        echo -e "${RED}✗${NC} Invalid YAML: $1"
        return 1
    fi
}

ERRORS=0

# Check directory structure
echo "Checking directory structure..."
echo "----------------------------------------------"
check_file "deploy/argocd/root-app.yaml" || ((ERRORS++))
check_file "deploy/argocd/bootstrap/README.md" || ((ERRORS++))
check_file "deploy/argocd/bootstrap/argocd-install.yaml" || ((ERRORS++))
check_file "deploy/argocd/projects/fluxion-project.yaml" || ((ERRORS++))
echo ""

# Check documentation
echo "Checking documentation..."
echo "----------------------------------------------"
check_file "deploy/argocd/ARGOCD-INSTALLATION.md" || ((ERRORS++))
check_file "deploy/argocd/NOTIFICATIONS.md" || ((ERRORS++))
check_file "deploy/argocd/DISASTER-RECOVERY.md" || ((ERRORS++))
check_file "deploy/argocd/GITOPS-WORKFLOW.md" || ((ERRORS++))
check_file "deploy/argocd/SYNC-POLICIES.md" || ((ERRORS++))
check_file "deploy/argocd/IMAGE-UPDATER.md" || ((ERRORS++))
check_file "deploy/argocd/README.md" || ((ERRORS++))
echo ""

# Check application manifests
echo "Checking application manifests..."
echo "----------------------------------------------"
check_file "deploy/argocd/apps/fluxion-dev.yaml" || ((ERRORS++))
check_file "deploy/argocd/apps/fluxion-staging.yaml" || ((ERRORS++))
check_file "deploy/argocd/apps/fluxion-production.yaml" || ((ERRORS++))
echo ""

# Validate YAML syntax
echo "Validating YAML syntax..."
echo "----------------------------------------------"
validate_yaml "deploy/argocd/root-app.yaml" || ((ERRORS++))
validate_yaml "deploy/argocd/projects/fluxion-project.yaml" || ((ERRORS++))
validate_yaml "deploy/argocd/apps/fluxion-dev.yaml" || ((ERRORS++))
validate_yaml "deploy/argocd/apps/fluxion-staging.yaml" || ((ERRORS++))
validate_yaml "deploy/argocd/apps/fluxion-production.yaml" || ((ERRORS++))
echo ""

# Check ArgoCD resource types
echo "Validating ArgoCD resources..."
echo "----------------------------------------------"

ROOT_APP_KIND=$(python3 -c "import yaml; print(yaml.safe_load(open('deploy/argocd/root-app.yaml'))['kind'])")
if [ "$ROOT_APP_KIND" = "Application" ]; then
    echo -e "${GREEN}✓${NC} root-app.yaml is an Application"
else
    echo -e "${RED}✗${NC} root-app.yaml kind is $ROOT_APP_KIND, expected Application"
    ((ERRORS++))
fi

PROJECT_KIND=$(python3 -c "import yaml; print(yaml.safe_load(open('deploy/argocd/projects/fluxion-project.yaml'))['kind'])")
if [ "$PROJECT_KIND" = "AppProject" ]; then
    echo -e "${GREEN}✓${NC} fluxion-project.yaml is an AppProject"
else
    echo -e "${RED}✗${NC} fluxion-project.yaml kind is $PROJECT_KIND, expected AppProject"
    ((ERRORS++))
fi

# Check kubectl (optional)
echo ""
echo "Checking optional tools..."
echo "----------------------------------------------"
if command -v kubectl &> /dev/null; then
    echo -e "${GREEN}✓${NC} kubectl is installed"
    kubectl version --client --short 2>/dev/null || kubectl version --client 2>/dev/null | head -1
else
    echo -e "${YELLOW}⚠${NC} kubectl not found (optional)"
fi

if command -v argocd &> /dev/null; then
    echo -e "${GREEN}✓${NC} argocd CLI is installed"
    argocd version --client --short 2>/dev/null || argocd version --client 2>/dev/null | head -1
else
    echo -e "${YELLOW}⚠${NC} argocd CLI not found (optional)"
fi

# Check Helm (optional)
if command -v helm &> /dev/null; then
    echo -e "${GREEN}✓${NC} helm is installed"
    helm version --short 2>/dev/null || echo "  $(helm version 2>/dev/null | head -1)"
else
    echo -e "${YELLOW}⚠${NC} helm not found (optional)"
fi

# Summary
echo ""
echo "================================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Install ArgoCD: see deploy/argocd/ARGOCD-INSTALLATION.md"
    echo "2. Bootstrap applications: see deploy/argocd/bootstrap/README.md"
    echo "3. Configure secrets: see deploy/SECRETS.md"
else
    echo -e "${RED}✗ $ERRORS error(s) found${NC}"
    echo ""
    echo "Please fix the errors above before proceeding."
    exit 1
fi
echo "================================================"
