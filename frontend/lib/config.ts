/**
 * Runtime configuration utility
 * Fetches configuration from the server that can be changed at runtime
 */

interface RuntimeConfig {
  apiBaseUrl: string;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

let cachedConfig: RuntimeConfig | null = null;
let configPromise: Promise<RuntimeConfig> | null = null;

/**
 * Get runtime configuration
 * Priority: 1. window.__RUNTIME_CONFIG__ (injected at startup)
 *           2. /api/config endpoint
 *           3. Build-time env var
 * Caches the result to avoid repeated fetches
 */
export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Check if we're in browser and have window.__RUNTIME_CONFIG__
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) {
    cachedConfig = window.__RUNTIME_CONFIG__;
    return cachedConfig;
  }

  // Return existing promise if fetch is in progress
  if (configPromise) {
    return configPromise;
  }

  // Fetch config from server API endpoint
  configPromise = fetch('/api/config', {
    cache: 'no-store',
  })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch runtime config: ${res.status}`);
      }
      return res.json();
    })
    .then(config => {
      cachedConfig = config;
      configPromise = null;
      return config;
    })
    .catch(error => {
      console.warn('Failed to load runtime config from API, using fallback:', error);
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
