/**
 * Instrumented API Client
 * 
 * This module wraps the API client with OpenTelemetry tracing
 * to automatically track all API calls with detailed metrics
 */

import { apiClient as originalApiClient, ApiError, type Stats, type Host, type PackageUpdate, type HostUpdate, type PackageHost, type ListAPIKeysResponse, type CreateAPIKeyRequest, type CreateAPIKeyResponse, type ListWebhooksResponse, type WebhookConfig, type WebhookConfigCreate, type WebhookConfigUpdate, type WebhookTestResponse, type WebhookDeliveryHistory } from '../api';
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

  // Admin: API Keys
  async getAPIKeys(): Promise<ListAPIKeysResponse> {
    return withSpan('api.call.getAPIKeys', async (span) => {
      span.setAttribute('api.endpoint', '/api/admin/api-keys');
      span.setAttribute('api.method', 'GET');
      const result = await originalApiClient.getAPIKeys();
      span.setAttribute('api.response.count', result.items.length);
      return result;
    });
  }

  async createAPIKey(data: CreateAPIKeyRequest): Promise<CreateAPIKeyResponse> {
    return withSpan('api.call.createAPIKey', async (span) => {
      span.setAttribute('api.endpoint', '/api/admin/api-keys');
      span.setAttribute('api.method', 'POST');
      span.setAttribute('api.param.name', data.name);
      return await originalApiClient.createAPIKey(data);
    });
  }

  async deleteAPIKey(keyId: number): Promise<{ message: string }> {
    return withSpan('api.call.deleteAPIKey', async (span) => {
      span.setAttribute('api.endpoint', `/api/admin/api-keys/${keyId}`);
      span.setAttribute('api.method', 'DELETE');
      return await originalApiClient.deleteAPIKey(keyId);
    });
  }

  // Admin: Webhooks
  async getWebhooks(): Promise<ListWebhooksResponse> {
    return withSpan('api.call.getWebhooks', async (span) => {
      span.setAttribute('api.endpoint', '/api/admin/webhooks');
      span.setAttribute('api.method', 'GET');
      const result = await originalApiClient.getWebhooks();
      span.setAttribute('api.response.count', result.webhooks.length);
      return result;
    });
  }

  async createWebhook(data: WebhookConfigCreate): Promise<WebhookConfig> {
    return withSpan('api.call.createWebhook', async (span) => {
      span.setAttribute('api.endpoint', '/api/admin/webhooks');
      span.setAttribute('api.method', 'POST');
      span.setAttribute('api.param.name', data.name);
      return await originalApiClient.createWebhook(data);
    });
  }

  async updateWebhook(webhookId: number, data: WebhookConfigUpdate): Promise<WebhookConfig> {
    return withSpan('api.call.updateWebhook', async (span) => {
      span.setAttribute('api.endpoint', `/api/admin/webhooks/${webhookId}`);
      span.setAttribute('api.method', 'PATCH');
      return await originalApiClient.updateWebhook(webhookId, data);
    });
  }

  async deleteWebhook(webhookId: number): Promise<{ message: string }> {
    return withSpan('api.call.deleteWebhook', async (span) => {
      span.setAttribute('api.endpoint', `/api/admin/webhooks/${webhookId}`);
      span.setAttribute('api.method', 'DELETE');
      return await originalApiClient.deleteWebhook(webhookId);
    });
  }

  async testWebhook(webhookId: number, testPayload?: Record<string, unknown>): Promise<WebhookTestResponse> {
    return withSpan('api.call.testWebhook', async (span) => {
      span.setAttribute('api.endpoint', `/api/admin/webhooks/${webhookId}/test`);
      span.setAttribute('api.method', 'POST');
      return await originalApiClient.testWebhook(webhookId, testPayload);
    });
  }

  async getWebhookHistory(webhookId: number, limit: number = 50): Promise<WebhookDeliveryHistory[]> {
    return withSpan('api.call.getWebhookHistory', async (span) => {
      span.setAttribute('api.endpoint', `/api/admin/webhooks/${webhookId}/history`);
      span.setAttribute('api.method', 'GET');
      const result = await originalApiClient.getWebhookHistory(webhookId, limit);
      span.setAttribute('api.response.count', result.length);
      return result;
    });
  }
}

// Create and export instrumented client instance
export const instrumentedApiClient = new InstrumentedApiClient();

// Re-export types and error class
export { ApiError };
export type { Stats, Host, PackageUpdate, HostUpdate, PackageHost, ListAPIKeysResponse, CreateAPIKeyRequest, CreateAPIKeyResponse, ListWebhooksResponse, WebhookConfig, WebhookConfigCreate, WebhookConfigUpdate, WebhookTestResponse, WebhookDeliveryHistory };
