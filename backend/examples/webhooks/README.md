# Webhook Configuration Examples

This directory contains example webhook configurations for various notification services.

## Example 1: ntfy.sh Kernel Update Alerts

Create a webhook configuration for receiving kernel update notifications via ntfy.sh:

```bash
curl -X POST http://localhost:8000/api/v1/admin/webhooks \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ntfy.sh kernel alerts",
    "url": "https://ntfy.sh/my-fluxion-alerts",
    "enabled": true,
    "event_types": ["kernel_update"],
    "headers_json": {
      "Title": "🚨 Kernel Update Alert",
      "Priority": "high",
      "Tags": "warning,package"
    }
  }'
```

## Example 2: Generic Webhook with Authentication

Create a webhook with custom authentication:

```bash
curl -X POST http://localhost:8000/api/v1/admin/webhooks \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom webhook with auth",
    "url": "https://api.example.com/webhooks/fluxion",
    "enabled": true,
    "event_types": ["kernel_update"],
    "headers_json": {
      "Authorization": "Bearer YOUR_TOKEN_HERE",
      "X-Custom-Header": "custom-value"
    }
  }'
```

## Example 3: Slack Webhook

Create a webhook for Slack notifications:

```bash
curl -X POST http://localhost:8000/api/v1/admin/webhooks \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Slack kernel alerts",
    "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    "enabled": true,
    "event_types": ["kernel_update"],
    "headers_json": {}
  }'
```

## Example 4: Discord Webhook

Create a webhook for Discord notifications:

```bash
curl -X POST http://localhost:8000/api/v1/admin/webhooks \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Discord kernel alerts",
    "url": "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN",
    "enabled": true,
    "event_types": ["kernel_update"],
    "headers_json": {}
  }'
```

## Webhook Payload Format

When a kernel update is detected, the following payload is sent to the webhook:

```json
{
  "event": "kernel_update",
  "hostname": "server01",
  "package_name": "linux-image-5.15.0-91-generic",
  "old_version": "5.15.0-88",
  "new_version": "5.15.0-91",
  "timestamp": "2025-10-29T12:00:00Z",
  "severity": "high"
}
```

For ntfy.sh webhooks, an additional `message` field is added for better display:

```json
{
  "event": "kernel_update",
  "hostname": "server01",
  "package_name": "linux-image-5.15.0-91-generic",
  "old_version": "5.15.0-88",
  "new_version": "5.15.0-91",
  "timestamp": "2025-10-29T12:00:00Z",
  "severity": "high",
  "message": "🚨 Kernel Update: server01 - linux-image-5.15.0-91-generic (5.15.0-88 → 5.15.0-91)"
}
```

## Testing Webhooks

Test a webhook configuration before enabling it:

```bash
# Test webhook by ID
curl -X POST http://localhost:8000/api/v1/admin/webhooks/1/test \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Test with custom payload
curl -X POST http://localhost:8000/api/v1/admin/webhooks/1/test \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "test_payload": {
      "event": "test",
      "message": "Custom test message"
    }
  }'
```

Or use the CLI tool:

```bash
# Test ntfy.sh webhook
python scripts/test_webhook.py --ntfy my-topic --title "Test Alert" --priority high

# Test generic webhook
python scripts/test_webhook.py --url https://example.com/webhook
```

## Managing Webhooks

List all webhooks:

```bash
curl http://localhost:8000/api/v1/admin/webhooks \
  -H "X-API-Key: YOUR_ADMIN_KEY"
```

Get a specific webhook:

```bash
curl http://localhost:8000/api/v1/admin/webhooks/1 \
  -H "X-API-Key: YOUR_ADMIN_KEY"
```

Update a webhook:

```bash
curl -X PATCH http://localhost:8000/api/v1/admin/webhooks/1 \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false
  }'
```

Delete a webhook:

```bash
curl -X DELETE http://localhost:8000/api/v1/admin/webhooks/1 \
  -H "X-API-Key: YOUR_ADMIN_KEY"
```

View webhook delivery history:

```bash
curl http://localhost:8000/api/v1/admin/webhooks/1/history \
  -H "X-API-Key: YOUR_ADMIN_KEY"
```

## Kernel Package Detection

The system automatically detects kernel packages based on these patterns:
- `linux-image*`
- `linux-headers*`
- `linux-modules*`

When any of these packages are updated, the `kernel_update` event is triggered and sent to all enabled webhooks configured for that event type.

## Retry Logic

Webhooks are delivered with the following retry logic:
- Maximum 3 attempts
- Exponential backoff: 1s, 2s, 4s
- 5-second timeout per attempt
- All delivery attempts are logged in the `webhook_delivery_history` table
