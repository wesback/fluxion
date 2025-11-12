# Fixing GitHub Actions Kubernetes RBAC Permissions

## Problem Analysis 🔍

Your workflow is failing with:
```
Error from server (Forbidden): services is forbidden: User "dc92424c-d019-45b4-9539-0def7798aa00" 
cannot list resource "services" in API group "" in the namespace "kube-system"
```

This means:
- ✅ Azure login succeeded
- ✅ kubeconfig retrieved successfully
- ❌ Service Principal lacks Kubernetes RBAC permissions inside the cluster

## Root Cause

The service principal (`dc92424c-d019-45b4-9539-0def7798aa00`) has Azure-level permissions but no Kubernetes RBAC roles. There are 3 common solutions:

### Solution 1: Grant Cluster Admin (Quick, but not recommended for production)

```bash
# Get your service principal's object ID
GITHUB_SP_OBJECT_ID="dc92424c-d019-45b4-9539-0def7798aa00"

# Create ClusterRoleBinding to grant admin access
kubectl create clusterrolebinding github-actions-admin \
  --clusterrole=cluster-admin \
  --serviceaccount=default:github-actions \
  --user=$GITHUB_SP_OBJECT_ID \
  --dry-run=client -o yaml | kubectl apply -f -

# Or if using Azure AD app registration:
az role assignment create \
  --role "Azure Kubernetes Service Cluster Admin Role" \
  --assignee $GITHUB_SP_OBJECT_ID \
  --scope "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/fluxion-dev-rg/providers/Microsoft.ContainerService/managedClusters/fluxion-dev-aks"
```

### Solution 2: Create Service Account for GitHub Actions (Recommended)

```bash
# Create namespace for GitHub Actions
kubectl create namespace github-actions

# Create service account
kubectl create serviceaccount github-actions-sa -n github-actions

# Create ClusterRole with minimal permissions
cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: github-actions-role
rules:
- apiGroups: [""]
  resources: ["namespaces", "secrets"]
  verbs: ["get", "create", "patch", "list"]
- apiGroups: ["cert-manager.io"]
  resources: ["clusterissuers", "issuers"]
  verbs: ["get", "list", "create", "patch"]
EOF

# Bind the role to the service account
kubectl create clusterrolebinding github-actions-binding \
  --clusterrole=github-actions-role \
  --serviceaccount=github-actions:github-actions-sa

# Get the service account token
kubectl get secret -n github-actions \
  $(kubectl get secret -n github-actions | grep github-actions-sa-token | awk '{print $1}') \
  -o jsonpath='{.data.token}' | base64 --decode

# Get the API server endpoint
kubectl cluster-info | grep 'Kubernetes master' | awk '/https/ {print $NF}'
```

### Solution 3: Use Azure AD Pod Identity (Most Secure)

This allows the pod to assume an Azure managed identity. See the guide below.

---

## Recommended Fix for Your Setup 🎯

For GitHub Actions accessing your AKS cluster, use **Solution 2 (Service Account)** combined with your federated OIDC:

### Step 1: Create Minimal RBAC for GitHub Actions

```bash
#!/bin/bash
set -e

echo "Creating GitHub Actions RBAC setup..."

# Create namespace
kubectl create namespace github-actions --dry-run=client -o yaml | kubectl apply -f -

# Create service account
kubectl create serviceaccount github-actions-sa -n github-actions --dry-run=client -o yaml | kubectl apply -f -

# Create ClusterRole with minimal permissions
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: github-actions-role
rules:
# Namespace operations
- apiGroups: [""]
  resources: ["namespaces"]
  verbs: ["get", "create", "list"]
# Secret operations (for cert-manager credentials)
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "create", "patch", "list", "watch"]
# Cert-manager operations
- apiGroups: ["cert-manager.io"]
  resources: ["clusterissuers", "issuers", "certificates"]
  verbs: ["get", "list", "create", "patch", "watch"]
# Deployment operations (for verification)
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list"]
EOF

# Bind the role
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: github-actions-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: github-actions-role
subjects:
- kind: ServiceAccount
  name: github-actions-sa
  namespace: github-actions
EOF

echo "✅ RBAC setup complete"
```

### Step 2: Update Your Workflow

Instead of relying on the service principal's Azure RBAC, add a step to authenticate as the service account:

