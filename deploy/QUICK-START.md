# Quick Start: Fix Your Cloudflare Issuer Workflow

## TL;DR - Do This Now 🚀

```bash
# 1. Navigate to repo
cd /home/wesleyb/git/fluxion

# 2. Run the fix script
chmod +x deploy/fix-github-actions-rbac.sh
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
./deploy/fix-github-actions-rbac.sh "$SUBSCRIPTION_ID"

# 3. Verify it worked
kubectl auth can-i create secrets -n cert-manager  # Should say: yes

# 4. Commit and push
git add deploy/ .github/workflows/
git commit -m "fix: cloudflare issuer RBAC and workflow improvements"
git push origin main

# 5. Test the workflow
gh workflow run deploy-cloudflare-issuer.yml
gh run watch
```

That's it! ✅

---

## What Was Wrong? 🔴

Your workflow failed with:
```
Error from server (Forbidden): services is forbidden
```

**Why:** The GitHub Actions service principal had no Kubernetes permissions.

---

## What Changed? ✅

1. **Created the fix script** - `deploy/fix-github-actions-rbac.sh`
2. **Updated the YAML** - Removed template variables
3. **Updated the workflow** - Added RBAC diagnostics
4. **Created documentation** - Full guides in `deploy/`

---

## File Changes at a Glance 📋

### `deploy/cert-manager-cloudflare-issuer.yaml`
```yaml
# BEFORE
email: ${CLOUDFLARE_EMAIL}  # ← Template variable

# AFTER  
email: wesleyb@live.be      # ← Static value
```

### `.github/workflows/deploy-cloudflare-issuer.yml`
- ✅ Added RBAC permission check
- ✅ Better error messages
- ✅ Cleaner secret creation
- ✅ Comprehensive verification

### New Files
- ✅ `deploy/fix-github-actions-rbac.sh` - Automated fix
- ✅ `deploy/FIX-RBAC-PERMISSIONS.md` - Detailed guide
- ✅ `deploy/GITHUB-ACTIONS-RBAC-FIX.md` - Complete solution
- ✅ `deploy/ISSUE-REPORT-AND-RESOLUTION.md` - Full report

---

## Verify It Works 🧪

```bash
# Check the permission fix
az role assignment list \
  --assignee "dc92424c-d019-45b4-9539-0def7798aa00" \
  --output table
# Look for: "Azure Kubernetes Service Cluster Admin Role"

# Test kubectl access
az aks get-credentials \
  --resource-group fluxion-dev-rg \
  --name fluxion-dev-aks \
  --overwrite-existing

kubectl auth can-i create secrets -n cert-manager  # Should be: yes
```

---

## If Something Goes Wrong 🔧

Check these in order:

1. **Did the RBAC fix script run successfully?**
   ```bash
   az role assignment list --assignee "dc92424c-d019-45b4-9539-0def7798aa00" --output table
   ```

2. **Do you have fresh AKS credentials?**
   ```bash
   az aks get-credentials --resource-group fluxion-dev-rg --name fluxion-dev-aks --overwrite-existing
   ```

3. **Can you create secrets manually?**
   ```bash
   kubectl create secret generic test --from-literal=test=value -n cert-manager --dry-run=client
   ```

4. **Still stuck?**
   - See: `deploy/FIX-RBAC-PERMISSIONS.md` (troubleshooting section)
   - Run the debug workflow step

---

## Next Steps

After the fix works:

1. ✅ Verify ClusterIssuers are created: `kubectl get clusterissuer`
2. ✅ Monitor cert-manager: `kubectl logs -n cert-manager deployment/cert-manager`
3. ✅ Consider production hardening (see `deploy/FIX-RBAC-PERMISSIONS.md`)

---

## Questions?

- **"What's RBAC?"** → See `deploy/FIX-RBAC-PERMISSIONS.md`
- **"Is this secure?"** → Yes! OIDC + scoped to your cluster
- **"Need production setup?"** → See security section in `deploy/FIX-RBAC-PERMISSIONS.md`
- **"Still broken?"** → Check troubleshooting above

---

Done! Your workflow should work now. 🎉
