# ArgoCD Notifications Setup Guide

This guide covers setting up ArgoCD notifications for the Fluxion project to alert teams about deployment status, sync failures, and other important events.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Notification Services](#notification-services)
- [Notification Templates](#notification-templates)
- [Application Annotations](#application-annotations)
- [Notification Triggers](#notification-triggers)
- [Testing Notifications](#testing-notifications)
- [Troubleshooting](#troubleshooting)

## Overview

ArgoCD Notifications provides:
- Real-time alerts for application sync events
- Customizable notification templates
- Multiple notification channels (Slack, Discord, Email, etc.)
- Trigger-based notifications
- Integration with ArgoCD application lifecycle

## Installation

ArgoCD Notifications is included by default in ArgoCD 2.3+. For older versions:

```bash
# Install ArgoCD Notifications controller
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/notifications_catalog/install.yaml

# Verify installation
kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-notifications-controller
```

## Notification Services

### Slack

#### Setup

1. Create a Slack App at https://api.slack.com/apps
2. Add "Incoming Webhooks" feature
3. Create a webhook for your channel
4. Configure ArgoCD with the webhook token

```bash
# Create/update the notifications ConfigMap
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: \$slack-token
  # Optional: Configure default channel
  service.slack.channel: fluxion-alerts
EOF

# Create secret with Slack token
kubectl create secret generic argocd-notifications-secret -n argocd \
  --from-literal=slack-token="xoxb-your-slack-token" \
  --dry-run=client -o yaml | kubectl apply -f -
```

#### Slack Message Format

```yaml
data:
  template.app-deployed: |
    message: |
      :rocket: Application {{.app.metadata.name}} has been deployed!
      
      *Repository:* {{.app.spec.source.repoURL}}
      *Revision:* {{.app.status.sync.revision}}
      *Author:* {{(call .repo.GetCommitMetadata .app.status.sync.revision).Author}}
      *Message:* {{(call .repo.GetCommitMetadata .app.status.sync.revision).Message}}
    slack:
      attachments: |
        [{
          "color": "good",
          "fields": [
            {"title": "Environment", "value": "{{.app.metadata.labels.environment}}", "short": true},
            {"title": "Sync Status", "value": "{{.app.status.sync.status}}", "short": true},
            {"title": "Health Status", "value": "{{.app.status.health.status}}", "short": true}
          ]
        }]
```

### Discord

```bash
# Configure Discord webhook
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.webhook.discord: |
    url: https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
    headers:
    - name: Content-Type
      value: application/json
EOF
```

#### Discord Message Format

```yaml
data:
  template.app-deployed: |
    webhook:
      discord:
        method: POST
        body: |
          {
            "content": "Application {{.app.metadata.name}} deployed!",
            "embeds": [{
              "title": "Deployment Notification",
              "description": "{{.app.metadata.name}} has been successfully deployed",
              "color": 5763719,
              "fields": [
                {"name": "Environment", "value": "{{.app.metadata.labels.environment}}"},
                {"name": "Sync Status", "value": "{{.app.status.sync.status}}"},
                {"name": "Health", "value": "{{.app.status.health.status}}"}
              ]
            }]
          }
```

### Microsoft Teams

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.webhook.teams: |
    url: https://outlook.office.com/webhook/YOUR_WEBHOOK_URL
    headers:
    - name: Content-Type
      value: application/json
EOF
```

### Email (SMTP)

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.email.gmail: |
    username: \$email-username
    password: \$email-password
    host: smtp.gmail.com
    port: 587
    from: argocd@example.com
---
apiVersion: v1
kind: Secret
metadata:
  name: argocd-notifications-secret
  namespace: argocd
stringData:
  email-username: your-email@gmail.com
  email-password: your-app-password
EOF
```

### PagerDuty

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.pagerduty: |
    token: \$pagerduty-token
---
apiVersion: v1
kind: Secret
metadata:
  name: argocd-notifications-secret
  namespace: argocd
stringData:
  pagerduty-token: your-pagerduty-integration-key
EOF
```

### Generic Webhook

For custom integrations:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.webhook.custom: |
    url: https://your-webhook-endpoint.com/notify
    headers:
    - name: Content-Type
      value: application/json
    - name: Authorization
      value: Bearer \$webhook-token
---
apiVersion: v1
kind: Secret
metadata:
  name: argocd-notifications-secret
  namespace: argocd
stringData:
  webhook-token: your-webhook-token
EOF
```

## Notification Templates

Define reusable notification templates:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  # Template for successful sync
  template.app-sync-succeeded: |
    message: |
      ✅ Application {{.app.metadata.name}} sync succeeded
      Environment: {{.app.metadata.labels.environment}}
      Revision: {{.app.status.sync.revision}}
    slack:
      attachments: |
        [{
          "color": "good",
          "title": "{{.app.metadata.name}} - Sync Succeeded",
          "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}",
          "fields": [
            {"title": "Sync Status", "value": "{{.app.status.sync.status}}", "short": true},
            {"title": "Health Status", "value": "{{.app.status.health.status}}", "short": true},
            {"title": "Repository", "value": "{{.app.spec.source.repoURL}}", "short": true},
            {"title": "Revision", "value": "{{.app.status.sync.revision}}", "short": true}
          ]
        }]
  
  # Template for sync failure
  template.app-sync-failed: |
    message: |
      ❌ Application {{.app.metadata.name}} sync failed
      Environment: {{.app.metadata.labels.environment}}
      Error: {{.app.status.operationState.message}}
    slack:
      attachments: |
        [{
          "color": "danger",
          "title": "{{.app.metadata.name}} - Sync Failed",
          "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}",
          "fields": [
            {"title": "Sync Status", "value": "{{.app.status.sync.status}}", "short": true},
            {"title": "Error", "value": "{{.app.status.operationState.message}}", "short": false}
          ]
        }]
  
  # Template for health degraded
  template.app-health-degraded: |
    message: |
      ⚠️ Application {{.app.metadata.name}} is degraded
      Environment: {{.app.metadata.labels.environment}}
      Health: {{.app.status.health.status}}
    slack:
      attachments: |
        [{
          "color": "warning",
          "title": "{{.app.metadata.name}} - Health Degraded",
          "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}",
          "fields": [
            {"title": "Health Status", "value": "{{.app.status.health.status}}", "short": true},
            {"title": "Sync Status", "value": "{{.app.status.sync.status}}", "short": true}
          ]
        }]
  
  # Template for production deployments
  template.app-prod-deployed: |
    message: |
      🚀 PRODUCTION DEPLOYMENT
      Application: {{.app.metadata.name}}
      Revision: {{.app.status.sync.revision}}
      Author: {{(call .repo.GetCommitMetadata .app.status.sync.revision).Author}}
    slack:
      attachments: |
        [{
          "color": "#ff9900",
          "title": "Production Deployment - {{.app.metadata.name}}",
          "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}",
          "fields": [
            {"title": "Environment", "value": "PRODUCTION", "short": true},
            {"title": "Author", "value": "{{(call .repo.GetCommitMetadata .app.status.sync.revision).Author}}", "short": true},
            {"title": "Commit", "value": "{{(call .repo.GetCommitMetadata .app.status.sync.revision).Message}}", "short": false},
            {"title": "Revision", "value": "{{.app.status.sync.revision}}", "short": true}
          ]
        }]
EOF
```

## Notification Triggers

Define when notifications should be sent:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  # Trigger on sync status change
  trigger.on-sync-status-unknown: |
    - when: app.status.sync.status == 'Unknown'
      send: [app-sync-failed]
  
  # Trigger on successful sync
  trigger.on-sync-succeeded: |
    - when: app.status.operationState.phase in ['Succeeded']
      send: [app-sync-succeeded]
  
  # Trigger on sync failure
  trigger.on-sync-failed: |
    - when: app.status.operationState.phase in ['Error', 'Failed']
      send: [app-sync-failed]
  
  # Trigger on health degraded
  trigger.on-health-degraded: |
    - when: app.status.health.status == 'Degraded'
      send: [app-health-degraded]
  
  # Trigger on production deployments
  trigger.on-prod-deployed: |
    - when: app.status.operationState.phase in ['Succeeded'] and app.metadata.labels.environment == 'production'
      send: [app-prod-deployed]
EOF
```

## Application Annotations

Add annotations to applications to enable notifications:

### Subscribe to All Events

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: fluxion-production
  namespace: argocd
  annotations:
    # Subscribe to all default notifications
    notifications.argoproj.io/subscribe.on-sync-succeeded.slack: fluxion-alerts
    notifications.argoproj.io/subscribe.on-sync-failed.slack: fluxion-alerts
    notifications.argoproj.io/subscribe.on-health-degraded.slack: fluxion-alerts
spec:
  # ... rest of application spec
```

### Environment-Specific Channels

```yaml
# Development - less noisy
metadata:
  annotations:
    notifications.argoproj.io/subscribe.on-sync-failed.slack: fluxion-dev

# Staging - moderate alerts
metadata:
  annotations:
    notifications.argoproj.io/subscribe.on-sync-succeeded.slack: fluxion-staging
    notifications.argoproj.io/subscribe.on-sync-failed.slack: fluxion-staging
    notifications.argoproj.io/subscribe.on-health-degraded.slack: fluxion-staging

# Production - all alerts
metadata:
  annotations:
    notifications.argoproj.io/subscribe.on-sync-succeeded.slack: fluxion-prod
    notifications.argoproj.io/subscribe.on-sync-failed.slack: fluxion-prod
    notifications.argoproj.io/subscribe.on-health-degraded.slack: fluxion-prod
    notifications.argoproj.io/subscribe.on-prod-deployed.slack: fluxion-prod
```

### Multiple Recipients

```yaml
metadata:
  annotations:
    # Slack
    notifications.argoproj.io/subscribe.on-sync-failed.slack: fluxion-alerts
    # Email
    notifications.argoproj.io/subscribe.on-sync-failed.email: team@example.com
    # PagerDuty (production only)
    notifications.argoproj.io/subscribe.on-health-degraded.pagerduty: fluxion-production
```

## Complete Configuration Example

Here's a complete example for Fluxion applications:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  # Service configuration
  service.slack: |
    token: \$slack-token
  
  context: |
    argocdUrl: https://argocd.example.com
  
  # Templates
  template.app-sync-succeeded: |
    message: |
      ✅ {{.app.metadata.name}} synced successfully
    slack:
      attachments: |
        [{
          "color": "good",
          "title": "{{.app.metadata.name}} - Sync Succeeded",
          "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}"
        }]
  
  template.app-sync-failed: |
    message: |
      ❌ {{.app.metadata.name}} sync failed: {{.app.status.operationState.message}}
    slack:
      attachments: |
        [{
          "color": "danger",
          "title": "{{.app.metadata.name}} - Sync Failed",
          "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}"
        }]
  
  # Triggers
  trigger.on-sync-succeeded: |
    - when: app.status.operationState.phase in ['Succeeded']
      send: [app-sync-succeeded]
  
  trigger.on-sync-failed: |
    - when: app.status.operationState.phase in ['Error', 'Failed']
      send: [app-sync-failed]
---
apiVersion: v1
kind: Secret
metadata:
  name: argocd-notifications-secret
  namespace: argocd
stringData:
  slack-token: "xoxb-your-slack-token"
EOF
```

## Testing Notifications

### Test Notification Service

```bash
# Test Slack notification
argocd admin notifications template notify app-sync-succeeded \
  --recipient slack:fluxion-alerts

# Test email notification
argocd admin notifications template notify app-sync-succeeded \
  --recipient email:team@example.com
```

### Trigger Test Notification

```bash
# Create a test application
kubectl apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: test-notification
  namespace: argocd
  annotations:
    notifications.argoproj.io/subscribe.on-sync-succeeded.slack: fluxion-alerts
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps
    path: guestbook
    targetRevision: HEAD
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF

# Sync the application to trigger notification
argocd app sync test-notification

# Clean up
kubectl delete application test-notification -n argocd
```

## Monitoring Notifications

### Check Notification Controller Logs

```bash
# View logs
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-notifications-controller -f

# Check for errors
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-notifications-controller | grep -i error
```

### Verify Subscriptions

```bash
# List all notification subscriptions
kubectl get applications -n argocd -o json | \
  jq '.items[] | {name: .metadata.name, annotations: .metadata.annotations | to_entries | map(select(.key | startswith("notifications.argoproj.io")))}' | \
  grep -v "^\[\]$"
```

## Troubleshooting

### Notifications Not Sending

1. **Check controller is running**:
   ```bash
   kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-notifications-controller
   ```

2. **Verify service configuration**:
   ```bash
   kubectl get configmap argocd-notifications-cm -n argocd -o yaml
   ```

3. **Check secrets**:
   ```bash
   kubectl get secret argocd-notifications-secret -n argocd
   ```

4. **View logs**:
   ```bash
   kubectl logs -n argocd -l app.kubernetes.io/name=argocd-notifications-controller
   ```

### Slack Webhook Not Working

```bash
# Test webhook manually
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message from ArgoCD"}' \
  https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Common issues:
# - Invalid token
# - Webhook URL expired
# - Channel doesn't exist
# - Bot not invited to channel
```

### Template Rendering Errors

```bash
# Test template rendering
argocd admin notifications template get app-sync-succeeded

# Validate template syntax
kubectl get configmap argocd-notifications-cm -n argocd -o yaml | yq '.data'
```

### Missing Annotations

```bash
# Check if application has notification annotations
kubectl get application fluxion-production -n argocd -o jsonpath='{.metadata.annotations}'
```

## Best Practices

1. **Use separate channels** for different environments (dev, staging, production)
2. **Limit noise** - only subscribe to important events in production
3. **Test templates** before deploying to production
4. **Monitor notification failures** via controller logs
5. **Use descriptive templates** with relevant context
6. **Include links** to ArgoCD UI in notifications
7. **Set up escalation** via PagerDuty for critical alerts
8. **Document** which teams/channels receive which notifications
9. **Regularly review** and update notification subscriptions
10. **Use conditional triggers** to avoid alert fatigue

## Advanced Configuration

### Conditional Notifications

Only notify for specific conditions:

```yaml
trigger.on-prod-deployment-large: |
  - when: |
      app.metadata.labels.environment == 'production' and
      app.status.operationState.phase in ['Succeeded'] and
      app.spec.source.helm.parameters.replicaCount > 3
    send: [app-prod-deployed]
```

### Rich Slack Messages

```yaml
template.app-deployed-detailed: |
  slack:
    attachments: |
      [{
        "color": "good",
        "title": "{{.app.metadata.name}} Deployed",
        "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}",
        "fields": [
          {"title": "Sync Status", "value": "{{.app.status.sync.status}}", "short": true},
          {"title": "Health", "value": "{{.app.status.health.status}}", "short": true},
          {"title": "Repository", "value": "{{.app.spec.source.repoURL}}", "short": false},
          {"title": "Path", "value": "{{.app.spec.source.path}}", "short": true},
          {"title": "Revision", "value": "{{.app.status.sync.revision}}", "short": true},
          {"title": "Environment", "value": "{{.app.metadata.labels.environment}}", "short": true},
          {"title": "Namespace", "value": "{{.app.spec.destination.namespace}}", "short": true}
        ],
        "footer": "ArgoCD Notifications",
        "footer_icon": "https://argo-cd.readthedocs.io/en/stable/assets/logo.png",
        "ts": {{.app.status.operationState.finishedAt}}
      }]
```

## Integration with CI/CD

Add notification context from CI/CD:

```bash
# GitHub Actions example
- name: Update ArgoCD Application
  run: |
    kubectl annotate application fluxion-production \
      -n argocd \
      --overwrite \
      ci-build-number="${{ github.run_number }}" \
      ci-commit-sha="${{ github.sha }}" \
      ci-actor="${{ github.actor }}"
```

Then reference in templates:

```yaml
template.app-deployed-with-ci: |
  message: |
    Deployed by: {{.app.metadata.annotations.ci-actor}}
    Build: {{.app.metadata.annotations.ci-build-number}}
    Commit: {{.app.metadata.annotations.ci-commit-sha}}
```

## Additional Resources

- [ArgoCD Notifications Documentation](https://argocd-notifications.readthedocs.io/)
- [Notification Templates Catalog](https://github.com/argoproj/argo-cd/tree/master/notifications_catalog)
- [Fluxion Deployment Guide](../README.md)
- [ArgoCD Installation Guide](ARGOCD-INSTALLATION.md)
