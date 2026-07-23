import axios, { AxiosInstance, AxiosError } from 'axios';

export interface Host {
  hostname: string;
  os_info: string;
  last_seen: string;
  total_updates: number;
}

export interface PackageUpdate {
  package_name: string;
  old_version: string | null;
  new_version: string;
  update_timestamp: string;
  is_security: boolean;
}

export interface HostUpdate extends PackageUpdate {
  hostname: string;
  timestamp: string;
}

export interface SecurityFeedItem {
  hostname: string;
  package_name: string;
  old_version: string | null;
  new_version: string;
  update_timestamp: string;
  is_security: boolean;
}

export interface SecurityFeedResponse {
  items: SecurityFeedItem[];
  total: number;
  limit: number;
  offset: number;
  security_updates_last_24h: number;
  security_updates_last_7d: number;
  top_packages: Array<{ package: string; count: number }>;
  top_hosts: Array<{ hostname: string; count: number }>;
}

export interface Stats {
  total_hosts: number;
  total_updates: number;
  updates_last_24h: number;
  updates_last_7d: number;
  most_updated_packages: Array<{ package: string; count: number }>;
  most_active_hosts: Array<{ hostname: string; count: number }>;
  security_updates_last_24h?: number;
  security_updates_last_7d?: number;
  top_security_packages?: Array<{ package: string; count: number }>;
  top_security_hosts?: Array<{ hostname: string; count: number }>;
}

export interface PackageHost {
  hostname: string;
  package_name: string;
  current_version: string;
  last_updated: string;
  is_security?: boolean;
}

export interface KernelFleetItem {
  hostname: string;
  os_info: string;
  kernel_package: string | null;
  kernel_version: string | null;
  last_updated: string | null;
  update_age_seconds: number | null;
  is_security: boolean;
}

export interface KernelFleetResponse {
  items: KernelFleetItem[];
  total_hosts: number;
}

export interface ActivityPoint {
  bucket: string;
  updates: number;
  installs: number;
  upgrades: number;
  security_updates: number;
  kernel_updates: number;
}

export interface ActivityResponse {
  bucket: "hour" | "day" | "week";
  from_date: string;
  to_date: string;
  items: ActivityPoint[];
}

export interface IngestDiagnosticsResponse {
  from_date: string;
  to_date: string;
  requests: number;
  packages_received: number;
  packages_accepted: number;
  packages_rejected: number;
  by_package_manager: Record<string, number>;
  by_outcome: Record<string, number>;
}

export interface WebhookCoverageItem {
  event_type: string;
  configured: number;
  attempted: number;
  delivered: number;
  failed: number;
}

export interface WebhookCoverageResponse {
  from_date: string;
  to_date: string;
  items: WebhookCoverageItem[];
}

// Admin types
export interface APIKeyMetadata {
  id: number;
  name: string;
  role: string;
  created_at: string;
  last_used: string | null;
  is_active: boolean;
}

export interface CreateAPIKeyRequest {
  name: string;
  role?: string;
}

export interface CreateAPIKeyResponse {
  id: number;
  name: string;
  role: string;
  api_key: string;
  message: string;
}

export interface ListAPIKeysResponse {
  items: APIKeyMetadata[];
  total: number;
}

