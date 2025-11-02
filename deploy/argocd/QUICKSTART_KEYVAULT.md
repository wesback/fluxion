# Quickstart: Deploy Fluxion with ArgoCD and Azure Key Vault (External Secrets)

This guide shows how to deploy Fluxion with secure secrets management using Azure Key Vault and External Secrets Operator.

## Prerequisites

- **Kubernetes cluster with infrastructure components installed:**
  - **Recommended:** Use Terraform infrastructure from `../../terraform/`
  - After `terraform apply`, run `../../terraform/scripts/install-k8s-components.sh` 
  - This installs: ingress-nginx, cert-manager, and **ArgoCD automatically**
- Helm 3.8+ and kubectl configured
- Azure subscription with Key Vault
- Managed identity or service principal with `Key Vault Secrets User` role
- Git repo access: https://github.com/wesback/fluxion

> **💡 If you used the Terraform bootstrap script**, ArgoCD is already installed! Skip to Step 2.

## Overview

This quickstart covers:

1. ~~Install ArgoCD~~ (Already done via Terraform bootstrap)
2. Install External Secrets Operator
3. Configure Azure Key Vault as a SecretStore
4. Create ExternalSecrets to map Key Vault secrets to Kubernetes secrets
5. Deploy Fluxion via ArgoCD

---

## Step 1: Verify ArgoCD Installation (If Using Terraform)

If you used the Terraform bootstrap script, verify ArgoCD is running:

```bash
kubectl get pods -n argocd
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d; echo
```

**If ArgoCD is NOT installed**, install it manually:

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

## Step 2: Install External Secrets Operator

Install the operator to sync secrets from Azure Key Vault:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets-system \
  --create-namespace
```

Verify installation:

```bash
kubectl get pods -n external-secrets-system
```

## Step 3: Configure Azure Key Vault Access

> **Note:** This guide uses `<ENVIRONMENT>` placeholder for namespace. Replace with your environment (e.g., `dev`, `staging`, `production`).

### Option A: Workload Identity (Recommended for AKS)

1. Create a managed identity with access to Key Vault:
   ```bash
   az identity create --name fluxion-keyvault-reader --resource-group <your-rg>
   ```

2. Assign Key Vault permissions:
   
   First, get the managed identity's object ID:
   ```bash
   az identity show --name fluxion-keyvault-reader --resource-group <your-rg> --query principalId -o tsv
   ```
   
   Then assign Key Vault permissions:
   ```bash
   az keyvault set-policy \
     --name <your-keyvault> \
     --object-id <managed-identity-object-id> \
     --secret-permissions get list
   ```

3. Create Kubernetes ServiceAccount with federated identity:
   
   First, get your AKS OIDC issuer URL:
   ```bash
   az aks show --resource-group <your-rg> --name <your-cluster> --query "oidcIssuerProfile.issuerUrl" -o tsv
   ```
   
   Then create the ServiceAccount and federated credential:
   ```bash
   az aks get-credentials --resource-group <your-rg> --name <your-cluster>
   
   kubectl create serviceaccount fluxion-external-secrets-sa -n <ENVIRONMENT>
   
   az identity federated-credential create \
     --name fluxion-keyvault-federated \
     --identity-name fluxion-keyvault-reader \
     --resource-group <your-rg> \
     --issuer <your-aks-oidc-issuer> \
     --subject system:serviceaccount:<ENVIRONMENT>:fluxion-external-secrets-sa
   ```

### Option B: Service Principal (Alternative)

1. Create service principal and grant Key Vault access
2. Store credentials in Kubernetes:
   ```bash
   kubectl create secret generic azure-secret \
     --from-literal=client-id=<client-id> \
     --from-literal=client-secret=<client-secret> \
     -n external-secrets-system
   ```

## Step 3.5: Define Secret Values in Azure Key Vault

Before ExternalSecrets can sync secrets to Kubernetes, you need to populate them in Azure Key Vault.

### Create Secrets Using Azure CLI:

```bash
# Set the postgres password
az keyvault secret set \
  --vault-name <your-keyvault> \
  --name postgres-password \
  --value "<your-postgres-password>"

# Set the admin API key
az keyvault secret set \
  --vault-name <your-keyvault> \
  --name admin-api-key \
  --value "<your-admin-api-key>"
