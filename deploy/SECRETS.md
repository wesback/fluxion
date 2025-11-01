# Secrets Management Guide for Fluxion

This guide covers best practices and methods for managing secrets in Fluxion deployments.

## ⚠️ Security Warning

**NEVER commit plain-text secrets to Git!** This includes:
- Database passwords
- API keys
- TLS certificates
- Any sensitive configuration

## Secret Types in Fluxion

Fluxion requires the following secrets:

1. **PostgreSQL Password**: Database authentication
2. **Admin API Key**: Initial admin access to the API
3. **TLS Certificates**: (Optional) For HTTPS ingress

## Secret Management Options

### Option 1: Kubernetes Secrets (Testing Only)

**Use only for local development/testing!**

```bash
# Create namespace
kubectl create namespace fluxion-dev

# Create secrets manually
kubectl create secret generic fluxion-postgresql \
  --namespace=fluxion-dev \
  --from-literal=postgres-password='test-password-123'

kubectl create secret generic fluxion-api \
  --namespace=fluxion-dev \
  --from-literal=postgres-password='test-password-123' \
  --from-literal=admin-api-key='test-api-key-456'
```

Then reference in values:

```yaml
postgresql:
  auth:
    existingSecret: "fluxion-postgresql"
    secretKey: "postgres-password"
```

### Option 2: Sealed Secrets (GitOps-Friendly)

Sealed Secrets encrypt secrets so they can be safely stored in Git.

#### Installation

```bash
# Install Sealed Secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Install kubeseal CLI
# macOS
brew install kubeseal

# Linux
wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/kubeseal-0.24.0-linux-amd64.tar.gz
tar -xvzf kubeseal-0.24.0-linux-amd64.tar.gz
sudo install -m 755 kubeseal /usr/local/bin/kubeseal
```

#### Creating Sealed Secrets

```bash
# Generate secure passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
ADMIN_API_KEY=$(python backend/scripts/generate_admin_key.py)

# Create and seal PostgreSQL secret
kubectl create secret generic fluxion-postgresql \
  --namespace=fluxion-production \
  --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
  --dry-run=client -o yaml | \
  kubeseal --format=yaml > deploy/secrets/fluxion-postgresql-sealed.yaml

# Create and seal API secret
kubectl create secret generic fluxion-api \
  --namespace=fluxion-production \
  --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
  --from-literal=admin-api-key="${ADMIN_API_KEY}" \
  --dry-run=client -o yaml | \
  kubeseal --format=yaml > deploy/secrets/fluxion-api-sealed.yaml

# Apply sealed secrets (safe to commit to Git)
kubectl apply -f deploy/secrets/fluxion-postgresql-sealed.yaml
kubectl apply -f deploy/secrets/fluxion-api-sealed.yaml
```

#### Updating Sealed Secrets

```bash
# To update a sealed secret, recreate it
POSTGRES_PASSWORD="new-password"

kubectl create secret generic fluxion-postgresql \
  --namespace=fluxion-production \
  --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
  --dry-run=client -o yaml | \
  kubeseal --format=yaml > deploy/secrets/fluxion-postgresql-sealed.yaml

kubectl apply -f deploy/secrets/fluxion-postgresql-sealed.yaml
```

#### Backup and Disaster Recovery

```bash
# Backup the sealing key (KEEP THIS SECURE!)
kubectl get secret -n kube-system sealed-secrets-key -o yaml > sealed-secrets-key-backup.yaml

# Restore sealing key on new cluster
kubectl apply -f sealed-secrets-key-backup.yaml
kubectl delete pod -n kube-system -l name=sealed-secrets-controller
```

### Option 3: External Secrets Operator (Enterprise)

External Secrets Operator integrates with external secret management systems.

#### Supported Backends

- AWS Secrets Manager
- AWS Systems Manager Parameter Store
- Azure Key Vault
- Google Secret Manager
- HashiCorp Vault
- 1Password
- Many others

#### Installation

```bash
# Add Helm repository
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

# Install External Secrets Operator
helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets-system \
  --create-namespace
```