export interface WebhookConfig {
  id: number;
  name: string;
  url: string;
  enabled: boolean;
  event_types: string[];
  headers_json: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookConfigCreate {
  name: string;
  url: string;
  enabled?: boolean;
  event_types: string[];
  headers_json?: Record<string, string> | null;
}

export interface WebhookConfigUpdate {
  name?: string;
  url?: string;
  enabled?: boolean;
  event_types?: string[];
  headers_json?: Record<string, string> | null;
}

export interface ListWebhooksResponse {
  webhooks: WebhookConfig[];
  total: number;
}

export interface WebhookTestResponse {
  success: boolean;
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  delivery_time_ms: number;
}

export interface WebhookDeliveryHistory {
  id: number;
  webhook_config_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  attempt_number: number;
  delivered_at: string;
  created_at: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    // Use Next.js API routes for all requests
    // These routes handle authentication server-side
    this.client = axios.create({
      baseURL: '', // Use relative URLs for Next.js API routes
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          // Server responded with error status
          const data = error.response.data as { detail?: string; error?: string } | undefined
          const message = data?.detail || data?.error || error.message
          throw new ApiError(
            message,
            error.response.status,
            error.response.data
          );
        } else if (error.request) {
          // Request made but no response received
          throw new ApiError('No response from server. Please check your connection.');
        } else {
          // Something else happened
          throw new ApiError(error.message);
        }
      }
    );
  }

  async getStats(): Promise<Stats> {
    const response = await this.client.get<Stats>('/api/stats');
    return response.data;
  }

  async getHosts(): Promise<{ items: Host[] }> {
    const response = await this.client.get<{ items: Host[] }>('/api/hosts');
    return response.data;
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
    const response = await this.client.get(
      `/api/hosts/${encodeURIComponent(hostname)}/updates`,
      { params: options }
    );
    return response.data;
  }

  async getRecentUpdates(limit: number = 20, hours: number = 24): Promise<{ items: HostUpdate[] }> {
    const response = await this.client.get<{ items: HostUpdate[] }>(
      '/api/updates/recent',
      { params: { limit, hours } }
    );
    return response.data;
  }

  async getSecurityFeed(options?: {
    limit?: number;
    offset?: number;
    hostname?: string;
    package_name?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<SecurityFeedResponse> {
    const response = await this.client.get<SecurityFeedResponse>('/api/security', {
      params: options,
    });
    return response.data;
  }

  async getPackageHosts(packageName: string): Promise<{ items: PackageHost[] }> {
    const response = await this.client.get<{ items: PackageHost[] }>(
      `/api/packages/${encodeURIComponent(packageName)}/hosts`
    );
    return response.data;
  }

  async getKernels(): Promise<KernelFleetResponse> {
    const response = await this.client.get<KernelFleetResponse>('/api/kernels');
    return response.data;
  }

  async getActivity(options?: {
    hostname?: string;
    package_name?: string;
    from_date?: string;
    to_date?: string;
    is_security?: boolean;
    is_install?: boolean;
    is_kernel?: boolean;
    bucket?: 'hour' | 'day' | 'week';
  }): Promise<ActivityResponse> {
    const response = await this.client.get<ActivityResponse>('/api/activity', { params: options });
    return response.data;
  }

  async getIngestDiagnostics(): Promise<IngestDiagnosticsResponse> {
    const response = await this.client.get<IngestDiagnosticsResponse>('/api/admin/ingest-diagnostics');
    return response.data;
  }

  async getWebhookCoverage(): Promise<WebhookCoverageResponse> {
    const response = await this.client.get<WebhookCoverageResponse>('/api/admin/webhook-coverage');
    return response.data;
  }

  // Admin: API Keys
  async getAPIKeys(): Promise<ListAPIKeysResponse> {
    const response = await this.client.get<ListAPIKeysResponse>('/api/admin/api-keys');
    return response.data;
  }

  async createAPIKey(data: CreateAPIKeyRequest): Promise<CreateAPIKeyResponse> {
    const response = await this.client.post<CreateAPIKeyResponse>('/api/admin/api-keys', data);
    return response.data;
  }

  async deleteAPIKey(keyId: number): Promise<{ message: string }> {
    const response = await this.client.delete<{ message: string }>(`/api/admin/api-keys/${keyId}`);
    return response.data;
  }

  // Admin: Webhooks
  async getWebhooks(): Promise<ListWebhooksResponse> {
    const response = await this.client.get<ListWebhooksResponse>('/api/admin/webhooks');
    return response.data;
  }

  async createWebhook(data: WebhookConfigCreate): Promise<WebhookConfig> {
    const response = await this.client.post<WebhookConfig>('/api/admin/webhooks', data);
    return response.data;
  }

  async getWebhook(webhookId: number): Promise<WebhookConfig> {
    const response = await this.client.get<WebhookConfig>(`/api/admin/webhooks/${webhookId}`);
    return response.data;
  }

  async updateWebhook(webhookId: number, data: WebhookConfigUpdate): Promise<WebhookConfig> {
    const response = await this.client.patch<WebhookConfig>(`/api/admin/webhooks/${webhookId}`, data);
    return response.data;
  }

  async deleteWebhook(webhookId: number): Promise<{ message: string }> {
    const response = await this.client.delete<{ message: string }>(`/api/admin/webhooks/${webhookId}`);
    return response.data;
  }

  async testWebhook(webhookId: number, testPayload?: Record<string, unknown>): Promise<WebhookTestResponse> {
    const response = await this.client.post<WebhookTestResponse>(
      `/api/admin/webhooks/${webhookId}/test`,
      { test_payload: testPayload || null }
    );
    return response.data;
  }

  async getWebhookHistory(webhookId: number, limit: number = 50): Promise<WebhookDeliveryHistory[]> {
    const response = await this.client.get<WebhookDeliveryHistory[]>(
      `/api/admin/webhooks/${webhookId}/history`,
      { params: { limit } }
    );
    return response.data;
  }
}

// Create a singleton instance
// No API key needed - Next.js API routes handle authentication server-side
export const apiClient = new ApiClient();
