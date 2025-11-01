#!/bin/bash
# Terraform Configuration Validation Script
# Validates Terraform files for basic structure and requirements

# Note: Not using set -e to continue validation even if some checks fail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "🔍 Validating Terraform configuration..."
echo "Directory: ${TERRAFORM_DIR}"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Function to check if file exists
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "${TERRAFORM_DIR}/${file}" ]; then
        echo -e "${GREEN}✓${NC} ${description}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} ${description} - Missing: ${file}"
        ((FAILED++))
        return 1
    fi
}

# Function to check if directory exists
check_dir() {
    local dir=$1
    local description=$2
    
    if [ -d "${TERRAFORM_DIR}/${dir}" ]; then
        echo -e "${GREEN}✓${NC} ${description}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} ${description} - Missing: ${dir}"
        ((FAILED++))
        return 1
    fi
}

# Function to check file content
check_content() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if [ ! -f "${TERRAFORM_DIR}/${file}" ]; then
        echo -e "${RED}✗${NC} ${description} - File not found: ${file}"
        ((FAILED++))
        return 1
    fi
    
    if grep -q "${pattern}" "${TERRAFORM_DIR}/${file}"; then
        echo -e "${GREEN}✓${NC} ${description}"
        ((PASSED++))
        return 0
    else
        echo -e "${YELLOW}⚠${NC} ${description} - Pattern not found in ${file}"
        ((WARNINGS++))
        return 1
    fi
}

echo "📋 Checking root Terraform files..."
check_file "main.tf" "Main Terraform configuration"
check_file "variables.tf" "Variable definitions"
check_file "outputs.tf" "Output definitions"
check_file "versions.tf" "Provider version constraints"
check_file "terraform.tfvars.example" "Example tfvars file"
echo ""

echo "📋 Checking module structure..."
check_dir "modules" "Modules directory"
check_dir "modules/networking" "Networking module"
check_dir "modules/aks" "AKS module"
check_dir "modules/acr" "ACR module"
check_dir "modules/monitoring" "Monitoring module"
echo ""

echo "📋 Checking networking module..."
check_file "modules/networking/main.tf" "Networking main.tf"
check_file "modules/networking/variables.tf" "Networking variables.tf"
check_file "modules/networking/outputs.tf" "Networking outputs.tf"
check_content "modules/networking/main.tf" "azurerm_virtual_network" "VNet resource defined"
check_content "modules/networking/main.tf" "azurerm_subnet" "Subnet resource defined"
check_content "modules/networking/main.tf" "azurerm_public_ip" "Public IP resource defined"
echo ""

echo "📋 Checking AKS module..."
check_file "modules/aks/main.tf" "AKS main.tf"
check_file "modules/aks/variables.tf" "AKS variables.tf"
check_file "modules/aks/outputs.tf" "AKS outputs.tf"
check_content "modules/aks/main.tf" "azurerm_kubernetes_cluster" "AKS cluster resource defined"
check_content "modules/aks/main.tf" "azurerm_kubernetes_cluster_node_pool" "User node pool defined"
check_content "modules/aks/main.tf" "azurerm_role_assignment" "Role assignments defined"
echo ""

echo "📋 Checking ACR module..."
check_file "modules/acr/main.tf" "ACR main.tf"
check_file "modules/acr/variables.tf" "ACR variables.tf"
check_file "modules/acr/outputs.tf" "ACR outputs.tf"
check_content "modules/acr/main.tf" "azurerm_container_registry" "ACR resource defined"
check_content "modules/acr/main.tf" "azurerm_storage_account" "Storage account for backups defined"
echo ""

echo "📋 Checking monitoring module..."
check_file "modules/monitoring/main.tf" "Monitoring main.tf"
check_file "modules/monitoring/variables.tf" "Monitoring variables.tf"
check_file "modules/monitoring/outputs.tf" "Monitoring outputs.tf"
check_content "modules/monitoring/main.tf" "azurerm_log_analytics_workspace" "Log Analytics workspace defined"
check_content "modules/monitoring/main.tf" "azurerm_key_vault" "Key Vault defined"
check_content "modules/monitoring/main.tf" "azurerm_monitor_diagnostic_setting" "Diagnostic settings defined"
echo ""

