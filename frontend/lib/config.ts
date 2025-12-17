/**
 * Runtime configuration utility
 * Fetches configuration from the server that can be changed at runtime
 */

interface RuntimeConfig {
  apiBaseUrl: string;
}

let cachedConfig: RuntimeConfig | null = null;
let configPromise: Promise<RuntimeConfig> | null = null;

/**
 * Get runtime configuration from the server
 * Caches the result to avoid repeated fetches
 */
export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Return existing promise if fetch is in progress
  if (configPromise) {
    return configPromise;
  }

  // Fetch config from server
  configPromise = fetch('/api/config')
    .then(res => {
      if (!res.ok) {
        throw new Error('Failed to fetch runtime config');
      }
      return res.json();
    })
    .then(config => {
      cachedConfig = config;
      configPromise = null;
      return config;
    })
    .catch(error => {
      console.error('Failed to load runtime config, using defaults:', error);
      configPromise = null;
      // Fall back to build-time env var or default
      const fallbackConfig = {
        apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000',
      };
      cachedConfig = fallbackConfig;
      return fallbackConfig;
    });

  return configPromise;
}

/**
 * Get the API base URL from runtime configuration
 */
export async function getApiBaseUrl(): Promise<string> {
  const config = await getRuntimeConfig();
  return config.apiBaseUrl;
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  configPromise = null;
}
