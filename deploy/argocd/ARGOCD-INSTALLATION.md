# ArgoCD Installation Guide for Fluxion

This guide provides comprehensive instructions for installing and configuring ArgoCD to manage Fluxion deployments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Options](#installation-options)
- [Standard Installation](#standard-installation)
- [High Availability Installation](#high-availability-installation)
- [Ingress Configuration](#ingress-configuration)
- [RBAC Configuration](#rbac-configuration)
- [Admin Password Management](#admin-password-management)
- [SSO Configuration (Optional)](#sso-configuration-optional)
- [Bootstrap Fluxion Applications](#bootstrap-fluxion-applications)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Kubernetes cluster (1.24+)
- `kubectl` configured to access your cluster
- Cluster admin access
- 4GB+ available memory for ArgoCD components
- Optional: Ingress controller (nginx, traefik, etc.)
- Optional: cert-manager for TLS certificates

## Installation Options

### Option 1: Standard Installation (Single Replica)

Suitable for:
- Development environments
- Small teams
- Non-critical workloads

### Option 2: High Availability Installation (Multi-Replica)

Suitable for:
- Production environments
- Large teams
- Critical workloads requiring high availability

## Standard Installation

### Step 1: Create Namespace

```bash
kubectl create namespace argocd
```

### Step 2: Install ArgoCD

```bash
# Install ArgoCD stable version
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for all components to be ready
kubectl wait --for=condition=available --timeout=300s \
  deployment/argocd-server \
  deployment/argocd-repo-server \
  deployment/argocd-applicationset-controller \
  deployment/argocd-notifications-controller \
  -n argocd
```

### Step 3: Verify Installation

```bash
# Check all pods are running
kubectl get pods -n argocd

# Expected output:
# NAME                                                READY   STATUS
# argocd-application-controller-0                     1/1     Running
# argocd-applicationset-controller-xxxxxxxxxx-xxxxx   1/1     Running
# argocd-dex-server-xxxxxxxxxx-xxxxx                  1/1     Running
# argocd-notifications-controller-xxxxxxxxxx-xxxxx    1/1     Running
# argocd-redis-xxxxxxxxxx-xxxxx                       1/1     Running
# argocd-repo-server-xxxxxxxxxx-xxxxx                 1/1     Running
# argocd-server-xxxxxxxxxx-xxxxx                      1/1     Running
```

## High Availability Installation

For production environments, use the HA installation:

```bash
# Install ArgoCD HA version
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/ha/install.yaml

# This installs:
# - 3 replicas of argocd-server
# - 2 replicas of argocd-repo-server
# - 3 replicas of argocd-application-controller (sharded)
# - Redis HA with Sentinel
```

## Ingress Configuration

### Option 1: Nginx Ingress (Recommended)

Create an ingress for the ArgoCD server:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server-ingress
  namespace: argocd
  annotations:
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/ssl-passthrough: "true"
    nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"
    # Optional: Use cert-manager for TLS
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  rules:
  - host: argocd.example.com  # Change to your domain
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: argocd-server
            port:
              name: https
  tls:
  - hosts:
    - argocd.example.com  # Change to your domain
    secretName: argocd-server-tls
EOF
```

### Option 2: Insecure HTTP (Development Only)

For development environments without TLS:

```bash
# Disable TLS on argocd-server
kubectl patch configmap argocd-cmd-params-cm -n argocd \
  --type merge \
  -p '{"data": {"server.insecure": "true"}}'

# Restart argocd-server
kubectl rollout restart deployment argocd-server -n argocd

# Create HTTP ingress
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server-ingress
  namespace: argocd
  annotations:
    nginx.ingress.kubernetes.io/backend-protocol: "HTTP"
spec:
  ingressClassName: nginx
  rules:
  - host: argocd.local  # Use in /etc/hosts for local testing
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: argocd-server
            port:
              name: http
EOF
```

### Option 3: Port Forward (Quick Access)

For quick access without configuring ingress:

```bash
# Forward port 8080 to argocd-server
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Access at https://localhost:8080
```

## RBAC Configuration

ArgoCD comes with default RBAC policies. To customize:

### Create Custom RBAC Policy

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-rbac-cm
  namespace: argocd
data:
  # Default policy: role:readonly for all authenticated users
  policy.default: role:readonly
  
  # CSV format: p, subject, resource, action, object, effect
  policy.csv: |
    # Grant admin role to specific users
    p, role:admin, applications, *, */*, allow
    p, role:admin, clusters, *, *, allow
    p, role:admin, repositories, *, *, allow
    p, role:admin, projects, *, *, allow
    p, role:admin, accounts, *, *, allow
    p, role:admin, certificates, *, *, allow
    p, role:admin, gpgkeys, *, *, allow
    
    # Grant developer role - can sync apps but not delete
    p, role:developer, applications, get, */*, allow
    p, role:developer, applications, sync, */*, allow
    p, role:developer, applications, override, */*, allow
    p, role:developer, repositories, get, *, allow
    p, role:developer, projects, get, *, allow
    
    # Grant viewer role - read-only access
    p, role:viewer, applications, get, */*, allow
    p, role:viewer, repositories, get, *, allow
    p, role:viewer, projects, get, *, allow
    p, role:viewer, clusters, get, *, allow
    
    # Assign roles to users/groups
    g, admin@example.com, role:admin
    g, dev-team, role:developer
    g, ops-team, role:admin
EOF

# Restart argocd-server to apply changes
kubectl rollout restart deployment argocd-server -n argocd
```

## Admin Password Management

### Get Initial Admin Password

```bash
# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo

# Save this password securely
```

### Change Admin Password

```bash
# Method 1: Using ArgoCD CLI
argocd login argocd.example.com
argocd account update-password

# Method 2: Using kubectl
# Generate bcrypt hash of new password
NEW_PASSWORD="your-new-secure-password"
BCRYPT_HASH=$(htpasswd -bnBC 10 "" "$NEW_PASSWORD" | tr -d ':\n')

# Update the secret
kubectl -n argocd patch secret argocd-secret \
  -p "{\"stringData\": {\"admin.password\": \"$BCRYPT_HASH\", \"admin.passwordMtime\": \"$(date +%FT%T%Z)\"}}"

# Method 3: Disable admin user and use SSO only
kubectl patch configmap argocd-cm -n argocd \
  --type merge \
  -p '{"data": {"admin.enabled": "false"}}'
```

### Delete Initial Admin Secret (After Changing Password)

```bash
# After you've changed the admin password, delete the initial secret
kubectl -n argocd delete secret argocd-initial-admin-secret
```

## SSO Configuration (Optional)

ArgoCD supports multiple SSO providers. Here are configurations for common providers:

### GitHub OAuth

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  url: https://argocd.example.com
  dex.config: |
    connectors:
    - type: github
      id: github
      name: GitHub
      config:
        clientID: \$dex.github.clientId
        clientSecret: \$dex.github.clientSecret
        orgs:
        - name: your-github-org
          teams:
          - developers
          - admins
---
apiVersion: v1
kind: Secret
metadata:
  name: argocd-secret
  namespace: argocd
stringData:
  dex.github.clientId: "YOUR_GITHUB_CLIENT_ID"
  dex.github.clientSecret: "YOUR_GITHUB_CLIENT_SECRET"
EOF
```

### OIDC (Generic)

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  url: https://argocd.example.com
  oidc.config: |
    name: "Your OIDC Provider"
    issuer: https://your-oidc-provider.com
    clientID: your-client-id
    clientSecret: \$oidc.clientSecret
    requestedScopes:
      - openid
      - profile
      - email
      - groups
---
apiVersion: v1
kind: Secret
metadata:
  name: argocd-secret
  namespace: argocd
stringData:
  oidc.clientSecret: "YOUR_OIDC_CLIENT_SECRET"
EOF
```

### SAML 2.0

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  url: https://argocd.example.com
  dex.config: |
    connectors:
    - type: saml
      id: saml
      name: "Corporate SSO"
      config:
        ssoURL: https://sso.example.com/saml
        caData: |
          -----BEGIN CERTIFICATE-----
          ... your IDP certificate ...
          -----END CERTIFICATE-----
        usernameAttr: email
        emailAttr: email
        groupsAttr: groups
EOF
```

After configuring SSO, map groups to roles in `argocd-rbac-cm`.

## Bootstrap Fluxion Applications

Once ArgoCD is installed and configured, bootstrap the Fluxion applications:

### Step 1: Apply Fluxion Project

```bash
kubectl apply -f deploy/argocd/projects/fluxion-project.yaml
```

### Step 2: Apply Root App-of-Apps

```bash
kubectl apply -f deploy/argocd/root-app.yaml
```

The root app will automatically discover and deploy all applications defined in `deploy/argocd/apps/`.

### Step 3: Verify Applications

```bash
# List all applications
kubectl get applications -n argocd

# Or use ArgoCD CLI
argocd app list

# Check status of root app
argocd app get fluxion-apps
```

### Alternative: Manual Application Deployment

If you prefer to deploy applications individually:

```bash
# Development environment
kubectl apply -f deploy/argocd/apps/fluxion-dev.yaml

# Staging environment
kubectl apply -f deploy/argocd/apps/fluxion-staging.yaml

# Production environment (manual sync required)
kubectl apply -f deploy/argocd/apps/fluxion-production.yaml

# Observability stack
kubectl apply -f deploy/argocd/apps/prometheus-stack.yaml
kubectl apply -f deploy/argocd/apps/opentelemetry-operator.yaml
kubectl apply -f deploy/argocd/apps/jaeger.yaml
kubectl apply -f deploy/argocd/apps/grafana-dashboards.yaml
```

## Verification

### Verify ArgoCD Installation

```bash
# Check all pods are healthy
kubectl get pods -n argocd

# Check services
kubectl get svc -n argocd

# Check ingress (if configured)
kubectl get ingress -n argocd
```

### Verify Fluxion Applications

```bash
# Check applications are synced
kubectl get applications -n argocd

# Check specific application details
kubectl describe application fluxion-production -n argocd

# Via ArgoCD CLI
argocd app get fluxion-production
```

### Access ArgoCD UI

1. Navigate to your ArgoCD URL (e.g., https://argocd.example.com)
2. Login with username `admin` and the password you set
3. You should see all Fluxion applications in the UI
4. Applications should be in "Synced" and "Healthy" status

### Install ArgoCD CLI (Optional)

```bash
# Linux
curl -sSL -o /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x /usr/local/bin/argocd

# macOS
brew install argocd

# Windows
# Download from https://github.com/argoproj/argo-cd/releases/latest

# Login
argocd login argocd.example.com
```

## Troubleshooting

### ArgoCD Pods Not Starting

```bash
# Check pod logs
kubectl logs -n argocd deployment/argocd-server
kubectl logs -n argocd deployment/argocd-repo-server
kubectl logs -n argocd statefulset/argocd-application-controller

# Check events
kubectl get events -n argocd --sort-by='.lastTimestamp'

# Check resource constraints
kubectl describe pod -n argocd <pod-name>
```

### Cannot Access ArgoCD UI

```bash
# Verify service is running
kubectl get svc argocd-server -n argocd

# Check ingress configuration
kubectl describe ingress argocd-server-ingress -n argocd

# Test with port-forward
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Check firewall/security groups
```

### Applications Not Syncing

```bash
# Check application status
argocd app get <app-name>

# Force refresh
argocd app get <app-name> --refresh

# Check sync operation
kubectl describe application <app-name> -n argocd

# View logs
kubectl logs -n argocd deployment/argocd-repo-server
```

### Repository Connection Issues

```bash
# Test repository connection
argocd repo list

# Add repository manually
argocd repo add https://github.com/wesback/fluxion

# For private repositories, add credentials:
argocd repo add https://github.com/wesback/fluxion \
  --username <username> \
  --password <token>
```

### Certificate Issues

```bash
# Skip TLS verification (not recommended for production)
kubectl patch configmap argocd-cm -n argocd \
  --type merge \
  -p '{"data": {"repo.insecure": "true"}}'

# Add custom CA certificate
kubectl create configmap argocd-tls-certs-cm -n argocd \
  --from-file=your-ca.crt=/path/to/ca.crt
```

### Reset ArgoCD Admin Password

```bash
# Delete admin password to reset to initial secret
kubectl patch secret argocd-secret -n argocd \
  -p '{"data": {"admin.password": null, "admin.passwordMtime": null}}'

# Restart argocd-server
kubectl rollout restart deployment argocd-server -n argocd

# Get initial password again
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo
```

## Security Best Practices

1. **Use HTTPS**: Always use TLS for ArgoCD server
2. **Strong Passwords**: Use strong, unique passwords for admin account
3. **Enable SSO**: Configure SSO for better access control
4. **RBAC**: Implement least-privilege RBAC policies
5. **Network Policies**: Restrict network access to ArgoCD components
6. **Audit Logs**: Enable and monitor audit logs
7. **Secrets Management**: Use external secret managers (Vault, AWS Secrets Manager, etc.)
8. **Regular Updates**: Keep ArgoCD updated to the latest stable version
9. **Disable Admin**: Consider disabling the admin user after configuring SSO
10. **Webhook Secrets**: Use webhook secrets for Git webhooks

## Monitoring ArgoCD

```bash
# Check ArgoCD metrics
kubectl port-forward svc/argocd-metrics -n argocd 8082:8082
curl http://localhost:8082/metrics

# Check ArgoCD server metrics
kubectl port-forward svc/argocd-server-metrics -n argocd 8083:8083
curl http://localhost:8083/metrics

# View logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-server -f
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller -f
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-repo-server -f
```

## Next Steps

After installing ArgoCD:

1. Configure secrets for Fluxion applications (see [SECRETS.md](../SECRETS.md))
2. Set up ArgoCD Image Updater (see [IMAGE-UPDATER.md](IMAGE-UPDATER.md))
3. Configure notifications (see [NOTIFICATIONS.md](NOTIFICATIONS.md))
4. Review sync policies (see [SYNC-POLICIES.md](SYNC-POLICIES.md))
5. Set up disaster recovery procedures (see [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md))
6. Review GitOps workflow (see [GITOPS-WORKFLOW.md](GITOPS-WORKFLOW.md))

## Additional Resources

- [ArgoCD Official Documentation](https://argo-cd.readthedocs.io/)
- [ArgoCD GitHub Repository](https://github.com/argoproj/argo-cd)
- [Fluxion Deployment Guide](../README.md)
- [Fluxion Repository](https://github.com/wesback/fluxion)
