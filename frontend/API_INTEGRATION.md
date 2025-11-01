# Frontend API Integration

This document describes the API integration implementation for the Fluxion frontend.

## Overview

The frontend integrates with the FastAPI backend using:
- **Axios** for HTTP requests
- **TanStack Query** (React Query) for data fetching, caching, and state management
- **Sonner** for toast notifications
- Server-side API key authentication

## Security

### API Key Storage

**IMPORTANT**: The API key is stored **server-side only** and is never exposed to the client browser.

- The API key is configured via the `FLUXION_API_KEY` environment variable
- It is only accessible in server-side contexts (API routes, server components)
- It is automatically included in the `X-API-Key` header for all API requests

### Configuration

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Set your API key:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
FLUXION_API_KEY=your_actual_api_key_here
```

**Note**: Never commit `.env.local` to version control. The `.gitignore` already excludes it.

## API Client

The API client is located in `lib/api.ts` and provides:

- Automatic authentication with API key
- Error handling with typed errors
- Request/response interceptors
- 30-second timeout for all requests
- TypeScript interfaces for all API responses

### Usage Example

```typescript
import { apiClient } from '@/lib/api';

// The API client automatically includes authentication
const stats = await apiClient.getStats();
const hosts = await apiClient.getHosts();
```

## TanStack Query Hooks

All API operations are exposed as React hooks in `lib/hooks/use-api.ts`:

### Available Hooks

#### `useStats()`
Fetches dashboard statistics including host count, update counts, and top packages/hosts.

```typescript
const { data, isLoading, error, refetch } = useStats();
```

**Features:**
- Stale time: 5 minutes
- Retry: 3 attempts with exponential backoff
- Auto error notifications via toast

#### `useHosts()`
Fetches list of all registered hosts.

```typescript
const { data, isLoading, error, refetch } = useHosts();
```

**Features:**
- Stale time: 5 minutes
- Retry: 3 attempts with exponential backoff
- Auto error notifications via toast

#### `useHostDetail(hostname, queryOptions, options)`
Fetches update history for a specific host.

```typescript
const { data, isLoading, error, refetch } = useHostDetail(
  'server-01',
  { limit: 50, offset: 0 }
);
```

**Parameters:**
- `hostname`: The hostname to fetch updates for
- `queryOptions`: Optional filters (limit, offset, from_date, to_date)
- `options`: Additional React Query options

**Features:**
- Only runs when hostname is provided
- Supports pagination and date filtering
- Stale time: 5 minutes

#### `useRecentUpdates(hours, limit, options)`
Fetches recent updates across all hosts with auto-refresh.

```typescript
const { data, isLoading, error, refetch } = useRecentUpdates(24, 20);
```

**Parameters:**
- `hours`: Number of hours to look back (default: 24)
- `limit`: Maximum number of results (default: 20)
- `options`: Additional React Query options

**Features:**
- **Auto-refresh every 30 seconds** (configurable)
- Stale time: 5 minutes
- Retry: 3 attempts with exponential backoff

#### `usePackageSearch(packageName, options)`
Searches for hosts that have a specific package installed.

```typescript
const { data, isLoading, error, refetch } = usePackageSearch('nginx');
```

**Parameters:**
- `packageName`: Name of the package to search for
- `options`: Additional React Query options

**Features:**
- Only runs when packageName is provided and non-empty
- Stale time: 5 minutes
- Retry: 3 attempts with exponential backoff

## Error Handling

### Error Boundary

Wrap pages/components with `ErrorBoundary` to catch and display errors gracefully:

```typescript
import { ErrorBoundary } from '@/components/error-boundary';

export default function MyPage() {
  return (
    <ErrorBoundary>
      <MyComponent />
    </ErrorBoundary>
  );
}
```

### Toast Notifications

Errors are automatically displayed as toast notifications using Sonner:

- API errors show the error message from the backend
- 401 errors include a hint about checking API key configuration
- Network errors show a user-friendly message

### Manual Error Handling

You can also handle errors manually:

```typescript
const { data, error } = useHosts();

if (error) {
  return <div>Failed to load hosts: {error.message}</div>;
}
```

## Loading States

### Loading Skeletons

Pre-built skeleton components are available in `components/ui/skeleton.tsx`:

```typescript
import { StatsCardSkeleton, TableSkeleton, ChartSkeleton } from '@/components/ui/skeleton';

if (isLoading) {
  return <StatsCardSkeleton />;
}
```

### Loading Indicators

All hooks provide `isLoading` state:

```typescript
const { data, isLoading } = useHosts();

if (isLoading) {
  return <LoadingSpinner />;
}
```

## Data Refresh

### Manual Refresh

All hooks provide a `refetch` function:

```typescript
const { data, refetch } = useStats();

const handleRefresh = async () => {
  await refetch();
};
```

### Toast on Refresh

Use `toast.promise` for better UX:

```typescript
import { toast } from 'sonner';

const handleRefresh = () => {
  toast.promise(refetch(), {
    loading: 'Refreshing data...',
    success: 'Data refreshed successfully',
    error: 'Failed to refresh data',
  });
};
```

### Auto Refresh

The `useRecentUpdates` hook automatically refreshes every 30 seconds. You can configure this:

```typescript
const { data } = useRecentUpdates(24, 20, {
  refetchInterval: 60000, // 1 minute
});
```

## Query Configuration

### Default Options

All queries use these default options:

```typescript
{
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
}
```

### Custom Options

Override defaults per query:

```typescript
const { data } = useStats({
  staleTime: 0, // Always fetch fresh data
  refetchInterval: 10000, // Refresh every 10 seconds
});
```

## TypeScript Types

All API responses are fully typed. Import types from `lib/api.ts`:

```typescript
import type { Host, PackageUpdate, Stats, HostUpdate, PackageHost } from '@/lib/api';
```

## Development Tools

### React Query DevTools

In development mode, the React Query DevTools are available at the bottom of the screen (toggle with the flower icon).

This allows you to:
- Inspect query state and data
- Manually trigger refetches
- Debug cache behavior
- View query timings

## Best Practices

1. **Always use hooks in components**: Don't call `apiClient` directly in components
2. **Use error boundaries**: Wrap pages with `ErrorBoundary` for graceful error handling
3. **Show loading states**: Always handle `isLoading` state for better UX
4. **Toast notifications**: Use `toast.promise` for user feedback on actions
5. **Respect stale time**: Don't set `staleTime: 0` unless necessary (wastes bandwidth)
6. **Use refetch sparingly**: TanStack Query automatically manages data freshness

## Troubleshooting

### "Missing API key" errors

- Ensure `FLUXION_API_KEY` is set in `.env.local`
- Restart the dev server after changing environment variables
- Check that the API key is valid and active in the backend

### Queries not fetching

- Check that required parameters are provided (e.g., hostname)
- Verify the query is enabled (some queries have `enabled: false` conditions)
- Check the browser console for errors

### CORS errors

- Ensure the backend allows requests from your frontend origin
- Check the `NEXT_PUBLIC_API_BASE_URL` is correct
- Verify the backend is running

### Stale data

- Use the `refetch` function to manually refresh data
- Adjust `staleTime` if data changes frequently
- Check React Query DevTools to see cache status
