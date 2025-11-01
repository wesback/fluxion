# Disaster Recovery Procedures for Fluxion

This guide provides comprehensive procedures for backing up, restoring, and recovering the Fluxion deployment managed by ArgoCD.

## Table of Contents

- [Overview](#overview)
- [Backup Strategy](#backup-strategy)
- [ArgoCD Backup](#argocd-backup)
- [Application Data Backup](#application-data-backup)
- [Recovery Procedures](#recovery-procedures)
- [Testing Recovery](#testing-recovery)
- [Disaster Scenarios](#disaster-scenarios)
- [Best Practices](#best-practices)

## Overview

### What to Backup

1. **Git Repository** (Primary source of truth)
   - Application manifests
   - Helm charts
   - ArgoCD application definitions
   
2. **ArgoCD Configuration**
   - Applications
   - Projects
   - Repositories
   - Clusters
   - Secrets
   
3. **Application Data**
   - PostgreSQL database
   - Persistent volumes
   - ConfigMaps and Secrets
   
4. **Cluster State**
   - Namespace configurations
   - RBAC policies
   - Network policies

### Recovery Time Objectives (RTO)

- **ArgoCD**: < 30 minutes
- **Application Configuration**: < 15 minutes (automated via GitOps)
- **Database**: < 1 hour (depending on database size)
- **Complete System**: < 2 hours

### Recovery Point Objectives (RPO)

- **Git Repository**: Real-time (continuous sync)
- **Database**: 15 minutes (continuous backup recommended)
- **ArgoCD State**: 1 hour (periodic backup)

## Backup Strategy

### Automated Daily Backups

Set up a CronJob for automated backups:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: fluxion-backup
  namespace: fluxion-production
spec:
  # Run daily at 2 AM
  schedule: "0 2 * * *"
  successfulJobsHistoryLimit: 7
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: backup-sa
          containers:
          - name: backup
            image: postgres:14
            env:
            - name: PGHOST
              value: fluxion-postgresql
            - name: PGDATABASE
              value: fluxion
            - name: PGUSER
              value: fluxion
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: fluxion-postgresql
                  key: postgres-password
            - name: BACKUP_DEST
              value: "s3://fluxion-backups/$(date +%Y%m%d-%H%M%S)"
            command:
            - /bin/sh
            - -c
            - |
              # Create backup
              pg_dump --format=custom --file=/tmp/backup.dump
              
              # Upload to S3 (requires aws-cli)
              apt-get update && apt-get install -y awscli
              aws s3 cp /tmp/backup.dump ${BACKUP_DEST}/fluxion.dump
              
              # Keep only last 30 days of backups
              aws s3 ls s3://fluxion-backups/ | \
                awk '{print $4}' | sort -r | tail -n +31 | \
                xargs -I {} aws s3 rm s3://fluxion-backups/{}
            volumeMounts:
            - name: backup-volume
              mountPath: /tmp
          volumes:
          - name: backup-volume
            emptyDir: {}
          restartPolicy: OnFailure
```

## ArgoCD Backup

### 1. Backup ArgoCD Applications

```bash
#!/bin/bash
# backup-argocd-apps.sh

BACKUP_DIR="/backups/argocd/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Export all applications
kubectl get applications -n argocd -o yaml > "$BACKUP_DIR/applications.yaml"

# Export all projects
kubectl get appprojects -n argocd -o yaml > "$BACKUP_DIR/projects.yaml"

# Export ArgoCD ConfigMaps
kubectl get configmap -n argocd -o yaml > "$BACKUP_DIR/configmaps.yaml"

# Export ArgoCD Secrets (encrypted)
kubectl get secrets -n argocd -o yaml > "$BACKUP_DIR/secrets.yaml"

# Compress backup
tar -czf "$BACKUP_DIR.tar.gz" -C /backups/argocd "$(basename $BACKUP_DIR)"
rm -rf "$BACKUP_DIR"

echo "Backup completed: $BACKUP_DIR.tar.gz"
```

### 2. Backup Git Repository

```bash
#!/bin/bash
# backup-git-repo.sh

BACKUP_DIR="/backups/git/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Clone the repository
git clone --mirror https://github.com/wesback/fluxion.git "$BACKUP_DIR/fluxion.git"

# Create archive
tar -czf "$BACKUP_DIR.tar.gz" -C /backups/git "$(basename $BACKUP_DIR)"
rm -rf "$BACKUP_DIR"

# Upload to backup storage
aws s3 cp "$BACKUP_DIR.tar.gz" "s3://fluxion-backups/git/"

echo "Git backup completed: $BACKUP_DIR.tar.gz"
```

### 3. Backup ArgoCD Configuration

Export critical ArgoCD configuration:

```bash
#!/bin/bash
# backup-argocd-config.sh

BACKUP_DIR="/backups/argocd-config/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Export repositories
argocd repo list -o yaml > "$BACKUP_DIR/repositories.yaml"

# Export clusters
argocd cluster list -o yaml > "$BACKUP_DIR/clusters.yaml"

# Export ArgoCD RBAC
kubectl get configmap argocd-rbac-cm -n argocd -o yaml > "$BACKUP_DIR/rbac.yaml"

# Export ArgoCD settings
kubectl get configmap argocd-cm -n argocd -o yaml > "$BACKUP_DIR/settings.yaml"

# Export notification configuration
kubectl get configmap argocd-notifications-cm -n argocd -o yaml > "$BACKUP_DIR/notifications.yaml" 2>/dev/null || true

# Compress
tar -czf "$BACKUP_DIR.tar.gz" -C /backups/argocd-config "$(basename $BACKUP_DIR)"
rm -rf "$BACKUP_DIR"

echo "ArgoCD config backup completed: $BACKUP_DIR.tar.gz"
```

## Application Data Backup

### PostgreSQL Database Backup

#### Manual Backup

```bash
# Create backup directory
mkdir -p /backups/postgres

# Backup database
kubectl exec -n fluxion-production fluxion-postgresql-0 -- \
  pg_dump -U fluxion -Fc fluxion > /backups/postgres/fluxion-$(date +%Y%m%d-%H%M%S).dump

# Verify backup
ls -lh /backups/postgres/
```

#### Automated Backup with Velero

Install Velero for cluster-wide backups:

```bash
# Install Velero
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.8.0 \
  --bucket fluxion-velero-backups \
  --secret-file ./credentials-velero \
  --backup-location-config region=us-east-1

# Create backup schedule for Fluxion
velero schedule create fluxion-daily \
  --schedule="0 2 * * *" \
  --include-namespaces fluxion-production,fluxion-staging,fluxion-dev \
  --ttl 720h0m0s

# Create immediate backup
velero backup create fluxion-manual \
  --include-namespaces fluxion-production
```

#### Backup to Cloud Storage

##### AWS S3

```bash
#!/bin/bash
# backup-postgres-to-s3.sh

NAMESPACE="fluxion-production"
POD="fluxion-postgresql-0"
S3_BUCKET="s3://fluxion-backups/postgres"
BACKUP_NAME="fluxion-$(date +%Y%m%d-%H%M%S).dump"

# Create backup
kubectl exec -n $NAMESPACE $POD -- \
  pg_dump -U fluxion -Fc fluxion > /tmp/$BACKUP_NAME

# Upload to S3
aws s3 cp /tmp/$BACKUP_NAME $S3_BUCKET/$BACKUP_NAME

# Clean up local file
rm /tmp/$BACKUP_NAME

echo "Backup uploaded to $S3_BUCKET/$BACKUP_NAME"
```

##### Azure Blob Storage

```bash
#!/bin/bash
# backup-postgres-to-azure.sh

NAMESPACE="fluxion-production"
POD="fluxion-postgresql-0"
STORAGE_ACCOUNT="fluxionbackups"
CONTAINER="postgres"
BACKUP_NAME="fluxion-$(date +%Y%m%d-%H%M%S).dump"

# Create backup
kubectl exec -n $NAMESPACE $POD -- \
  pg_dump -U fluxion -Fc fluxion > /tmp/$BACKUP_NAME

# Upload to Azure
az storage blob upload \
  --account-name $STORAGE_ACCOUNT \
  --container-name $CONTAINER \
  --name $BACKUP_NAME \
  --file /tmp/$BACKUP_NAME

rm /tmp/$BACKUP_NAME

echo "Backup uploaded to Azure: $BACKUP_NAME"
```

### Persistent Volume Backup

```bash
# Using volume snapshots
kubectl apply -f - <<EOF
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: fluxion-postgres-snapshot-$(date +%Y%m%d)
  namespace: fluxion-production
spec:
  volumeSnapshotClassName: csi-snapclass
  source:
    persistentVolumeClaimName: data-fluxion-postgresql-0
EOF
```

### Secrets Backup

```bash
#!/bin/bash
# backup-secrets.sh

BACKUP_DIR="/backups/secrets/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Export secrets from all Fluxion namespaces
for ns in fluxion-dev fluxion-staging fluxion-production; do
  kubectl get secrets -n $ns -o yaml > "$BACKUP_DIR/secrets-$ns.yaml"
done

# Encrypt backup (using gpg)
tar -czf - -C /backups/secrets "$(basename $BACKUP_DIR)" | \
  gpg --symmetric --cipher-algo AES256 > "$BACKUP_DIR.tar.gz.gpg"

rm -rf "$BACKUP_DIR"

echo "Encrypted secrets backup: $BACKUP_DIR.tar.gz.gpg"
```

## Recovery Procedures

### Complete Disaster Recovery

#### Scenario: Complete cluster loss

```bash
#!/bin/bash
# disaster-recovery.sh

set -e

echo "=== Starting Disaster Recovery ==="

# 1. Create new cluster (example using eksctl)
echo "Step 1: Creating new cluster..."
eksctl create cluster -f cluster-config.yaml

# 2. Install ArgoCD
echo "Step 2: Installing ArgoCD..."
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
kubectl wait --for=condition=available --timeout=300s \
  deployment/argocd-server -n argocd

# 3. Restore ArgoCD configuration
echo "Step 3: Restoring ArgoCD configuration..."
# Restore from backup
tar -xzf /backups/argocd-config/latest.tar.gz -C /tmp
kubectl apply -f /tmp/*/rbac.yaml
kubectl apply -f /tmp/*/settings.yaml
kubectl apply -f /tmp/*/notifications.yaml

# 4. Restore projects
echo "Step 4: Restoring ArgoCD projects..."
tar -xzf /backups/argocd/latest.tar.gz -C /tmp
kubectl apply -f /tmp/*/projects.yaml

# 5. Restore Git credentials (from secure storage)
echo "Step 5: Restoring Git credentials..."
kubectl create secret generic git-credentials -n argocd \
  --from-literal=username="$GIT_USERNAME" \
  --from-literal=password="$GIT_TOKEN"

# 6. Deploy root app-of-apps
echo "Step 6: Deploying root application..."
kubectl apply -f https://raw.githubusercontent.com/wesback/fluxion/main/deploy/argocd/root-app.yaml

# 7. Wait for applications to sync
echo "Step 7: Waiting for applications to sync..."
sleep 30
kubectl get applications -n argocd

# 8. Restore database from backup
echo "Step 8: Restoring PostgreSQL database..."
# Wait for PostgreSQL pod to be ready
kubectl wait --for=condition=ready --timeout=300s \
  pod/fluxion-postgresql-0 -n fluxion-production

# Download latest backup from S3
aws s3 cp s3://fluxion-backups/postgres/latest.dump /tmp/restore.dump

# Restore database
kubectl cp /tmp/restore.dump fluxion-production/fluxion-postgresql-0:/tmp/restore.dump
kubectl exec -n fluxion-production fluxion-postgresql-0 -- \
  pg_restore -U fluxion -d fluxion -c /tmp/restore.dump

echo "=== Disaster Recovery Complete ==="
echo "Please verify all applications are healthy in ArgoCD UI"
```

### Restore Single Application

```bash
#!/bin/bash
# restore-application.sh

APP_NAME="fluxion-production"

# 1. Delete existing application (if corrupted)
kubectl delete application $APP_NAME -n argocd

# 2. Restore from Git (source of truth)
kubectl apply -f https://raw.githubusercontent.com/wesback/fluxion/main/deploy/argocd/apps/$APP_NAME.yaml

# 3. Sync application
argocd app sync $APP_NAME --force

# 4. Wait for sync to complete
argocd app wait $APP_NAME --health --timeout 300
```

### Restore Database Only

```bash
#!/bin/bash
# restore-database.sh

NAMESPACE="fluxion-production"
POD="fluxion-postgresql-0"
BACKUP_FILE="/backups/postgres/fluxion-20231201-020000.dump"

# 1. Stop API to prevent writes
kubectl scale deployment fluxion-api -n $NAMESPACE --replicas=0

# 2. Restore database
kubectl cp $BACKUP_FILE $NAMESPACE/$POD:/tmp/restore.dump
kubectl exec -n $NAMESPACE $POD -- \
  pg_restore -U fluxion -d fluxion -c /tmp/restore.dump

# 3. Restart API
kubectl scale deployment fluxion-api -n $NAMESPACE --replicas=3

echo "Database restored successfully"
```

### Restore ArgoCD Applications

```bash
#!/bin/bash
# restore-argocd-apps.sh

BACKUP_FILE="/backups/argocd/20231201-020000.tar.gz"

# Extract backup
tar -xzf $BACKUP_FILE -C /tmp

# Restore projects first
kubectl apply -f /tmp/*/projects.yaml

# Wait a moment
sleep 5

# Restore applications
kubectl apply -f /tmp/*/applications.yaml

# Verify
kubectl get applications -n argocd
kubectl get appprojects -n argocd
```

## Testing Recovery

### Regular Recovery Drills

Perform quarterly disaster recovery drills:

```bash
#!/bin/bash
# recovery-drill.sh

# Use a separate test cluster
export KUBECONFIG=~/.kube/config-test

echo "=== Starting Recovery Drill ==="

# Follow disaster recovery procedure
./disaster-recovery.sh

# Verify recovery
echo "=== Verification ==="
kubectl get pods -A
kubectl get applications -n argocd
argocd app list

# Run smoke tests
./run-smoke-tests.sh

echo "=== Recovery Drill Complete ==="
```

### Recovery Time Measurement

```bash
#!/bin/bash
# measure-recovery-time.sh

START_TIME=$(date +%s)

# Perform recovery
./disaster-recovery.sh

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "Recovery completed in $ELAPSED seconds ($((ELAPSED / 60)) minutes)"

# Log to metrics
echo "$(date +%Y-%m-%d),recovery_drill,$ELAPSED" >> /var/log/recovery-metrics.csv
```

## Disaster Scenarios

### Scenario 1: Accidental Application Delete

**Problem**: Someone accidentally deleted the production application in ArgoCD.

**Recovery**:
```bash
# Restore from Git (source of truth)
kubectl apply -f deploy/argocd/apps/fluxion-production.yaml

# Sync application
argocd app sync fluxion-production
```

**Time**: < 5 minutes

### Scenario 2: Database Corruption

**Problem**: PostgreSQL database is corrupted.

**Recovery**:
```bash
# 1. Scale down API
kubectl scale deployment fluxion-api -n fluxion-production --replicas=0

# 2. Delete corrupted pod
kubectl delete pod fluxion-postgresql-0 -n fluxion-production

# 3. Restore from backup
# (see "Restore Database Only" section)

# 4. Verify data
kubectl exec -n fluxion-production fluxion-postgresql-0 -- \
  psql -U fluxion -c "SELECT COUNT(*) FROM hosts;"

# 5. Scale up API
kubectl scale deployment fluxion-api -n fluxion-production --replicas=3
```

**Time**: < 30 minutes

### Scenario 3: Git Repository Compromise

**Problem**: Git repository was compromised or accidentally force-pushed.

**Recovery**:
```bash
# 1. Restore repository from backup
aws s3 cp s3://fluxion-backups/git/latest.tar.gz /tmp/
tar -xzf /tmp/latest.tar.gz -C /tmp
cd /tmp/fluxion.git

# 2. Push to new repository or restore original
git push --mirror https://github.com/wesback/fluxion-restored.git

# 3. Update ArgoCD applications to point to restored repository
kubectl patch application fluxion-production -n argocd \
  --type merge \
  -p '{"spec":{"source":{"repoURL":"https://github.com/wesback/fluxion-restored.git"}}}'

# 4. Sync applications
argocd app sync --all
```

**Time**: < 1 hour

### Scenario 4: Complete Cluster Failure

**Problem**: Entire Kubernetes cluster is lost.

**Recovery**: Follow "Complete Disaster Recovery" procedure above.

**Time**: < 2 hours

### Scenario 5: Namespace Accidentally Deleted

**Problem**: Production namespace was accidentally deleted.

**Recovery**:
```bash
# ArgoCD will automatically recreate namespace and all resources
# due to syncPolicy.syncOptions.CreateNamespace=true

# Force immediate sync
argocd app sync fluxion-production --force

# Monitor recovery
watch kubectl get pods -n fluxion-production
```

**Time**: < 10 minutes

## Best Practices

### 1. Git as Source of Truth

- **All configuration in Git**: Never make manual cluster changes
- **Protected branches**: Require PR reviews for main/production branches
- **Signed commits**: Use GPG signing for audit trail
- **Backup Git**: Regular repository backups

### 2. Automated Backups

- **Database**: Continuous or every 15 minutes
- **ArgoCD state**: Daily
- **Secrets**: Weekly (encrypted)
- **Test restores**: Monthly

### 3. Multiple Backup Locations

- **Primary**: Cloud storage (S3, Azure Blob, GCS)
- **Secondary**: Different region/cloud provider
- **Tertiary**: Local encrypted backups

### 4. Documentation

- **Runbooks**: Clear recovery procedures
- **Contact list**: On-call contacts
- **Escalation**: Clear escalation path
- **Change log**: Track all changes

### 5. Monitoring and Alerts

```yaml
# AlertManager rule for backup failures
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: backup-alerts
  namespace: monitoring
spec:
  groups:
  - name: backup
    rules:
    - alert: BackupJobFailed
      expr: |
        kube_job_status_failed{job_name=~"fluxion-backup.*"} > 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Backup job failed"
        description: "Backup job {{ $labels.job_name }} has failed"
    
    - alert: BackupNotRunRecently
      expr: |
        time() - max(kube_job_status_completion_time{job_name=~"fluxion-backup.*"}) > 86400
      labels:
        severity: warning
      annotations:
        summary: "Backup not run in 24 hours"
        description: "No successful backup in the last 24 hours"
```

### 6. Regular Testing

- **Monthly**: Restore database from backup
- **Quarterly**: Full disaster recovery drill
- **Annually**: Cross-region failover test

### 7. Documentation of Recovery Times

Track actual recovery times to validate RTO/RPO:

```bash
# Create metrics dashboard
cat > recovery-metrics.json <<EOF
{
  "dashboard": {
    "title": "Disaster Recovery Metrics",
    "panels": [
      {
        "title": "Recovery Time",
        "targets": [
          {"expr": "disaster_recovery_duration_seconds"}
        ]
      },
      {
        "title": "Last Successful Backup",
        "targets": [
          {"expr": "time() - backup_last_success_time"}
        ]
      }
    ]
  }
}
EOF
```

## Recovery Checklist

Print and keep this checklist accessible:

```
☐ Identify the failure scope
☐ Assess data loss (if any)
☐ Notify stakeholders
☐ Begin documentation/incident log
☐ Restore ArgoCD (if needed)
☐ Restore Git repository (if needed)
☐ Restore ArgoCD applications
☐ Restore database (if needed)
☐ Verify all applications are healthy
☐ Run smoke tests
☐ Verify data integrity
☐ Monitor for issues
☐ Update documentation
☐ Post-mortem review
☐ Implement preventive measures
```

## Emergency Contacts

Document and keep updated:

```yaml
# emergency-contacts.yaml
contacts:
  on_call:
    - name: "Primary On-Call"
      phone: "+1-XXX-XXX-XXXX"
      email: "oncall@example.com"
  
  escalation:
    - name: "Engineering Manager"
      phone: "+1-XXX-XXX-XXXX"
    - name: "CTO"
      phone: "+1-XXX-XXX-XXXX"
  
  external:
    - name: "Cloud Provider Support"
      phone: "+1-XXX-XXX-XXXX"
      url: "https://support.aws.amazon.com"
```

## Additional Resources

- [Velero Documentation](https://velero.io/docs/)
- [PostgreSQL Backup Documentation](https://www.postgresql.org/docs/current/backup.html)
- [ArgoCD Backup/Restore](https://argo-cd.readthedocs.io/en/stable/operator-manual/disaster_recovery/)
- [Kubernetes Backup Best Practices](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#backing-up-an-etcd-cluster)
- [Fluxion Repository](https://github.com/wesback/fluxion)
