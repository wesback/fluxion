/**
 * OpenTelemetry Browser Instrumentation
 * 
 * This module initializes OpenTelemetry for browser tracing, including:
 * - Automatic fetch/XHR instrumentation
 * - Custom span creation for user actions
 * - Web Vitals monitoring
 * - Error tracking
 */

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { 
  ATTR_SERVICE_NAME, 
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT 
} from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { trace, Span, SpanStatusCode } from '@opentelemetry/api';
import { getTelemetryConfig } from './config';

let isInitialized = false;
let sessionId: string;

/**
 * Generate a unique session ID for the user session
 * Uses cryptographically secure random values
 */
function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // Use crypto.randomUUID if available (modern browsers)
    return `session_${Date.now()}_${crypto.randomUUID()}`;
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Fallback to crypto.getRandomValues
    const array = new Uint32Array(2);
    crypto.getRandomValues(array);
    return `session_${Date.now()}_${array[0].toString(36)}${array[1].toString(36)}`;
  } else {
    // Fallback for environments without crypto (shouldn't happen in browsers)
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Get user agent information
 */
function getUserAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
}

/**
 * Initialize OpenTelemetry browser tracing
 * Should be called once when the application starts
 */
export function initializeTelemetry(): void {
  // Prevent double initialization
  if (isInitialized) {
    console.warn('OpenTelemetry already initialized');
    return;
  }

  // Only run on client side
  if (typeof window === 'undefined') {
    return;
  }

  const config = getTelemetryConfig();

  // Generate session ID
  sessionId = generateSessionId();

  if (config.debug) {
    console.log('Initializing OpenTelemetry with config:', config);
  }

  try {
    // Create resource with service information
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment,
      'session.id': sessionId,
      'user_agent.original': getUserAgent(),
    });

    // Create and configure OTLP exporter
    const exporter = new OTLPTraceExporter({
      url: config.otlpEndpoint,
      headers: {},
    });

    // Create trace provider with batch processor for better performance
    const provider = new WebTracerProvider({
      resource,
      sampler: {
        shouldSample: () => ({
          decision: Math.random() < config.sampleRate ? 1 : 0, // SamplingDecision.RECORD_AND_SAMPLED : NOT_RECORD
        }),
        toString: () => `CustomSampler{${config.sampleRate}}`,
      },
      spanProcessors: [
        new BatchSpanProcessor(exporter, {
          maxQueueSize: 100,
          scheduledDelayMillis: 1000,
        })
      ],
    });

    // Register the provider
    provider.register({
      contextManager: new ZoneContextManager(),
    });

    // Register automatic instrumentations
    registerInstrumentations({
      instrumentations: [
        new FetchInstrumentation({
          propagateTraceHeaderCorsUrls: [
            new RegExp(`^${config.otlpEndpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
            /^\/api\//,  // Relative API calls
          ],
          clearTimingResources: true,
          applyCustomAttributesOnSpan: (span, request, response) => {
            // Add custom attributes to fetch spans
            if (request instanceof Request) {
              span.setAttribute('http.request.url', request.url);
            }
            if (response instanceof Response) {
              span.setAttribute('http.response.status_code', response.status);
            }
          },
        }),
        new XMLHttpRequestInstrumentation({
          propagateTraceHeaderCorsUrls: [
            new RegExp(`^${config.otlpEndpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
            /^\/api\//,  // Relative API calls
          ],
          clearTimingResources: true,
        }),
      ],
    });

    isInitialized = true;

    if (config.debug) {
      console.log('OpenTelemetry initialized successfully');
    }
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry:', error);
  }
}

/**
 * Get the current tracer instance
 */
export function getTracer() {
  return trace.getTracer('fluxion-frontend', '0.1.0');
}

/**
 * Get the current session ID
 */
export function getSessionId(): string {
  return sessionId;
}

/**
 * Create a custom span for tracking user actions
 * 
 * @param name - Name of the span
 * @param fn - Function to execute within the span
 * @param attributes - Optional attributes to add to the span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  
  return tracer.startActiveSpan(name, async (span) => {
    try {
      // Add custom attributes if provided
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });
      }

      // Add session ID to all spans
      span.setAttribute('session.id', sessionId);

      // Execute the function
      const result = await fn(span);
      
      // Mark span as successful
      span.setStatus({ code: SpanStatusCode.OK });
      
      return result;
    } catch (error) {
      // Record error in span
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      
      if (error instanceof Error) {
        span.recordException(error);
      }
      
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Track an error in OpenTelemetry
 * 
 * @param error - Error to track
 * @param context - Additional context about the error
 */
export function trackError(error: Error, errorContext?: Record<string, string | number | boolean>): void {
  const tracer = getTracer();
  const span = tracer.startSpan('error');
  
  span.setAttribute('error.type', error.name);
  span.setAttribute('error.message', error.message);
  span.setAttribute('session.id', sessionId);
  
  if (error.stack) {
    span.setAttribute('error.stack', error.stack);
  }
  
  if (errorContext) {
    Object.entries(errorContext).forEach(([key, value]) => {
      span.setAttribute(`error.context.${key}`, value);
    });
  }
  
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.end();
}

/**
 * Track a custom event
 * 
 * @param name - Name of the event
 * @param attributes - Event attributes
 */
export function trackEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const tracer = getTracer();
  const span = tracer.startSpan(name);
  
  span.setAttribute('event.name', name);
  span.setAttribute('session.id', sessionId);
  
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
  
  span.end();
}
