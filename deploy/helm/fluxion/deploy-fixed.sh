#!/bin/bash
set -e

NAMESPACE="apps"
RELEASE_NAME="fluxion"
HELM_CHART_DIR="/home/wesleyb/git/fluxion/deploy/helm/fluxion"

echo "=========================================="
echo "Deploying Fixed Fluxion Chart"
echo "=========================================="
echo ""

# Verify cluster connection
if ! kubectl cluster-info &>/dev/null; then
    echo "❌ Not connected to Kubernetes cluster"
    exit 1
fi

echo "✓ Connected to cluster: $(kubectl config current-context)"
echo ""

# Delete old secrets
echo "Deleting old secrets..."
kubectl delete secret fluxion-postgresql fluxion-api -n $NAMESPACE --ignore-not-found
echo "✓ Secrets deleted"
echo ""

# Deploy with Helm
echo "Upgrading Helm release with fixed templates..."
cd "$HELM_CHART_DIR"
helm upgrade $RELEASE_NAME . \
    -f values-local.yaml \
    -n $NAMESPACE \
    --install \
    --timeout 5m

echo "✓ Helm upgrade submitted"
echo ""

echo "Waiting for PostgreSQL StatefulSet to be ready..."
kubectl rollout status statefulset/fluxion-postgresql -n $NAMESPACE --timeout=3m || echo "⚠️  PostgreSQL rollout incomplete, continuing..."
echo ""

echo "Waiting for API Deployment to have updated replicas..."
sleep 10
echo ""

# Verify secrets contain the correct data
echo "Verifying secrets..."
PG_PW=$(kubectl get secret fluxion-postgresql -n $NAMESPACE -o jsonpath='{.data.postgres-password}' | base64 -d)
API_PW=$(kubectl get secret fluxion-api -n $NAMESPACE -o jsonpath='{.data.postgres-password}' | base64 -d)

if [ "$PG_PW" = "$API_PW" ]; then
    echo "✓ Passwords match: $PG_PW"
else
    echo "❌ Passwords don't match!"
    echo "PostgreSQL: $PG_PW"
    echo "API: $API_PW"
    exit 1
fi

# Check if database-url key exists
if kubectl get secret fluxion-api -n $NAMESPACE -o jsonpath='{.data.database-url}' &>/dev/null; then
    echo "✓ database-url key exists in API secret"
    echo "  Value: $(kubectl get secret fluxion-api -n $NAMESPACE -o jsonpath='{.data.database-url}' | base64 -d)"
else
    echo "❌ database-url key missing from API secret"
    exit 1
fi
echo ""

# Force pods to pick up new secrets
echo "Restarting API pods to pick up new secrets..."
kubectl rollout restart deployment/fluxion-api -n $NAMESPACE
kubectl rollout status deployment/fluxion-api -n $NAMESPACE --timeout=3m
echo "✓ API restarted"
echo ""

# Wait a bit for connections to stabilize
sleep 5

# Check logs
echo "=========================================="
echo "Checking API logs for errors..."
echo "=========================================="
echo ""

if kubectl logs -l app.kubernetes.io/component=api -n $NAMESPACE --tail=50 --since=30s 2>/dev/null | grep -i "password authentication failed" > /dev/null; then
    echo "❌ Still seeing password authentication errors!"
    echo ""
    echo "Recent API logs:"
    kubectl logs -l app.kubernetes.io/component=api -n $NAMESPACE --tail=30
    exit 1
else
    echo "✓ No password authentication errors detected"
fi

echo ""
echo "=========================================="
echo "✓ Deployment successful!"
echo "=========================================="
echo ""
echo "Monitor logs with:"
echo "  kubectl logs -f -l app.kubernetes.io/component=api -n $NAMESPACE"
