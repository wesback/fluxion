#!/bin/bash
# Setup GitHub Actions for ACR Push
# This script configures Azure and GitHub for automated container builds

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=================================================="
echo "GitHub Actions ACR Setup for Fluxion"
echo "=================================================="
echo ""

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed."
    echo "   Install: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI is not installed."
    echo "   Install: https://cli.github.com/"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ jq is not installed."
    echo "   Install: sudo apt-get install jq (Linux) or brew install jq (macOS)"
    exit 1
fi

echo "✅ Prerequisites met"
echo ""

# Check Azure login
echo "🔍 Checking Azure authentication..."
if ! az account show &> /dev/null; then
    echo "❌ Not logged in to Azure. Please run: az login"
    exit 1
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
echo "✅ Logged in to Azure"
echo "   Subscription: $SUBSCRIPTION_ID"
echo ""

# Check GitHub authentication
echo "🔍 Checking GitHub authentication..."
if ! gh auth status &> /dev/null 2>&1; then
    echo "❌ Not logged in to GitHub. Please run: gh auth login"
    exit 1
fi

REPO_FULL=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "✅ Logged in to GitHub"
echo "   Repository: $REPO_FULL"
echo ""

# Get environment
echo "🔍 Selecting environment..."
echo ""
echo "Which environment do you want to configure?"
echo "  1) dev"
echo "  2) staging"
echo "  3) production"
echo ""
read -p "Enter choice [1-3]: " ENV_CHOICE

case $ENV_CHOICE in
    1) ENVIRONMENT="dev" ;;
    2) ENVIRONMENT="staging" ;;
    3) ENVIRONMENT="production" ;;
    *) echo "❌ Invalid choice"; exit 1 ;;
esac

echo "✅ Selected environment: $ENVIRONMENT"
echo ""

# Get ACR details from Terraform
echo "🔍 Getting ACR details from Terraform (remote state)..."
cd "$REPO_ROOT/terraform"

# Initialize Terraform to fetch remote state
echo "Initializing Terraform..."
terraform init -backend-config=backend-config-${ENVIRONMENT}.hcl > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Terraform initialization failed."
    echo "   Make sure backend-config-${ENVIRONMENT}.hcl is configured correctly."
    exit 1
fi

ACR_NAME=$(terraform output -raw acr_name 2>/dev/null || echo "")
ACR_ID=$(terraform output -raw acr_id 2>/dev/null || echo "")

if [ -z "$ACR_NAME" ] || [ -z "$ACR_ID" ]; then
    echo "❌ Could not get ACR details from Terraform."
    echo "   Make sure:"
    echo "   1. Terraform has been applied for the '$ENVIRONMENT' environment"
    echo "   2. backend-config-${ENVIRONMENT}.hcl is configured with the correct storage account"
    echo "   3. You have access to the Azure Storage Account where state is stored"
    exit 1
fi

echo "✅ Found ACR"
echo "   Name: $ACR_NAME"
echo "   ID: $ACR_ID"
echo ""

# Ask user which method to use
echo "=================================================="
echo "Authentication Method"
echo "=================================================="
echo ""
echo "Choose authentication method:"
echo "  1) Service Principal with Secret (simpler, less secure)"
echo "  2) Federated Credentials / OIDC (recommended, more secure)"
echo ""
read -p "Enter choice [1-2]: " AUTH_CHOICE

