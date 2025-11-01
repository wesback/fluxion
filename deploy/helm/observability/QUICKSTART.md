# Observability Stack Quick Reference

## Quick Deployment

```bash
# Deploy in order:
kubectl apply -f deploy/argocd/projects/fluxion-project.yaml
kubectl apply -f deploy/argocd/apps/prometheus-stack.yaml
kubectl apply -f deploy/argocd/apps/jaeger.yaml
kubectl apply -f deploy/argocd/apps/opentelemetry-operator.yaml
kubectl apply -f deploy/argocd/apps/otel-collector.yaml
kubectl apply -f deploy/argocd/apps/grafana-dashboards.yaml
kubectl apply -f deploy/argocd/apps/prometheus-rules.yaml

# Wait for all pods
kubectl wait --for=condition=ready pod --all -n monitoring --timeout=600s
```

## Service Endpoints

| Service | Port | URL (Port-Forward) |
|---------|------|-------------------|
| Grafana | 80 | `kubectl port-forward -n monitoring svc/prometheus-stack-grafana 3000:80` |
| Prometheus | 9090 | `kubectl port-forward -n monitoring svc/prometheus-stack-prometheus 9090:9090` |
| Jaeger UI | 16686 | `kubectl port-forward -n monitoring svc/jaeger-query 16686:16686` |
| AlertManager | 9093 | `kubectl port-forward -n monitoring svc/prometheus-stack-alertmanager 9093:9093` |
| OTEL Collector OTLP/gRPC | 4317 | Internal: `fluxion-collector.monitoring.svc.cluster.local:4317` |
| OTEL Collector OTLP/HTTP | 4318 | Internal: `fluxion-collector.monitoring.svc.cluster.local:4318` |
| OTEL Collector Metrics | 8889 | Internal (Prometheus scrapes) |

## Default Credentials

- **Grafana**: admin / changeme (change immediately!)

## ArgoCD Applications

| Application | Namespace | Chart/Source |
|-------------|-----------|--------------|
| prometheus-stack | monitoring | prometheus-community/kube-prometheus-stack:55.0.0 |
| jaeger | monitoring | jaegertracing/jaeger:0.71.13 |
| opentelemetry-operator | opentelemetry-operator-system | open-telemetry/opentelemetry-operator:0.43.1 |
| otel-collector | monitoring | Git: deploy/helm/observability/otel-collector |
| grafana-dashboards | monitoring | Git: deploy/helm/observability/grafana-dashboards |
| prometheus-rules | monitoring | Git: deploy/helm/observability/prometheus-rules |

## Custom Resources

| Type | Name | Namespace |
|------|------|-----------|
| OpenTelemetryCollector | fluxion-collector | monitoring |
| PrometheusRule | fluxion-alerts | monitoring |
| ConfigMap | grafana-dashboard-api-performance | monitoring |
| ConfigMap | grafana-dashboard-package-updates | monitoring |
| ConfigMap | grafana-dashboard-system-health | monitoring |

## Dashboards

1. **Fluxion - API Performance** (UID: fluxion-api-performance)
   - Request rate, latency, errors
   - Database query performance
   - Top endpoints

2. **Fluxion - Package Updates Overview** (UID: fluxion-package-updates)
   - Updates per day/week
   - Most updated packages
   - Kernel updates

3. **Fluxion - System Health** (UID: fluxion-system-health)
   - Pod status
   - Resource usage
   - Webhook delivery

## Key Metrics

### API Metrics
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request duration histogram
- `db_query_duration_seconds` - Database query duration

### Package Update Metrics
- `package_updates_total` - Total package updates
- `package_updates_last_timestamp` - Last update timestamp

### Webhook Metrics
- `webhook_delivery_attempts_total` - Webhook delivery attempts
- `webhook_delivery_success_total` - Successful deliveries
- `webhook_delivery_failed_total` - Failed deliveries

## Alert Rules

### Critical
- FluxionAPIDown (2m)

### Warning
- FluxionHighErrorRate (5% for 5m)
- FluxionHighLatency (>1s for 10m)
- FluxionPodRestarting (>3 in 1h)
- FluxionHighCPUUsage (>80% for 15m)
- FluxionHighMemoryUsage (>80% for 15m)
- FluxionHighDatabaseConnections (>80 for 10m)
- FluxionSlowDatabaseQueries (>2s for 10m)
- FluxionWebhookDeliveryFailing (>50% for 10m)
- FluxionNoUpdatesReceived (24h)

### Info
- FluxionKernelUpdateDetected

## Common Commands

```bash
# Check pod status
kubectl get pods -n monitoring
kubectl get pods -n opentelemetry-operator-system

# Check ArgoCD sync status
argocd app list | grep -E "prometheus|jaeger|otel|grafana"

# View logs
kubectl logs -n monitoring -l app.kubernetes.io/name=prometheus
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana
kubectl logs -n monitoring -l app.kubernetes.io/name=jaeger
kubectl logs -n monitoring -l app.kubernetes.io/component=opentelemetry-collector

# Restart pods
kubectl rollout restart deployment -n monitoring
kubectl rollout restart statefulset -n monitoring

# Check storage
kubectl get pvc -n monitoring
kubectl exec -n monitoring prometheus-stack-prometheus-0 -- df -h

# Test OTEL Collector
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl -v http://fluxion-collector.monitoring.svc.cluster.local:4318/v1/traces
```

## Resource Requirements

### Minimum (All Components)
- CPU: 4 cores
- Memory: 8 GB
- Storage: 100 GB

### Recommended (Production)
- CPU: 8 cores
- Memory: 16 GB
- Storage: 200 GB

### Individual Components
| Component | CPU Request | Memory Request | Storage |
|-----------|-------------|----------------|---------|
| Prometheus | 500m | 2Gi | 50Gi |
| Grafana | 100m | 128Mi | 10Gi |
| AlertManager | 100m | 128Mi | 10Gi |
| Jaeger | 200m | 256Mi | 5Gi |
| OTEL Collector | 200m | 256Mi | - |
| Node Exporter | 100m | 32Mi | - |
| Kube State Metrics | 100m | 128Mi | - |

## Troubleshooting

### Pods Not Starting
```bash
kubectl describe pod <pod-name> -n monitoring
kubectl logs <pod-name> -n monitoring
kubectl get events -n monitoring --sort-by='.lastTimestamp'
```

### No Metrics in Grafana
1. Check Prometheus targets: http://localhost:9090/targets
2. Verify Fluxion is exposing metrics
3. Check ServiceMonitor configuration

### No Traces in Jaeger
1. Check OTEL Collector logs
2. Verify Fluxion OTLP endpoint configuration
3. Test collector connectivity

### Dashboard Not Loading
1. Check ConfigMap labels: `kubectl get cm -n monitoring -l grafana_dashboard=1`
2. Check Grafana sidecar logs
3. Restart Grafana pod

## Documentation

- [Installation Guide](INSTALLATION.md) - Complete installation instructions
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Detailed troubleshooting
- [README](README.md) - Full documentation with architecture

## Support

For issues or questions:
1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Review component logs
3. Open GitHub issue with details
