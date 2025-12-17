import axios, { AxiosInstance, AxiosError } from 'axios';
import { getApiBaseUrl } from './config';

// API key should be stored server-side only, not exposed to client
// For server-side requests, use the FLUXION_API_KEY environment variable
const getApiKey = () => {
  // This will only work in server-side contexts (API routes, server components)
  return process.env.FLUXION_API_KEY;
};

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
}

export interface HostUpdate extends PackageUpdate {
  hostname: string;
  timestamp: string;
}

export interface Stats {
  total_hosts: number;
  total_updates: number;
  updates_last_24h: number;
  updates_last_7d: number;
  most_updated_packages: Array<{ package: string; count: number }>;
  most_active_hosts: Array<{ hostname: string; count: number }>;
}

export interface PackageHost {
  hostname: string;
  current_version: string;
  last_updated: string;
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
  private baseUrlPromise: Promise<string> | null = null;

  constructor(apiKey?: string) {
    // Create client with temporary base URL
    // Will be updated when first request is made
    this.client = axios.create({
      baseURL: 'http://localhost:8000', // temporary default
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
    });

    // Request interceptor to set base URL from runtime config
    this.client.interceptors.request.use(async (config) => {
      if (!this.baseUrlPromise) {
        this.baseUrlPromise = getApiBaseUrl();
      }
      const baseURL = await this.baseUrlPromise;
      config.baseURL = baseURL;
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          // Server responded with error status
          const data = error.response.data as { detail?: string } | undefined
          const message = data?.detail || error.message
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
    const response = await this.client.get<Stats>('/api/v1/stats');
    return response.data;
  }

  async getHosts(): Promise<{ items: Host[] }> {
    const response = await this.client.get<{ items: Host[] }>('/api/v1/hosts');
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
      `/api/v1/hosts/${encodeURIComponent(hostname)}/updates`,
      { params: options }
    );
    return response.data;
  }

  async getRecentUpdates(limit: number = 20, hours: number = 24): Promise<{ items: HostUpdate[] }> {
    const response = await this.client.get<{ items: HostUpdate[] }>(
      '/api/v1/updates/recent',
      { params: { limit, hours } }
    );
    return response.data;
  }

  async getPackageHosts(packageName: string): Promise<{ items: PackageHost[] }> {
    const response = await this.client.get<{ items: PackageHost[] }>(
      `/api/v1/packages/${encodeURIComponent(packageName)}/hosts`
    );
    return response.data;
  }
}

// Create a singleton instance with API key from environment
export const apiClient = new ApiClient(getApiKey());
