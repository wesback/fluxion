/**
 * OpenTelemetry Configuration
 * 
 * This module provides configuration for OpenTelemetry browser instrumentation.
 * It supports different configurations for development and production environments.
 */

export interface TelemetryConfig {
  /** OTLP collector endpoint URL */
  otlpEndpoint: string;
  /** Service name for the application */
  serviceName: string;
  /** Service version */
  serviceVersion: string;
  /** Environment (development, production) */
  environment: string;
  /** Sample rate for traces (0-1) */
  sampleRate: number;
  /** Enable console logging for debugging */
  debug: boolean;
}

/**
 * Get telemetry configuration based on environment
 */
export function getTelemetryConfig(): TelemetryConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    otlpEndpoint: process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT || 
                  'http://localhost:4318/v1/traces',
    serviceName: process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME || 'fluxion-frontend',
    serviceVersion: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    environment: process.env.NEXT_PUBLIC_ENV || process.env.NODE_ENV || 'development',
    sampleRate: isDevelopment ? 1.0 : parseFloat(process.env.NEXT_PUBLIC_OTEL_SAMPLE_RATE || '0.1'),
    debug: isDevelopment && (process.env.NEXT_PUBLIC_OTEL_DEBUG === 'true'),
  };
}
