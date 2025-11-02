# Automation Guide

This guide explains how to automate the complete Fluxion infrastructure deployment in CI/CD pipelines.

## Design Philosophy

The Fluxion infrastructure uses a **three-tier deployment model** that separates concerns for maximum automation:

```
┌─────────────────────────────────────────────────────────────────┐
│ Tier 1: Azure Infrastructure (Terraform)                       │
│ ├─ AKS Cluster                                                  │
│ ├─ Networking (VNet, Subnets, NSGs)                            │
│ ├─ Azure Container Registry                                     │
│ ├─ Monitoring (Log Analytics, Application Insights)            │
│ └─ Key Vault                                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Tier 2: Kubernetes Infrastructure (Bootstrap Script)           │
│ ├─ cert-manager (TLS certificate management)                   │
│ ├─ ingress-nginx (Ingress controller)                          │
│ └─ ArgoCD (GitOps operator)                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Tier 3: Applications (ArgoCD GitOps)                           │
│ ├─ Fluxion Backend & Frontend                                  │
│ ├─ Observability Stack (Prometheus, Grafana, Jaeger)          │
│ └─ Any other applications                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Why This Approach?

### ❌ What We Avoided

**Anti-pattern: Terraform managing Kubernetes resources**

```bash
terraform apply    # Creates AKS cluster
# ⚠️ Problem: Need to manually run: az aks get-credentials --admin
terraform apply    # Now can deploy Helm releases
```

This breaks automation because:
- Manual step required between terraform applies
- Terraform provider initialization happens before cluster exists
- Can't use dynamic credentials in CI/CD
- Chicken-and-egg problem with authentication

### ✅ What We Implemented

**Pattern: Separate Azure infrastructure from Kubernetes resources**

```bash
terraform apply                          # Pure Azure infrastructure (fully automated)
./scripts/install-k8s-components.sh dev  # K8s infrastructure (fully automated)
kubectl apply -f root-app.yaml           # Applications via GitOps (fully automated)
```

Benefits:
- ✅ No manual steps between commands
- ✅ Each tier is independently automatable
- ✅ No authentication chicken-and-egg problems
- ✅ CI/CD friendly
- ✅ GitOps native

## CI/CD Pipeline Examples

### GitHub Actions

```yaml
name: Deploy Infrastructure

on:
  push:
    branches: [main]
    paths:
      - 'terraform/**'

env:
  ENVIRONMENT: dev
  ARM_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
  ARM_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
  ARM_SUBSCRIPTION_ID: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
  ARM_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}

jobs:
  deploy-infrastructure:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.5.0
      
      - name: Setup Azure CLI
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      
      - name: Setup kubectl
        uses: azure/setup-kubectl@v3
      
      - name: Setup Helm
        uses: azure/setup-helm@v3
      
      - name: Terraform Init
        working-directory: terraform
        run: |
          terraform init \
            -backend-config=backend-config-${ENVIRONMENT}.hcl
      
      - name: Terraform Plan
        working-directory: terraform
        run: |
          terraform plan \
            -var-file="environments/${ENVIRONMENT}.tfvars" \
            -out=tfplan
      
      - name: Terraform Apply
        working-directory: terraform
        run: terraform apply -auto-approve tfplan
      
      - name: Bootstrap Kubernetes Infrastructure
        working-directory: terraform
        run: ./scripts/install-k8s-components.sh ${ENVIRONMENT}
      
      - name: Save ArgoCD Password
        run: |
          ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret \
            -o jsonpath="{.data.password}" | base64 -d)
          echo "::add-mask::$ARGOCD_PASSWORD"
          echo "ARGOCD_PASSWORD=$ARGOCD_PASSWORD" >> $GITHUB_ENV
      
      - name: Deploy Applications via ArgoCD
        working-directory: deploy/argocd
        run: |
          kubectl apply -f projects/fluxion-project.yaml
          kubectl apply -f root-app.yaml
      
      - name: Wait for Applications to Sync
        run: |
          kubectl wait --for=condition=Synced \
            --timeout=300s \
            applications --all -n argocd