#### AWS Secrets Manager Example

**1. Store secrets in AWS Secrets Manager:**

```bash
# Using AWS CLI
aws secretsmanager create-secret \
  --name fluxion/production/postgres-password \
  --secret-string "your-secure-password" \
  --region us-east-1

aws secretsmanager create-secret \
  --name fluxion/production/admin-api-key \
  --secret-string "your-admin-api-key" \
  --region us-east-1
```

**2. Create IAM role for service account:**

```bash
# Create IAM policy
cat > policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:fluxion/*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name FluxionSecretsAccess \
  --policy-document file://policy.json

# Create service account with IAM role (EKS)
eksctl create iamserviceaccount \
  --name external-secrets-sa \
  --namespace fluxion-production \
  --cluster my-cluster \
  --attach-policy-arn arn:aws:iam::ACCOUNT_ID:policy/FluxionSecretsAccess \
  --approve
```

**3. Create SecretStore:**

```yaml
# deploy/secrets/secretstore-aws.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets
  namespace: fluxion-production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
```

```bash
kubectl apply -f deploy/secrets/secretstore-aws.yaml
```

**4. Create ExternalSecret:**

```yaml
# deploy/secrets/externalsecret-fluxion.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: fluxion-secrets
  namespace: fluxion-production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: fluxion-api
    creationPolicy: Owner
  data:
    - secretKey: postgres-password
      remoteRef:
        key: fluxion/production/postgres-password
    - secretKey: admin-api-key
      remoteRef:
        key: fluxion/production/admin-api-key
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: fluxion-postgresql-secrets
  namespace: fluxion-production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: fluxion-postgresql
    creationPolicy: Owner
  data:
    - secretKey: postgres-password
      remoteRef:
        key: fluxion/production/postgres-password
```

```bash
kubectl apply -f deploy/secrets/externalsecret-fluxion.yaml
```

#### HashiCorp Vault Example

**1. Configure Vault:**

```bash
# Enable KV secrets engine
vault secrets enable -path=fluxion kv-v2

# Store secrets
vault kv put fluxion/production/database \
  postgres-password="your-secure-password"

vault kv put fluxion/production/api \
  admin-api-key="your-admin-api-key"

# Create policy
vault policy write fluxion-production - <<EOF
path "fluxion/data/production/*" {
  capabilities = ["read"]
}
EOF

# Enable Kubernetes auth
vault auth enable kubernetes

# Configure Kubernetes auth
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc:443" \
  kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
  token_reviewer_jwt=@/var/run/secrets/kubernetes.io/serviceaccount/token

# Create role
vault write auth/kubernetes/role/fluxion-production \
  bound_service_account_names=external-secrets-sa \
  bound_service_account_namespaces=fluxion-production \
  policies=fluxion-production \
  ttl=24h
```

**2. Create SecretStore:**

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
  namespace: fluxion-production
spec:
  provider:
    vault:
      server: "http://vault.vault.svc.cluster.local:8200"
      path: "fluxion"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "fluxion-production"
          serviceAccountRef:
            name: external-secrets-sa
```

**3. Create ExternalSecret:**

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: fluxion-secrets
  namespace: fluxion-production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: fluxion-api
  data:
    - secretKey: postgres-password
      remoteRef:
        key: production/database
        property: postgres-password
    - secretKey: admin-api-key
      remoteRef:
        key: production/api
        property: admin-api-key
```

### Option 4: SOPS (Mozilla)

SOPS encrypts values in YAML/JSON files.

#### Installation

```bash
# macOS
brew install sops

# Linux
wget https://github.com/mozilla/sops/releases/download/v3.8.1/sops-v3.8.1.linux.amd64
sudo mv sops-v3.8.1.linux.amd64 /usr/local/bin/sops
sudo chmod +x /usr/local/bin/sops
```

#### Using SOPS with Age

