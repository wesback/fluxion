# Fluxion Observability Stack

Complete observability infrastructure for Fluxion using modern open-source tools deployed via ArgoCD.

## Overview

This observability stack provides comprehensive monitoring, metrics, tracing, and alerting for the Fluxion package tracking system.

### Components

| Component | Purpose | Chart Version |
|-----------|---------|---------------|
| **kube-prometheus-stack** | Metrics collection, storage, and alerting | 55.0.0 |
| ├─ Prometheus Operator | Manages Prometheus instances | |
| ├─ Prometheus | Time-series metrics database | |
| ├─ Grafana | Metrics visualization and dashboards | |
| ├─ AlertManager | Alert routing and management | |
| ├─ Node Exporter | Host-level metrics | |
| └─ Kube State Metrics | Kubernetes cluster metrics | |
| **Jaeger** | Distributed tracing | 0.71.13 |
| **OpenTelemetry Operator** | Manages OTEL collectors | 0.43.1 |
| **OTEL Collector** | Collects and exports telemetry data | 0.91.0 |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Fluxion Applications                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Dev        │  │  Staging    │  │  Production │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                 │                 │                 │
│         │  OTLP/HTTP     │                 │                 │
│         └─────────────────┴─────────────────┘                │
│                           │                                   │
└───────────────────────────┼───────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              OpenTelemetry Collector (monitoring)            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Receivers: OTLP (gRPC/HTTP), Prometheus            │    │
│  │  Processors: Batch, Memory Limiter, K8s Attributes  │    │
│  │  Exporters: Prometheus, Jaeger, Logging            │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────┬──────────────────────────────┬────────────────┘
               │                               │
               │ Traces                        │ Metrics
               ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│  Jaeger (monitoring)     │   │  Prometheus (monitoring) │
│  - Query UI              │   │  - TSDB                  │
│  - Badger Storage        │   │  - Alerting Rules        │
│  - 5Gi PVC              │   │  - 50Gi PVC             │
└──────────────────────────┘   └────────┬─────────────────┘
                                         │
                                         │ Queries & Alerts
                                         ▼
                         ┌────────────────────────────────┐
                         │  Grafana (monitoring)          │
                         │  - Dashboards                  │
                         │  - Data Sources                │
                         │  - Alerting                    │
                         └────────────────────────────────┘
                                         │
                                         │ Alerts
                                         ▼
                         ┌────────────────────────────────┐
                         │  AlertManager (monitoring)     │
                         │  - Routing                     │
                         │  - Notifications               │
                         └────────────────────────────────┘
