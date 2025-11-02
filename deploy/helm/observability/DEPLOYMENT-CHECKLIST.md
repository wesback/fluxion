# Observability Stack Deployment Checklist

Use this checklist to ensure successful deployment of the Fluxion observability stack.

## Pre-Deployment

### ☐ Prerequisites Verified

- [ ] Kubernetes cluster version 1.23+ running
- [ ] kubectl configured and can access cluster
- [ ] ArgoCD installed and accessible
- [ ] Storage class with dynamic provisioning available
- [ ] Cluster has sufficient resources:
  - [ ] At least 4 CPU cores available
  - [ ] At least 8 GB RAM available
  - [ ] At least 100 GB storage available

### ☐ Optional Components

- [ ] Ingress controller installed (nginx/traefik)
- [ ] cert-manager installed (for TLS)
- [ ] External secrets operator (for secret management)

### ☐ Repository Access

- [ ] Cloned fluxion repository
- [ ] On correct branch with observability changes
- [ ] Have access to apply resources to cluster

## Deployment Steps

### ☐ Step 1: Update ArgoCD Project

```bash
kubectl apply -f deploy/argocd/projects/fluxion-project.yaml
```

**Verify:**
- [ ] Project updated successfully
- [ ] Project includes `monitoring` namespace
- [ ] Project includes `opentelemetry-operator-system` namespace

### ☐ Step 2: Deploy Prometheus Stack

```bash
kubectl apply -f deploy/argocd/apps/prometheus-stack.yaml
```

**Wait and verify:**
- [ ] ArgoCD application created: `argocd app get prometheus-stack`
- [ ] Application synced successfully
- [ ] Pods running in monitoring namespace:
  - [ ] prometheus-stack-prometheus-*
  - [ ] prometheus-stack-grafana-*
  - [ ] alertmanager-*
  - [ ] prometheus-stack-kube-state-metrics-*
  - [ ] prometheus-stack-prometheus-node-exporter-* (on all nodes)

```bash
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=prometheus -n monitoring --timeout=300s
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=grafana -n monitoring --timeout=300s
```

### ☐ Step 3: Deploy Jaeger

```bash
kubectl apply -f deploy/argocd/apps/jaeger.yaml
```

**Wait and verify:**
- [ ] ArgoCD application created
- [ ] Application synced successfully
- [ ] Jaeger pod running

```bash
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=jaeger -n monitoring --timeout=180s
```

### ☐ Step 4: Deploy OpenTelemetry Operator

```bash
kubectl apply -f deploy/argocd/apps/opentelemetry-operator.yaml
```

**Wait and verify:**
- [ ] ArgoCD application created
- [ ] Application synced successfully
- [ ] Operator pod running in opentelemetry-operator-system namespace

```bash
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=opentelemetry-operator -n opentelemetry-operator-system --timeout=180s
```

### ☐ Step 5: Deploy OTEL Collector

```bash
kubectl apply -f deploy/argocd/apps/otel-collector.yaml
```

**Wait and verify:**
- [ ] ArgoCD application created
- [ ] Application synced successfully
- [ ] Collector pods running (2 replicas)

```bash
kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=opentelemetry-collector -n monitoring --timeout=180s
```

### ☐ Step 6: Deploy Grafana Dashboards

```bash
kubectl apply -f deploy/argocd/apps/grafana-dashboards.yaml
```

**Verify:**
- [ ] ArgoCD application created
- [ ] Application synced successfully
- [ ] ConfigMaps created in monitoring namespace:
  - [ ] grafana-dashboard-api-performance
  - [ ] grafana-dashboard-package-updates
  - [ ] grafana-dashboard-system-health

```bash
kubectl get cm -n monitoring -l grafana_dashboard=1
```

### ☐ Step 7: Deploy Prometheus Rules

```bash
kubectl apply -f deploy/argocd/apps/prometheus-rules.yaml
```

