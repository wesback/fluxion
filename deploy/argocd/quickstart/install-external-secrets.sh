#!/usr/bin/env bash
set -euo pipefail

# Install External Secrets Operator via Helm.
# Usage: ./install-external-secrets.sh [release-name] [namespace]
# Defaults: release-name=external-secrets, namespace=external-secrets-system

RELEASE=${1:-external-secrets}
NS=${2:-external-secrets-system}

echo "Installing External Secrets Operator release=$RELEASE into namespace=$NS"

helm repo add external-secrets https://charts.external-secrets.io || true
helm repo update

helm upgrade --install "$RELEASE" external-secrets/external-secrets \
  --namespace "$NS" --create-namespace

echo "Waiting for pods in namespace $NS to be ready..."
kubectl wait --for=condition=available --timeout=180s deployment -n "$NS" --all || true

echo "External Secrets Operator install attempted. Check pods with: kubectl get pods -n $NS"

echo "Done."
