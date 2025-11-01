# Fluxion Frontend

A modern, responsive Next.js frontend for the Fluxion package update tracking system.

## Features

- 🌓 **Dark/Light Mode**: Automatic system preference detection with manual toggle
- 📱 **Responsive Design**: Mobile-first design that works on all screen sizes
- 📊 **Data Visualization**: Interactive charts using Recharts
- 🎨 **Modern UI**: Built with Tailwind CSS and shadcn/ui components
- ⚡ **Fast**: Next.js 14+ with App Router for optimal performance
- 🔄 **Real-time Updates**: TanStack Query for efficient data fetching (ready for real API)

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Charts**: Recharts
- **Theme**: next-themes
- **Date Handling**: date-fns
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running (see `/backend/README.md`)

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and set your API base URL:
   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   ```

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

## Pages

### Dashboard (`/`)
- Stats cards showing total hosts, updates, and recent activity
- Bar charts for top packages and most active hosts
- Recent updates feed (last 20 updates)

### Hosts (`/hosts`)
- Searchable table of all registered hosts
- Shows hostname, OS, last seen, and total updates
- Click hostname to view details

### Host Detail (`/hosts/[hostname]`)
- Host information card
- Line chart showing updates over time
- Full update history with pagination
- Filter by date range (ready for implementation)

### Packages (`/packages`)
- Search for packages across all hosts
- Shows which hosts have the package installed
- Displays current version per host

## Project Structure

```
frontend/
├── app/                      # Next.js App Router pages
│   ├── hosts/               # Host list and detail pages
│   │   ├── [hostname]/      # Dynamic host detail page
│   │   └── page.tsx         # Host list page
│   ├── packages/            # Package search page
│   ├── layout.tsx           # Root layout with theme provider
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
│   │   └── table.tsx
│   ├── host-card.tsx        # Host information card
│   ├── navbar.tsx           # Navigation bar
│   ├── stats-card.tsx       # Statistics card
│   ├── theme-provider.tsx   # Theme context provider
│   ├── theme-toggle.tsx     # Dark/light mode toggle
│   └── updates-table.tsx    # Reusable updates table
├── lib/
│   ├── api.ts               # API client
│   ├── mock-data.ts         # Mock data for development
│   └── utils.ts             # Utility functions
├── .env.example             # Environment variables template
└── README.md                # This file
```

## Theme Customization

The theme is configured in `app/globals.css` using CSS variables. You can customize colors by modifying the variables in the `:root` and `.dark` selectors.

## Development with Mock Data

The frontend currently uses mock data defined in `lib/mock-data.ts`. This allows for development and testing without a running backend.

To switch to the real API:
1. Ensure the backend is running
2. Update `NEXT_PUBLIC_API_BASE_URL` in `.env.local`
3. The API client in `lib/api.ts` will automatically use the real endpoints

## API Client

The API client (`lib/api.ts`) provides methods for:
- `getStats()` - Dashboard statistics
- `getHosts()` - List all hosts
- `getHostUpdates(hostname, options)` - Get updates for a specific host
- `getRecentUpdates(limit, hours)` - Get recent updates across all hosts
- `getPackageHosts(packageName)` - Get hosts with a specific package

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

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base URL | `http://localhost:8000` |

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
5. Submit a pull request

## License

MIT License - see LICENSE file for details
