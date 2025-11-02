#!/bin/bash
# Prerequisites Check for Fluxion CI/CD Setup
# This script verifies all required tools and access

echo "==================================================="
echo "Prerequisites Check for Fluxion CI/CD"
echo "==================================================="
echo ""

ALL_OK=true

# Check Azure CLI
echo "🔍 Checking Azure CLI..."
if command -v az &> /dev/null; then
    AZ_VERSION=$(az --version | head -n1 | grep -oP 'azure-cli\s+\K[\d.]+' || echo "unknown")
    echo "✅ Azure CLI installed: $AZ_VERSION"
    
    if az account show &> /dev/null; then
        USER_NAME=$(az account show --query user.name -o tsv)
        SUBSCRIPTION_NAME=$(az account show --query name -o tsv)
        SUBSCRIPTION_ID=$(az account show --query id -o tsv)
        echo "   ✅ Logged in as: $USER_NAME"
        echo "   ✅ Subscription: $SUBSCRIPTION_NAME"
        echo "   ✅ Subscription ID: $SUBSCRIPTION_ID"
    else
        echo "   ❌ Not logged in to Azure"
        echo "      Run: az login"
        ALL_OK=false
    fi
else
    echo "❌ Azure CLI not installed"
    echo "   Install: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
    ALL_OK=false
fi

echo ""

# Check GitHub CLI
echo "🔍 Checking GitHub CLI..."
if command -v gh &> /dev/null; then
    GH_VERSION=$(gh --version | head -n1 | grep -oP 'gh version \K[\d.]+' || echo "unknown")
    echo "✅ GitHub CLI installed: $GH_VERSION"
    
    if gh auth status &> /dev/null 2>&1; then
        GH_USER=$(gh api user --jq .login 2>/dev/null || echo "unknown")
        echo "   ✅ Logged in to GitHub as: $GH_USER"
        
        # Check repository access
        if gh repo view wesback/fluxion &> /dev/null 2>&1; then
            echo "   ✅ Can access repository: wesback/fluxion"
            
            # Check permissions
            PERMS=$(gh api repos/wesback/fluxion --jq '.permissions // {}' 2>/dev/null)
            if echo "$PERMS" | grep -q '"admin":true'; then
                echo "   ✅ Admin access to repository"
            else
                echo "   ⚠️  Limited access to repository (admin needed for secrets)"
            fi
        else
            echo "   ⚠️  Cannot access repository wesback/fluxion"
        fi
    else
        echo "   ❌ Not logged in to GitHub"
        echo "      Run: gh auth login"
        ALL_OK=false
    fi
else
    echo "❌ GitHub CLI not installed"
    echo "   Install: https://cli.github.com/"
    ALL_OK=false
fi

echo ""

# Check jq
echo "🔍 Checking jq..."
if command -v jq &> /dev/null; then
    JQ_VERSION=$(jq --version | grep -oP 'jq-\K[\d.]+' || echo "unknown")
    echo "✅ jq installed: $JQ_VERSION"
else
    echo "❌ jq not installed"
    echo "   Linux: sudo apt-get install jq"
    echo "   macOS: brew install jq"
    ALL_OK=false
fi

echo ""

# Check Terraform
echo "🔍 Checking Terraform..."
if command -v terraform &> /dev/null; then
    TF_VERSION=$(terraform --version | head -n1 | grep -oP 'Terraform v\K[\d.]+' || echo "unknown")
    echo "✅ Terraform installed: $TF_VERSION"
    
    TERRAFORM_DIR="/home/wesleyb/git/fluxion/terraform"
    if [ -d "$TERRAFORM_DIR" ]; then
        cd "$TERRAFORM_DIR"
        
        if [ -f "terraform.tfstate" ]; then
            echo "   ✅ Terraform state found"
            
            # Check for ACR outputs
            if ACR_NAME=$(terraform output -raw acr_name 2>/dev/null); then
                echo "   ✅ ACR Name: $ACR_NAME"
                
                if ACR_LOGIN_SERVER=$(terraform output -raw acr_login_server 2>/dev/null); then
                    echo "   ✅ ACR Login Server: $ACR_LOGIN_SERVER"
                fi
                
                if ACR_ID=$(terraform output -raw acr_id 2>/dev/null); then
                    echo "   ✅ ACR ID: ${ACR_ID:0:60}..."
                fi
            else
                echo "   ⚠️  ACR outputs not found in Terraform state"
                echo "      This might mean ACR is not deployed yet"
            fi
        else
            echo "   ⚠️  Terraform state not found"
            echo "      Run 'terraform apply' first to provision infrastructure"
        fi
        
        cd - > /dev/null
    else
        echo "   ⚠️  Terraform directory not found: $TERRAFORM_DIR"
    fi
else
    echo "⚠️  Terraform not installed (but infrastructure may already be deployed)"
fi

echo ""

# Check Docker (optional)
echo "🔍 Checking Docker (optional)..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | grep -oP 'Docker version \K[\d.]+' || echo "unknown")
    echo "✅ Docker installed: $DOCKER_VERSION"
    
    if docker ps &> /dev/null; then
        echo "   ✅ Docker daemon is running"
    else
        echo "   ⚠️  Docker daemon not running or insufficient permissions"
        echo "      You may need to add your user to docker group: sudo usermod -aG docker $USER"
    fi
else
    echo "ℹ️  Docker not installed (optional - only needed for local image building)"
fi

echo ""
echo "==================================================="
echo "Summary"
echo "==================================================="
echo ""

if [ "$ALL_OK" = true ]; then
    echo "✅ All required prerequisites are met!"
    echo ""
    echo "You're ready to run the setup script:"
    echo "  cd /home/wesleyb/git/fluxion/.github/workflows"
    echo "  ./setup-acr-auth.sh"
    echo ""
else
    echo "❌ Some prerequisites are missing or not configured."
    echo ""
    echo "Please fix the issues marked with ❌ above, then run this script again."
    echo ""
    echo "For detailed installation instructions, see:"
    echo "  /home/wesleyb/git/fluxion/.github/PREREQUISITES.md"
    echo ""
fi

echo "Quick links:"
echo "  • Azure CLI: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
echo "  • GitHub CLI: https://cli.github.com/"
echo "  • Full documentation: /home/wesleyb/git/fluxion/.github/workflows/README.md"
echo ""
