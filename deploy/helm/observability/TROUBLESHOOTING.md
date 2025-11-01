# Observability Stack Troubleshooting Guide

Common issues and solutions for the Fluxion observability stack.

## Table of Contents

1. [General Debugging](#general-debugging)
2. [Prometheus Issues](#prometheus-issues)
3. [Grafana Issues](#grafana-issues)
4. [Jaeger Issues](#jaeger-issues)
5. [OpenTelemetry Issues](#opentelemetry-issues)
6. [ArgoCD Sync Issues](#argocd-sync-issues)
7. [Performance Issues](#performance-issues)
8. [Data Issues](#data-issues)

## General Debugging

### Check Pod Status

```bash
# List all pods in monitoring namespace
kubectl get pods -n monitoring

# Describe a specific pod
kubectl describe pod <pod-name> -n monitoring

# Check pod logs
kubectl logs <pod-name> -n monitoring

# Check previous logs (if pod restarted)
kubectl logs <pod-name> -n monitoring --previous
```

### Check Resource Usage

```bash
# Check node resources
kubectl top nodes

# Check pod resources in monitoring namespace
kubectl top pods -n monitoring

# Check persistent volume claims
kubectl get pvc -n monitoring
```

### Check Events

```bash
# Recent events in monitoring namespace
kubectl get events -n monitoring --sort-by='.lastTimestamp'

# Watch events in real-time
kubectl get events -n monitoring --watch
```

## Prometheus Issues

### Prometheus Pod Not Starting

**Symptoms:** Prometheus pod is in `Pending`, `CrashLoopBackOff`, or `Error` state.

**Common Causes:**

1. **Insufficient resources**
   ```bash
   # Check pod events
   kubectl describe pod -n monitoring -l app.kubernetes.io/name=prometheus
   
   # Look for "Insufficient cpu" or "Insufficient memory"
   ```
   
   **Solution:** Increase cluster resources or reduce Prometheus resource requests.

2. **PVC not bound**
   ```bash
   kubectl get pvc -n monitoring
   ```
   
   **Solution:** 
   - Check if storage class exists: `kubectl get sc`
   - Check PVC events: `kubectl describe pvc <pvc-name> -n monitoring`
   - Ensure storage provisioner is working

3. **Configuration errors**
   ```bash
   kubectl logs -n monitoring -l app.kubernetes.io/name=prometheus
   ```
   
   **Solution:** Check PrometheusRule CRs for syntax errors:
   ```bash
   kubectl get prometheusrules -n monitoring
   kubectl describe prometheusrule fluxion-alerts -n monitoring
   ```

### Prometheus Not Scraping Targets

**Symptoms:** Targets show as "down" in Prometheus UI (Status -> Targets).

**Common Causes:**

1. **Service discovery issues**
   ```bash
   # Check if services exist
   kubectl get svc -n fluxion-production
   
   # Check service endpoints
   kubectl get endpoints -n fluxion-production
   ```
   
   **Solution:** Ensure pods have correct labels and are running.

2. **Network policies blocking access**
   ```bash
   kubectl get networkpolicies -n fluxion-production
   ```
   
   **Solution:** Add policy to allow Prometheus to scrape:
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata:
     name: allow-prometheus-scrape
   spec:
     podSelector:
       matchLabels:
         app.kubernetes.io/name: fluxion
     ingress:
       - from:
           - namespaceSelector:
               matchLabels:
                 name: monitoring
   ```

3. **Incorrect scrape configuration**
   
   **Solution:** Check ServiceMonitor or scrape config:
   ```bash
   kubectl get servicemonitors -n monitoring
   kubectl describe servicemonitor <name> -n monitoring
   ```

### High Memory Usage

**Symptoms:** Prometheus consuming too much memory, OOMKilled.

**Solutions:**

1. **Reduce retention**
   ```yaml
   prometheus:
     prometheusSpec:
       retention: 15d  # Reduce from 30d
   ```

2. **Reduce cardinality**
   - Check for high-cardinality metrics
   - Add relabel configs to drop unnecessary labels
   
   ```yaml
   prometheus:
     prometheusSpec:
       additionalScrapeConfigs:
         - job_name: 'example'
           metric_relabel_configs:
             - source_labels: [__name__]
               regex: 'expensive_metric_.*'
               action: drop
   ```

3. **Increase resources**
   ```yaml
   prometheus:
     prometheusSpec:
       resources:
         limits:
           memory: 8Gi
   ```

## Grafana Issues

### Grafana Not Starting

**Common Causes:**

1. **Database initialization failed**
   ```bash
   kubectl logs -n monitoring -l app.kubernetes.io/name=grafana
   ```
   
   **Solution:** Check PVC and ensure storage is available.

2. **Secret missing**
   ```bash
   kubectl get secret -n monitoring prometheus-stack-grafana
   ```
   
   **Solution:** Ensure the secret exists or create it manually.

### Dashboards Not Loading

**Symptoms:** Dashboards show "Panel plugin not found" or empty panels.

**Common Causes:**

1. **Sidecar not running**
   ```bash
   kubectl describe pod -n monitoring -l app.kubernetes.io/name=grafana
   ```
   
   Look for the dashboard sidecar container.
   
   **Solution:** Ensure sidecar is enabled:
   ```yaml
   grafana:
     sidecar:
       dashboards:
         enabled: true
   ```

2. **Dashboard ConfigMaps not labeled**
   ```bash
   kubectl get cm -n monitoring -l grafana_dashboard=1
   ```
   
   **Solution:** Ensure dashboards have the correct label:
   ```yaml
   metadata:
     labels:
       grafana_dashboard: "1"
   ```

3. **Datasource not configured**
   
   **Solution:** Check datasources in Grafana UI (Configuration -> Data Sources).

### No Data in Dashboards

**Common Causes:**

1. **Prometheus not scraping metrics**
   - Check Prometheus targets (see above)

2. **Metric names incorrect**
   - Check Prometheus for available metrics: http://prometheus:9090/api/v1/label/__name__/values
   
   **Solution:** Update dashboard queries to match actual metric names.

3. **Time range issue**
   - Change time range in dashboard to verify data exists

4. **Namespace filter**
   - Check if metrics have namespace labels
   ```promql
   http_requests_total{namespace="fluxion-production"}
   ```

### Cannot Login to Grafana

**Symptoms:** Login fails with admin credentials.

**Solution:**

1. Get the actual password:
   ```bash
   kubectl get secret -n monitoring prometheus-stack-grafana \
     -o jsonpath="{.data.admin-password}" | base64 -d
   ```

2. Reset password:
   ```bash
   kubectl delete pod -n monitoring -l app.kubernetes.io/name=grafana
   ```

## Jaeger Issues

### Jaeger Not Starting

**Common Causes:**

1. **Storage issues**
   ```bash
   kubectl logs -n monitoring -l app.kubernetes.io/name=jaeger
   ```
   
   Look for badger database errors.
   
   **Solution:** Ensure PVC is bound and writable.

2. **Port conflicts**
   ```bash
   kubectl get svc -n monitoring jaeger-query
   ```
   
   **Solution:** Ensure ports are not already in use.

### No Traces Showing

**Common Causes:**

1. **OTEL Collector not sending traces**
   ```bash
   kubectl logs -n monitoring -l app.kubernetes.io/component=opentelemetry-collector
   ```
   
   Look for export errors.

2. **Fluxion not instrumenting**
   - Check if Fluxion API has OTLP endpoint configured
   ```bash
   kubectl get cm -n fluxion-production fluxion-api-config -o yaml
   ```
   
   **Solution:** Set OTLP endpoint:
   ```yaml
   OTEL_EXPORTER_OTLP_ENDPOINT: "http://fluxion-collector.monitoring.svc.cluster.local:4317"
   ```

3. **Sampling too aggressive**
   
   **Solution:** Check sampling configuration in OTEL collector.

### Storage Full

**Symptoms:** Jaeger stops accepting traces, pod restarts.

**Solution:**

1. Check PVC usage:
   ```bash
   kubectl exec -n monitoring <jaeger-pod> -- df -h /badger
   ```

2. Increase PVC size (if storage class supports it):
   ```bash
   kubectl patch pvc -n monitoring jaeger-data -p '{"spec":{"resources":{"requests":{"storage":"10Gi"}}}}'
   ```

3. Or reduce retention in Jaeger configuration.

## OpenTelemetry Issues

### Operator Not Creating Collector

**Symptoms:** OpenTelemetryCollector CR exists but no pods created.

**Common Causes:**

1. **Operator not running**
   ```bash
   kubectl get pods -n opentelemetry-operator-system
   ```
   
   **Solution:** Check operator logs:
   ```bash
   kubectl logs -n opentelemetry-operator-system -l app.kubernetes.io/name=opentelemetry-operator
   ```

2. **Invalid collector configuration**
   ```bash
   kubectl describe otelcol -n monitoring fluxion-collector
   ```
   
   Look for validation errors.
   
   **Solution:** Fix YAML syntax in collector configuration.

### Collector Not Receiving Data

**Common Causes:**

1. **Service not accessible**
   ```bash
   kubectl get svc -n monitoring fluxion-collector
   ```
   
   Test connectivity:
   ```bash
   kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
     curl -v http://fluxion-collector.monitoring.svc.cluster.local:4318/v1/traces
   ```

2. **Firewall/Network policy**
   ```bash
   kubectl get networkpolicies -n monitoring
   ```

3. **Wrong endpoint in application**
   
   Verify Fluxion configuration points to collector service.

### High Memory Usage

**Solution:**

1. Increase batch size:
   ```yaml
   processors:
     batch:
       send_batch_size: 2048  # Increase
   ```

2. Add memory limiter:
   ```yaml
   processors:
     memory_limiter:
       limit_mib: 900
       spike_limit_mib: 100
   ```

3. Increase resources:
   ```yaml
   resources:
     limits:
       memory: 2Gi
   ```

## ArgoCD Sync Issues

### Application Stuck in "Progressing"

**Common Causes:**

1. **Pods not becoming ready**
   ```bash
   kubectl get pods -n monitoring
   kubectl describe pod <pod-name> -n monitoring
   ```

2. **Liveness/Readiness probes failing**
   
   **Solution:** Check probe configuration and pod logs.

3. **Timeout too short**
   
   **Solution:** Increase sync timeout in application.

### Application "OutOfSync"

**Common Causes:**

1. **Manual changes in cluster**
   ```bash
   argocd app diff <app-name>
   ```
   
   **Solution:** Either:
   - Revert manual changes
   - Commit changes to Git
   - Add to ignoreDifferences

2. **Drift detection**
   
   Some fields change automatically (e.g., replicas with HPA).
   
   **Solution:** Add to ignoreDifferences:
   ```yaml
   ignoreDifferences:
     - group: apps
       kind: Deployment
       jsonPointers:
         - /spec/replicas
   ```

### Sync Failed

**Check sync operation:**
```bash
argocd app get <app-name> -o yaml

# Check logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller
```

**Common causes:**
- Resource already exists (owned by Helm)
- RBAC issues
- API validation errors

## Performance Issues

### Slow Dashboard Loading

**Solutions:**

1. Reduce query time range
2. Add caching:
   ```yaml
   grafana:
     grafana.ini:
       dataproxy:
         timeout: 300
   ```
3. Optimize queries (add rate/irate, increase intervals)

### High CPU Usage

**Prometheus:**
- Reduce scrape frequency
- Reduce number of targets
- Add recording rules for expensive queries

**Grafana:**
- Reduce concurrent users
- Increase resources

## Data Issues

### Metrics Missing

**Debugging steps:**

1. Check if metric exists in Prometheus:
   ```promql
   {__name__=~".*your_metric.*"}
   ```

2. Check metric labels:
   ```promql
   your_metric_name
   ```

3. Check scrape configuration

### Gaps in Data

**Common Causes:**

1. **Prometheus restarted**
   ```bash
   kubectl get events -n monitoring | grep prometheus
   ```

2. **Target was down**
   Check target uptime in Prometheus

3. **Storage full**
   ```bash
   kubectl exec -n monitoring prometheus-stack-prometheus-0 -- df -h
   ```

### Alert Not Firing

**Debugging:**

1. Check if metric has data:
   ```promql
   your_alert_query
   ```

2. Check alert state in Prometheus (Alerts page)

3. Check AlertManager:
   ```bash
   kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager
   ```

4. Verify routing configuration

## Getting Help

If you cannot resolve the issue:

1. Check logs: `kubectl logs -n monitoring <pod-name>`
2. Check events: `kubectl get events -n monitoring`
3. Check documentation for specific component
4. Open an issue on GitHub with:
   - Description of problem
   - Relevant logs
   - Output of `kubectl get all -n monitoring`
   - Helm/ArgoCD configuration

## Useful Commands

```bash
# Check all resources
kubectl get all -n monitoring

# Restart all pods in namespace (careful!)
kubectl rollout restart deployment -n monitoring

# Delete and recreate an application
argocd app delete <app-name>
kubectl apply -f deploy/argocd/apps/<app-name>.yaml

# Check resource versions
helm list -n monitoring
kubectl get crd | grep monitoring

# Export metrics for debugging
kubectl port-forward -n monitoring svc/prometheus-stack-prometheus 9090:9090
curl localhost:9090/api/v1/query?query=up > metrics.json
```
