#!/usr/bin/env bash
set -euo pipefail

# Generate SecretStore and ExternalSecret YAMLs for Azure Key Vault and optionally apply them.
# Usage examples:
#  ./generate-secretstore-externalsecret.sh \
#    --tenant-id <TENANT> --vault-url https://<VAULT>.vault.azure.net/ \
#    --sa-name fluxion-external-secrets-sa --env dev \
#    --secrets postgres-password=postgres-password admin-api-key=admin-api-key \
#    --apply

print_usage() {
  cat <<EOF
Usage: $0 --tenant-id TENANT --vault-url VAULT_URL --sa-name SERVICE_ACCOUNT --namespace NAMESPACE [--apply] --secrets key=remoteKey[,key2=remoteKey2,...]

Generates two YAML files in the current directory:
  secretstore-azure-keyvault.yaml
  externalsecret-fluxion.yaml

If --apply is given the scripts will kubectl apply the generated manifests to the target namespace.
EOF
}

if [ ${#@} -eq 0 ]; then
  print_usage
  exit 1
fi

APPLY=false
SECRETS=""
ENV="dev"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tenant-id) TENANT_ID="$2"; shift 2;;
    --vault-url) VAULT_URL="$2"; shift 2;;
    --sa-name) SA_NAME="$2"; shift 2;;
    --namespace) TARGET_NS="$2"; shift 2;;
    --env) ENV="$2"; shift 2;;
    --secrets) SECRETS="$2"; shift 2;;
    --apply) APPLY=true; shift 1;;
    -h|--help) print_usage; exit 0;;
    *) echo "Unknown arg: $1"; print_usage; exit 2;;
  esac
done

: "${TENANT_ID:?--tenant-id is required}"
: "${VAULT_URL:?--vault-url is required}"
: "${SA_NAME:?--sa-name is required}"

# Environment defaults
if [ -z "${TARGET_NS:-}" ]; then
  case "$ENV" in
    dev) TARGET_NS="fluxion-dev";;
    prod) TARGET_NS="fluxion-production";;
    *) echo "Unknown env: $ENV"; exit 2;;
  esac
fi

: "${SECRETS:?--secrets is required (format: key=remoteKey[,key2=remoteKey2])}"

OUT_SS=secretstore-azure-keyvault.yaml
OUT_ES=externalsecret-fluxion.yaml

cat > "$OUT_SS" <<EOF
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: azure-keyvault
  namespace: ${TARGET_NS}
spec:
  provider:
    azurekv:
      tenantId: "${TENANT_ID}"
      vaultUrl: "${VAULT_URL}"
      authType: WorkloadIdentity
      serviceAccountRef:
        name: ${SA_NAME}
EOF

echo "Wrote $OUT_SS"

# Build an ExternalSecret that maps secrets into a single k8s secret named fluxion-postgresql (and a second named fluxion-api)
IFS=',' read -r -a pairs <<< "$SECRETS"

# Create one ExternalSecret that targets fluxion-postgresql if postgres-password present, and one for fluxion-api for all keys
cat > "$OUT_ES" <<EOF
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: fluxion-secrets
  namespace: ${TARGET_NS}
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-keyvault
    kind: SecretStore
  target:
    name: fluxion-postgresql
    creationPolicy: Owner
  data:
EOF

for p in "${pairs[@]}"; do
  key=${p%%=*}
  remote=${p#*=}
  if [[ "$key" == "postgres-password" ]]; then
    cat >> "$OUT_ES" <<EOF
    - secretKey: ${key}
      remoteRef:
        key: ${remote}
EOF
  fi
done

cat >> "$OUT_ES" <<EOF
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: fluxion-api-secrets
  namespace: ${TARGET_NS}
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-keyvault
    kind: SecretStore
  target:
    name: fluxion-api
    creationPolicy: Owner
  data:
EOF

for p in "${pairs[@]}"; do
  key=${p%%=*}
  remote=${p#*=}
  cat >> "$OUT_ES" <<EOF
    - secretKey: ${key}
      remoteRef:
        key: ${remote}
EOF
done

echo "Wrote $OUT_ES"

if [ "$APPLY" = true ]; then
  echo "Applying manifests to namespace ${TARGET_NS}"
  kubectl create namespace "${TARGET_NS}" --dry-run=client -o yaml | kubectl apply -f -
  kubectl apply -f "$OUT_SS"
  kubectl apply -f "$OUT_ES"
  echo "Applied."
fi

echo "Done."
