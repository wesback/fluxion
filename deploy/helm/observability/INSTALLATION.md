# Observability Stack Installation Guide

Complete guide for deploying the Fluxion observability infrastructure using ArgoCD and Helm.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Installation Steps](#installation-steps)
5. [Configuration](#configuration)
6. [Verification](#verification)
7. [Accessing Services](#accessing-services)
8. [Next Steps](#next-steps)

## Overview

The Fluxion observability stack provides comprehensive monitoring, tracing, and alerting capabilities:

- **Prometheus Stack**: Metrics collection, storage, and alerting
- **Grafana**: Visualization and dashboards
- **Jaeger**: Distributed tracing
- **OpenTelemetry**: Unified observability data collection
- **AlertManager**: Alert routing and notifications

## Prerequisites

### Required

- Kubernetes cluster 1.23+ with 8GB+ RAM available
- ArgoCD installed and configured
- kubectl configured to access the cluster
- Storage class with dynamic provisioning (for persistent volumes)

### Optional

- Ingress controller (nginx, traefik) for external access
- cert-manager for TLS certificate management
- External secrets operator for secrets management

### Resource Requirements

**Minimum:**
- 4 CPU cores
- 8 GB RAM
- 100 GB storage

**Recommended:**
- 8 CPU cores
- 16 GB RAM
- 200 GB storage

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Monitoring Namespace                         │
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │  Prometheus  │◀─────│ OTEL         │◀─────│  Fluxion     │  │
│  │  + Operator  │      │ Collector    │      │  API         │  │
│  └──────┬───────┘      └──────┬───────┘      └──────────────┘  │
│         │                     │                                 │
│         │                     │                                 │
│         ▼                     ▼                                 │
│  ┌──────────────┐      ┌──────────────┐                        │
│  │  Grafana     │      │  Jaeger      │                        │
│  │  Dashboards  │      │  All-in-One  │                        │
│  └──────────────┘      └──────────────┘                        │
│                                                                  │
│  ┌──────────────┐                                               │
│  │ AlertManager │                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Installation Steps

### Step 1: Update ArgoCD Project

The `fluxion` ArgoCD project needs to allow deployments to observability namespaces:

```bash
kubectl apply -f deploy/argocd/projects/fluxion-project.yaml
```

This configures access to:
- `monitoring` namespace
- `opentelemetry-operator-system` namespace

### Step 2: Deploy Prometheus Stack

Deploy the kube-prometheus-stack which includes Prometheus, Grafana, AlertManager, and exporters:

```bash
kubectl apply -f deploy/argocd/apps/prometheus-stack.yaml
```

This will:
- Install Prometheus Operator
- Deploy Prometheus with 50GB storage
- Deploy Grafana with preconfigured datasources
- Install AlertManager
- Deploy Node Exporter on all nodes
- Deploy Kube State Metrics

**Wait for deployment:**
```bash
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=prometheus -n monitoring --timeout=300s
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=grafana -n monitoring --timeout=300s
```

### Step 3: Deploy Jaeger

Deploy Jaeger for distributed tracing:

```bash
kubectl apply -f deploy/argocd/apps/jaeger.yaml
```

This deploys Jaeger in all-in-one mode with persistent storage using Badger.

**Wait for deployment:**
```bash
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=jaeger -n monitoring --timeout=180s
```

### Step 4: Deploy OpenTelemetry Operator

Deploy the OpenTelemetry Operator to manage collector instances:

```bash
kubectl apply -f deploy/argocd/apps/opentelemetry-operator.yaml
```

**Wait for deployment:**
```bash
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=opentelemetry-operator -n opentelemetry-operator-system --timeout=180s
```

### Step 5: Deploy OpenTelemetry Collector

Deploy the OTEL collector instance for Fluxion:

```bash
kubectl apply -f deploy/argocd/apps/otel-collector.yaml
```

This creates a collector that:
- Receives traces and metrics via OTLP (gRPC and HTTP)
- Exports traces to Jaeger
- Exports metrics to Prometheus
- Adds Kubernetes metadata to all telemetry

**Wait for deployment:**
```bash
kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=opentelemetry-collector -n monitoring --timeout=180s
```

### Step 6: Deploy Custom Dashboards

Deploy Fluxion-specific Grafana dashboards:

```bash
kubectl apply -f deploy/argocd/apps/grafana-dashboards.yaml
```

This creates three dashboards:
- **API Performance**: Request rates, latency, errors
- **Package Updates Overview**: Update statistics and trends
- **System Health**: Pod status, resource usage, webhooks

### Step 7: Deploy Prometheus Rules

Deploy alerting rules:

```bash
kubectl apply -f deploy/argocd/apps/prometheus-rules.yaml
```

This configures alerts for:
- API availability and performance
- Resource usage
- Database health
- Webhook delivery
- Package updates

## Configuration

### Grafana Access

Default credentials:
- **Username**: `admin`
- **Password**: `changeme` (from values, should be changed)

**Change the password:**

1. Get the current password:
   ```bash
   kubectl get secret -n monitoring prometheus-stack-grafana -o jsonpath="{.data.admin-password}" | base64 -d
   ```

2. Or set a new password:
   ```bash
   kubectl create secret generic grafana-admin -n monitoring \
     --from-literal=admin-password="your-secure-password" \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

3. Update the prometheus-stack.yaml to use the secret:
   ```yaml
   grafana:
     admin:
       existingSecret: grafana-admin
       userKey: admin-user
       passwordKey: admin-password
   ```

### Prometheus Retention

Default retention is 30 days. To change:

Edit `deploy/argocd/apps/prometheus-stack.yaml`:
```yaml
prometheus:
  prometheusSpec:
    retention: 60d  # Change to desired retention
    retentionSize: "90GB"  # Adjust storage accordingly
```

### AlertManager Configuration

Configure alert receivers in `prometheus-stack.yaml`:

```yaml
alertmanager:
  config:
    receivers:
      - name: 'slack'
        slack_configs:
          - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
            channel: '#alerts'
            title: 'Fluxion Alert'
    route:
      routes:
        - match:
            severity: critical
          receiver: 'slack'
```

### Ingress Configuration

To expose services externally, enable ingress in the respective application files.

**For Grafana:**
```yaml
grafana:
  ingress:
    enabled: true
    ingressClassName: nginx
    hosts:
      - grafana.yourdomain.com
    tls:
      - secretName: grafana-tls
        hosts:
          - grafana.yourdomain.com
```

**For Jaeger:**
```yaml
ingress:
  enabled: true
  ingressClassName: nginx
  hosts:
    - host: jaeger.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
```

## Verification

### Check All Pods

```bash
# Check monitoring namespace
kubectl get pods -n monitoring

# Expected output should show all pods running:
# - prometheus-stack-prometheus-*
# - prometheus-stack-grafana-*
# - alertmanager-*
# - jaeger-*
# - fluxion-collector-*
# - prometheus-stack-kube-state-metrics-*
# - prometheus-stack-prometheus-node-exporter-*
```

### Check ArgoCD Applications

```bash
argocd app list | grep -E "prometheus|jaeger|otel|grafana"

# All should show "Healthy" and "Synced"
```

### Verify Services

```bash
kubectl get svc -n monitoring

# Should show services for:
# - prometheus-stack-prometheus
# - prometheus-stack-grafana
# - jaeger-query
# - fluxion-collector
```

### Test Prometheus

```bash
# Port-forward Prometheus
kubectl port-forward -n monitoring svc/prometheus-stack-prometheus 9090:9090

# Visit http://localhost:9090
# Check Status -> Targets to see all scraped endpoints
```

### Test Grafana

```bash
# Port-forward Grafana
kubectl port-forward -n monitoring svc/prometheus-stack-grafana 3000:80

# Visit http://localhost:3000
# Login with admin credentials
# Check Dashboards -> Fluxion folder
```

### Test Jaeger

```bash
# Port-forward Jaeger
kubectl port-forward -n monitoring svc/jaeger-query 16686:16686

# Visit http://localhost:16686
# Should see Jaeger UI
```

## Accessing Services

### Port-Forwarding (Development)

```bash
# Grafana
kubectl port-forward -n monitoring svc/prometheus-stack-grafana 3000:80

# Prometheus
kubectl port-forward -n monitoring svc/prometheus-stack-prometheus 9090:9090

# Jaeger
kubectl port-forward -n monitoring svc/jaeger-query 16686:16686

# AlertManager
kubectl port-forward -n monitoring svc/prometheus-stack-alertmanager 9093:9093
```

### LoadBalancer (Production)

Change service type to LoadBalancer:
```yaml
service:
  type: LoadBalancer
```

### Ingress (Recommended)

Configure ingress as shown in the Configuration section above.

## Next Steps

1. **Configure Alerts**: Set up AlertManager receivers for your notification channels
2. **Customize Dashboards**: Modify dashboards to match your specific metrics
3. **Set Up Authentication**: Configure OAuth or LDAP for Grafana
4. **Enable TLS**: Configure TLS certificates for all services
5. **Backup Configuration**: Set up backups for Prometheus and Grafana data
6. **Monitor the Monitors**: Set up meta-monitoring for the observability stack itself

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [kube-prometheus-stack Chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