**Verify:**
- [ ] ArgoCD application created
- [ ] Application synced successfully
- [ ] PrometheusRule created

```bash
kubectl get prometheusrule -n monitoring fluxion-alerts
```

## Post-Deployment Verification

### ☐ All Pods Running

```bash
kubectl get pods -n monitoring
kubectl get pods -n opentelemetry-operator-system
```

**Verify all pods are in Running state and Ready:**
- [ ] All pods showing "1/1" or "2/2" in READY column
- [ ] No pods in CrashLoopBackOff or Error state
- [ ] No excessive restarts

### ☐ ArgoCD Applications Healthy

```bash
argocd app list | grep -E "prometheus|jaeger|otel|grafana"
```

**Verify all applications:**
- [ ] All show "Healthy" status
- [ ] All show "Synced" status
- [ ] No sync errors

### ☐ Services Accessible

```bash
kubectl get svc -n monitoring
```

**Verify services exist:**
- [ ] prometheus-stack-prometheus
- [ ] prometheus-stack-grafana
- [ ] prometheus-stack-alertmanager
- [ ] jaeger-query
- [ ] fluxion-collector

### ☐ Persistent Volumes Bound

```bash
kubectl get pvc -n monitoring
```

**Verify PVCs:**
- [ ] prometheus-stack-prometheus-* (50Gi) - Bound
- [ ] prometheus-stack-grafana (10Gi) - Bound
- [ ] alertmanager-* (10Gi) - Bound
- [ ] jaeger-* (5Gi) - Bound

## Configuration

### ☐ Grafana Access

1. **Get Grafana password:**
```bash
kubectl get secret -n monitoring prometheus-stack-grafana -o jsonpath="{.data.admin-password}" | base64 -d
```

2. **Port-forward Grafana:**
```bash
kubectl port-forward -n monitoring svc/prometheus-stack-grafana 3000:80
```

3. **Access Grafana:**
- [ ] Open http://localhost:3000
- [ ] Login with admin / <password>
- [ ] **IMPORTANT: Change default password immediately**

### ☐ Verify Dashboards

In Grafana UI:
- [ ] Navigate to Dashboards
- [ ] Find "Fluxion" folder
- [ ] Verify 3 dashboards present:
  - [ ] Fluxion - API Performance
  - [ ] Fluxion - Package Updates Overview
  - [ ] Fluxion - System Health

### ☐ Verify Data Sources

In Grafana UI:
- [ ] Go to Configuration → Data Sources
- [ ] Verify Prometheus data source configured
- [ ] Test connection (should show "Data source is working")
- [ ] Verify Jaeger data source configured

### ☐ Verify Prometheus

1. **Port-forward Prometheus:**
```bash
kubectl port-forward -n monitoring svc/prometheus-stack-prometheus 9090:9090
```

2. **Access Prometheus UI:**
- [ ] Open http://localhost:9090
- [ ] Go to Status → Targets
- [ ] Verify targets are being scraped:
  - [ ] Kubernetes components (Up)
  - [ ] Node exporters (Up)
  - [ ] OTEL Collector (Up)
  - [ ] Fluxion API (if deployed) (Up)

### ☐ Verify Jaeger

1. **Port-forward Jaeger:**
```bash
kubectl port-forward -n monitoring svc/jaeger-query 16686:16686
```

2. **Access Jaeger UI:**
- [ ] Open http://localhost:16686
- [ ] UI loads successfully
- [ ] Services dropdown available

### ☐ Verify OTEL Collector

```bash
kubectl logs -n monitoring -l app.kubernetes.io/component=opentelemetry-collector
```

**Check logs for:**
- [ ] No error messages
- [ ] Successful receiver startup
- [ ] Successful exporter connections

**Test connectivity:**
```bash
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl -v http://fluxion-collector.monitoring.svc.cluster.local:4318/v1/traces
```
- [ ] Connection successful (404 expected for GET)

### ☐ Verify Alerts

