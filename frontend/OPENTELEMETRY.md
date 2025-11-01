# OpenTelemetry Frontend Integration

This document describes the OpenTelemetry integration for the Fluxion frontend application, providing comprehensive browser tracing and monitoring capabilities.

## Overview

The frontend is instrumented with OpenTelemetry to provide:

- **Browser Tracing**: Automatic tracking of user interactions and navigation
- **Fetch/XHR Instrumentation**: Automatic tracing of all API calls
- **Custom Spans**: Manual tracking of key user actions
- **Error Tracking**: Automatic error capture and reporting
- **Performance Metrics**: Web Vitals monitoring (LCP, FID, CLS, etc.)
- **Session Tracking**: User session duration and behavior

## Architecture

### Components

1. **Telemetry Provider** (`components/telemetry-provider.tsx`): Root-level component that initializes OpenTelemetry
2. **Instrumentation Module** (`lib/telemetry/instrumentation.ts`): Core tracing setup with automatic fetch/XHR instrumentation
3. **Instrumented API Client** (`lib/telemetry/api-client.ts`): Wrapped API client with automatic span creation
4. **Custom Hooks** (`lib/telemetry/hooks.ts`): React hooks for tracking user actions
5. **Web Vitals Module** (`lib/telemetry/web-vitals.ts`): Core Web Vitals monitoring

### Data Flow

```
User Action → React Component → Telemetry Hook → OpenTelemetry API → OTLP Exporter → Collector
```

## Configuration

### Environment Variables

Add these variables to your `.env.local` file:

```bash
# OTLP collector endpoint (required)
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Service name (optional, default: fluxion-frontend)
NEXT_PUBLIC_OTEL_SERVICE_NAME=fluxion-frontend

# Application version (optional, default: 0.1.0)
NEXT_PUBLIC_APP_VERSION=0.1.0

# Environment (optional, default: NODE_ENV value)
NEXT_PUBLIC_ENV=development

# Sample rate 0-1 (optional, default: 1.0 in dev, 0.1 in prod)
NEXT_PUBLIC_OTEL_SAMPLE_RATE=1.0

# Enable debug logging (optional, default: false)
NEXT_PUBLIC_OTEL_DEBUG=true
```

### Production Configuration

For production deployments, adjust the sample rate to reduce data volume:

```bash
NEXT_PUBLIC_ENV=production
NEXT_PUBLIC_OTEL_SAMPLE_RATE=0.1  # Sample 10% of traces
NEXT_PUBLIC_OTEL_DEBUG=false
```

## Usage

### Automatic Instrumentation

The following are automatically instrumented:

1. **Page Navigation**: All page transitions are tracked automatically
2. **Fetch Requests**: All `fetch()` calls are traced with timing and response status
3. **XHR Requests**: All XMLHttpRequest calls are traced
4. **Session Tracking**: Session start, duration, and end events
5. **Web Vitals**: Core Web Vitals (LCP, FID, CLS, FCP, TTFB, INP)

### Manual Tracking

#### Track User Actions

```typescript
import { useClickTracking } from '@/lib/telemetry';

function MyComponent() {
  const trackClick = useClickTracking();

  const handleButtonClick = () => {
    trackClick('submit_form', 'button', { 
      form_id: 'contact-form',
      page: '/contact'
    });
    // ... rest of your logic
  };

  return <button onClick={handleButtonClick}>Submit</button>;
}
```

#### Track Search Actions

```typescript
import { useSearchTracking } from '@/lib/telemetry';

function SearchComponent() {
  const trackSearch = useSearchTracking();

  const handleSearch = (query: string, results: any[]) => {
    trackSearch(query, results.length);
    // ... rest of your logic
  };

  return <input onChange={e => handleSearch(e.target.value, [])} />;
}
```

#### Track Theme Changes

Theme changes are automatically tracked in the `ThemeToggle` component.

#### Track Data Refresh

```typescript
import { useRefreshTracking } from '@/lib/telemetry';

function Dashboard() {
  const trackRefresh = useRefreshTracking();

  const handleRefresh = async () => {
    try {
      await fetchData();
      trackRefresh('dashboard', true);
    } catch (error) {
      trackRefresh('dashboard', false);
    }
  };

  return <button onClick={handleRefresh}>Refresh</button>;
}
```

#### Track Errors

```typescript
import { useErrorTracking } from '@/lib/telemetry';

function MyComponent() {
  const trackError = useErrorTracking();

  const handleAction = async () => {
    try {
      await riskyOperation();
    } catch (error) {
      trackError(error as Error, {
        component: 'MyComponent',
        action: 'riskyOperation',
      });
      throw error;
    }
  };
}
```

#### Custom Spans

For advanced use cases, create custom spans:

```typescript
import { withSpan } from '@/lib/telemetry';

async function complexOperation() {
  return withSpan(
    'custom.complex_operation',
    async (span) => {
      span.setAttribute('operation.type', 'data_processing');
      span.setAttribute('user.action', 'export');

      const result = await doWork();
      
      span.setAttribute('operation.result_count', result.length);
      
      return result;
    }
  );
}
```

