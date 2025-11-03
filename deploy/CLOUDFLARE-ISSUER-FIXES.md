# Cloudflare Issuer Workflow - Issues & Fixes

## Issues Found in Original Workflow ❌

### 1. **Double Secret Creation (Contradictory Logic)**
**Problem:** The workflow was creating the Cloudflare secret in two different ways:
- Step 3: `Create or update Cloudflare API Secret` - created a secret from environment variable
- Step 4: `Update ClusterIssuer with Cloudflare credentials` - tried to create the secret again from YAML file

**Impact:** Inefficient, confusing, and error-prone. The YAML file contained literal template variables instead of actual values.

### 2. **Secrets Stored in Git Repository** ⚠️
**Problem:** The `deploy/cert-manager-cloudflare-issuer.yaml` file contained:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cloudflare-api-token
  namespace: cert-manager
type: Opaque
stringData:
  api-token: "${CLOUDFLARE_API_TOKEN}"  # ← Secret definition in Git!
```

**Impact:** 
- Security anti-pattern - secrets should never be in version control
- Makes the YAML file environment-dependent
- Not suitable for GitOps workflows

### 3. **Sed Command Escaping Vulnerability** 🔓
**Problem:** The original workflow used:
```bash
sed "s/\${CLOUDFLARE_EMAIL}/$CLOUDFLARE_EMAIL/g"
```

**Impact:** 
- If the secret contains special characters (`/`, `&`, `\`), sed fails
- No escaping of delimiter conflicts
- Brittle and unmaintainable

### 4. **No Namespace Validation**
**Problem:** The workflow assumed `cert-manager` namespace already existed.

**Impact:** Secret creation would fail if namespace was deleted or not yet created.

### 5. **No Error Handling or Validation**
**Problem:** 
- No validation that required secrets exist before deployment
- No cluster connectivity check
- Failed steps provided no clear feedback

**Impact:** Difficult to debug failures in CI/CD pipeline.

---

## Solutions Implemented ✅

### 1. **Removed Secret Definition from YAML**
The `deploy/cert-manager-cloudflare-issuer.yaml` now contains **ONLY** the ClusterIssuer resources:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-dns01-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: wesleyb@live.be
    privateKeySecretRef:
      name: letsencrypt-dns01-prod
    solvers:
    - dns01:
        cloudflare:
          email: wesleyb@live.be
          apiTokenSecretRef:
            name: cloudflare-api-token  # ← References externally managed secret
            key: api-token
```

**Benefits:**
- ✅ Safe to commit to Git
- ✅ GitOps-friendly
- ✅ Secrets managed separately in workflow

### 2. **Secret Created Only in Workflow**
Workflow now creates the secret directly using `kubectl`:

```bash
kubectl create secret generic cloudflare-api-token \
  --namespace=cert-manager \
  --from-literal=api-token="${CLOUDFLARE_API_TOKEN}" \
  --dry-run=client -o yaml | kubectl apply -f -
```

**Benefits:**
- ✅ Uses `--from-literal` (safe for special characters)
- ✅ Uses `--dry-run` + `kubectl apply` (idempotent)
- ✅ Clear, single source of truth

### 3. **Added Secret Validation**
New step validates all required secrets before deployment:

```bash
if [ -z "${{ secrets.CLOUDFLARE_API_TOKEN }}" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN is not set"
  exit 1
fi
```

**Benefits:**
- ✅ Early failure if secrets are missing
- ✅ Clear error messages

### 4. **Added Namespace Validation**
New step ensures cert-manager namespace exists:

```bash
kubectl create namespace cert-manager --dry-run=client -o yaml | kubectl apply -f -
```

**Benefits:**
- ✅ Idempotent (safe to run multiple times)
- ✅ Creates namespace if missing
- ✅ No errors if namespace already exists

### 5. **Improved Error Handling**
New workflow includes:

```bash
# Verify cluster connection
kubectl cluster-info

# Verify secret creation
kubectl get secret cloudflare-api-token -n cert-manager

# Verify deployment
kubectl get clusterissuer letsencrypt-dns01-prod letsencrypt-dns01-staging
```

**Benefits:**
- ✅ Clear verification steps
- ✅ Easy to debug failures
- ✅ Provides confidence that deployment succeeded

---

## Workflow Structure (New)

```
1. ✅ Checkout code
2. ✅ Validate required secrets exist
3. ✅ Azure Login (OIDC)
4. ✅ Install tools
5. ✅ Get AKS credentials
6. ✅ Ensure cert-manager namespace exists
7. ✅ Create/Update Cloudflare API Secret (single source)
8. ✅ Deploy ClusterIssuers (from YAML)
9. ✅ Verify all deployments
```

---

## Security Improvements 🔐

| Issue | Before | After |
|-------|--------|-------|
| Secrets in Git | ❌ Yes | ✅ No |
| Special char handling | ❌ Vulnerable | ✅ Safe (`--from-literal`) |
| Secret validation | ❌ None | ✅ Early validation |
| Error handling | ❌ Poor | ✅ Comprehensive |
| Idempotence | ❌ Questionable | ✅ Yes (`apply` + `--dry-run`) |
| OIDC auth | ✅ Yes | ✅ Yes (unchanged) |

---

## Testing the Fixed Workflow

### Manual Test
```bash
# Trigger workflow manually
gh workflow run deploy-cloudflare-issuer.yml

# Watch the logs
gh run watch <RUN_ID>

# Verify secrets and issuers
kubectl get secret -n cert-manager cloudflare-api-token
kubectl get clusterissuer
```

### Verify the Secret References Work
```bash
# Check that ClusterIssuer can reference the secret
kubectl describe clusterissuer letsencrypt-dns01-prod
kubectl describe clusterissuer letsencrypt-dns01-staging
```

### Test Certificate Creation
```bash
# Create a test certificate to verify the issuers work
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: test-cert
  namespace: cert-manager
spec:
  secretName: test-cert-secret
  issuerRef:
    name: letsencrypt-dns01-staging
    kind: ClusterIssuer
  dnsNames:
    - example.com
EOF

# Monitor certificate creation
kubectl describe certificate test-cert -n cert-manager
```

---

## Next Steps

1. **Test the updated workflow** - Trigger it manually to verify it works
2. **Monitor cert-manager logs** - Check for any DNS01 validation issues:
   ```bash
   kubectl logs -n cert-manager deployment/cert-manager -f
   ```
3. **Consider Sealed Secrets** - For production, encrypt secrets using Sealed Secrets:
   - This allows storing encrypted secrets in Git
   - Only the Kubernetes cluster can decrypt them
   - See `deploy/SECRETS.md` for setup instructions

---

## Key Best Practices Applied

✅ **Principle of Least Privilege** - Secret only created when deploying  
✅ **GitOps-Friendly** - YAML can be committed to Git safely  
✅ **Idempotent** - Safe to run multiple times  
✅ **Clear Error Messages** - Easy to debug failures  
✅ **Defense in Depth** - Multiple validation layers  
✅ **OIDC Authentication** - No long-lived credentials stored  
