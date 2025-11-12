# GitHub Actions RBAC Issue - Complete Solution

## Problem Summary 🔴

Your workflow is failing with:
```
Error from server (Forbidden): services is forbidden: User "dc92424c-d019-45b4-9539-0def7798aa00" 
cannot list resource "services" in API group "" in the namespace "kube-system": 
User does not have access to the resource in Azure.
```

**Root Cause:** The service principal used by GitHub Actions has Azure-level permissions but lacks Kubernetes RBAC permissions inside your AKS cluster.

---

## What Changed ✅

### Files Updated:

1. **`deploy/cert-manager-cloudflare-issuer.yaml`**
   - Removed template variables (`${CLOUDFLARE_EMAIL}`)
   - Now uses static email address (stored safely outside Git)
   - Ready for GitOps deployment

2. **`.github/workflows/deploy-cloudflare-issuer.yml`**
   - Added `Verify RBAC permissions` step for better diagnostics
   - Better error messages
   - Helps identify permission issues early

3. **`deploy/FIX-RBAC-PERMISSIONS.md`** (NEW)
   - Complete guide to fix RBAC issues
   - Multiple solution approaches
   - Troubleshooting commands

4. **`deploy/fix-github-actions-rbac.sh`** (NEW)
   - Automated script to fix permissions
   - Ready to run

---

## Quick Fix - Run This Now 🚀

### Option 1: Automated Script (Recommended)

```bash
cd /home/wesleyb/git/fluxion

# Make it executable
chmod +x deploy/fix-github-actions-rbac.sh

# Get your subscription ID
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

# Run the fix script
./deploy/fix-github-actions-rbac.sh "$SUBSCRIPTION_ID"
```

### Option 2: Manual Command

```bash
# Get your subscription ID
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

# Grant cluster admin to the GitHub Actions service principal
az role assignment create \
  --role "Azure Kubernetes Service Cluster Admin Role" \
  --assignee "dc92424c-d019-45b4-9539-0def7798aa00" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/fluxion-dev-rg/providers/Microsoft.ContainerService/managedClusters/fluxion-dev-aks"

# Verify it worked
az role assignment list \
  --assignee "dc92424c-d019-45b4-9539-0def7798aa00" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/fluxion-dev-rg/providers/Microsoft.ContainerService/managedClusters/fluxion-dev-aks" \
  --output table
```

---

## What Each Option Does 📋

| Approach | Pros | Cons | Use When |
|----------|------|------|----------|
| **Option 1: Cluster Admin** | Simple, fast, GitHub Actions works immediately | Overly permissive | Dev/test environments |
| **Option 2: Service Account** | Minimal permissions, production-ready | More setup | Production or security-sensitive |
| **Option 3: Pod Identity** | Most secure, Azure-managed | Complex setup | Enterprise environments |

---

## Verify the Fix 🧪

After running the fix script, verify it worked:

```bash
# 1. Refresh your kubeconfig
az aks get-credentials \
  --resource-group fluxion-dev-rg \
  --name fluxion-dev-aks \
  --overwrite-existing

# 2. Check your permissions
kubectl auth whoami

# 3. Try the operations that were failing
kubectl auth can-i create secrets -n cert-manager
kubectl auth can-i get clusterissuers

# 4. Try manually what the workflow does
kubectl create namespace cert-manager --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic test-secret \
  --namespace=cert-manager \
  --from-literal=test=value \
  --dry-run=client -o yaml | kubectl apply -f -

# 5. Clean up test secret
kubectl delete secret test-secret -n cert-manager --ignore-not-found
```

---

## Next: Re-run the Workflow 🔄

Once the RBAC fix is applied:

```bash
# Manually trigger the workflow
gh workflow run deploy-cloudflare-issuer.yml

# Watch it run
gh run watch

# Or check the logs
gh run list --workflow="deploy-cloudflare-issuer.yml" --limit 1
gh run view <RUN_ID> --log
```

---

## What the Updated Workflow Does 📊

```
1. ✅ Checkout code
2. ✅ Validate secrets exist
3. ✅ Azure Login (OIDC)
4. ✅ Install tools
5. ✅ Get AKS credentials
6. ✅ [NEW] Verify RBAC permissions (shows diagnostic info)
7. ✅ Ensure cert-manager namespace exists
8. ✅ Create/Update Cloudflare API secret
9. ✅ Deploy ClusterIssuers
10. ✅ Verify deployment
```