```

Replace:
- `<your-keyvault>` with your Key Vault name
- `<your-postgres-password>` with a strong password for PostgreSQL (e.g., `openssl rand -base64 32`)
- `<your-admin-api-key>` with a generated API key (see below)

### Generate Admin API Key:

Generate a secure random admin API key using `openssl`:

```bash
openssl rand -base64 32
```

Copy the generated key and use it for the `admin-api-key` secret.

> **Note:** The `backend/scripts/generate_admin_key.py` script requires the database to be running, so it's not suitable for initial setup. Use `openssl rand -base64 32` to generate a secure random key instead. Once the backend is deployed and running, you can use the script to generate additional API keys through the application.

### Create Secrets Using Azure Portal (Alternative):

1. Go to your Key Vault in Azure Portal
2. Click **Secrets** → **+ Generate/Import**
3. Create each secret:
   - **Name:** `postgres-password` → **Value:** (strong password)
   - **Name:** `admin-api-key` → **Value:** (generated API key)

### Verify Secrets Were Created:

```bash
az keyvault secret list --vault-name <your-keyvault>
```

You should see both `postgres-password` and `admin-api-key` listed.

## Step 4: Create SecretStore

Create a SecretStore that connects to your Azure Key Vault:

**For Workload Identity:**

```yaml
apiVersion: external-secrets.io/v1
kind: SecretStore
metadata:
  name: azure-keyvault
  namespace: <ENVIRONMENT>
spec:
  provider:
    azurekv:
      tenantId: "<AZURE_TENANT_ID>"
      vaultUrl: "https://<YOUR-VAULT-NAME>.vault.azure.net/"
      authType: WorkloadIdentity
      serviceAccountRef:
        name: fluxion-external-secrets-sa
```

Apply the SecretStore:

```bash
kubectl create namespace <ENVIRONMENT>
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1
kind: SecretStore
metadata:
  name: azure-keyvault
  namespace: <ENVIRONMENT>
spec:
  provider:
    azurekv:
      tenantId: "<AZURE_TENANT_ID>"
      vaultUrl: "https://<YOUR-VAULT>.vault.azure.net/"
      authType: WorkloadIdentity
      serviceAccountRef:
        name: fluxion-external-secrets-sa
EOF
```

## Step 5: Build and Push Container Images to ACR

Before deploying, you need to build the container images and push them to your Azure Container Registry.

### Get your ACR login credentials:

```bash
az acr login --name <your-acr-name>
```

### Build and push images:

**For the backend:**
```bash
cd backend
docker build -t <your-acr-name>.azurecr.io/fluxion-backend:latest .
docker push <your-acr-name>.azurecr.io/fluxion-backend:latest
cd ..
```

**For the frontend:**
```bash
cd frontend
docker build -t <your-acr-name>.azurecr.io/fluxion-frontend:latest .
docker push <your-acr-name>.azurecr.io/fluxion-frontend:latest
cd ..
```

> **Tip:** You can get your ACR name from Terraform output:
> ```bash
> terraform output acr_login_server
> ```

## Step 6: Create ExternalSecrets

Create ExternalSecret resources to map Key Vault secrets to Kubernetes secrets:

```bash
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: fluxion-postgresql-secret
  namespace: fluxion-<ENVIRONMENT>
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-keyvault
    kind: SecretStore
  target:
    name: fluxion-postgresql
    creationPolicy: Owner
  data:
    - secretKey: postgres-password
      remoteRef:
        key: postgres-password
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: fluxion-api-secret
  namespace: fluxion-<ENVIRONMENT>
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-keyvault
    kind: SecretStore
  target:
    name: fluxion-api
    creationPolicy: Owner
  data:
    - secretKey: postgres-password
      remoteRef:
        key: postgres-password
    - secretKey: admin-api-key
      remoteRef:
        key: admin-api-key
EOF
```

Verify secrets were created:

```bash
kubectl get externalsecrets -n <ENVIRONMENT>
kubectl get secrets -n <ENVIRONMENT>
```

## Step 7: Deploy Fluxion with ArgoCD

Now deploy Fluxion using ArgoCD:

```bash
# Create the Fluxion project
kubectl apply -f projects/fluxion-project.yaml

# Deploy the application
kubectl apply -f apps/fluxion-<ENVIRONMENT>.yaml
```

Monitor the deployment:

```bash
# Watch ArgoCD sync status
kubectl get applications -n argocd -w

