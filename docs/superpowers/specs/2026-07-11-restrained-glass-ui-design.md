# Restrained Glass UI Modernization

## Purpose and scope

Modernize Fluxion's user-facing Next.js dashboard with a restrained glass visual system. The design prioritizes operational data readability and accessibility across the dashboard, host, package, and administration screens. It applies within the existing Tailwind v4 styling model and shared UI primitives; it does not change data, routes, or interaction flows.

## Current-state context

The frontend uses semantic HSL CSS variables in `frontend/app/globals.css`, Tailwind utility classes, light/dark themes, and reusable Card, Button, Input, Table, Dialog, Badge, and Skeleton primitives. Cards are currently opaque, bordered surfaces; tables carry dense operational information. Responsive grids, mobile navigation, keyboard focus styling, skip navigation, labels, semantic tables, loading skeletons, alerts, and error boundaries already exist.

## Visual architecture and tokens

Extend the semantic token layer with light- and dark-mode values for glass surface fill, glass border, glass shadow, and a restrained blur strength. Glass is an elevation cue, not a substitute for clear typography, spacing, borders, status color, or focus visibility. Preserve current radius, typography, semantic colors, and focus-ring tokens.

Light glass uses a subtle translucent light surface; dark glass uses a translucent charcoal surface. Both modes must maintain sufficient contrast for text and controls without relying on the background visible through the surface.

## Component application

- **Card:** Use tokenized translucent fill, subtle border, and modest shadow. Apply hover elevation only to interactive summary cards.
- **Navbar and admin navigation:** Use a glass surface over the page background while retaining clearly contrasted active and hover states.
- **Dialog and chart tooltip:** Use a readable glass panel over the existing dimmed overlay; preserve close controls and keyboard behavior.
- **Charts:** Apply glass to the containing card and tooltip only. Keep axes, grids, labels, and series visibly high contrast.
- **Inputs, buttons, badges:** Retain existing semantic, readable control styling; do not make controls dependent on translucency.
- **Tables:** See the opaque-table boundary below.

## Route application

- **Dashboard:** Apply glass to statistic cards, chart cards, and the recent-updates framing surface. Keep the update table opaque.
- **Hosts and host detail:** Apply glass to search and summary surfaces, host cards, chart cards, and empty/error panels. Keep host and update-history tables opaque.
- **Packages:** Apply glass to the search panel and empty/error panels. Keep search results opaque.
- **Administration:** Apply glass to admin navigation, API-key/webhook summary cards, dialogs, and empty/error panels. Keep management tables opaque.

## Intentional opaque-table boundary

Data tables remain mostly opaque with their existing borders, headers, row hover states, and scroll behavior. A parent Card may have minimal glass framing, but table backgrounds and rows must provide stable contrast for dense scanning, selection, timestamps, package versions, and status badges.

## Responsive, accessibility, and reduced-transparency behavior

Do not change the existing responsive grid breakpoints, mobile navigation, responsive table columns, or table overflow behavior. Preserve semantic HTML, skip navigation, labels, ARIA state/alerts, visible focus rings, and touch target sizing.

When `prefers-reduced-transparency` is active, substitute opaque semantic surfaces for translucent/blurred glass surfaces. Avoid expensive backdrop filtering on constrained/mobile rendering and keep blur restrained elsewhere.

## State handling

Loading skeletons use the matching surface tokens but do not require blur. Error states retain destructive color contrast and borders. Empty states may use glass only for their containing panel. Toasts remain readable above all page surfaces. Existing loading, empty, error, stale, and success behaviors remain unchanged.

## Non-goals

- No route, API, data-model, or interaction-flow changes.
- No new component library or styling framework.
- No glass treatment that reduces table, chart, status, or form-control legibility.
- No changes to existing accessibility semantics or responsive layout behavior.

## Validation criteria

Run the existing frontend lint and build commands. Verify light and dark themes on desktop and mobile; keyboard focus and dialog interaction; navigation and responsive tables; loading, error, and empty states; and reduced-transparency behavior. Confirm accessible contrast for text, controls, chart labels/series, table content, and status badges.
