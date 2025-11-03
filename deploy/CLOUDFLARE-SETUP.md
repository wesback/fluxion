# Cloudflare DNS01 Setup for HTTPS with Let's Encrypt

## Prerequisites

- Cloudflare account with your domain
- Cloudflare API Token with DNS edit permissions

## Step 1: Create Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click your profile → **API Tokens**
3. Click **Create Token**
4. Select **"Edit zone DNS"** template
5. Configure:
   - **Permissions**: `Zone:DNS:Edit`
   - **Zone Resources**: Include your domain
   - **TTL**: Until expiry (or set to 1 year)
6. Copy the generated token

## Step 2: Add GitHub Secret

Store both your Cloudflare email and API token as GitHub secrets:

1. Go to [GitHub Repo Settings](https://github.com/wesback/fluxion/settings/secrets/actions)
2. Add two secrets:
   - **Name**: `CLOUDFLARE_EMAIL`
   - **Value**: `your-email@example.com` (your Cloudflare account email)

3. Add another secret:
   - **Name**: `CLOUDFLARE_API_TOKEN`  
   - **Value**: `<paste your API token>`

## Step 3: Deploy Cloudflare Issuer

Replace placeholders and deploy:

```bash
export CLOUDFLARE_EMAIL="your-email@example.com"
export CLOUDFLARE_API_TOKEN="your-api-token-here"

# Create the secret and issuer
cat deploy/cert-manager-cloudflare-issuer.yaml | \
  sed "s/\${CLOUDFLARE_EMAIL}/$CLOUDFLARE_EMAIL/g" | \
  sed "s/\${CLOUDFLARE_API_TOKEN}/$CLOUDFLARE_API_TOKEN/g" | \
  kubectl apply -f -

# Verify
kubectl get clusterissuer
```

## Step 4: Point Your Domain to Your Ingress

In Cloudflare DNS settings:

1. Go to **DNS** → **Records**
2. Add/Update A record:
   - **Name**: `fluxion-dev` (or your subdomain)
   - **Type**: `A`
   - **IPv4 address**: `4.225.222.163` (your Nginx Ingress IP)
   - **TTL**: Auto or 1 hour
   - **Proxy status**: **DNS only** (grey cloud, not orange)
3. Save

## Step 5: Update values-dev.yaml

Replace `your-domain.com` with your actual Cloudflare domain:

```yaml
ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-dns01-prod"
  hosts:
    - host: fluxion-dev.your-domain.com
      paths:
        - path: /
          pathType: Prefix
          backend: frontend
        - path: /api/v1
          pathType: Prefix
          backend: api
  tls:
    enabled: true
    secretName: fluxion-tls
    certManager:
      enabled: true
      issuer: letsencrypt-dns01-prod
      issuerKind: ClusterIssuer
```

## Step 6: Deploy

```bash
cd /home/wesleyb/git/fluxion

# Commit and push to trigger ArgoCD
git add deploy/helm/fluxion/values-dev.yaml deploy/cert-manager-cloudflare-issuer.yaml
git commit -m "feat: enable HTTPS with Cloudflare DNS01 and Let's Encrypt"
git push origin main
```

Or manually apply:

```bash
helm template fluxion deploy/helm/fluxion -n fluxion-dev \
  -f deploy/helm/fluxion/values.yaml \
  -f deploy/helm/fluxion/values-dev.yaml | kubectl apply -f -
```

## Step 7: Verify Certificate Issuance

```bash
# Watch certificate creation (30-120 seconds)
kubectl get certificate -n fluxion-dev -w

# Check status
kubectl describe certificate fluxion-tls -n fluxion-dev

# Check ingress has HTTPS
kubectl get ingress -n fluxion-dev fluxion -o yaml | grep -A 5 "tls:"
```

## Step 8: Access Your Frontend

```bash
https://fluxion-dev.your-domain.com
https://fluxion-dev.your-domain.com/api/v1
```

## Troubleshooting

### Certificate stuck in "False"
```bash
# Check for errors
kubectl describe certificate fluxion-tls -n fluxion-dev
kubectl get certificaterequest -n fluxion-dev -o yaml

# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager --tail=100 | grep -i cloudflare
```

### DNS validation not working
```bash
# Verify Cloudflare secret is deployed
kubectl get secret -n cert-manager cloudflare-api-token

# Check if issuer is ready
kubectl get clusterissuer letsencrypt-dns01-prod
kubectl describe clusterissuer letsencrypt-dns01-prod
```

### Domain not resolving
```bash
# Verify DNS record
nslookup fluxion-dev.your-domain.com
dig fluxion-dev.your-domain.com

# Should return: 4.225.222.163
```

## GitHub Actions Automation (Optional)

To automate Cloudflare issuer deployment via CI/CD, see `.github/workflows/deploy-cert-manager.yml` in the main repository documentation.

## Important Notes

✅ **DNS01 works for internal IPs** - No need for public internet access  
✅ **Wildcard certificates supported** - Use `*.your-domain.com` if needed  
✅ **Auto-renewal** - Automatic 30 days before expiration  
✅ **API Token is stored as secret** - Never committed to git  

---

## Questions?

Refer to:
- [cert-manager Cloudflare Documentation](https://cert-manager.io/docs/configuration/acme/dns01/cloudflare/)
- [Cloudflare API Token Docs](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