```

### Azure DevOps Pipeline

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include:
      - main
  paths:
    include:
      - terraform/*

variables:
  - group: fluxion-dev  # Variable group with Azure credentials
  - name: environment
    value: 'dev'

pool:
  vmImage: 'ubuntu-latest'

stages:
  - stage: DeployInfrastructure
    displayName: 'Deploy Azure Infrastructure'
    jobs:
      - job: Terraform
        steps:
          - task: TerraformInstaller@0
            inputs:
              terraformVersion: '1.5.0'
          
          - task: AzureCLI@2
            displayName: 'Terraform Init & Apply'
            inputs:
              azureSubscription: 'fluxion-service-connection'
              scriptType: 'bash'
              scriptLocation: 'inlineScript'
              inlineScript: |
                cd terraform
                terraform init -backend-config=backend-config-$(environment).hcl
                terraform apply -var-file="environments/$(environment).tfvars" -auto-approve
          
          - task: AzureCLI@2
            displayName: 'Bootstrap Kubernetes'
            inputs:
              azureSubscription: 'fluxion-service-connection'
              scriptType: 'bash'
              scriptLocation: 'inlineScript'
              inlineScript: |
                cd terraform
                ./scripts/install-k8s-components.sh $(environment)
          
          - task: Kubernetes@1
            displayName: 'Deploy ArgoCD Applications'
            inputs:
              connectionType: 'Azure Resource Manager'
              azureSubscriptionEndpoint: 'fluxion-service-connection'
              azureResourceGroup: 'fluxion-$(environment)-rg'
              kubernetesCluster: 'fluxion-$(environment)-aks'
              command: 'apply'
              arguments: '-f deploy/argocd/projects/fluxion-project.yaml'
          
          - task: Kubernetes@1
            displayName: 'Deploy Root App'
            inputs:
              connectionType: 'Azure Resource Manager'
              azureSubscriptionEndpoint: 'fluxion-service-connection'
              azureResourceGroup: 'fluxion-$(environment)-rg'
              kubernetesCluster: 'fluxion-$(environment)-aks'
              command: 'apply'
              arguments: '-f deploy/argocd/root-app.yaml'
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - deploy-infrastructure
  - bootstrap-kubernetes
  - deploy-applications

variables:
  ENVIRONMENT: dev
  TF_ROOT: ${CI_PROJECT_DIR}/terraform

.azure_auth:
  before_script:
    - az login --service-principal \
        -u ${AZURE_CLIENT_ID} \
        -p ${AZURE_CLIENT_SECRET} \
        --tenant ${AZURE_TENANT_ID}
    - az account set --subscription ${AZURE_SUBSCRIPTION_ID}

terraform:validate:
  stage: validate
  image: hashicorp/terraform:1.5
  script:
    - cd ${TF_ROOT}
    - terraform init -backend-config=backend-config-${ENVIRONMENT}.hcl
    - terraform validate
    - terraform fmt -check

terraform:deploy:
  stage: deploy-infrastructure
  image: hashicorp/terraform:1.5
  extends: .azure_auth
  script:
    - cd ${TF_ROOT}
    - terraform init -backend-config=backend-config-${ENVIRONMENT}.hcl
    - terraform apply -var-file="environments/${ENVIRONMENT}.tfvars" -auto-approve
  only:
    - main

kubernetes:bootstrap:
  stage: bootstrap-kubernetes
  image: mcr.microsoft.com/azure-cli:latest
  extends: .azure_auth
  script:
    - az aks install-cli
    - curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    - cd ${TF_ROOT}
    - ./scripts/install-k8s-components.sh ${ENVIRONMENT}
  only:
    - main

argocd:deploy:
  stage: deploy-applications
  image: mcr.microsoft.com/azure-cli:latest
  extends: .azure_auth
  script:
    - az aks get-credentials \
        --resource-group fluxion-${ENVIRONMENT}-rg \
        --name fluxion-${ENVIRONMENT}-aks \
        --admin
    - kubectl apply -f deploy/argocd/projects/fluxion-project.yaml
    - kubectl apply -f deploy/argocd/root-app.yaml
    - kubectl wait --for=condition=Synced applications --all -n argocd --timeout=300s
  only:
    - main
```

## Infrastructure as Code Best Practices

### 1. State Management

Always use remote state in production:

```bash
# backend-config-production.hcl
resource_group_name  = "fluxion-tfstate-rg"
storage_account_name = "fluxiontfstateprod"
container_name       = "tfstate"
key                  = "fluxion-production.tfstate"
```

### 2. Environment Separation

Use separate state files and variable files per environment:

```
terraform/
├── environments/
│   ├── dev.tfvars
│   ├── staging.tfvars
│   └── production.tfvars
├── backend-config-dev.hcl
├── backend-config-staging.hcl
└── backend-config-production.hcl
```

### 3. Secrets Management

Never commit secrets to Git. Use:

**Option 1: Azure Key Vault (Recommended)**

```bash
# Store secrets in Key Vault
az keyvault secret set --vault-name fluxion-kv --name argocd-admin-password --value "${ARGOCD_PASSWORD}"

# Retrieve in pipeline
ARGOCD_PASSWORD=$(az keyvault secret show --vault-name fluxion-kv --name argocd-admin-password --query value -o tsv)
```

**Option 2: CI/CD Secret Variables**

- GitHub Actions: Repository Secrets
- Azure DevOps: Variable Groups (with Azure Key Vault integration)
- GitLab CI: CI/CD Variables (masked)

### 4. Idempotency

All scripts are idempotent - safe to run multiple times:

