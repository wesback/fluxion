/**
 * OpenTelemetry Integration for Fluxion Frontend
 * 
 * This module provides comprehensive browser tracing and monitoring:
 * - Automatic fetch/XHR instrumentation
 * - Custom spans for user actions
 * - Web Vitals monitoring
 * - Error tracking
 * - Performance metrics
 * 
 * Usage:
 * 1. Initialize in your app layout/root component
 * 2. Use hooks in your components to track user actions
 * 3. Use withSpan for custom tracking
 * 
 * Configuration:
 * Set environment variables to configure the telemetry:
 * - NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT: OTLP collector endpoint
 * - NEXT_PUBLIC_OTEL_SERVICE_NAME: Service name (default: fluxion-frontend)
 * - NEXT_PUBLIC_OTEL_SAMPLE_RATE: Sample rate 0-1 (default: 0.1 in production, 1.0 in dev)
 * - NEXT_PUBLIC_OTEL_DEBUG: Enable debug logging (default: false)
 */

export { initializeTelemetry, withSpan, trackError, trackEvent, getSessionId } from './instrumentation';
export { initializeWebVitals, trackPerformanceMark, trackPageLoad } from './web-vitals';
export { getTelemetryConfig } from './config';
export type { TelemetryConfig } from './config';

// Export all hooks
export {
  usePageTracking,
  useSearchTracking,
  useThemeTracking,
  useRefreshTracking,
  useClickTracking,
  useApiTracing,
  useErrorTracking,
  useSessionTracking,
  useFormTracking,
} from './hooks';
