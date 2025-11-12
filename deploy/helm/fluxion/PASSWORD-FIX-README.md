# PostgreSQL Authentication Fix

## Problem Summary

The API was failing to connect to PostgreSQL with:
```
asyncpg.exceptions.InvalidPasswordError: password authentication failed for user "fluxion"
```

**Root Cause:** The Helm chart was generating two different random passwords:
- One for the `fluxion-postgresql` secret (used by PostgreSQL)
- Another for the `fluxion-api` secret (used by the API)

This happened because both `postgresql-secret.yaml` and `api-secret.yaml` used `randAlphaNum 32`, which generates a **new** random value each time.

## Solution Applied

Added an explicit password in `values-local.yaml`:
```yaml
postgresql:
  auth:
    password: "fluxion-local-dev-password-change-in-prod"
```

Now both secrets will use the same password from the values file.

## How to Deploy the Fix

### Option 1: Automated Script (Recommended)

```bash
# Make sure you're connected to the cluster first
az aks get-credentials --resource-group <your-rg> --name <your-cluster>

# Run the automated fix script
cd /home/wesleyb/git/fluxion/deploy/helm/fluxion
./fix-password-auth.sh
```

### Option 2: Manual Steps

```bash
# 1. Connect to cluster
az aks get-credentials --resource-group <your-rg> --name <your-cluster>

# 2. Delete the mismatched secrets
kubectl delete secret fluxion-postgresql fluxion-api -n apps

# 3. Upgrade Helm with the fixed values
cd /home/wesleyb/git/fluxion/deploy/helm/fluxion
helm upgrade fluxion . -f values-local.yaml -n apps --wait

# 4. Restart PostgreSQL
kubectl rollout restart statefulset/fluxion-postgresql -n apps
kubectl rollout status statefulset/fluxion-postgresql -n apps

# 5. Restart API
kubectl rollout restart deployment/fluxion-api -n apps
kubectl rollout status deployment/fluxion-api -n apps

# 6. Verify - check logs for errors
kubectl logs -f -l app.kubernetes.io/component=api -n apps
```

## Verification

After deployment, verify there are no more authentication errors:
```bash
# Check recent logs
kubectl logs -l app.kubernetes.io/component=api -n apps --tail=50 --since=5m | grep -i password

# If no output, the fix worked!
```

## For Production

⚠️ **Important:** Change the password to a secure random value:

```bash
# Generate a secure password
PASSWORD=$(openssl rand -base64 32)
echo "Generated password: $PASSWORD"

# Update values file
# Then deploy using the same steps above
```

## Better Long-term Solution

Consider using external secret management:

1. **Azure Key Vault with External Secrets Operator**
2. **Sealed Secrets**
3. **Or use `postgresql.auth.existingSecret`** to reference a pre-created secret

This prevents passwords from being stored in Git and ensures proper secret rotation.

## Technical Details

The fix ensures that both secrets use the same password by checking in this order:
1. `secrets.postgresPassword` (if set)
2. `postgresql.auth.password` (if set) ← **This is what we're using**
3. `randAlphaNum 32` (fallback - generates random password)

See the templates:
- `templates/postgresql-secret.yaml`
- `templates/api-secret.yaml`

Both now use the same logic and will get the same password from `postgresql.auth.password`.