```bash
# Safe to re-run if interrupted
./scripts/install-k8s-components.sh dev

# Script checks if components already exist and skips installation
# ✓ cert-manager is already installed
# ✓ ingress-nginx is already installed
# ✓ ArgoCD is already installed
```

### 5. Rollback Strategy

**Infrastructure rollback:**

```bash
# Terraform maintains state
terraform plan -var-file="environments/dev.tfvars"  # Review changes
terraform apply -var-file="environments/dev.tfvars"  # Apply or rollback
```

**Application rollback:**

```bash
# ArgoCD handles application versioning
argocd app rollback fluxion-dev  # Rollback to previous version
```

**Full environment recreation:**

```bash
# Nuclear option - destroy and recreate
terraform destroy -var-file="environments/dev.tfvars"
terraform apply -var-file="environments/dev.tfvars"
./scripts/install-k8s-components.sh dev
kubectl apply -f deploy/argocd/root-app.yaml
```

## Monitoring and Validation

### Infrastructure Validation

```bash
# Terraform outputs
terraform output

# Verify AKS cluster
az aks show --resource-group fluxion-dev-rg --name fluxion-dev-aks --query provisioningState

# Check cluster health
kubectl get nodes
kubectl get pods -A
```

### ArgoCD Application Health

```bash
# Check application sync status
kubectl get applications -n argocd

# Get detailed application status
argocd app get fluxion-dev

# View sync history
argocd app history fluxion-dev
```

### Automated Health Checks

Add to your CI/CD pipeline:

```bash
# Wait for cluster to be ready
kubectl wait --for=condition=Ready nodes --all --timeout=300s

# Wait for critical pods
kubectl wait --for=condition=Ready pods --all -n kube-system --timeout=300s
kubectl wait --for=condition=Ready pods --all -n cert-manager --timeout=300s
kubectl wait --for=condition=Ready pods --all -n ingress-nginx --timeout=300s

# Wait for ArgoCD applications to sync
kubectl wait --for=condition=Synced applications --all -n argocd --timeout=600s

# Check application health
kubectl wait --for=condition=Healthy applications --all -n argocd --timeout=600s
```

## Troubleshooting

### Common Issues in CI/CD

**Issue: Terraform state locked**

```bash
# Force unlock (use with caution)
terraform force-unlock <lock-id>
```

**Issue: kubectl authentication fails**

```bash
# Ensure service principal has correct permissions
az role assignment create \
  --assignee ${AZURE_CLIENT_ID} \
  --role "Azure Kubernetes Service Cluster User Role" \
  --scope /subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/fluxion-dev-rg
```

**Issue: Helm installation timeout**

```bash
# Increase timeout in script or manually retry
helm install <release> <chart> --timeout 10m
```

**Issue: ArgoCD applications stuck in Progressing**

```bash
# Check application events
kubectl describe application fluxion-dev -n argocd

# Force sync
argocd app sync fluxion-dev --force
```

## Cost Optimization

### Auto-shutdown for Non-Production

```bash
# Add to dev/staging environments
# Scale node pools to 0 during off-hours
az aks nodepool scale \
  --resource-group fluxion-dev-rg \
  --cluster-name fluxion-dev-aks \
  --name user \
  --node-count 0

# Scale back up
az aks nodepool scale \
  --resource-group fluxion-dev-rg \
  --cluster-name fluxion-dev-aks \
  --name user \
  --node-count 2
```

### Use Spot Instances for Dev

In `environments/dev.tfvars`:

```hcl
user_node_pool = {
  vm_size    = "Standard_D2s_v3"
  node_count = 2
  priority   = "Spot"  # 60-80% cost savings
  eviction_policy = "Delete"
  spot_max_price = -1  # Pay up to regular price
}
```

## Security Checklist

- [ ] Terraform state encrypted at rest (Azure Storage encryption enabled)
- [ ] Secrets stored in Azure Key Vault or CI/CD secret storage
- [ ] Service principal follows principle of least privilege
- [ ] Network policies enabled on AKS cluster
- [ ] Azure AD RBAC enabled for cluster access
- [ ] Private cluster endpoint (for production)
- [ ] Container image scanning in ACR
- [ ] ArgoCD SSO configured (production)
- [ ] Audit logging enabled in Azure Monitor

## Summary

This automation approach provides:

✅ **Fully automated deployment** - No manual steps required  
✅ **CI/CD friendly** - Works with any CI/CD platform  
✅ **Idempotent operations** - Safe to re-run scripts  
✅ **Clear separation of concerns** - Infrastructure vs Applications  
✅ **GitOps ready** - ArgoCD manages application state  
✅ **Scalable** - Supports multiple environments  
✅ **Secure** - Follows Azure and Kubernetes security best practices  

For questions or issues, see [QUICKSTART.md](./QUICKSTART.md) or [README.md](./README.md).