```yaml
- name: Set up kubectl authentication
  run: |
    # Get service account details
    TOKEN=$(kubectl get secret -n github-actions \
      $(kubectl get secret -n github-actions -o jsonpath='{.items[?(@.metadata.annotations.kubernetes\.io/service-account\.name=="github-actions-sa")].metadata.name}') \
      -o jsonpath='{.data.token}' | base64 --decode)
    
    API_SERVER=$(kubectl cluster-info | grep 'Kubernetes master' | awk '/https/ {print $NF}')
    CA_CERT=$(kubectl get secret -n github-actions \
      $(kubectl get secret -n github-actions -o jsonpath='{.items[?(@.metadata.annotations.kubernetes\.io/service-account\.name=="github-actions-sa")].metadata.name}') \
      -o jsonpath='{.data.ca\.crt}')
    
    # Update kubeconfig
    kubectl config set-cluster github-actions \
      --server=$API_SERVER \
      --certificate-authority=<(echo $CA_CERT | base64 --decode)
    
    kubectl config set-credentials github-actions-user \
      --token=$TOKEN
    
    kubectl config set-context github-actions \
      --cluster=github-actions \
      --user=github-actions-user
    
    kubectl config use-context github-actions
```

---

## Quick Fix: Use Azure CLI Directly

The simpler approach - keep using Azure login but ensure your service principal has cluster-admin:

```bash
# Get your subscription ID and resource group
SUBSCRIPTION_ID="<your-subscription-id>"
RESOURCE_GROUP="fluxion-dev-rg"
CLUSTER_NAME="fluxion-dev-aks"
SP_OBJECT_ID="dc92424c-d019-45b4-9539-0def7798aa00"

# Grant cluster admin role
az role assignment create \
  --role "Azure Kubernetes Service Cluster Admin Role" \
  --assignee "$SP_OBJECT_ID" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.ContainerService/managedClusters/$CLUSTER_NAME"

# Verify the role assignment
az role assignment list \
  --assignee "$SP_OBJECT_ID" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.ContainerService/managedClusters/$CLUSTER_NAME"
```

---

## Troubleshooting Steps 🔧

### 1. Verify Current Permissions

```bash
# See who you are
kubectl auth whoami

# Check what you can do
kubectl auth can-i create secrets -n cert-manager
kubectl auth can-i list services -n kube-system
kubectl auth can-i get clusterissuers

# List all role bindings for your user
kubectl get rolebinding,clusterrolebinding -A -o jsonpath='{range .items[*]}{.kind}{"\t"}{.metadata.name}{"\n"}{end}'
```

### 2. Check Service Principal ID

```bash
# From Azure CLI
az ad sp show --id dc92424c-d019-45b4-9539-0def7798aa00
```

### 3. Validate Workflow Can Access Cluster

```bash
# Add this step to your workflow to debug
- name: Debug RBAC
  run: |
    echo "=== Current User ==="
    kubectl auth whoami || echo "Error: Cannot identify user"
    
    echo "=== Available Operations ==="
    kubectl auth can-i create secrets -n cert-manager
    kubectl auth can-i create services -n default
    
    echo "=== Cluster Role Bindings ==="
    kubectl get clusterrolebinding -o wide
```

---

## Recommended: Update Workflow with Better Error Handling

```yaml
- name: Get AKS credentials
  run: |
    echo "Fetching AKS credentials..."
    az aks get-credentials \
      --resource-group fluxion-dev-rg \
      --name fluxion-dev-aks \
      --file $HOME/.kube/config \
      --overwrite-existing
    
    # Verify connection with explicit error handling
    if ! kubectl cluster-info &> /dev/null; then
      echo "❌ Cannot connect to cluster"
      kubectl auth whoami
      exit 1
    fi
    echo "✅ Connected to cluster"

- name: Verify RBAC permissions
  run: |
    echo "Checking RBAC permissions..."
    
    if ! kubectl auth can-i create secrets -n cert-manager; then
      echo "❌ No permission to create secrets in cert-manager"
      echo "   Run: az role assignment create --role 'Azure Kubernetes Service Cluster Admin Role' --assignee <SERVICE_PRINCIPAL_ID>"
      exit 1
    fi
    
    echo "✅ RBAC permissions OK"
```

---

## Summary: What to Do Now

**Choose ONE of these approaches:**

1. **Quick Fix (Easiest):**
   ```bash
   az role assignment create \
     --role "Azure Kubernetes Service Cluster Admin Role" \
     --assignee "dc92424c-d019-45b4-9539-0def7798aa00" \
     --scope "/subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/fluxion-dev-rg/providers/Microsoft.ContainerService/managedClusters/fluxion-dev-aks"
   ```

2. **Production Fix (Recommended):**
   - Follow Solution 2 above (Service Account with minimal RBAC)
   - Update workflow to use service account token

3. **Most Secure (Enterprise):**
   - Use Azure AD Pod Identity
   - Add ManagedIdentity binding
   - Update service principal with Workload Identity

---

**Next Steps:**
1. Run the quick fix command with your subscription ID
2. Re-run the workflow
3. If still failing, run the debug step above and share the output
