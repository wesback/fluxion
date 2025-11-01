/**
 * Web Vitals Monitoring
 * 
 * This module integrates Web Vitals metrics with OpenTelemetry
 * to track Core Web Vitals (CWV) performance metrics
 */

import { onCLS, onFCP, onLCP, onTTFB, onINP, Metric } from 'web-vitals';
import { trackEvent } from './instrumentation';

/**
 * Initialize Web Vitals monitoring
 * Tracks Core Web Vitals and reports them via OpenTelemetry
 */
export function initializeWebVitals(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Helper function to send metric to OpenTelemetry
  const sendToOTel = (metric: Metric) => {
    trackEvent('web_vital', {
      'metric.name': metric.name,
      'metric.value': metric.value,
      'metric.rating': metric.rating,
      'metric.delta': metric.delta,
      'metric.id': metric.id,
      'navigation.type': metric.navigationType,
    });
  };

  // Track Cumulative Layout Shift (CLS)
  // Measures visual stability
  onCLS(sendToOTel);

  // Track Interaction to Next Paint (INP)
  // Measures overall responsiveness (replaces FID)
  onINP(sendToOTel);

  // Track First Contentful Paint (FCP)
  // Measures when first content is painted
  onFCP(sendToOTel);

  // Track Largest Contentful Paint (LCP)
  // Measures loading performance
  onLCP(sendToOTel);

  // Track Time to First Byte (TTFB)
  // Measures server response time
  onTTFB(sendToOTel);
}

/**
 * Track custom performance marks
 * 
 * @param name - Name of the performance mark
 * @param detail - Optional additional details
 */
export function trackPerformanceMark(name: string, detail?: Record<string, string | number>): void {
  if (typeof window === 'undefined' || !window.performance) {
    return;
  }

  try {
    window.performance.mark(name, { detail });
    
    trackEvent('performance.mark', {
      'mark.name': name,
      ...(detail || {}),
    });
  } catch (error) {
    console.warn('Failed to track performance mark:', error);
  }
}

/**
 * Track page load time
 */
export function trackPageLoad(): void {
  if (typeof window === 'undefined' || !window.performance) {
    return;
  }

  // Wait for page to fully load
  if (document.readyState === 'complete') {
    measurePageLoad();
  } else {
    window.addEventListener('load', measurePageLoad);
  }
}

function measurePageLoad(): void {
  try {
    const perfData = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    if (perfData) {
      trackEvent('page.load', {
        'page.load.time': perfData.loadEventEnd - perfData.fetchStart,
        'page.dns.time': perfData.domainLookupEnd - perfData.domainLookupStart,
        'page.tcp.time': perfData.connectEnd - perfData.connectStart,
        'page.request.time': perfData.responseEnd - perfData.requestStart,
        'page.response.time': perfData.responseEnd - perfData.responseStart,
        'page.dom.processing': perfData.domComplete - perfData.domInteractive,
        'page.dom.interactive': perfData.domInteractive - perfData.fetchStart,
        'page.dom.complete': perfData.domComplete - perfData.fetchStart,
      });
    }
  } catch (error) {
    console.warn('Failed to track page load metrics:', error);
  }
}
