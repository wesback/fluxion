#!/bin/bash
set -e

# Script to fix PostgreSQL password authentication issue
# This script deletes the old secrets and upgrades Helm to regenerate them with matching passwords

NAMESPACE="apps"
RELEASE_NAME="fluxion"
HELM_CHART_DIR="/home/wesleyb/git/fluxion/deploy/helm/fluxion"

echo "=========================================="
echo "Fixing Fluxion PostgreSQL Authentication"
echo "=========================================="
echo ""

# Check if connected to cluster
echo "Checking cluster connection..."
if ! kubectl cluster-info &>/dev/null; then
    echo "❌ Not connected to Kubernetes cluster"
    echo ""
    echo "Please connect to your cluster first:"
    echo "  az aks get-credentials --resource-group <rg-name> --name <cluster-name>"
    exit 1
fi

echo "✓ Connected to cluster: $(kubectl config current-context)"
echo ""

# Check if secrets exist
echo "Checking existing secrets..."
POSTGRES_SECRET=$(kubectl get secret fluxion-postgresql -n $NAMESPACE --ignore-not-found -o name)
API_SECRET=$(kubectl get secret fluxion-api -n $NAMESPACE --ignore-not-found -o name)

if [ -z "$POSTGRES_SECRET" ] && [ -z "$API_SECRET" ]; then
    echo "⚠️  Secrets don't exist yet - they will be created during Helm upgrade"
else
    echo "Found secrets:"
    [ -n "$POSTGRES_SECRET" ] && echo "  - fluxion-postgresql"
    [ -n "$API_SECRET" ] && echo "  - fluxion-api"
    echo ""
    
    # Delete existing secrets
    echo "Deleting existing secrets to force regeneration..."
    kubectl delete secret fluxion-postgresql fluxion-api -n $NAMESPACE --ignore-not-found
    echo "✓ Secrets deleted"
fi
echo ""

# Upgrade Helm release
echo "Upgrading Helm release with fixed password configuration..."
cd "$HELM_CHART_DIR"
helm upgrade $RELEASE_NAME . \
    -f values-local.yaml \
    -n $NAMESPACE \
    --wait \
    --timeout 5m

echo "✓ Helm upgrade complete"
echo ""

# Restart PostgreSQL StatefulSet
echo "Restarting PostgreSQL to pick up new password..."
kubectl rollout restart statefulset/fluxion-postgresql -n $NAMESPACE
kubectl rollout status statefulset/fluxion-postgresql -n $NAMESPACE --timeout=3m
echo "✓ PostgreSQL restarted"
echo ""

# Restart API deployment
echo "Restarting API to pick up new password..."
kubectl rollout restart deployment/fluxion-api -n $NAMESPACE
kubectl rollout status deployment/fluxion-api -n $NAMESPACE --timeout=3m
echo "✓ API restarted"
echo ""

# Verify the fix
echo "=========================================="
echo "Verifying the fix..."
echo "=========================================="
echo ""

# Check API logs for errors
echo "Checking API logs for authentication errors..."
sleep 5  # Give pods time to start connecting

if kubectl logs -l app.kubernetes.io/component=api -n $NAMESPACE --tail=50 --since=1m 2>/dev/null | grep -i "password authentication failed" > /dev/null; then
    echo "❌ Still seeing authentication errors!"
    echo ""
    echo "Recent API logs:"
    kubectl logs -l app.kubernetes.io/component=api -n $NAMESPACE --tail=20
    exit 1
else
    echo "✓ No authentication errors found"
fi

echo ""
echo "=========================================="
echo "✓ Fix applied successfully!"
echo "=========================================="
echo ""
echo "The PostgreSQL password has been synchronized between:"
echo "  - fluxion-postgresql secret (used by PostgreSQL)"
echo "  - fluxion-api secret (used by API)"
echo ""
echo "Both now use the password from values-local.yaml:"
echo "  postgresql.auth.password: \"fluxion-local-dev-password-change-in-prod\""
echo ""
echo "Monitor the API logs with:"
echo "  kubectl logs -f -l app.kubernetes.io/component=api -n $NAMESPACE"
