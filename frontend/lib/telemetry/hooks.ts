/**
 * Custom Hooks for User Action Tracking
 * 
 * These hooks provide easy integration of OpenTelemetry tracking
 * for common user actions in the application
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent, withSpan, trackError } from './instrumentation';

/**
 * Hook to track page navigation
 * Automatically tracks when the user navigates to different pages
 */
export function usePageTracking() {
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    // Skip first render
    if (previousPath.current === null) {
      previousPath.current = pathname;
      
      // Track initial page view
      trackEvent('page.view', {
        'page.path': pathname,
        'page.title': document.title,
        'page.referrer': document.referrer || 'direct',
      });
      
      return;
    }

    // Track navigation
    if (previousPath.current !== pathname) {
      trackEvent('page.navigation', {
        'page.from': previousPath.current,
        'page.to': pathname,
        'page.title': document.title,
      });

      previousPath.current = pathname;
    }
  }, [pathname]);
}

/**
 * Hook to track search actions
 * Returns a function to call when search is performed
 */
export function useSearchTracking() {
  return useCallback((searchQuery: string, resultCount?: number) => {
    trackEvent('user.search', {
      'search.query': searchQuery,
      'search.query_length': searchQuery.length,
      ...(resultCount !== undefined && { 'search.result_count': resultCount }),
    });
  }, []);
}

/**
 * Hook to track theme toggle actions
 */
export function useThemeTracking() {
  return useCallback((theme: string, previousTheme?: string) => {
    trackEvent('user.theme_toggle', {
      'theme.new': theme,
      ...(previousTheme && { 'theme.previous': previousTheme }),
    });
  }, []);
}

/**
 * Hook to track data refresh actions
 */
export function useRefreshTracking() {
  return useCallback((dataType: string, success: boolean = true) => {
    trackEvent('user.data_refresh', {
      'refresh.data_type': dataType,
      'refresh.success': success,
    });
  }, []);
}

/**
 * Hook to track button/link clicks
 */
export function useClickTracking() {
  return useCallback((elementName: string, elementType: string = 'button', metadata?: Record<string, string | number | boolean>) => {
    trackEvent('user.click', {
      'click.element_name': elementName,
      'click.element_type': elementType,
      ...(metadata || {}),
    });
  }, []);
}

/**
 * Hook to wrap API calls with tracing
 */
export function useApiTracing() {
  return useCallback(async <T,>(
    apiName: string,
    apiCall: () => Promise<T>,
    metadata?: Record<string, string | number | boolean>
  ): Promise<T> => {
    return withSpan(
      `api.${apiName}`,
      async (span) => {
        const startTime = performance.now();
        
        try {
          const result = await apiCall();
          const duration = performance.now() - startTime;
          
          span.setAttribute('api.name', apiName);
          span.setAttribute('api.duration_ms', duration);
          span.setAttribute('api.success', true);
          
          if (metadata) {
            Object.entries(metadata).forEach(([key, value]) => {
              span.setAttribute(`api.${key}`, value);
            });
          }
          
          return result;
        } catch (error) {
          const duration = performance.now() - startTime;
          span.setAttribute('api.name', apiName);
          span.setAttribute('api.duration_ms', duration);
          span.setAttribute('api.success', false);
          
          throw error;
        }
      }
    );
  }, []);
}

/**
 * Hook to track errors in components
 */
export function useErrorTracking() {
  return useCallback((error: Error, errorContext?: Record<string, string | number | boolean>) => {
    trackError(error, {
      'error.component': errorContext?.component as string || 'unknown',
      'error.page': window.location.pathname,
      ...errorContext,
    });
  }, []);
}

/**
 * Hook to track user session duration
 */
export function useSessionTracking() {
  useEffect(() => {
    const sessionStart = Date.now();
    
    // Track session start
    trackEvent('session.start', {
      'session.start_time': sessionStart,
      'session.page': window.location.pathname,
    });

    // Track session end on page unload
    const handleUnload = () => {
      const sessionDuration = Date.now() - sessionStart;
      
      trackEvent('session.end', {
        'session.duration_ms': sessionDuration,
        'session.duration_seconds': Math.round(sessionDuration / 1000),
        'session.page': window.location.pathname,
      });
    };

    window.addEventListener('beforeunload', handleUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);
}

/**
 * Hook to track form interactions
 */
export function useFormTracking() {
  const trackFormStart = useCallback((formName: string) => {
    trackEvent('form.start', {
      'form.name': formName,
    });
  }, []);

  const trackFormSubmit = useCallback((formName: string, success: boolean = true) => {
    trackEvent('form.submit', {
      'form.name': formName,
      'form.success': success,
    });
  }, []);

  const trackFormError = useCallback((formName: string, errorMessage: string) => {
    trackEvent('form.error', {
      'form.name': formName,
      'form.error': errorMessage,
    });
  }, []);

  return { trackFormStart, trackFormSubmit, trackFormError };
}