```

## Features

### Monitoring & Metrics
- ✅ **Prometheus**: Time-series metrics storage with 30-day retention
- ✅ **Custom Metrics**: Automatic scraping of Fluxion API metrics
- ✅ **Node Metrics**: System-level metrics from all Kubernetes nodes
- ✅ **Cluster Metrics**: Kubernetes resource metrics (pods, deployments, etc.)
- ✅ **Service Monitors**: Automatic discovery and scraping configuration

### Visualization
- ✅ **Grafana**: Pre-configured with Prometheus and Jaeger datasources
- ✅ **Custom Dashboards**: Three Fluxion-specific dashboards
  - API Performance: Request rates, latency, error rates
  - Package Updates Overview: Update statistics and trends
  - System Health: Resource usage, pod status, database metrics
- ✅ **Dashboard Sidecar**: Automatic dashboard provisioning from ConfigMaps

### Distributed Tracing
- ✅ **Jaeger**: Full distributed tracing stack
- ✅ **OTLP Support**: Native OpenTelemetry Protocol
- ✅ **Persistent Storage**: Badger database with persistent volumes
- ✅ **Query UI**: Web interface for trace exploration

### Observability Data Collection
- ✅ **OpenTelemetry Operator**: Manages collector instances
- ✅ **OTEL Collector**: Unified telemetry data pipeline
- ✅ **K8s Attributes**: Automatic Kubernetes metadata enrichment
- ✅ **Multi-Protocol**: Supports OTLP gRPC and HTTP

### Alerting
- ✅ **AlertManager**: Centralized alert management
- ✅ **Custom Alert Rules**: 15+ Fluxion-specific alerts
- ✅ **Alert Grouping**: Intelligent alert aggregation
- ✅ **Multiple Receivers**: Support for Slack, email, webhooks, etc.

## Custom Dashboards

### 1. API Performance Dashboard
**File**: `grafana-dashboards/api-performance.yaml`

Monitors API health and performance:
- Request rate by endpoint
- Latency percentiles (p95, p99)
- Error rate (5xx responses)
- Database query performance
- Top endpoints by traffic

**Key Metrics:**
- `http_requests_total`
- `http_request_duration_seconds`
- `db_query_duration_seconds`

### 2. Package Updates Overview Dashboard
**File**: `grafana-dashboards/package-updates.yaml`

Tracks package update activity:
- Updates per day/week
- Active host count
- Kernel updates (with alerts)
- Most updated packages
- Most active hosts
- Update timeline

**Key Metrics:**
- `package_updates_total`
- `package_updates_last_timestamp`

### 3. System Health Dashboard
**File**: `grafana-dashboards/system-health.yaml`

Monitors system health:
- Pod status and restarts
- CPU and memory usage
- Database connections and activity
- Webhook delivery success rate
- Resource usage trends

**Key Metrics:**
- `kube_pod_status_phase`
- `container_cpu_usage_seconds_total`
- `container_memory_working_set_bytes`
- `pg_stat_database_*`
- `webhook_delivery_*`

## Alert Rules

**File**: `prometheus-rules/fluxion-alerts.yaml`

### API Alerts
- `FluxionAPIDown`: API unavailable for 2+ minutes (critical)
- `FluxionHighErrorRate`: >5% error rate for 5+ minutes (warning)
- `FluxionHighLatency`: p95 latency >1s for 10+ minutes (warning)

### Infrastructure Alerts
- `FluxionPodRestarting`: >3 restarts per hour (warning)
- `FluxionHighCPUUsage`: >80% of CPU limit for 15+ minutes (warning)
- `FluxionHighMemoryUsage`: >80% of memory limit for 15+ minutes (warning)

### Database Alerts
- `FluxionHighDatabaseConnections`: >80 connections for 10+ minutes (warning)
- `FluxionSlowDatabaseQueries`: p95 query latency >2s for 10+ minutes (warning)

### Webhook Alerts
- `FluxionWebhookDeliveryFailing`: >50% failure rate for 10+ minutes (warning)

### Package Update Alerts
- `FluxionKernelUpdateDetected`: Kernel package updated (info)
- `FluxionNoUpdatesReceived`: No updates for 24+ hours (warning)

## Installation

### Quick Start

Deploy all components:

```bash
# 1. Update ArgoCD project
kubectl apply -f deploy/argocd/projects/fluxion-project.yaml

# 2. Deploy Prometheus Stack (includes Grafana & AlertManager)
kubectl apply -f deploy/argocd/apps/prometheus-stack.yaml

# 3. Deploy Jaeger
kubectl apply -f deploy/argocd/apps/jaeger.yaml

# 4. Deploy OpenTelemetry Operator
kubectl apply -f deploy/argocd/apps/opentelemetry-operator.yaml

# 5. Deploy OTEL Collector
kubectl apply -f deploy/argocd/apps/otel-collector.yaml

# 6. Deploy Dashboards
kubectl apply -f deploy/argocd/apps/grafana-dashboards.yaml

# 7. Deploy Alert Rules
kubectl apply -f deploy/argocd/apps/prometheus-rules.yaml
```

Wait for all pods to be ready:
```bash
kubectl wait --for=condition=ready pod --all -n monitoring --timeout=600s
```

### Detailed Guide

See [INSTALLATION.md](INSTALLATION.md) for comprehensive installation instructions.

## Configuration

### Prometheus

**Retention**: 30 days (configurable)
**Storage**: 50GB persistent volume
**Scrape Interval**: 30s

Edit `deploy/argocd/apps/prometheus-stack.yaml` to customize.

### Grafana

**Default Credentials**:
- Username: `admin`
- Password: `changeme` (should be changed immediately)

**Data Sources**:
- Prometheus (default)
- Jaeger

### Jaeger

**Storage**: Badger (embedded database)
**Persistence**: 5GB persistent volume
**Deployment**: All-in-one (single pod)

For production, consider using Jaeger Operator for multi-component deployment.

### OTEL Collector

**Mode**: Deployment (2 replicas)
**Receivers**: OTLP gRPC (4317), OTLP HTTP (4318)
**Exporters**: Prometheus (8889), Jaeger (4317)

## Accessing Services

### Port Forwarding (Development)

```bash
# Grafana
kubectl port-forward -n monitoring svc/prometheus-stack-grafana 3000:80
# Access: http://localhost:3000

