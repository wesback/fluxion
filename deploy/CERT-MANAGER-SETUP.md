# Let's Encrypt Certificate Manager Setup

## Security Setup

### 1. Add GitHub Secret
Store your email as a GitHub secret to keep it out of version control:

1. Go to your GitHub repository: https://github.com/wesback/fluxion
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `LETSENCRYPT_EMAIL`
5. Value: `your-email@example.com` (your Let's Encrypt notification email)
6. Click **Add secret**

### 2. Create GitHub Actions Workflow
Create `.github/workflows/deploy-cert-manager.yml`:

```yaml
name: Deploy Cert-Manager Issuer

on:
  workflow_dispatch:
  push:
    paths:
      - 'deploy/cert-manager-issuer.yaml'
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up kubeconfig
        run: |
          # Configure your kubeconfig here
          # This depends on your cluster setup
          mkdir -p $HOME/.kube
          echo "${{ secrets.KUBECONFIG }}" | base64 -d > $HOME/.kube/config
      
      - name: Deploy cert-manager issuers
        env:
          LETSENCRYPT_EMAIL: ${{ secrets.LETSENCRYPT_EMAIL }}
        run: |
          # Substitute the email placeholder
          cat deploy/cert-manager-issuer.yaml | \
            sed "s/\${LETSENCRYPT_EMAIL}/$LETSENCRYPT_EMAIL/g" | \
            kubectl apply -f -
          
          # Verify deployment
          kubectl get clusterissuer
```

### 3. Manual Deployment (Local)
If deploying manually:

```bash
# Set your email
export LETSENCRYPT_EMAIL="your-email@example.com"

# Substitute and apply
cat deploy/cert-manager-issuer.yaml | \
  sed "s/\${LETSENCRYPT_EMAIL}/$LETSENCRYPT_EMAIL/g" | \
  kubectl apply -f -

# Verify
kubectl get clusterissuer
kubectl describe clusterissuer letsencrypt-prod
```

### 4. Additional GitHub Secrets for Full CD/CD Pipeline
For complete CI/CD, also add:
- `KUBECONFIG`: Your base64-encoded kubeconfig
- `AZURE_CREDENTIALS`: For Azure Container Registry authentication (if using)
- `DOCKER_PASSWORD`: For Docker registry authentication

### 5. Monitor Certificate Status
```bash
# Check issuers are ready
kubectl get clusterissuer

# Watch certificate issuance
kubectl get certificate -n fluxion-dev -w

# Check cert status
kubectl describe certificate fluxion-tls -n fluxion-dev

# Check for errors
kubectl get certificaterequest -n fluxion-dev
```

### 6. Troubleshooting
```bash
# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager --tail=100

# Check webhook logs
kubectl logs -n cert-manager -l app=webhook --tail=50

# Check acme challenge status
kubectl get challenges -n fluxion-dev
kubectl describe challenge <challenge-name> -n fluxion-dev
```

## Notes
- The email is used by Let's Encrypt for certificate expiration notices
- Let's Encrypt will send renewal notifications to this email
- Keep the secret secure and never commit it to version control
- The certificate will auto-renew 30 days before expiration
