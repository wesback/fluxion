#!/usr/bin/env bash
set -euo pipefail

# Apply ArgoCD project and application manifests from deploy/argocd/apps
# Optionally attempt to sync apps using the argocd CLI (requires argocd logged in).
# Usage: ./apply-argocd-apps.sh [--sync]

SYNC=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sync) SYNC=true; shift;;
    -h|--help) echo "Usage: $0 [--sync]"; exit 0;;
    *) echo "Unknown arg: $1"; exit 2;;
  esac
done

APPS_DIR="$(dirname "$0")/../../apps"

echo "Applying ArgoCD apps from $APPS_DIR"
kubectl apply -f "$APPS_DIR"

if [ "$SYNC" = true ]; then
  if ! command -v argocd >/dev/null 2>&1; then
    echo "argocd CLI not found in PATH; cannot sync. Install CLI or run manual sync via ArgoCD UI."
    exit 1
  fi

  echo "Listing ArgoCD apps..."
  argocd app list

  for app in $(argocd app list -o name); do
    echo "Syncing app: $app"
    argocd app sync "$app" || echo "Sync failed for $app"
  done
fi

echo "Done."
