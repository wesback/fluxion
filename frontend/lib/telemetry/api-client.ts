/**
 * Instrumented API Client
 * 
 * This module wraps the API client with OpenTelemetry tracing
 * to automatically track all API calls with detailed metrics
 */

import { apiClient as originalApiClient, ApiError, type Stats, type Host, type PackageUpdate, type HostUpdate, type PackageHost } from '../api';
import { withSpan } from '../telemetry';

/**
 * Instrumented API Client with automatic tracing
 * Wraps all API calls with OpenTelemetry spans
 */
class InstrumentedApiClient {
  async getStats(): Promise<Stats> {
    return withSpan(
      'api.call.getStats',
      async (span) => {
        span.setAttribute('api.endpoint', '/api/v1/stats');
        span.setAttribute('api.method', 'GET');
        
        const result = await originalApiClient.getStats();
        
        span.setAttribute('api.response.total_hosts', result.total_hosts);
        span.setAttribute('api.response.total_updates', result.total_updates);
        
        return result;
      }
    );
  }

  async getHosts(): Promise<{ items: Host[] }> {
    return withSpan(
      'api.call.getHosts',
      async (span) => {
        span.setAttribute('api.endpoint', '/api/v1/hosts');
        span.setAttribute('api.method', 'GET');
        
        const result = await originalApiClient.getHosts();
        
        span.setAttribute('api.response.count', result.items.length);
        
        return result;
      }
    );
  }

  async getHostUpdates(
    hostname: string,
    options?: {
      limit?: number;
      offset?: number;
      from_date?: string;
      to_date?: string;
    }
  ): Promise<{ items: PackageUpdate[]; total: number; limit: number; offset: number }> {
    return withSpan(
      'api.call.getHostUpdates',
      async (span) => {
        span.setAttribute('api.endpoint', `/api/v1/hosts/${hostname}/updates`);
        span.setAttribute('api.method', 'GET');
        span.setAttribute('api.param.hostname', hostname);
        
        if (options?.limit) span.setAttribute('api.param.limit', options.limit);
        if (options?.offset) span.setAttribute('api.param.offset', options.offset);
        if (options?.from_date) span.setAttribute('api.param.from_date', options.from_date);
        if (options?.to_date) span.setAttribute('api.param.to_date', options.to_date);
        
        const result = await originalApiClient.getHostUpdates(hostname, options);
        
        span.setAttribute('api.response.count', result.items.length);
        span.setAttribute('api.response.total', result.total);
        
        return result;
      }
    );
  }

  async getRecentUpdates(limit: number = 20, hours: number = 24): Promise<{ items: HostUpdate[] }> {
    return withSpan(
      'api.call.getRecentUpdates',
      async (span) => {
        span.setAttribute('api.endpoint', '/api/v1/updates/recent');
        span.setAttribute('api.method', 'GET');
        span.setAttribute('api.param.limit', limit);
        span.setAttribute('api.param.hours', hours);
        
        const result = await originalApiClient.getRecentUpdates(limit, hours);
        
        span.setAttribute('api.response.count', result.items.length);
        
        return result;
      }
    );
  }

  async getPackageHosts(packageName: string): Promise<{ items: PackageHost[] }> {
    return withSpan(
      'api.call.getPackageHosts',
      async (span) => {
        span.setAttribute('api.endpoint', `/api/v1/packages/${packageName}/hosts`);
        span.setAttribute('api.method', 'GET');
        span.setAttribute('api.param.package_name', packageName);
        
        const result = await originalApiClient.getPackageHosts(packageName);
        
        span.setAttribute('api.response.count', result.items.length);
        
        return result;
      }
    );
  }
}

// Create and export instrumented client instance
export const instrumentedApiClient = new InstrumentedApiClient();

// Re-export types and error class
export { ApiError };
export type { Stats, Host, PackageUpdate, HostUpdate, PackageHost };