The new "Verify RBAC permissions" step will help diagnose any remaining issues:

```yaml
- name: Verify RBAC permissions
  run: |
    echo "Checking RBAC permissions..."
    kubectl auth whoami                                     # Shows current user
    kubectl auth can-i create secrets -n cert-manager      # Can create secrets?
    kubectl auth can-i get clusterissuers                  # Can read CRDs?
    kubectl auth can-i create clusterissuers               # Can create CRDs?
```

---

## Troubleshooting: If It Still Fails 🔧

### Check 1: Verify Role Assignment

```bash
# List all role assignments for the service principal
az role assignment list \
  --assignee "dc92424c-d019-45b4-9539-0def7798aa00" \
  --output table

# Look for "Azure Kubernetes Service Cluster Admin Role"
```

### Check 2: Verify AKS Credentials

```bash
# Get a fresh kubeconfig
az aks get-credentials \
  --resource-group fluxion-dev-rg \
  --name fluxion-dev-aks \
  --overwrite-existing

# Check connection
kubectl cluster-info
kubectl get nodes
```

### Check 3: Check Service Principal

```bash
# Verify the service principal exists
az ad sp show --id dc92424c-d019-45b4-9539-0def7798aa00

# Check if it has subscriptions
az account list-for-tenant --query "[].{id:id,name:name}" -o table
```

### Check 4: Enable Diagnostic Logging

Add this to your workflow for detailed debugging:

```yaml
- name: Debug RBAC
  if: failure()
  run: |
    echo "=== Current context ==="
    kubectl config current-context
    kubectl config get-contexts
    
    echo "=== User info ==="
    kubectl auth whoami
    
    echo "=== All ClusterRoleBindings ==="
    kubectl get clusterrolebinding -o wide
    
    echo "=== All RoleBindings ==="
    kubectl get rolebinding -A -o wide
```

---

## Security Notes 🔐

The fix grants `Azure Kubernetes Service Cluster Admin Role` which:
- ✅ Is scoped to just your AKS cluster
- ✅ Uses federated OIDC (no long-lived credentials stored in GitHub)
- ✅ Can be revoked anytime
- ⚠️  Gives full cluster admin access (consider limiting to service accounts in production)

For production, consider:
1. Using a Kubernetes service account with minimal RBAC
2. Implementing admission controllers to restrict what GitHub Actions can do
3. Using network policies to limit resource access
4. Implementing audit logging

---

## Files Reference 📁

- **`deploy/FIX-RBAC-PERMISSIONS.md`** - Detailed RBAC troubleshooting guide
- **`deploy/fix-github-actions-rbac.sh`** - Automated fix script
- **`deploy/cert-manager-cloudflare-issuer.yaml`** - Updated issuer configuration (no templates)
- **`.github/workflows/deploy-cloudflare-issuer.yml`** - Updated workflow with RBAC diagnostics

---

## Summary of Changes 📝

| File | Change | Why |
|------|--------|-----|
| `cert-manager-cloudflare-issuer.yaml` | Removed `${CLOUDFLARE_EMAIL}` template | Safe for Git, no secrets or templates |
| `deploy-cloudflare-issuer.yml` | Added RBAC permission check | Better diagnostics and error messages |
| (NEW) `FIX-RBAC-PERMISSIONS.md` | Complete RBAC solution guide | Helps users understand and fix permissions |
| (NEW) `fix-github-actions-rbac.sh` | Automated permission fix | One-command fix for the issue |

---

## Ready to Test? ✨

```bash
# 1. Fix the permissions
cd /home/wesleyb/git/fluxion
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
./deploy/fix-github-actions-rbac.sh "$SUBSCRIPTION_ID"

# 2. Commit changes
git add deploy/ .github/
git commit -m "fix: update cloudflare issuer workflow with RBAC diagnostics"

# 3. Test the workflow
gh workflow run deploy-cloudflare-issuer.yml

# 4. Watch it run
gh run watch
```

The workflow should now succeed! 🎉