## Viewing Traces

### Local Development with Jaeger

1. **Start Jaeger** (includes OTLP collector):

```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

2. **Configure endpoint** in `.env.local`:

```bash
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

3. **View traces** at http://localhost:16686

### Using Grafana Tempo

1. **Start Tempo with OTLP receiver**:

```yaml
# docker-compose.yml
version: '3'
services:
  tempo:
    image: grafana/tempo:latest
    command: [ "-config.file=/etc/tempo.yaml" ]
    volumes:
      - ./tempo.yaml:/etc/tempo.yaml
    ports:
      - "4318:4318"  # OTLP HTTP
      - "3200:3200"  # Tempo UI
```

2. **Tempo configuration** (`tempo.yaml`):

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

3. **View traces** using Grafana connected to Tempo

### Using OpenTelemetry Collector

For production deployments, use the OpenTelemetry Collector:

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024

exporters:
  otlp:
    endpoint: your-backend:4317
  logging:
    loglevel: debug

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp, logging]
```

Start the collector:

```bash
docker run -v $(pwd)/otel-collector-config.yaml:/etc/otel-collector-config.yaml \
  -p 4318:4318 \
  otel/opentelemetry-collector:latest \
  --config=/etc/otel-collector-config.yaml
```

## Metrics Tracked

### Performance Metrics

- **Page Load Time**: Total time from navigation to page load
- **API Call Duration**: Time taken for each API request
- **First Contentful Paint (FCP)**: Time to first content render
- **Largest Contentful Paint (LCP)**: Time to largest content element
- **Time to First Byte (TTFB)**: Server response time

### User Interaction Metrics

- **Navigation Events**: Page navigation tracking
- **Click Events**: Button and link clicks
- **Search Actions**: Search queries and results
- **Theme Toggles**: Theme preference changes
- **Data Refresh**: Manual data refresh actions

### Error Metrics

- **Error Count**: Number of errors by type
- **Error Rate**: Percentage of requests with errors
- **Component Errors**: Errors caught by error boundaries

### Session Metrics

- **Session Duration**: Total time user spent on site
- **Session ID**: Unique identifier for each session
- **User Agent**: Browser and device information

## Span Attributes

All spans include these common attributes:

- `session.id`: Unique session identifier
- `user_agent.original`: Browser user agent string
- `service.name`: Service name (fluxion-frontend)
- `service.version`: Application version
- `deployment.environment`: Environment (dev/staging/prod)

API call spans include:

- `api.endpoint`: API endpoint path
- `api.method`: HTTP method (GET, POST, etc.)
- `api.duration_ms`: Call duration in milliseconds
- `api.success`: Whether the call succeeded
- `api.response.count`: Number of items returned
- `http.response.status_code`: HTTP response status

## Privacy Considerations

The implementation follows these privacy guidelines:

1. **No PII in Traces**: Personal information is not included in span attributes
2. **Sanitized URLs**: Query parameters are not included in URL tracking
3. **Session IDs**: Generated client-side, not linked to user identity
4. **Error Messages**: Sanitized to remove sensitive information
5. **Search Queries**: Only query length is tracked, not content (can be configured)

To further restrict data collection, modify the hooks in `lib/telemetry/hooks.ts`.

## Performance Impact

The OpenTelemetry instrumentation has minimal performance impact:

- **Bundle Size**: ~150KB (gzipped: ~45KB)
- **Memory**: ~2-5MB for trace buffer
- **CPU**: <1% overhead
- **Network**: Batched exports every 1 second (configurable)

To minimize impact in production:

1. Use sampling (e.g., `NEXT_PUBLIC_OTEL_SAMPLE_RATE=0.1`)
2. Enable batching (default: 100 spans per batch)
3. Use the OTLP collector close to your application

## Troubleshooting

### Traces Not Appearing

1. Check OTLP endpoint is accessible:
   ```bash
   curl http://localhost:4318/v1/traces
   ```

2. Enable debug logging:
   ```bash
   NEXT_PUBLIC_OTEL_DEBUG=true
   ```

3. Check browser console for initialization errors

### High Data Volume

1. Reduce sample rate:
   ```bash
   NEXT_PUBLIC_OTEL_SAMPLE_RATE=0.1
   ```

2. Filter spans at the collector level

3. Adjust batch size in `instrumentation.ts`

### CORS Issues

If traces aren't being exported due to CORS:

1. Configure CORS on your collector
2. Use a collector sidecar on the same domain
3. Set appropriate headers in collector config

## Best Practices

1. **Meaningful Span Names**: Use descriptive, consistent naming
2. **Relevant Attributes**: Add context that aids debugging
3. **Error Context**: Include enough info to diagnose issues
4. **Sampling Strategy**: Balance observability with cost
5. **Privacy First**: Never log sensitive user data
6. **Performance**: Use batching and sampling in production

## Further Reading

- [OpenTelemetry JavaScript Documentation](https://opentelemetry.io/docs/instrumentation/js/)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [Web Vitals](https://web.dev/vitals/)
- [OTLP Protocol](https://opentelemetry.io/docs/specs/otlp/)
