# Quick Start Guide for OpenTelemetry Testing

This guide shows you how to quickly set up and test the OpenTelemetry integration.

## Option 1: Using Jaeger (Easiest)

Jaeger is an all-in-one solution that includes an OTLP collector and a UI for viewing traces.

### 1. Start Jaeger

```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

### 2. Configure Environment

Create `.env.local` in the frontend directory:

```bash
# Copy from example
cp .env.example .env.local

# Edit and ensure this line is present:
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
NEXT_PUBLIC_OTEL_DEBUG=true
```

### 3. Start the Frontend

```bash
npm run dev
```

### 4. View Traces

1. Open the application at http://localhost:3000
2. Navigate around, click buttons, toggle theme, refresh data
3. Open Jaeger UI at http://localhost:16686
4. Select "fluxion-frontend" from the Service dropdown
5. Click "Find Traces" to see your traces

## Option 2: Using Grafana Tempo

Tempo is lightweight and integrates well with Grafana.

### 1. Create Tempo Configuration

Create `tempo.yaml`:

```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        http:
          endpoint: 0.0.0.0:4318

storage:
  trace:
    backend: local
    local:
      path: /tmp/tempo/traces

query_frontend:
  search:
    enabled: true
```

### 2. Start Tempo

```bash
docker run -d --name tempo \
  -v $(pwd)/tempo.yaml:/etc/tempo.yaml \
  -p 4318:4318 \
  -p 3200:3200 \
  grafana/tempo:latest \
  -config.file=/etc/tempo.yaml
```

### 3. Configure Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
NEXT_PUBLIC_OTEL_DEBUG=true
```

### 4. Query Traces

Use Grafana with Tempo as a data source or query directly:

```bash
# Search for traces
curl 'http://localhost:3200/api/search?tags=service.name=fluxion-frontend'
```

## Verifying the Integration

### Check Browser Console

With `NEXT_PUBLIC_OTEL_DEBUG=true`, you should see:

```
Initializing OpenTelemetry with config: {...}
OpenTelemetry initialized successfully
```

### Check Network Tab

In browser DevTools → Network, you should see periodic POST requests to:
- `http://localhost:4318/v1/traces`

### Expected Traces

After interacting with the app, you should see traces for:

1. **Automatic Traces**:
   - `fetch` - API calls with full timing
   - `XMLHttpRequest` - Any XHR requests
   - `page.view` - Initial page loads
   - `page.navigation` - Navigation between pages
   - `session.start` / `session.end` - Session tracking

2. **User Action Traces**:
   - `user.theme_toggle` - Theme changes
   - `user.data_refresh` - Data refresh clicks
   - `user.click` - Navigation link clicks

3. **API Call Traces**:
   - `api.call.getStats`
   - `api.call.getHosts`
   - `api.call.getRecentUpdates`
   - Each with duration, endpoint, and response attributes

4. **Web Vitals**:
   - `web_vital` - LCP, FCP, CLS, INP, TTFB metrics

5. **Errors** (if any occur):
   - `error` - With stack traces and context

### Example Span Attributes

For an API call span, you should see:
```json
{
  "api.endpoint": "/api/v1/stats",
  "api.method": "GET",
  "api.duration_ms": 234,
  "api.success": true,
  "api.response.total_hosts": 5,
  "session.id": "session_1234567890_abc123",
  "service.name": "fluxion-frontend",
  "service.version": "0.1.0"
}
```

## Troubleshooting

### No traces appearing

1. **Check the collector is running**:
   ```bash
   curl http://localhost:4318/v1/traces
   # Should return 405 Method Not Allowed (means it's listening)
   ```

2. **Check browser console** for errors

3. **Verify environment variables**:
   ```bash
   # In browser console:
   console.log(process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT)
   ```

4. **Check CORS**: The collector must allow CORS from localhost:3000

### Collector CORS Issues

If you see CORS errors, you may need to add CORS headers to your collector.

For Jaeger, it should work out of the box.

For custom collectors, add:
```yaml
receivers:
  otlp:
    protocols:
      http:
        cors:
          allowed_origins:
            - "http://localhost:3000"
            - "http://localhost:*"
```

### High Data Volume

If you're generating too many traces:

1. **Reduce sample rate**:
   ```bash
   NEXT_PUBLIC_OTEL_SAMPLE_RATE=0.1  # Only 10% of traces
   ```

2. **Disable auto-refresh**: The dashboard auto-refreshes every 30 seconds, generating API traces

## Next Steps

1. **Explore the Jaeger UI** to understand trace hierarchies
2. **Check span attributes** to see what context is captured
3. **Look for slow API calls** to identify performance bottlenecks
4. **Review Web Vitals** to understand user experience
5. **Configure alerts** based on error rates or performance thresholds

## Production Deployment

For production, you'll want to:

1. **Set up a proper OTLP collector** (OpenTelemetry Collector)
2. **Configure sample rate**: `NEXT_PUBLIC_OTEL_SAMPLE_RATE=0.1`
3. **Disable debug logging**: `NEXT_PUBLIC_OTEL_DEBUG=false`
4. **Use a dedicated observability platform** (Grafana, Datadog, Honeycomb, etc.)
5. **Set up proper CORS** on your collector
6. **Review privacy settings** to ensure no PII in traces

See OPENTELEMETRY.md for complete documentation.
