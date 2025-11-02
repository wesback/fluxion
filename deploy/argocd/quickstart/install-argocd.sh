#!/usr/bin/env bash
set -euo pipefail

# Small helper to install ArgoCD into the cluster and wait for the server to be available.
# Usage: ./install-argocd.sh [namespace]
# Defaults to namespace: argocd

NS=${1:-argocd}

echo "Installing ArgoCD into namespace: $NS"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

echo "Applying ArgoCD manifests..."
kubectl apply -n "$NS" -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

echo "Waiting for argocd-server deployment to become available (timeout 300s)..."
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n "$NS"

echo "ArgoCD installed. To access the UI locally you can port-forward (background):"
echo "  kubectl port-forward svc/argocd-server -n $NS 8080:443 &"

echo "To get the initial admin password run:" 
echo "  kubectl -n $NS get secret argocd-initial-admin-secret -o jsonpath=\"{.data.password}\" | base64 -d; echo"

echo "Done."