echo "📋 Checking environment configurations..."
check_dir "environments" "Environments directory"
check_file "environments/dev.tfvars" "Development environment config"
check_file "environments/staging.tfvars" "Staging environment config"
check_file "environments/production.tfvars" "Production environment config"
echo ""

echo "📋 Checking backend configurations..."
check_file "backend-config-dev.hcl.example" "Dev backend config example"
check_file "backend-config-staging.hcl.example" "Staging backend config example"
check_file "backend-config-production.hcl.example" "Production backend config example"
echo ""

echo "📋 Checking scripts..."
check_dir "scripts" "Scripts directory"
check_file "scripts/setup-backend.sh" "Backend setup script"
check_file "scripts/configure-access.sh" "Access configuration script"
check_file "scripts/acr-login.sh" "ACR login script"

# Check if scripts are executable
if [ -x "${TERRAFORM_DIR}/scripts/setup-backend.sh" ]; then
    echo -e "${GREEN}✓${NC} setup-backend.sh is executable"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} setup-backend.sh is not executable"
    ((WARNINGS++))
fi

if [ -x "${TERRAFORM_DIR}/scripts/configure-access.sh" ]; then
    echo -e "${GREEN}✓${NC} configure-access.sh is executable"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} configure-access.sh is not executable"
    ((WARNINGS++))
fi

if [ -x "${TERRAFORM_DIR}/scripts/acr-login.sh" ]; then
    echo -e "${GREEN}✓${NC} acr-login.sh is executable"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} acr-login.sh is not executable"
    ((WARNINGS++))
fi
echo ""

echo "📋 Checking documentation..."
check_file "README.md" "Main README"
check_file "ARCHITECTURE.md" "Architecture documentation"
check_file "COST-ESTIMATION.md" "Cost estimation documentation"
check_file "SECURITY-CHECKLIST.md" "Security checklist"
check_file "POST-DEPLOYMENT.md" "Post-deployment guide"
echo ""

echo "📋 Checking required variables..."
check_content "variables.tf" "variable \"environment\"" "Environment variable defined"
check_content "variables.tf" "variable \"location\"" "Location variable defined"
check_content "variables.tf" "variable \"kubernetes_version\"" "Kubernetes version variable defined"
check_content "variables.tf" "variable \"vnet_address_space\"" "VNet address space variable defined"
check_content "variables.tf" "variable \"enable_private_cluster\"" "Private cluster variable defined"
echo ""

echo "📋 Checking provider configuration..."
check_content "versions.tf" "required_version" "Terraform version constraint defined"
check_content "versions.tf" "hashicorp/azurerm" "AzureRM provider defined"
check_content "versions.tf" "hashicorp/helm" "Helm provider defined"
check_content "versions.tf" "hashicorp/kubernetes" "Kubernetes provider defined"
echo ""

echo "📋 Checking main configuration..."
check_content "main.tf" "module \"networking\"" "Networking module referenced"
check_content "main.tf" "module \"aks\"" "AKS module referenced"
check_content "main.tf" "module \"acr\"" "ACR module referenced"
check_content "main.tf" "module \"monitoring\"" "Monitoring module referenced"
check_content "main.tf" "azurerm_resource_group" "Resource group defined"
echo ""

echo "📋 Checking outputs..."
check_content "outputs.tf" "cluster_id" "Cluster ID output defined"
check_content "outputs.tf" "acr_login_server" "ACR login server output defined"
check_content "outputs.tf" "ingress_public_ip" "Ingress public IP output defined"
check_content "outputs.tf" "log_analytics_workspace_id" "Log Analytics workspace ID output defined"
echo ""

echo "📋 Checking environment-specific configurations..."
for env in dev staging production; do
    if check_content "environments/${env}.tfvars" "environment = \"${env}\"" "Environment set in ${env}.tfvars"; then
        :
    fi
done
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Validation Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Passed:${NC}   ${PASSED}"
echo -e "${YELLOW}⚠ Warnings:${NC} ${WARNINGS}"
echo -e "${RED}✗ Failed:${NC}   ${FAILED}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ${FAILED} -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Install Terraform: https://www.terraform.io/downloads"
    echo "2. Login to Azure: az login"
    echo "3. Run: cd ${TERRAFORM_DIR} && terraform init"
    echo "4. Run: terraform validate"
    echo "5. Run: terraform fmt -check"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some critical checks failed. Please review and fix the issues.${NC}"
    echo ""
    exit 1
fi
