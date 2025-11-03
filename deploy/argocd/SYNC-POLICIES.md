# ArgoCD Sync Policies for Fluxion

This guide explains the different sync policies used in Fluxion's ArgoCD deployment and how to configure them for different scenarios.

## Table of Contents

- [Overview](#overview)
- [Sync Policy Types](#sync-policy-types)
- [Automated Sync](#automated-sync)
- [Manual Sync](#manual-sync)
- [Sync Options](#sync-options)
- [Sync Waves](#sync-waves)
- [Environment-Specific Policies](#environment-specific-policies)
- [Sync Hooks](#sync-hooks)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

ArgoCD sync policies define how and when changes from Git are applied to the Kubernetes cluster. Proper sync policies ensure safe, predictable deployments while maintaining the desired state.

### Key Concepts

- **Sync**: Process of applying Git changes to the cluster
- **Auto-sync**: Automatic sync when Git changes
- **Self-heal**: Automatic correction of drift
- **Prune**: Automatic deletion of removed resources
- **Sync waves**: Ordered deployment of resources

## Sync Policy Types

### Manual Sync

Application waits for manual approval before syncing.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-production
spec:
  syncPolicy:
    # No automated sync policy = manual sync required
    automated: null
```

**Use Cases:**
- Production environments
- Critical applications
- Compliance requirements
- Change management processes

**Advantages:**
- Full control over deployments
- Review changes before applying
- Coordinate with maintenance windows
- Reduce risk of unexpected changes

**Disadvantages:**
- Slower deployment process
- Requires manual intervention
- Potential for human error
- Delays in deploying fixes

### Automated Sync

Application automatically syncs when Git changes.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-dev
spec:
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
```

**Use Cases:**
- Development environments
- Staging environments
- Non-critical applications
- Rapid iteration workflows

**Advantages:**
- Fast deployment of changes
- Reduced manual overhead
- Consistent with GitOps principles
- Automatic drift correction

**Disadvantages:**
- Less control over timing
- Potential for unexpected changes
- May deploy during business hours
- Requires careful testing

## Automated Sync

### Basic Configuration

```yaml
spec:
  syncPolicy:
    automated:
      prune: true      # Delete resources removed from Git
      selfHeal: true   # Correct manual changes
      allowEmpty: false # Prevent empty manifests
```

### Prune

Automatically delete resources that are no longer defined in Git.

```yaml
automated:
  prune: true
```

**Example:**
```bash
# Resource exists in cluster
kubectl get deployment old-service -n fluxion-dev

# Remove from Git
git rm deploy/helm/fluxion/templates/old-service.yaml
git commit -m "remove old service"
git push

# ArgoCD will automatically delete it
# After sync, the resource is gone
kubectl get deployment old-service -n fluxion-dev
# Error: deployments.apps "old-service" not found
```

**Cautions:**
- Can accidentally delete resources
- Be careful with wildcards
- Test in dev first
- Use `PruneLast` sync option

### Self-Heal

Automatically revert manual changes to match Git state.

```yaml
automated:
  selfHeal: true
```

**Example:**
```bash
# Manually scale deployment
kubectl scale deployment fluxion-api --replicas=5 -n fluxion-dev

# ArgoCD detects drift
argocd app get fluxion-dev
# Status: OutOfSync

# After 5 seconds, ArgoCD reverts change
kubectl get deployment fluxion-api -n fluxion-dev
# READY: 2/2  (back to Git-defined replica count)
```

**Cautions:**
- Prevents emergency manual fixes
- May revert debugging changes
- Consider disabling for troubleshooting
- Use `argocd app set --self-heal false` temporarily

### Allow Empty

Prevent syncing when no manifests are found.

```yaml
automated:
  allowEmpty: false
```

**Use Case:**
Prevents accidental deletion of all resources if:
- Helm chart rendering fails
- Path is incorrect
- Git branch is empty

## Manual Sync

### Basic Configuration

```yaml
spec:
  syncPolicy:
    automated: null  # No automated sync
    
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
```

### Sync via CLI

```bash
# Basic sync
argocd app sync fluxion-production

# Dry run (preview changes)
argocd app sync fluxion-production --dry-run

# Force sync (ignore health checks)
argocd app sync fluxion-production --force

# Sync specific resources
argocd app sync fluxion-production \
  --resource Deployment:fluxion-api \
  --resource Service:fluxion-api

# Prune during sync
argocd app sync fluxion-production --prune
```

### Sync via UI

1. Navigate to application in ArgoCD UI
2. Click "Sync" button
3. Review changes in diff view
4. Select sync options:
   - Prune: Delete removed resources
   - Dry Run: Preview without applying
   - Force: Ignore health checks
5. Click "Synchronize"

### Sync Strategies

```yaml
spec:
  syncPolicy:
    syncOptions:
      - ApplyOutOfSyncOnly=true  # Only sync out-of-sync resources
    
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

## Sync Options

### CreateNamespace

Automatically create namespace if it doesn't exist.

```yaml
syncOptions:
  - CreateNamespace=true
```

### PruneLast

Prune resources as the last step of sync.

```yaml
syncOptions:
  - PruneLast=true
```

**Use Case:** Safely delete resources after new ones are created.

**Example:**
```
1. Create new service
2. Update deployment to use new service
3. Delete old service (pruned last)
```

### Validate

Validate resources before applying.

```yaml
syncOptions:
  - Validate=true
```

### ApplyOutOfSyncOnly

Only apply resources that are out of sync.

```yaml
syncOptions:
  - ApplyOutOfSyncOnly=true
```

**Benefit:** Faster syncs for large applications.

### PrunePropagationPolicy

Control how Kubernetes handles resource deletion.

```yaml
syncOptions:
  - PrunePropagationPolicy=foreground
  # Options: foreground, background, orphan
```

### RespectIgnoreDifferences

Honor `ignoreDifferences` configuration.

```yaml
syncOptions:
  - RespectIgnoreDifferences=true

ignoreDifferences:
  - group: apps
    kind: Deployment
    jsonPointers:
      - /spec/replicas  # Ignore replica count differences
```

### Replace

Use `kubectl replace` instead of `kubectl apply`.

```yaml
syncOptions:
  - Replace=true
```

**Use Case:** Resources that don't support `apply` (e.g., some CRDs).

### ServerSideApply

Use Kubernetes server-side apply.

```yaml
syncOptions:
  - ServerSideApply=true
```

## Sync Waves

Control the order of resource deployment using sync waves.

### Wave Annotations

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "0"
```

### Wave Strategy for Fluxion

```yaml
# Wave 0: Foundation
apiVersion: v1
kind: Namespace
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "0"

---
# Wave 0: Secrets
apiVersion: v1
kind: Secret
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "0"

---
# Wave 1: Databases
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgresql
  annotations:
    argocd.argoproj.io/sync-wave: "1"

---
# Wave 2: Applications
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fluxion-api
  annotations:
    argocd.argoproj.io/sync-wave: "2"

---
# Wave 3: Services & Ingress
apiVersion: v1
kind: Service
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "3"
```

### Complete Wave Hierarchy

```
Wave -5: Namespace creation
Wave -1: CRDs and Operators
Wave  0: Secrets, ConfigMaps, ServiceAccounts, PVCs
Wave  1: Databases, StatefulSets, DaemonSets
Wave  2: Deployments, ReplicaSets
Wave  3: Services, Ingress
Wave  4: Jobs
Wave  5: Monitoring, Dashboards
```

### Wave Synchronization

```bash
# Sync respects wave order
argocd app sync fluxion-production

# Waves are applied sequentially:
# 1. Wave 0 resources → Wait for healthy
# 2. Wave 1 resources → Wait for healthy
# 3. Wave 2 resources → Wait for healthy
# ...and so on
```

## Environment-Specific Policies

### Development Environment

**Goal:** Fast iteration, automatic updates, self-healing

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-dev
spec:
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
      - RespectIgnoreDifferences=true
    
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

**Characteristics:**
- Automatic sync enabled
- Self-healing enabled
- Aggressive retry policy
- Fast failure recovery

### Staging Environment

**Goal:** Automatic deployment with safety checks

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-staging
spec:
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
      - RespectIgnoreDifferences=true
      - Validate=true
    
    retry:
      limit: 3
      backoff:
        duration: 10s
        factor: 2
        maxDuration: 5m
```

**Characteristics:**
- Automatic sync enabled
- Validation enabled
- Moderate retry policy
- Production-like configuration

### Production Environment

**Goal:** Manual control, maximum safety

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-production
spec:
  syncPolicy:
    # Manual sync only
    automated: null
    
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
      - RespectIgnoreDifferences=true
      - Validate=true
      - ApplyOutOfSyncOnly=true
    
    retry:
      limit: 5
      backoff:
        duration: 15s
        factor: 2
        maxDuration: 10m
    
    # Optional: Restrict sync to maintenance windows
    syncWindows:
      - kind: allow
        schedule: '0 9 * * 1-5'  # Mon-Fri 9am
        duration: 8h
        applications:
          - fluxion-production
        manualSync: true
```

**Characteristics:**
- Manual sync only
- Sync windows enforced
- Comprehensive validation
- Conservative retry policy

## Sync Hooks

Execute actions at specific points in the sync lifecycle.

### Hook Types

```yaml
metadata:
  annotations:
    argocd.argoproj.io/hook: PreSync
    # Options: PreSync, Sync, PostSync, Skip, SyncFail
```

### Pre-Sync Hook

Run before syncing (e.g., database migration).

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      containers:
      - name: migrate
        image: fluxiondevaksacr.azurecr.io/fluxion:v1.2.3
        command: ["alembic", "upgrade", "head"]
      restartPolicy: Never
```

### Post-Sync Hook

Run after successful sync (e.g., smoke test).

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: smoke-test
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      containers:
      - name: test
        image: curlimages/curl
        command:
        - sh
        - -c
        - |
          curl -f http://fluxion-api:8000/health || exit 1
      restartPolicy: Never
```

### Sync Fail Hook

Run if sync fails (e.g., rollback, notification).

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: notify-failure
  annotations:
    argocd.argoproj.io/hook: SyncFail
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      containers:
      - name: notify
        image: curlimages/curl
        command:
        - sh
        - -c
        - |
          curl -X POST https://hooks.slack.com/... \
            -d '{"text": "Sync failed for fluxion-production"}'
      restartPolicy: Never
```

### Hook Deletion Policies

```yaml
argocd.argoproj.io/hook-delete-policy: HookSucceeded
# Options:
# - HookSucceeded: Delete after successful execution
# - HookFailed: Delete after failed execution
# - BeforeHookCreation: Delete before creating new hook
```

## Sync Windows

Restrict when syncs can occur.

### Allow Window

```yaml
syncPolicy:
  syncWindows:
    - kind: allow
      schedule: '0 9 * * 1-5'  # Mon-Fri at 9am
      duration: 8h              # 8-hour window
      applications:
        - fluxion-production
      manualSync: true          # Require manual sync even in window
```

### Deny Window

```yaml
syncPolicy:
  syncWindows:
    - kind: deny
      schedule: '0 0 * * 6,0'  # Weekends
      duration: 24h
      applications:
        - fluxion-production
```

### Multiple Windows

```yaml
syncPolicy:
  syncWindows:
    # Allow weekday mornings
    - kind: allow
      schedule: '0 9 * * 1-5'
      duration: 4h
      applications:
        - fluxion-production
    
    # Deny holidays
    - kind: deny
      schedule: '0 0 25 12 *'  # Christmas
      duration: 24h
      applications:
        - fluxion-production
```

## Best Practices

### 1. Start with Manual Sync

```yaml
# Start conservative
syncPolicy:
  automated: null

# After confidence, enable auto-sync
syncPolicy:
  automated:
    prune: false  # Start without prune
    selfHeal: false

# Finally, full automation
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

### 2. Use Sync Waves

```yaml
# Always use sync waves for proper ordering
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "1"
```

### 3. Test in Development First

```bash
# Apply policy to dev first
kubectl apply -f deploy/argocd/apps/fluxion-dev.yaml

# Monitor for issues
argocd app watch fluxion-dev

# After 1-2 weeks, promote to staging
kubectl apply -f deploy/argocd/apps/fluxion-staging.yaml
```

### 4. Use Ignore Differences

```yaml
ignoreDifferences:
  - group: apps
    kind: Deployment
    jsonPointers:
      - /spec/replicas  # HPA manages this
  
  - group: apps
    kind: StatefulSet
    jsonPointers:
      - /spec/volumeClaimTemplates/0/spec/resources/requests/storage
```

### 5. Implement Sync Hooks

```yaml
# Pre-sync: Database migrations
# Sync: Application deployment
# Post-sync: Smoke tests
```

### 6. Monitor Sync Operations

```bash
# Watch sync status
argocd app watch fluxion-production

# View sync history
argocd app history fluxion-production

# Check sync logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller
```

### 7. Document Sync Policies

```yaml
metadata:
  annotations:
    sync-policy: "Manual sync required for production"
    sync-window: "Mon-Fri 9am-5pm EST"
    approval: "Requires DevOps team approval"
```

## Troubleshooting

### Sync Not Triggering

```bash
# Check if automated sync is enabled
argocd app get fluxion-dev | grep -A5 "Sync Policy"

# Check sync status
argocd app get fluxion-dev

# Force refresh
argocd app get fluxion-dev --refresh

# Hard refresh (clears cache)
argocd app get fluxion-dev --hard-refresh
```

### Sync Fails Due to Resource Order

```bash
# Add sync waves to control order
kubectl patch -f deployment.yaml \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/sync-wave":"2"}}}'
```

### Application Stuck OutOfSync

```bash
# Check diff
argocd app diff fluxion-production

# Sync with force
argocd app sync fluxion-production --force

# If stuck, reset to Git state
argocd app sync fluxion-production --force --prune
```

### Self-Heal Preventing Manual Changes

```bash
# Temporarily disable self-heal
argocd app set fluxion-dev --self-heal=false

# Make manual change
kubectl scale deployment fluxion-api --replicas=5

# After debugging, re-enable
argocd app set fluxion-dev --self-heal=true
```

### Prune Deleting Wrong Resources

```bash
# Check what would be pruned
argocd app sync fluxion-dev --dry-run --prune

# Disable prune temporarily
argocd app set fluxion-dev --auto-prune=false

# Fix resource definitions in Git

# Re-enable prune
argocd app set fluxion-dev --auto-prune=true
```

## Sync Policy Decision Tree

```
Is this production? 
  ├─ Yes → Manual sync
  │         - automated: null
  │         - Sync windows
  │         - Approval required
  │
  └─ No → Is this staging?
            ├─ Yes → Auto-sync with validation
            │         - automated: {prune: true, selfHeal: true}
            │         - Validate: true
            │
            └─ No (dev) → Full auto-sync
                          - automated: {prune: true, selfHeal: true}
                          - Fast iteration
```

## Additional Resources

- [ArgoCD Sync Documentation](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/)
- [Sync Waves and Phases](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/)
- [Resource Hooks](https://argo-cd.readthedocs.io/en/stable/user-guide/resource_hooks/)
- [Fluxion Repository](https://github.com/wesback/fluxion)
- [GITOPS-WORKFLOW.md](GITOPS-WORKFLOW.md)
- [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md)