# Prometheus
kubectl port-forward -n monitoring svc/prometheus-stack-prometheus 9090:9090
# Access: http://localhost:9090

# Jaeger
kubectl port-forward -n monitoring svc/jaeger-query 16686:16686
# Access: http://localhost:16686

# AlertManager
kubectl port-forward -n monitoring svc/prometheus-stack-alertmanager 9093:9093
# Access: http://localhost:9093
```

### Ingress (Production)

Edit the respective application files to enable ingress:
- `prometheus-stack.yaml`: Configure Grafana ingress
- `jaeger.yaml`: Configure Jaeger ingress

Example:
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

## Configuring Fluxion to Use Observability Stack

### Update Fluxion Helm Values

Add OTEL collector endpoint to Fluxion configuration:

```yaml
# In fluxion values.yaml
api:
  env:
    - name: OTEL_EXPORTER_OTLP_ENDPOINT
      value: "http://fluxion-collector.monitoring.svc.cluster.local:4318"
    - name: OTEL_EXPORTER_OTLP_PROTOCOL
      value: "http/protobuf"
    - name: OTEL_SERVICE_NAME
      value: "fluxion-api"
    - name: OTEL_RESOURCE_ATTRIBUTES
      value: "service.namespace=fluxion,deployment.environment=$(POD_NAMESPACE)"
```

### Enable Metrics Export

Ensure Fluxion API exports metrics on `/metrics` endpoint:
- Prometheus will automatically scrape via ServiceMonitor
- No additional configuration needed

## Monitoring Best Practices

1. **Set Up Alerts**: Configure AlertManager with notification channels
2. **Review Dashboards Regularly**: Check for anomalies and trends
3. **Monitor Resource Usage**: Ensure observability stack has enough resources
4. **Backup Configuration**: Regularly backup Grafana dashboards and Prometheus rules
5. **Test Alerting**: Verify alerts fire correctly and reach notification channels
6. **Optimize Queries**: Use recording rules for expensive queries
7. **Clean Up Old Data**: Monitor storage usage and adjust retention

## Maintenance

### Updating Components

```bash
# Update chart version in application file
# e.g., prometheus-stack.yaml: targetRevision: 56.0.0

# Sync application
argocd app sync prometheus-stack
```

### Scaling

Increase replicas for high availability:

```bash
# Edit prometheus-stack.yaml
prometheus:
  prometheusSpec:
    replicas: 2

# OTEL Collector
replicas: 3
```

### Backup

**Prometheus Data**:
```bash
# Create snapshot
kubectl exec -n monitoring prometheus-stack-prometheus-0 -- \
  curl -XPOST http://localhost:9090/api/v1/admin/tsdb/snapshot
```

**Grafana Dashboards**:
```bash
# Already version controlled in Git
# For manual backup:
kubectl get cm -n monitoring -l grafana_dashboard=1 -o yaml > dashboards-backup.yaml
```

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.

### Quick Checks

```bash
# Check pod status
kubectl get pods -n monitoring

# Check ArgoCD application status
argocd app list | grep -E "prometheus|jaeger|otel|grafana"

# Check logs
kubectl logs -n monitoring -l app.kubernetes.io/name=prometheus
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana
kubectl logs -n monitoring -l app.kubernetes.io/name=jaeger

# Test connectivity
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://fluxion-collector.monitoring.svc.cluster.local:4318/v1/traces
```

## Resources

### Documentation
- [Installation Guide](INSTALLATION.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)

### External Links
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)

## Contributing

Contributions are welcome! Please submit PRs for:
- Additional dashboards
- Alert rule improvements
- Documentation updates
- Bug fixes

## License

MIT License - see [LICENSE](../../LICENSE) file for details.
