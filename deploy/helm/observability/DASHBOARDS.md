# Observability Stack - Dashboard Overview

This document provides an overview of the custom Grafana dashboards included in the Fluxion observability stack.

## Dashboard Catalog

### 1. Fluxion - API Performance

**UID**: `fluxion-api-performance`  
**Refresh**: 10 seconds  
**Time Range**: Last 1 hour

#### Purpose
Monitor API health, performance, and reliability metrics to identify issues and optimize response times.

#### Panels

1. **API Request Rate**
   - **Type**: Time series
   - **Metrics**: `rate(http_requests_total[5m])`
   - **Grouped by**: method, path
   - **Purpose**: Track request volume over time by endpoint
   - **What to look for**: Sudden spikes or drops in traffic

2. **API Latency (p95, p99)**
   - **Type**: Time series
   - **Metrics**: `histogram_quantile(0.95, http_request_duration_seconds_bucket)`
   - **Purpose**: Monitor tail latencies
   - **What to look for**: Latency above 0.5s (yellow) or 1s (red)

3. **Error Rate (5xx)**
   - **Type**: Time series
   - **Metrics**: `rate(http_requests_total{status_code=~"5.."}[5m])`
   - **Purpose**: Track server error rates
   - **What to look for**: Any non-zero error rate

4. **Database Query Performance**
   - **Type**: Time series
   - **Metrics**: `histogram_quantile(0.95, db_query_duration_seconds_bucket)`
   - **Purpose**: Monitor database query latency
   - **What to look for**: Queries taking >1s consistently

5. **Top 10 Endpoints by Traffic**
   - **Type**: Table
   - **Metrics**: `topk(10, rate(http_requests_total[5m]))`
   - **Purpose**: Identify most-used endpoints
   - **Use case**: Optimization targets

#### Expected Values

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Request Rate | Steady | - | Sudden drop to 0 |
| P95 Latency | <500ms | 500ms-1s | >1s |
| P99 Latency | <1s | 1s-2s | >2s |
| Error Rate | 0% | <1% | >5% |
| DB Query P95 | <200ms | 200ms-1s | >1s |

#### Example Use Cases

- **Incident Response**: Quickly identify which endpoints are failing
- **Performance Optimization**: Find slow endpoints and database queries
- **Capacity Planning**: Track request volume trends
- **SLO Monitoring**: Ensure latency and error rate SLOs are met

### 2. Fluxion - Package Updates Overview

**UID**: `fluxion-package-updates`  
**Refresh**: 30 seconds  
**Time Range**: Last 24 hours

#### Purpose
Track package update activity across all monitored hosts, identify trends, and detect kernel updates.

#### Panels

1. **Updates Today**
   - **Type**: Stat
   - **Metrics**: `sum(increase(package_updates_total[1d]))`
   - **Purpose**: Quick view of today's update volume
   - **What to look for**: Unusually high or low counts

2. **Updates This Week**
   - **Type**: Stat
   - **Metrics**: `sum(increase(package_updates_total[7d]))`
   - **Purpose**: Weekly update volume
   - **Use case**: Trend analysis

3. **Active Hosts**
   - **Type**: Stat
   - **Metrics**: `count(count by (hostname) (package_updates_total))`
   - **Purpose**: Number of hosts reporting updates
   - **What to look for**: Sudden decrease (hosts offline)

4. **Kernel Updates Today**
   - **Type**: Stat (red background if >0)
   - **Metrics**: `sum(increase(package_updates_total{package_name=~"linux-.*"}[1d]))`
   - **Purpose**: Critical kernel update detection
   - **What to look for**: Any non-zero value

5. **Updates per Hour by Host**
   - **Type**: Time series
   - **Metrics**: `increase(package_updates_total[1h])`
   - **Purpose**: Per-host update activity
   - **What to look for**: Unusual patterns or missing hosts

6. **Top 10 Most Updated Packages (24h)**
   - **Type**: Time series (bars)
   - **Metrics**: `topk(10, increase(package_updates_total[24h]))`
   - **Purpose**: Identify frequently updated packages
   - **Use case**: Security update awareness

7. **Most Active Hosts (7d)**
   - **Type**: Table
   - **Metrics**: `topk(20, increase(package_updates_total[7d]))`
   - **Purpose**: Find hosts with most updates
   - **Use case**: Identify test systems or problem hosts

8. **Kernel Updates Timeline**
   - **Type**: Time series
   - **Metrics**: `increase(package_updates_total{package_name=~"linux-.*"}[1h])`
   - **Purpose**: Track kernel updates over time
   - **What to look for**: Coordinated kernel deployments

#### Expected Values

| Metric | Typical | Investigation Needed |
|--------|---------|---------------------|
| Updates Today | 10-100 | <5 or >500 |
| Active Hosts | All registered | Missing hosts |
| Kernel Updates | 0-5 per week | >10 in one day |

#### Example Use Cases

- **Security Monitoring**: Track kernel and critical package updates
- **Capacity Planning**: Understand update load patterns
- **Anomaly Detection**: Identify hosts with unusual update patterns
- **Compliance**: Verify all hosts are receiving updates

### 3. Fluxion - System Health

**UID**: `fluxion-system-health`  
**Refresh**: 30 seconds  
**Time Range**: Last 1 hour

#### Purpose
Monitor infrastructure health, resource usage, and operational metrics.

#### Panels

1. **API Status**
   - **Type**: Stat (background color)
   - **Metrics**: `up{job="fluxion-api"}`
   - **Purpose**: API availability
   - **Colors**: Green (up) / Red (down)

