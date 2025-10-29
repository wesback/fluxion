# API Authentication Examples

This document provides examples of using the Fluxion API with authentication.

## Prerequisites

1. Generate an admin API key:
```bash
cd backend
python scripts/generate_admin_key.py
```

2. Save the generated key (you'll see it only once)

## Environment Setup

Store your API key in an environment variable for convenience:

```bash
export FLUXION_API_KEY="your_api_key_here"
export FLUXION_URL="http://localhost:8000"
```

## API Key Management

### Create a New API Key (Admin Only)

Create a user-level API key for hosts to report updates:

```bash
curl -X POST "${FLUXION_URL}/api/v1/admin/api-keys" \
  -H "X-API-Key: ${FLUXION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Host Reporter",
    "role": "user"
  }'
```

Response:
```json
{
  "id": 2,
  "name": "Production Host Reporter",
  "role": "user",
  "api_key": "64_character_hex_key_shown_only_once",
  "message": "API key created successfully. Save this key securely - it cannot be retrieved later."
}
```

### List All API Keys (Admin Only)

```bash
curl "${FLUXION_URL}/api/v1/admin/api-keys" \
  -H "X-API-Key: ${FLUXION_API_KEY}"
```

Response:
```json
{
  "items": [
    {
      "id": 1,
      "name": "Initial Admin Key",
      "role": "admin",
      "created_at": "2025-10-29T15:00:00Z",
      "last_used": "2025-10-29T15:30:00Z",
      "is_active": true
    },
    {
      "id": 2,
      "name": "Production Host Reporter",
      "role": "user",
      "created_at": "2025-10-29T15:05:00Z",
      "last_used": null,
      "is_active": true
    }
  ],
  "total": 2
}
```

### Delete an API Key (Admin Only)

```bash
curl -X DELETE "${FLUXION_URL}/api/v1/admin/api-keys/2" \
  -H "X-API-Key: ${FLUXION_API_KEY}"
```

Response:
```json
{
  "message": "API key 'Production Host Reporter' (ID: 2) has been deleted successfully"
}
```

## Package Update Operations

### Report a Single Package Update

```bash
curl -X POST "${FLUXION_URL}/api/v1/updates" \
  -H "X-API-Key: ${FLUXION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "webserver-01",
    "package_name": "nginx",
    "old_version": "1.18.0",
    "new_version": "1.22.0"
  }'
```

Response:
```json
{
  "id": 123,
  "message": "Package update recorded successfully"
}
```

### Report Batch Package Updates

More efficient when multiple packages are updated at once:

```bash
curl -X POST "${FLUXION_URL}/api/v1/updates/batch" \
  -H "X-API-Key: ${FLUXION_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "webserver-01",
    "updates": [
      {
        "package_name": "nginx",
        "old_version": "1.18.0",
        "new_version": "1.22.0"
      },
      {
        "package_name": "curl",
        "old_version": "7.68.0",
        "new_version": "7.81.0"
      },
      {
        "package_name": "python3",
        "old_version": null,
        "new_version": "3.11.0"
      }
    ]
  }'
```

Response:
```json
{
  "hostname": "webserver-01",
  "count": 3,
  "ids": [124, 125, 126],
  "message": "3 package updates recorded successfully"
}
```

## Query Operations

### Get Statistics Dashboard

```bash
curl "${FLUXION_URL}/api/v1/stats" \
  -H "X-API-Key: ${FLUXION_API_KEY}"
```

Response:
```json
{
  "total_hosts": 15,
  "total_updates": 1234,
  "updates_last_24h": 45,
  "updates_last_7d": 320,
  "most_updated_packages": [
    {"package": "nginx", "count": 45},
    {"package": "curl", "count": 38}
  ],
  "most_active_hosts": [
    {"hostname": "webserver-01", "count": 89},
    {"hostname": "database-01", "count": 67}
  ]
}
```

### List All Hosts

```bash
curl "${FLUXION_URL}/api/v1/hosts" \
  -H "X-API-Key: ${FLUXION_API_KEY}"
```

Response:
```json
{
  "items": [
    {
      "hostname": "webserver-01",
      "os_info": "Ubuntu 22.04 LTS",
      "last_seen": "2025-10-29T15:30:00Z",
      "total_updates": 89
    }
  ]
}
```

### Get Host Update History

```bash
curl "${FLUXION_URL}/api/v1/hosts/webserver-01/updates?limit=10&offset=0" \
  -H "X-API-Key: ${FLUXION_API_KEY}"
```

Response:
```json
{
  "items": [
    {
      "package_name": "nginx",
      "old_version": "1.18.0",
      "new_version": "1.22.0",
      "update_timestamp": "2025-10-29T15:30:00Z"
    }
  ],
  "total": 89,
  "limit": 10,
  "offset": 0
}
```

### Get Recent Updates Across All Hosts

```bash
curl "${FLUXION_URL}/api/v1/updates/recent?limit=20&hours=24" \
  -H "X-API-Key: ${FLUXION_API_KEY}"
```

Response:
```json
{
  "items": [
    {
      "hostname": "webserver-01",
      "package_name": "nginx",
      "old_version": "1.18.0",
      "new_version": "1.22.0",
      "timestamp": "2025-10-29T15:30:00Z"
    }
  ]
}
```

### Find Hosts with a Specific Package

```bash
curl "${FLUXION_URL}/api/v1/packages/nginx/hosts" \
  -H "X-API-Key: ${FLUXION_API_KEY}"
```

Response:
```json
{
  "items": [
    {
      "hostname": "webserver-01",
      "current_version": "1.22.0",
      "last_updated": "2025-10-29T15:30:00Z"
    },
    {
      "hostname": "webserver-02",
      "current_version": "1.22.0",
      "last_updated": "2025-10-29T14:00:00Z"
    }
  ]
}
```

## Health Checks (No Authentication Required)

### Basic Health Check

```bash
curl "${FLUXION_URL}/health"
```

Response:
```json
{
  "status": "healthy"
}
```

### Readiness Check (with Database)

```bash
curl "${FLUXION_URL}/ready"
```

Response:
```json
{
  "status": "ready",
  "database": "connected"
}
```

## Rate Limiting

Each API key has a rate limit of 1000 requests per hour. Check the response headers:

```bash
curl -i "${FLUXION_URL}/api/v1/stats" \
  -H "X-API-Key: ${FLUXION_API_KEY}"
```

Response headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
```

When rate limit is exceeded:
```json
{
  "detail": "Rate limit exceeded. Maximum 1000 requests per hour."
}
```

## Error Responses

### Missing API Key

```bash
curl "${FLUXION_URL}/api/v1/stats"
```

Response (401):
```json
{
  "detail": "Missing API key. Provide X-API-Key header."
}
```

### Invalid API Key

```bash
curl "${FLUXION_URL}/api/v1/stats" \
  -H "X-API-Key: invalid_key"
```

Response (401):
```json
{
  "detail": "Invalid or inactive API key"
}
```

### Insufficient Permissions

Using a user key to access admin endpoints:

```bash
curl "${FLUXION_URL}/api/v1/admin/api-keys" \
  -H "X-API-Key: ${USER_API_KEY}"
```

Response (401):
```json
{
  "detail": "Invalid or inactive API key"
}
```

## Best Practices

1. **Secure Storage**: Store API keys in environment variables or secret management systems, never in code
2. **Key Rotation**: Regularly rotate API keys and delete unused ones
3. **Separate Keys**: Use different API keys for different hosts/applications
4. **Monitor Usage**: Check the `last_used` timestamp to identify unused keys
5. **Least Privilege**: Use user-role keys for hosts reporting updates, admin keys only for management
6. **Rate Limit Awareness**: Monitor rate limit headers and implement backoff strategies if needed