```bash
# Generate age key
age-keygen -o key.txt

# Create secrets file
cat > secrets.yaml <<EOF
postgresql:
  auth:
    password: your-secure-password
api:
  adminApiKey: your-admin-api-key
EOF

# Encrypt with SOPS
sops --age $(cat key.txt | grep public | cut -d: -f2 | tr -d ' ') \
  --encrypt secrets.yaml > secrets.enc.yaml

# Decrypt when needed
sops --decrypt secrets.enc.yaml > secrets.yaml
```

## Secret Rotation

### Manual Rotation

```bash
# 1. Generate new secrets
NEW_POSTGRES_PASSWORD=$(openssl rand -base64 32)
NEW_ADMIN_API_KEY=$(python backend/scripts/generate_admin_key.py)

# 2. Update secrets in your chosen backend (AWS Secrets Manager, Vault, etc.)
aws secretsmanager update-secret \
  --secret-id fluxion/production/postgres-password \
  --secret-string "${NEW_POSTGRES_PASSWORD}"

# 3. If using External Secrets, it will auto-refresh
# If using Sealed Secrets, recreate and apply

# 4. Restart pods to pick up new secrets
kubectl rollout restart deployment/fluxion-api -n fluxion-production
kubectl rollout restart statefulset/fluxion-postgresql -n fluxion-production
```

### Automated Rotation

With External Secrets Operator, secrets are automatically refreshed based on `refreshInterval`.

## Best Practices

1. **Never commit secrets to Git**: Use one of the encryption methods above
2. **Use strong passwords**: Minimum 32 characters, random
3. **Rotate regularly**: At least every 90 days
4. **Limit access**: Use RBAC to restrict who can access secrets
5. **Audit access**: Enable audit logging for secret access
6. **Backup encryption keys**: Store sealing keys and encryption keys securely
7. **Use different secrets per environment**: Don't reuse secrets across dev/staging/prod
8. **Monitor secret access**: Alert on unusual access patterns

## Verifying Secrets

```bash
# Check if secret exists
kubectl get secret fluxion-api -n fluxion-production

# View secret (base64 encoded)
kubectl get secret fluxion-api -n fluxion-production -o yaml

# Decode secret (DO NOT run in production logs!)
kubectl get secret fluxion-api -n fluxion-production \
  -o jsonpath='{.data.postgres-password}' | base64 -d

# Verify API can read secret
kubectl exec -it -n fluxion-production deployment/fluxion-api -- \
  env | grep POSTGRES_PASSWORD
```

## Troubleshooting

### Secret Not Found

```bash
# Check if secret exists in namespace
kubectl get secrets -n fluxion-production

# Check ExternalSecret status
kubectl describe externalsecret fluxion-secrets -n fluxion-production

# Check SecretStore status
kubectl describe secretstore aws-secrets -n fluxion-production
```

### Secret Not Syncing

```bash
# Check External Secrets Operator logs
kubectl logs -n external-secrets-system \
  -l app.kubernetes.io/name=external-secrets

# Force refresh
kubectl annotate externalsecret fluxion-secrets \
  -n fluxion-production \
  force-sync=$(date +%s) --overwrite
```

### Pods Not Starting Due to Missing Secrets

```bash
# Check pod events
kubectl describe pod -n fluxion-production -l app.kubernetes.io/component=api

# Check if secret is mounted
kubectl exec -it -n fluxion-production deployment/fluxion-api -- \
  ls -la /var/run/secrets/
```

## Emergency Access

If you need emergency access to recover secrets:

### Sealed Secrets

```bash
# Extract sealed secret
kubectl get sealedsecret -n fluxion-production fluxion-api -o yaml

# Get controller to decrypt (requires cluster access)
kubectl get secret -n fluxion-production fluxion-api -o yaml
```

### External Secrets

```bash
# Access secrets from backend directly
# AWS Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id fluxion/production/postgres-password

# HashiCorp Vault
vault kv get fluxion/production/database
```

## Additional Resources

- [Kubernetes Secrets Documentation](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Sealed Secrets Documentation](https://github.com/bitnami-labs/sealed-secrets)
- [External Secrets Operator Documentation](https://external-secrets.io/)
- [SOPS Documentation](https://github.com/mozilla/sops)
