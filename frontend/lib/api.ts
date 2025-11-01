const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

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

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${url}`, error);
      throw error;
    }
  }

  async getStats(): Promise<Stats> {
    return this.request<Stats>('/api/v1/stats');
  }

  async getHosts(): Promise<{ items: Host[] }> {
    return this.request<{ items: Host[] }>('/api/v1/hosts');
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
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.from_date) params.append('from_date', options.from_date);
    if (options?.to_date) params.append('to_date', options.to_date);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/v1/hosts/${encodeURIComponent(hostname)}/updates${query}`);
  }

  async getRecentUpdates(limit: number = 20, hours: number = 24): Promise<{ items: HostUpdate[] }> {
    return this.request<{ items: HostUpdate[] }>(
      `/api/v1/updates/recent?limit=${limit}&hours=${hours}`
    );
  }

  async getPackageHosts(packageName: string): Promise<{ items: PackageHost[] }> {
    return this.request<{ items: PackageHost[] }>(
      `/api/v1/packages/${encodeURIComponent(packageName)}/hosts`
    );
  }
}

export const apiClient = new ApiClient();