2. **Pod Restarts (1h)**
   - **Type**: Stat
   - **Metrics**: `sum(increase(kube_pod_container_status_restarts_total[1h]))`
   - **Purpose**: Detect pod instability
   - **What to look for**: >0 restarts

3. **DB Connections**
   - **Type**: Stat
   - **Metrics**: `sum(pg_stat_database_numbackends)`
   - **Purpose**: Monitor database connection usage
   - **What to look for**: Approaching max connections

4. **Webhook Success Rate**
   - **Type**: Gauge
   - **Metrics**: `100 * rate(webhook_delivery_success_total[5m]) / rate(webhook_delivery_attempts_total[5m])`
   - **Purpose**: Webhook reliability
   - **What to look for**: <70% (yellow), <50% (red)

5. **CPU Usage (% of Request)**
   - **Type**: Time series
   - **Metrics**: Container CPU usage vs requested
   - **Purpose**: Track CPU utilization
   - **What to look for**: Consistently >80%

6. **Memory Usage (% of Request)**
   - **Type**: Time series
   - **Metrics**: Container memory usage vs requested
   - **Purpose**: Track memory utilization
   - **What to look for**: Consistently >80%

7. **Pod Status**
   - **Type**: Table
   - **Metrics**: `kube_pod_status_phase`
   - **Purpose**: Overview of all pod states
   - **What to look for**: Any non-Running pods

8. **Database Activity**
   - **Type**: Time series
   - **Metrics**: `pg_stat_database_tup_fetched`, `tup_inserted`, `tup_updated`
   - **Purpose**: Database operation rates
   - **Use case**: Correlate with API traffic

9. **Webhook Delivery Status**
   - **Type**: Time series
   - **Metrics**: Webhook attempts, success, failures
   - **Purpose**: Track webhook reliability over time
   - **What to look for**: High failure rates

#### Expected Values

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| API Status | Up (1) | - | Down (0) |
| Pod Restarts | 0 | 1-3 | >3 |
| DB Connections | <50 | 50-80 | >80 |
| Webhook Success | 100% | 70-90% | <70% |
| CPU Usage | <70% | 70-90% | >90% |
| Memory Usage | <70% | 70-90% | >90% |

#### Example Use Cases

- **Health Checks**: Quick overview of system status
- **Capacity Planning**: Track resource usage trends
- **Incident Response**: Identify failing components
- **Performance Tuning**: Optimize resource allocations

## Dashboard Access

### Via Port-Forward
```bash
kubectl port-forward -n monitoring svc/prometheus-stack-grafana 3000:80
# Visit http://localhost:3000
# Navigate to Dashboards -> Fluxion folder
```

### Via Ingress
Configure ingress in `prometheus-stack.yaml`:
```yaml
grafana:
  ingress:
    enabled: true
    hosts:
      - grafana.yourdomain.com
```

## Dashboard Customization

### Modifying Dashboards

1. **Edit JSON directly** in ConfigMap:
   ```bash
   kubectl edit cm -n monitoring grafana-dashboard-api-performance
   ```

2. **Update via Git**:
   - Edit `deploy/helm/observability/grafana-dashboards/*.yaml`
   - Commit changes
   - ArgoCD will sync automatically

3. **Via Grafana UI** (if allowed):
   - Make changes in UI
   - Export JSON
   - Update ConfigMap

### Adding New Dashboards

1. Create ConfigMap:
   ```yaml
   apiVersion: v1
   kind: ConfigMap
   metadata:
     name: grafana-dashboard-new-dashboard
     namespace: monitoring
     labels:
       grafana_dashboard: "1"
   data:
     new-dashboard.json: |
       { ... dashboard JSON ... }
   ```

2. Apply to cluster:
   ```bash
   kubectl apply -f new-dashboard.yaml
   ```

3. Dashboard appears in Grafana automatically (via sidecar)

## Best Practices

1. **Use Consistent Time Ranges**: Keep related panels synchronized
2. **Set Appropriate Refresh Rates**: Balance freshness vs load
3. **Add Annotations**: Use Grafana annotations for deployments/incidents
4. **Create Variables**: Use dashboard variables for dynamic filtering
5. **Set Alerts**: Configure panel alerts for critical metrics
6. **Document Thresholds**: Clear good/warning/critical values
7. **Use Folders**: Organize dashboards by component/team

## Troubleshooting

### Dashboard Not Appearing

1. Check ConfigMap exists and has label:
   ```bash
   kubectl get cm -n monitoring -l grafana_dashboard=1
   ```

2. Check Grafana sidecar logs:
   ```bash
   kubectl logs -n monitoring -l app.kubernetes.io/name=grafana -c grafana-sc-dashboard
   ```

3. Restart Grafana pod:
   ```bash
   kubectl delete pod -n monitoring -l app.kubernetes.io/name=grafana
   ```

### Panel Shows "No Data"

1. Check Prometheus has the metric:
   ```bash
   kubectl port-forward -n monitoring svc/prometheus-stack-prometheus 9090:9090
   # Visit http://localhost:9090 and query metric
   ```

2. Verify time range includes data
3. Check query syntax in panel edit mode

### Queries Are Slow

1. Use recording rules for expensive queries
2. Reduce time range
3. Increase Prometheus resources
4. Add metric relabeling to reduce cardinality

## Additional Resources

- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Documentation](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Dashboard Best Practices](https://grafana.com/docs/grafana/latest/best-practices/best-practices-for-creating-dashboards/)