# Or use ArgoCD CLI
argocd app list
argocd app get fluxion-<ENVIRONMENT>
argocd app sync fluxion-<ENVIRONMENT>  # If not auto-syncing
```

## Step 8: Verify Deployment

Check that all components are running:

```bash
# Check pods
kubectl get pods -n fluxion-<ENVIRONMENT>

# Check StatefulSets (PostgreSQL)
kubectl get statefulsets -n fluxion-<ENVIRONMENT>

# Check services
kubectl get svc -n fluxion-<ENVIRONMENT>

# View logs
kubectl logs -n fluxion-<ENVIRONMENT> -l app=fluxion-api
kubectl logs -n fluxion-<ENVIRONMENT> statefulset/fluxion-postgresql
```

## Step 9: Access ArgoCD UI

First, retrieve the ArgoCD admin password:

```bash
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d; echo
```

Then port-forward to the ArgoCD server:

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Open your browser and navigate to `https://localhost:8080`, then login with:
- **Username:** `admin`
- **Password:** (from the command above)

---

## Helper Scripts (Optional)

For convenience, helper scripts are available in `quickstart/`:

### Install External Secrets

```bash
./quickstart/install-external-secrets.sh external-secrets external-secrets-system
```

### Generate SecretStore and ExternalSecret YAMLs

```bash
./quickstart/generate-secretstore-externalsecret.sh \
  --tenant-id "<AZURE_TENANT_ID>" \
  --vault-url "https://<YOUR-VAULT>.vault.azure.net/" \
  --sa-name fluxion-external-secrets-sa \
  --env prod \
  --secrets postgres-password=postgres-password,admin-api-key=admin-api-key \
  --apply
```

**Script Options:**
- `--env dev|prod` - Sets namespace (`fluxion-dev` or `fluxion-production`)
- `--namespace <name>` - Override namespace
- `--apply` - Apply generated manifests immediately
- `--secrets key=remoteKey[,key2=remoteKey2]` - Comma-separated secret mappings

### Apply All ArgoCD Apps

```bash
./quickstart/apply-argocd-apps.sh --sync
```

---

## Best Practices

✅ **Security:**
- Use Workload Identity (no credentials stored in cluster)
- Limit Key Vault access with `Key Vault Secrets User` role only
- Use separate Key Vaults per environment (dev/staging/prod)

✅ **Secrets Management:**
- Set `creationPolicy: Owner` so External Secrets manages secret lifecycle
- Use `refreshInterval: 1h` or longer for production
- Store connection strings, passwords, and API keys in Key Vault

✅ **GitOps:**
- Enable ArgoCD auto-sync for dev/staging
- Use manual sync for production deployments
- Use `syncOptions: [PruneLast=true]` for safe resource cleanup

✅ **High Availability:**
- Use multiple replicas for API pods
- Configure PodDisruptionBudgets
- Use pod anti-affinity for spreading across nodes

---

## Troubleshooting

### External Secrets Not Syncing

Check External Secrets Operator logs:
```bash
kubectl logs -n external-secrets-system -l app.kubernetes.io/name=external-secrets
```

Verify SecretStore status:
```bash
kubectl describe secretstore azure-keyvault -n <ENVIRONMENT>
```

### Key Vault Access Issues

Test managed identity access:
```bash
# Create a test ExternalSecret
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: test-secret
  namespace: <ENVIRONMENT>
spec:
  secretStoreRef:
    name: azure-keyvault
    kind: SecretStore
  target:
    name: test-k8s-secret
  data:
    - secretKey: test
      remoteRef:
        key: postgres-password
EOF

# Check if secret was created
kubectl get secret test-k8s-secret -n <ENVIRONMENT>
```

### ArgoCD Application Not Syncing

Check application status:
```bash
kubectl describe application fluxion-production -n argocd
```

View ArgoCD server logs:
```bash
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-server
```

---

## Further Reading

- [External Secrets Azure Key Vault Provider](https://external-secrets.io/latest/provider/azure-key-vault/)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [Azure Key Vault Best Practices](https://learn.microsoft.com/azure/key-vault/general/best-practices)
- [AKS Workload Identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)
- [Terraform Infrastructure Setup](../../terraform/README.md)