1. **In Prometheus UI:**
- [ ] Go to Alerts page
- [ ] Verify alert rules loaded
- [ ] Should see Fluxion alerts

2. **In AlertManager:**
```bash
kubectl port-forward -n monitoring svc/prometheus-stack-alertmanager 9093:9093
```
- [ ] Open http://localhost:9093
- [ ] UI loads successfully

## Integration with Fluxion

### ☐ Configure Fluxion to Use OTEL Collector

Update Fluxion Helm values:
```yaml
api:
  env:
    - name: OTEL_EXPORTER_OTLP_ENDPOINT
      value: "http://fluxion-collector.monitoring.svc.cluster.local:4318"
    - name: OTEL_SERVICE_NAME
      value: "fluxion-api"
```

- [ ] Updated Fluxion values
- [ ] Redeployed Fluxion application
- [ ] Verified Fluxion sending telemetry

### ☐ Verify Fluxion Metrics

1. **In Prometheus:**
- [ ] Query `http_requests_total{job="fluxion-api"}`
- [ ] Should see data (if Fluxion is running)

2. **In Grafana:**
- [ ] Open "API Performance" dashboard
- [ ] Should see data (if Fluxion is running)

## Optional: Production Configuration

### ☐ Enable Ingress

Edit application YAMLs to enable ingress:
- [ ] prometheus-stack.yaml (Grafana)
- [ ] jaeger.yaml (Jaeger UI)

Configure:
- [ ] Hostnames set
- [ ] TLS configured
- [ ] DNS records created

### ☐ Configure AlertManager

Edit prometheus-stack.yaml:
- [ ] Add notification receivers (Slack, email, etc.)
- [ ] Configure routing rules
- [ ] Test alert delivery

### ☐ Secure Grafana

- [ ] Change default admin password
- [ ] Configure OAuth/LDAP (optional)
- [ ] Set up RBAC (optional)
- [ ] Enable audit logging

### ☐ Set Up Backups

- [ ] Configure Prometheus snapshots
- [ ] Backup Grafana dashboards (in Git)
- [ ] Configure PV snapshots
- [ ] Document restore procedure

### ☐ Resource Tuning

Based on actual usage:
- [ ] Adjust Prometheus retention
- [ ] Adjust resource requests/limits
- [ ] Configure autoscaling if needed
- [ ] Optimize storage sizes

## Documentation Review

- [ ] Read README.md
- [ ] Review INSTALLATION.md
- [ ] Bookmark TROUBLESHOOTING.md
- [ ] Review QUICKSTART.md
- [ ] Review DASHBOARDS.md

## Final Verification

### ☐ Smoke Test

1. **Generate test traffic** (if Fluxion is deployed)
2. **Check dashboards update** with new data
3. **Verify traces** appear in Jaeger
4. **Check alerts** are evaluating

### ☐ Team Handoff

- [ ] Share Grafana URL and credentials
- [ ] Share documentation links
- [ ] Demonstrate key dashboards
- [ ] Show how to access logs
- [ ] Explain alert escalation

## Troubleshooting

If issues occur, refer to:
- [ ] TROUBLESHOOTING.md for common problems
- [ ] Check pod logs: `kubectl logs -n monitoring <pod-name>`
- [ ] Check events: `kubectl get events -n monitoring`
- [ ] Check ArgoCD sync status: `argocd app get <app-name>`

## Success Criteria

✅ Deployment is successful when:

1. All 6 ArgoCD applications are Healthy and Synced
2. All pods are Running and Ready
3. Grafana is accessible and shows 3 custom dashboards
4. Prometheus is scraping targets successfully
5. Jaeger UI is accessible
6. OTEL Collector is receiving and exporting data
7. Alert rules are loaded in Prometheus
8. Documentation is accessible to team

---

**Deployment Date**: ___________  
**Deployed By**: ___________  
**Environment**: ___________  
**Notes**: ___________
