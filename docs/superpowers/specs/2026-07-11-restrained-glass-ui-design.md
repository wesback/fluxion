# Restrained Glass UI Modernization

## Purpose and scope

Modernize Fluxion's user-facing Next.js dashboard with a restrained glass visual system. The design prioritizes operational data readability and accessibility across the dashboard, host, package, and administration screens. It applies within the existing Tailwind v4 styling model and shared UI primitives; it does not change data, routes, or interaction flows.

## Current-state context

The frontend uses semantic HSL CSS variables in `frontend/app/globals.css`, Tailwind utility classes, light/dark themes, and reusable Card, Button, Input, Table, Dialog, Badge, and Skeleton primitives. Cards are currently opaque, bordered surfaces; tables carry dense operational information. Responsive grids, mobile navigation, keyboard focus styling, skip navigation, labels, semantic tables, loading skeletons, alerts, and error boundaries already exist.

## Visual architecture and tokens

Extend the semantic token layer in both `:root` and `.dark` with the following contract: `--glass-surface`, `--glass-surface-alpha`, `--glass-border`, `--glass-border-alpha`, `--glass-shadow`, `--glass-shadow-near-alpha`, `--glass-shadow-alpha`, `--glass-blur`, and `--glass-opaque`. The color tokens use the existing space-separated HSL format; `--glass-opaque` resolves to the current semantic `--card` value in each theme. `--glass-blur` is `12px` or less.

Use these exact token values:

```css
:root {
  --glass-surface: 0 0% 100%;
  --glass-surface-alpha: 0.78;
  --glass-border: 220 13% 88%;
  --glass-border-alpha: 0.72;
  --glass-shadow: 222 47% 11%;
  --glass-shadow-near-alpha: 0.08;
  --glass-shadow-alpha: 0.12;
  --glass-blur: 12px;
  --glass-opaque: var(--card);
}

.dark {
  --glass-surface: 0 0% 12%;
  --glass-surface-alpha: 0.82;
  --glass-border: 0 0% 100%;
  --glass-border-alpha: 0.14;
  --glass-shadow: 0 0% 0%;
  --glass-shadow-near-alpha: 0.28;
  --glass-shadow-alpha: 0.32;
  --glass-blur: 12px;
  --glass-opaque: var(--card);
}
```

The sole reusable glass treatment is `.glass-surface`. It must use `background-color: hsl(var(--glass-surface) / var(--glass-surface-alpha))`, `border-color: hsl(var(--glass-border) / var(--glass-border-alpha))`, and this complete shadow declaration:

```css
box-shadow:
  0 1px 2px 0 hsl(var(--glass-shadow) / var(--glass-shadow-near-alpha)),
  0 12px 28px -6px hsl(var(--glass-shadow) / var(--glass-shadow-alpha));
```

It must also use both `backdrop-filter: blur(var(--glass-blur))` and `-webkit-backdrop-filter: blur(var(--glass-blur))`. These fills, borders, and shadows are deliberately bounded: the light fill remains near-white over every permitted light backdrop, while the dark fill remains a near-black surface with a subtle light edge; neither supplies text or control contrast through the visible backdrop. Glass is an elevation cue, not a substitute for clear typography, spacing, borders, status color, or focus visibility. Preserve current radius, typography, semantic colors, and focus-ring tokens. No ad-hoc opacity or backdrop-filter utility may create a second glass variant.

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

Enforce the opaque boundary in the shared `Table` primitive, not only at call sites. Retain its existing `relative w-full overflow-auto` wrapper exactly. The primitive's locked surface classes must be:

- `Table`: `w-full caption-bottom bg-card text-card-foreground text-sm`
- `TableHeader`: `bg-muted [&_tr]:border-b`
- `TableBody`: `bg-card [&_tr:last-child]:border-0`
- `TableRow`: `border-b bg-card transition-colors hover:bg-muted data-[state=selected]:bg-accent data-[state=selected]:text-accent-foreground`
- `TableFooter`: an opaque `bg-muted` (not `bg-muted/50`)

The implementation must introduce a shared `withoutTableSurfaceUtilities(className)` sanitizer and pass its result—not the raw caller `className`—to `cn` in `Table`, `TableHeader`, `TableBody`, `TableRow`, and `TableFooter`. The sanitizer must tokenize Tailwind classes and remove every background-writing utility after arbitrary variant prefixes and an optional `!` marker: `bg-*`, `from-*`, `via-*`, `to-*`, and arbitrary-property utilities for `background`, `background-color`, `background-image`, or `background`. This includes state forms such as `hover:bg-*`, `focus:bg-*`, `data-[state=selected]:bg-*`, `dark:hover:bg-*`, `!bg-*`, and their arbitrary-value equivalents. It must preserve non-background layout, spacing, typography, and border utilities.