case $AUTH_CHOICE in
    1)
        echo ""
        echo "=================================================="
        echo "Creating Service Principal"
        echo "=================================================="
        echo ""
        
        SP_NAME="github-actions-fluxion-$(date +%s)"
        echo "Creating service principal: $SP_NAME"
        
        # Create service principal
        SP_OUTPUT=$(az ad sp create-for-rbac \
            --name "$SP_NAME" \
            --role "AcrPush" \
            --scopes "$ACR_ID" \
            --sdk-auth)
        
        echo "✅ Service principal created"
        echo ""
        
        # Save to GitHub secret
        echo "📝 Adding AZURE_CREDENTIALS to GitHub secrets..."
        echo "$SP_OUTPUT" | gh secret set AZURE_CREDENTIALS
        
        echo "✅ Secret added to GitHub"
        echo ""
        ;;
        
    2)
        echo ""
        echo "=================================================="
        echo "Creating Federated Credentials"
        echo "=================================================="
        echo ""
        
        APP_NAME="github-fluxion-$(date +%s)"
        echo "Creating app registration: $APP_NAME"
        
        # Create app registration
        APP_ID=$(az ad app create \
            --display-name "$APP_NAME" \
            --query appId -o tsv)
        
        echo "✅ App created: $APP_ID"
        
        # Create service principal
        SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
        echo "✅ Service principal created: $SP_ID"
        
        # Assign role
        echo "Assigning AcrPush role..."
        az role assignment create \
            --role "AcrPush" \
            --assignee "$SP_ID" \
            --scope "$ACR_ID" \
            > /dev/null
        
        echo "✅ Role assigned"
        
        # Add federated credentials
        echo "Adding federated credentials..."
        
        # Main branch
        az ad app federated-credential create \
            --id "$APP_ID" \
            --parameters "{
                \"name\": \"github-main\",
                \"issuer\": \"https://token.actions.githubusercontent.com\",
                \"subject\": \"repo:${REPO_FULL}:ref:refs/heads/main\",
                \"audiences\": [\"api://AzureADTokenExchange\"]
            }" > /dev/null
        
        echo "  ✅ Main branch credential"
        
        # Develop branch
        az ad app federated-credential create \
            --id "$APP_ID" \
            --parameters "{
                \"name\": \"github-develop\",
                \"issuer\": \"https://token.actions.githubusercontent.com\",
                \"subject\": \"repo:${REPO_FULL}:ref:refs/heads/develop\",
                \"audiences\": [\"api://AzureADTokenExchange\"]
            }" > /dev/null
        
        echo "  ✅ Develop branch credential"
        
        # Pull requests
        az ad app federated-credential create \
            --id "$APP_ID" \
            --parameters "{
                \"name\": \"github-pr\",
                \"issuer\": \"https://token.actions.githubusercontent.com\",
                \"subject\": \"repo:${REPO_FULL}:pull_request\",
                \"audiences\": [\"api://AzureADTokenExchange\"]
            }" > /dev/null
        
        echo "  ✅ Pull request credential"
        echo ""
        
        # Add secrets to GitHub
        echo "📝 Adding secrets to GitHub..."
        echo "$APP_ID" | gh secret set AZURE_CLIENT_ID
        echo "$TENANT_ID" | gh secret set AZURE_TENANT_ID
        echo "$SUBSCRIPTION_ID" | gh secret set AZURE_SUBSCRIPTION_ID
        
        echo "✅ Secrets added to GitHub"
        echo ""
        
        echo "⚠️  Important: Update .github/workflows/build-push-acr.yml"
        echo "   Comment out the 'creds:' line and uncomment the federated credential lines"
        echo ""
        ;;
        
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

# Set ACR_NAME variable
echo "📝 Setting ACR_NAME variable in GitHub..."
echo "$ACR_NAME" | gh variable set ACR_NAME

echo "✅ Variable set"
echo ""

# Summary
echo "=================================================="
echo "✅ Setup Complete!"
echo "=================================================="
echo ""
echo "Configuration:"
echo "  Repository: $REPO_FULL"
echo "  ACR Name: $ACR_NAME"
echo "  ACR Login Server: ${ACR_NAME}.azurecr.io"
echo ""
echo "Next steps:"
echo "  1. Verify secrets: gh secret list"
echo "  2. Verify variables: gh variable list"
echo "  3. Make a change and push to 'develop' branch to trigger workflow"
echo "  4. Monitor workflow: gh run list --workflow=build-push-acr.yml"
echo ""
echo "Test locally:"
echo "  cd $REPO_ROOT/terraform"
echo "  ./scripts/acr-login.sh dev"
echo "  docker build -t ${ACR_NAME}.azurecr.io/fluxion-backend:test ../backend"
echo "  docker push ${ACR_NAME}.azurecr.io/fluxion-backend:test"
echo ""
echo "Documentation: $REPO_ROOT/.github/workflows/README.md"
echo ""
