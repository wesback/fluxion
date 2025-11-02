# Prerequisites for Fluxion CI/CD Setup

Complete checklist of tools and access required for GitHub Actions + ACR automation.

## Required Tools

### 1. Azure CLI

**Purpose:** Authenticate with Azure and manage ACR  
**Installation:**

```bash
# Linux (Debian/Ubuntu)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Linux (Manual)
curl -L https://aka.ms/InstallAzureCli | bash

# macOS
brew install azure-cli

# Windows
# Download from: https://aka.ms/installazurecliwindows
```

**Verify:**
```bash
az --version
# Should show: azure-cli 2.x.x or higher
```

**Login:**
```bash
az login
# Opens browser for authentication
# Select the correct subscription
az account show
```

**Documentation:** https://learn.microsoft.com/en-us/cli/azure/install-azure-cli

---

### 2. GitHub CLI

**Purpose:** Configure repository secrets and variables  
**Installation:**

```bash
# Linux (Debian/Ubuntu)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# macOS
brew install gh

# Windows
# Download from: https://cli.github.com/
# Or: winget install --id GitHub.cli
```

**Verify:**
```bash
gh --version
# Should show: gh version 2.x.x or higher
```

**Login:**
```bash
gh auth login
# Follow prompts:
# 1. Choose GitHub.com
# 2. Choose HTTPS or SSH
# 3. Authenticate in browser
```

**Test:**
```bash
gh repo view
# Should show your repository details
```

**Documentation:** https://cli.github.com/

---

### 3. jq (JSON Processor)

**Purpose:** Parse JSON in setup scripts  
**Installation:**

```bash
# Linux (Debian/Ubuntu)
sudo apt-get update
sudo apt-get install jq

# Linux (RHEL/CentOS)
sudo yum install jq

# macOS
brew install jq

# Windows
# Download from: https://stedolan.github.io/jq/download/
```

**Verify:**
```bash
jq --version
# Should show: jq-1.x or higher
```

**Documentation:** https://stedolan.github.io/jq/

---

### 4. Terraform (Already installed)

**Purpose:** Provision ACR and Azure infrastructure  
**Installation:** Already completed (infrastructure exists)

**Verify:**
```bash
cd /home/wesleyb/git/fluxion/terraform
terraform --version
terraform output acr_name  # Should return ACR name
```

---

### 5. Docker (Optional - for local testing)

**Purpose:** Build and push images locally for testing  
**Installation:**

```bash
# Linux
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Log out and back in for group changes

# macOS
# Install Docker Desktop from: https://docker.com/products/docker-desktop

# Verify
docker --version
```

---

## Required Access

### Azure Permissions

You need the following permissions in your Azure subscription:

- ✅ **Subscription Contributor** or **Owner** role
- ✅ **Permission to create Service Principals** (for GitHub Actions authentication)
- ✅ **ACR Push role** on the Container Registry (granted automatically by setup script)

**Verify your permissions:**
```bash
# Check your role assignments
az role assignment list --assignee $(az account show --query user.name -o tsv) --output table

# Check if you can create service principals
az ad sp list --show-mine
```

### GitHub Permissions

You need these permissions on the GitHub repository:

- ✅ **Admin access** to the repository (to manage secrets and settings)
- ✅ **Write access** to repository secrets
- ✅ **Actions enabled** in repository settings

**Verify your permissions:**
```bash
# Check your permissions
gh api repos/wesback/fluxion --jq '.permissions'

# Should show:
# {
#   "admin": true,
#   "push": true,
#   "pull": true
# }
```

**Enable GitHub Actions:**
1. Go to repository Settings
2. Navigate to Actions → General
3. Ensure "Allow all actions and reusable workflows" is selected

---

## Quick Setup Checklist

Run this to verify everything is ready:

```bash
#!/bin/bash
echo "=== Prerequisites Check ==="
echo ""

# Check Azure CLI
if command -v az &> /dev/null; then
    echo "✅ Azure CLI: $(az --version | head -n1)"
    if az account show &> /dev/null; then
        echo "   ✅ Logged in as: $(az account show --query user.name -o tsv)"
        echo "   ✅ Subscription: $(az account show --query name -o tsv)"
    else
        echo "   ❌ Not logged in - Run: az login"
    fi
else
    echo "❌ Azure CLI: Not installed"
fi

echo ""

# Check GitHub CLI
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI: $(gh --version | head -n1)"
    if gh auth status &> /dev/null 2>&1; then
        echo "   ✅ Logged in to GitHub"
    else
        echo "   ❌ Not logged in - Run: gh auth login"
    fi
else
    echo "❌ GitHub CLI: Not installed"
fi

echo ""

# Check jq
if command -v jq &> /dev/null; then
    echo "✅ jq: $(jq --version)"
else
    echo "❌ jq: Not installed"
fi

echo ""

# Check Terraform
if command -v terraform &> /dev/null; then
    echo "✅ Terraform: $(terraform --version | head -n1)"
    cd /home/wesleyb/git/fluxion/terraform
    if [ -f "terraform.tfstate" ]; then
        echo "   ✅ Infrastructure deployed"
        echo "   ✅ ACR Name: $(terraform output -raw acr_name 2>/dev/null || echo 'N/A')"
    else
        echo "   ⚠️  Infrastructure not deployed yet"
    fi
else
    echo "❌ Terraform: Not installed"
fi

echo ""

# Check Docker (optional)
if command -v docker &> /dev/null; then
    echo "✅ Docker: $(docker --version)"
else
    echo "⚠️  Docker: Not installed (optional for local testing)"
fi

echo ""
echo "=== Summary ==="
echo "If all required items show ✅, you're ready to run:"
echo "  cd /home/wesleyb/git/fluxion/.github/workflows"
echo "  ./setup-acr-auth.sh"
```

Save this as `check-prerequisites.sh` and run it:

```bash
cd /home/wesleyb/git/fluxion/.github/workflows
chmod +x ../check-prerequisites.sh
../check-prerequisites.sh
```

---

## Troubleshooting

### Azure CLI Installation Issues

**Linux: Missing dependencies**
```bash
# Install missing dependencies
sudo apt-get update
sudo apt-get install ca-certificates curl apt-transport-https lsb-release gnupg
```

**macOS: Homebrew not installed**
```bash
# Install Homebrew first
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### GitHub CLI Authentication Issues

**Error: "gh: command not found" after installation**
```bash
# Reload shell
exec $SHELL

# Or add to PATH manually
export PATH="/usr/local/bin:$PATH"
```

**Error: "authentication token invalid"**
```bash
# Logout and login again
gh auth logout
gh auth login
```

### Azure Login Issues

**Error: "AADSTS50011: No reply address is registered"**
```bash
# Use device code authentication
az login --use-device-code
```

**Error: "Multiple subscriptions found"**
```bash
# List subscriptions
az account list --output table

# Set default subscription
az account set --subscription "Your Subscription Name"
```

### Permission Issues

**Error: "Insufficient privileges to complete the operation"**
```bash
# You need to be an Owner or have permission to create service principals
# Contact your Azure administrator
```

**GitHub: "Resource not accessible by integration"**
```bash
# You need admin access to the repository
# Contact the repository owner
```

---

## Alternative: Manual Setup (without GitHub CLI)

If you can't install GitHub CLI, you can set secrets manually:

### 1. Create Service Principal

```bash
cd /home/wesleyb/git/fluxion/terraform
ACR_ID=$(terraform output -raw acr_id)

az ad sp create-for-rbac \
  --name "github-actions-fluxion" \
  --role "AcrPush" \
  --scopes "$ACR_ID" \
  --sdk-auth
```

### 2. Add Secret via GitHub UI

1. Copy the entire JSON output
2. Go to: https://github.com/wesback/fluxion/settings/secrets/actions
3. Click "New repository secret"
4. Name: `AZURE_CREDENTIALS`
5. Value: Paste the JSON
6. Click "Add secret"

### 3. Add Variable via GitHub UI

1. Go to: https://github.com/wesback/fluxion/settings/variables/actions
2. Click "New repository variable"
3. Name: `ACR_NAME`
4. Value: Run `cd terraform && terraform output -raw acr_name`
5. Click "Add variable"

---

## Next Steps

Once all prerequisites are met:

1. ✅ Run the setup script: `.github/workflows/setup-acr-auth.sh`
2. ✅ Commit the workflows: `git add .github/ && git commit && git push`
3. ✅ Test the workflow: Make a change and push to `develop` branch
4. ✅ Monitor: `gh run watch`

See [QUICKSTART.md](QUICKSTART.md) for detailed instructions.
