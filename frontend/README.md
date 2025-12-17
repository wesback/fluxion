# Fluxion Frontend

A modern, responsive Next.js frontend for the Fluxion package update tracking system.

## Features

- 🌓 **Dark/Light Mode**: Automatic system preference detection with manual toggle
- 📱 **Responsive Design**: Mobile-first design that works on all screen sizes
- 📊 **Data Visualization**: Interactive charts using Recharts
- 🎨 **Modern UI**: Built with Tailwind CSS and shadcn/ui components
- ⚡ **Fast**: Next.js 16 with App Router for optimal performance
- 🔄 **Real-time Updates**: TanStack Query for efficient data fetching and caching
- 🔐 **Secure Authentication**: Server-side API key authentication
- 🚨 **Error Handling**: Comprehensive error boundaries and toast notifications
- ⏱️ **Auto-refresh**: Recent updates refresh every 30 seconds
- 🔁 **Retry Logic**: Automatic retry with exponential backoff for failed requests

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Charts**: Recharts
- **Data Fetching**: TanStack Query (React Query) v5
- **HTTP Client**: Axios
- **Notifications**: Sonner
- **Theme**: next-themes
- **Date Handling**: date-fns
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running (see `/backend/README.md`)
- Valid API key from the backend

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and set your API configuration:
   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   FLUXION_API_KEY=your_api_key_here
   ```
   
   **IMPORTANT**: The `FLUXION_API_KEY` is stored server-side only and never exposed to the browser.

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## API Integration

The frontend integrates with the FastAPI backend using secure, server-side authentication. For detailed documentation on API usage, hooks, and error handling, see [API_INTEGRATION.md](./API_INTEGRATION.md).

### Quick Start with API

```typescript
import { useStats, useHosts, useRecentUpdates } from '@/lib/hooks/use-api';

function MyComponent() {
  const { data, isLoading, error, refetch } = useStats();
  
  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorMessage error={error} />;
  
  return <DataDisplay data={data} onRefresh={refetch} />;
}
```

## Pages

### Dashboard (`/`)
- Stats cards showing total hosts, updates, and recent activity
- Bar charts for top packages and most active hosts
- Recent updates feed (auto-refreshes every 30 seconds)
- Manual refresh button

### Hosts (`/hosts`)
- Searchable table of all registered hosts
- Shows hostname, OS, last seen, and total updates
- Click hostname to view details
- Manual refresh button

### Host Detail (`/hosts/[hostname]`)
- Host information card
- Line chart showing updates over time (last 7 days)
- Full update history with pagination
- Manual refresh button

### Packages (`/packages`)
- Search for packages across all hosts (supports partial/wildcard matching)
- Shows which hosts have the package installed
- Displays current version per host
- Real-time search results
- Case-insensitive search

## Project Structure

```
frontend/
├── app/                      # Next.js App Router pages
│   ├── hosts/               # Host list and detail pages
│   │   ├── [hostname]/      # Dynamic host detail page
│   │   └── page.tsx         # Host list page
│   ├── packages/            # Package search page
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Dashboard page
│   └── globals.css          # Global styles and theme
├── components/
│   ├── charts/              # Chart components
│   │   ├── bar-chart.tsx
│   │   └── line-chart.tsx
│   ├── ui/                  # Base UI components (shadcn/ui)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── skeleton.tsx     # Loading skeletons
│   │   └── table.tsx
│   ├── error-boundary.tsx   # Error boundary component
│   ├── host-card.tsx        # Host information card
│   ├── navbar.tsx           # Navigation bar
│   ├── query-provider.tsx   # TanStack Query provider
│   ├── stats-card.tsx       # Statistics card
│   ├── theme-provider.tsx   # Theme context provider
│   ├── theme-toggle.tsx     # Dark/light mode toggle
│   └── updates-table.tsx    # Reusable updates table
├── lib/
│   ├── hooks/               # Custom React hooks
│   │   └── use-api.ts       # TanStack Query API hooks
│   ├── api.ts               # API client with auth
│   ├── mock-data.ts         # Mock data (for reference)
│   └── utils.ts             # Utility functions
├── .env.example             # Environment variables template
├── API_INTEGRATION.md       # API integration documentation
└── README.md                # This file
```

## Theme Customization

The theme is configured in `app/globals.css` using CSS variables. You can customize colors by modifying the variables in the `:root` and `.dark` selectors.

## Error Handling

The frontend includes comprehensive error handling:

- **Error Boundaries**: Catch and display React errors gracefully
- **Toast Notifications**: User-friendly error messages using Sonner
- **Retry Logic**: Automatic retry with exponential backoff (3 attempts)
- **Loading States**: Skeleton components for better UX
- **API Error Messages**: Display backend error details

## Data Management

The frontend uses TanStack Query for efficient data management:

- **Caching**: Data is cached for 5 minutes (configurable per query)
- **Auto-refresh**: Recent updates refresh every 30 seconds
- **Stale-while-revalidate**: Show cached data while fetching updates
- **Manual Refresh**: Refresh buttons on all pages
- **DevTools**: React Query DevTools in development mode

## API Client

The API client (`lib/api.ts`) provides methods for:
- `getStats()` - Dashboard statistics
- `getHosts()` - List all hosts
- `getHostUpdates(hostname, options)` - Get updates for a specific host
- `getRecentUpdates(limit, hours)` - Get recent updates across all hosts
- `getPackageHosts(packageName)` - Get hosts with a specific package

All methods include:
- Automatic authentication with API key
- Error handling with typed errors
- 30-second timeout
- TypeScript type safety

## Responsive Design

The frontend is built mobile-first with breakpoints:
- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

All pages and components adapt to different screen sizes.

## Accessibility

- Semantic HTML structure
- ARIA labels for interactive elements
- Keyboard navigation support
- Color contrast meets WCAG AA standards

## Production Build

To build for production:

```bash
npm run build
npm start
```

The build will be optimized and output to `.next/` directory.

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base URL | `http://localhost:8000` | Yes |
| `FLUXION_API_KEY` | API authentication key (server-side only) | - | Yes |

## Security

- API keys are stored server-side only
- Never exposed to client browser
- Automatic inclusion in authenticated requests
- No localStorage or cookie storage

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly on mobile and desktop
4. Ensure dark mode works correctly
5. Run linting and build
6. Submit a pull request

## License

MIT License - see LICENSE file for details
