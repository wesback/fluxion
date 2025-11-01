/**
 * Telemetry Provider Component
 * 
 * This component initializes OpenTelemetry and Web Vitals monitoring
 * for the application. It should be rendered at the root level.
 */

'use client';

import { useEffect } from 'react';
import { initializeTelemetry, initializeWebVitals, trackPageLoad, usePageTracking, useSessionTracking } from '@/lib/telemetry';

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  // Initialize telemetry once on mount
  useEffect(() => {
    // Initialize OpenTelemetry
    initializeTelemetry();
    
    // Initialize Web Vitals monitoring
    initializeWebVitals();
    
    // Track initial page load
    trackPageLoad();
  }, []);

  // Track page navigation automatically
  usePageTracking();
  
  // Track session duration
  useSessionTracking();

  return <>{children}</>;
}
