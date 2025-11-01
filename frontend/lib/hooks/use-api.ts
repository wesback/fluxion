import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { instrumentedApiClient as apiClient, ApiError, Stats, Host, PackageUpdate, HostUpdate, PackageHost } from '../telemetry/api-client';
import { toast } from 'sonner';

// Query keys for cache management
export const queryKeys = {
  stats: ['stats'] as const,
  hosts: ['hosts'] as const,
  host: (hostname: string) => ['host', hostname] as const,
  hostUpdates: (hostname: string, options?: Record<string, unknown>) => ['host', hostname, 'updates', options] as const,
  recentUpdates: (hours: number) => ['updates', 'recent', hours] as const,
  packageHosts: (packageName: string) => ['package', packageName, 'hosts'] as const,
};

// Default query options with retry logic and error handling
const defaultQueryOptions = {
  retry: 3,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
};

// Error handler that shows toast notifications
const handleQueryError = (error: unknown, customMessage?: string) => {
  const message = error instanceof ApiError 
    ? error.message 
    : customMessage || 'An error occurred while fetching data';
  
  toast.error(message, {
    description: error instanceof ApiError && error.status === 401 
      ? 'Please check your API key configuration'
      : undefined,
  });
};

/**
 * Hook to fetch dashboard statistics
 * Auto-updates with stale-while-revalidate strategy
 */
export function useStats(options?: Omit<UseQueryOptions<Stats, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<Stats, Error>({
    queryKey: queryKeys.stats,
    queryFn: async () => {
      try {
        return await apiClient.getStats();
      } catch (error) {
        handleQueryError(error, 'Failed to fetch statistics');
        throw error;
      }
    },
    ...defaultQueryOptions,
    ...options,
  });
}

/**
 * Hook to fetch list of all hosts
 * Auto-updates with stale-while-revalidate strategy
 */
export function useHosts(options?: Omit<UseQueryOptions<{ items: Host[] }, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery<{ items: Host[] }, Error>({
    queryKey: queryKeys.hosts,
    queryFn: async () => {
      try {
        return await apiClient.getHosts();
      } catch (error) {
        handleQueryError(error, 'Failed to fetch hosts');
        throw error;
      }
    },
    ...defaultQueryOptions,
    ...options,
  });
}

/**
 * Hook to fetch update history for a specific host
 * @param hostname - The hostname to fetch updates for
 * @param options - Query options including limit, offset, date filters
 */
export function useHostDetail(
  hostname: string,
  queryOptions?: {
    limit?: number;
    offset?: number;
    from_date?: string;
    to_date?: string;
  },
  options?: Omit<UseQueryOptions<{ items: PackageUpdate[]; total: number; limit: number; offset: number }, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<{ items: PackageUpdate[]; total: number; limit: number; offset: number }, Error>({
    queryKey: queryKeys.hostUpdates(hostname, queryOptions),
    queryFn: async () => {
      try {
        return await apiClient.getHostUpdates(hostname, queryOptions);
      } catch (error) {
        handleQueryError(error, `Failed to fetch updates for ${hostname}`);
        throw error;
      }
    },
    ...defaultQueryOptions,
    enabled: !!hostname,
    ...options,
  });
}

/**
 * Hook to fetch recent updates across all hosts
 * Auto-refreshes every 30 seconds by default
 * @param hours - Number of hours to look back (default 24)
 * @param limit - Maximum number of results (default 20)
 */
export function useRecentUpdates(
  hours: number = 24,
  limit: number = 20,
  options?: Omit<UseQueryOptions<{ items: HostUpdate[] }, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<{ items: HostUpdate[] }, Error>({
    queryKey: queryKeys.recentUpdates(hours),
    queryFn: async () => {
      try {
        return await apiClient.getRecentUpdates(limit, hours);
      } catch (error) {
        handleQueryError(error, 'Failed to fetch recent updates');
        throw error;
      }
    },
    ...defaultQueryOptions,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    ...options,
  });
}

/**
 * Hook to search for hosts that have a specific package installed
 * @param packageName - Name of the package to search for
 */
export function usePackageSearch(
  packageName: string,
  options?: Omit<UseQueryOptions<{ items: PackageHost[] }, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery<{ items: PackageHost[] }, Error>({
    queryKey: queryKeys.packageHosts(packageName),
    queryFn: async () => {
      try {
        return await apiClient.getPackageHosts(packageName);
      } catch (error) {
        handleQueryError(error, `Failed to search for package: ${packageName}`);
        throw error;
      }
    },
    ...defaultQueryOptions,
    enabled: !!packageName && packageName.length > 0,
    ...options,
  });
}
