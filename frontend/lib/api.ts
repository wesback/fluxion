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

  async getPackageHosts(packageName: string): Promise<{ items: PackageHost[] }> {
    const response = await this.client.get<{ items: PackageHost[] }>(
      `/api/packages/${encodeURIComponent(packageName)}/hosts`
    );
    return response.data;
  }
}

// Create a singleton instance
// No API key needed - Next.js API routes handle authentication server-side
export const apiClient = new ApiClient();