The primitive then appends its locked classes after the sanitized result, with `!` on each surface declaration: `!bg-card` on `Table`, `TableBody`, and default `TableRow`; `!bg-muted` on `TableHeader`, hover `!hover:bg-muted`, and `!bg-accent` / `!data-[state=selected]:bg-accent` on selected rows; `!text-accent-foreground` for selected rows; and `!bg-muted` on `TableFooter`. The corresponding locked `!` utility remains inside the primitive rather than in any caller-supplied string. This two-part contract prevents caller `className` Tailwind utilities—including important and variant-qualified utilities—from changing opaque table, header, body, default-row, hover-row, selected-row, or footer fills, while retaining the existing primitive API and allowing safe caller layout classes. A parent Card may have minimal glass framing, but the table itself must provide stable contrast for dense scanning, selection, timestamps, package versions, and status badges.

## Responsive, accessibility, and reduced-transparency behavior

Do not change the existing responsive grid breakpoints, mobile navigation, responsive table columns, or table overflow behavior. Preserve semantic HTML, skip navigation, labels, ARIA state/alerts, visible focus rings, and touch target sizing.

### Reduced-transparency contract

The following selector pairs are equivalent and must have identical declarations, so automated tests can force the fallback without emulating a media feature:

```css
@media (prefers-reduced-transparency: reduce) {
  .glass-surface { /* declarations below */ }
}

html[data-reduced-transparency="true"] .glass-surface,
html.reduced-transparency .glass-surface {
  /* the same declarations */
}
```

At either selector, `.glass-surface` must use `background-color: hsl(var(--card))`, retain a semantic `border-color: hsl(var(--border))`, and set both `backdrop-filter: none` and `-webkit-backdrop-filter: none`. It must not use an alpha fill, opacity reduction, or image to simulate translucency. The root `data-reduced-transparency="true"` attribute and `reduced-transparency` class are the required fallback controls where the media preference is unavailable; either one is sufficient, and removing both restores normal behavior when the media query does not match.

### Mobile and constrained-rendering boundary

Backdrop filtering is disabled for `.glass-surface` at the exact capability boundary below:

```css
@media (max-width: 767px), (pointer: coarse) and (hover: none), (update: slow) {
  .glass-surface {
    background-color: hsl(var(--glass-opaque));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
```

This boundary applies independently of reduced-transparency preferences. `--glass-opaque` must be an opaque, theme-appropriate semantic surface with the same readable foreground pairing as `--card`; it is the required non-blurred fill at the boundary, rather than a transparent approximation of glass.

### Composited contrast acceptance

For each light and dark theme, evaluate the final composited pixels—not source token values alone—for every permitted background: the opaque `--background`, `--card`, `--popover`, and `--glass-opaque` surfaces; a `.glass-surface` composited directly over `--background`; and a `.glass-surface` composited over each permitted opaque parent (`--card` or `--popover`). Nested glass surfaces are prohibited, so no other backdrop is permitted.

In every default, hover, selected, active, disabled, and focus-visible state that exposes content:

- Normal-size text, including muted text, table text, labels, and status text, must meet **4.5:1** or greater against each permitted composited background.
- Controls (their visible label/icon and boundary where it conveys control), chart graphics (series, axes, grids, and tooltip markers), and large text must meet **3:1** or greater against each permitted composited background.

Validate with a contrast tool using computed colors and alpha compositing for the listed backdrop matrix in both themes. A token-only contrast calculation, a single screenshot, or an opaque fallback result does not demonstrate compliance for a translucent state.

## State handling

Loading skeletons use the matching surface tokens but do not require blur. Error states retain destructive color contrast and borders. Empty states may use glass only for their containing panel. Toasts remain readable above all page surfaces. Existing loading, empty, error, stale, and success behaviors remain unchanged.

## Non-goals

- No route, API, data-model, or interaction-flow changes.
- No new component library or styling framework.
- No glass treatment that reduces table, chart, status, or form-control legibility.
- No changes to existing accessibility semantics or responsive layout behavior.

## Validation criteria

Run the existing frontend lint and build commands. Verify light and dark themes on desktop and mobile; keyboard focus and dialog interaction; navigation and responsive tables; loading, error, and empty states; and reduced-transparency behavior. Confirm the shared Table primitive has the specified opaque classes while retaining its overflow wrapper. Test reduced transparency once through an emulated `prefers-reduced-transparency: reduce` media feature and once by setting `html[data-reduced-transparency="true"]` (or the equivalent root class); in both cases verify opaque semantic fills and no computed backdrop filter. At each mobile/constrained media boundary, verify no computed backdrop filter and the opaque `--glass-opaque` fill. Complete the composited contrast matrix defined above for text, controls, chart labels/series, table content, and status badges.
