# Frosted Neutral Glass Shell Design

## Goals

Evolve the Fluxion frontend from the restrained glass layer (2026-07-11) into a cohesive **shared frontend shell** with a stronger ambient environment, a refined frosted-neutral palette, and explicit component contracts for the navbar, card primitive, skeleton, and chart tooltip. The result must feel like a professional operational product — quiet, trustworthy, and readable — not a design demo.

## Non-goals

- No changes to routes, data fetching, API contracts, or business logic.
- No animated blobs, particle effects, morphing gradients, or per-card entry animations.
- No new dependencies (no animation library, no new icon set, no CSS-in-JS).
- No replacement of the system font stack.
- No changes to colour used for status semantics: amber/yellow for warning, red for destructive. The operational accent is an informational highlight only.
- No removal of the opaque-table boundary established in the 2026-07-11 spec.

---

## Prerequisites

This spec is a targeted evolution of the **Restrained Glass UI** system introduced in `docs/superpowers/specs/2026-07-11-restrained-glass-ui.md`. It is **not self-contained**. Before implementing, an automated validation gate must confirm that all of the following are present in the codebase:

| Requirement | Verification |
|---|---|
| `.glass-surface` class | Encodes `backdrop-filter`, translucent fill, and hairline border |
| `--glass-surface`, `--glass-surface-alpha` | Defined in `:root` and `.dark` |
| `--glass-border`, `--glass-border-alpha` | Defined in `:root` and `.dark` |
| `--glass-blur` | Defined in `:root` and `.dark` |
| `--glass-shadow`, `--glass-shadow-alpha`, `--glass-shadow-near-alpha` | Defined in `:root` and `.dark` |
| `--glass-opaque` | Defined in `:root` and `.dark` |
| `--control-border`, `--input-border` | Defined in `:root` and `.dark` |
| `--ring` | Defined in `:root` and `.dark` |
| Opaque-table boundary | `Table` carries `bg-card!` class |

If any requirement above is unmet, apply the 2026-07-11 spec first and do not proceed with this spec until the gate passes.

---

## Existing surfaces (baseline)

From the previous spec and current codebase state:

| Surface | Current treatment |
|---|---|
| Page background | `--background` semantic token; flat colour |
| Navbar | Opaque surface, `--card` fill |
| Card | `.glass-surface` translucent fill + 12 px blur + hairline border |
| Table | Opaque (`bg-card!` locked in primitive) |
| Dialog | Glass panel over dimmed overlay |
| Chart tooltip | Glass-styled container |
| Skeleton | Default shadcn/ui pattern |
| Inputs / buttons | Opaque semantic styling with `--control-border` / `--input-border` |

This spec extends and tightens the above rather than replacing it.

---

## Token system

### Palette additions

Add the following named palette constants. These are **not** direct CSS variables — they are the human-readable source-of-truth values that must be encoded in the token definitions below.

| Name | Light value | Dark value |
|---|---|---|
| ice | `#F3F7FB` | — |
| cloud | `#E6EEF5` | — |
| glass-white | `rgba(255,255,255,0.62)` | — |
| ink | `#17202A` | — |
| slate | `#5C6B78` | — |
| operational-accent | `#2C7396` | — |
| charcoal | — | `#11161B` |
| graphite | — | `#1A232B` |
| muted-cyan-focus | — | `#5BB8D4` |

Amber and red remain reserved for status only (`--destructive`, `--warning`). Do not use `operational-accent` for success or error states.

### CSS custom properties

Extend `:root` and `.dark` with the following additions and replacements. Preserve all tokens from the 2026-07-11 spec unless explicitly superseded here.

```css
:root {
  /* Page background — ice wash */
  --background: 214 36% 97%;           /* #F3F7FB */
  --background-secondary: 213 30% 93%; /* #E6EEF5 */

  /* Frosted shell tokens */
  --shell-surface: 0 0% 100%;
  --shell-surface-alpha: 0.62;
  --shell-border: 213 30% 88%;
  --shell-border-alpha: 0.70;

  /* Navbar-specific */
  --navbar-surface: 0 0% 100%;
  --navbar-surface-alpha: 0.72;
  --navbar-highlight: 0 0% 100%;
  --navbar-highlight-alpha: 0.55;
  --navbar-blur: 14px;

  /* Ambient grid/noise impression (applied to ::before pseudo-element) */
  --ambient-grid-opacity: 0.025;

  /* Operational accent */
  --accent-operational: 200 55% 38%;   /* #2C7396 — darkened one step vs. palette draft to clear ≥4.5:1 on composited navbar */
  --accent-operational-fg: 0 0% 100%;

  /* Signature frost line */
  --frost-line-start: 0 0% 100%;
  --frost-line-end: 210 60% 94%;       /* cool ice-blue */
  --frost-line-alpha: 0.80;

  /* Glass tokens — supersede 2026-07-11 values */
  --glass-surface: 0 0% 100%;
  --glass-surface-alpha: 0.62;
  --glass-border: 213 30% 88%;
  --glass-border-alpha: 0.68;
  --glass-blur: 12px;
}

.dark {
  /* Page background — charcoal */
  --background: 216 23% 9%;            /* #11161B */
  --background-secondary: 214 23% 13%; /* #1A232B */

  /* Frosted shell tokens */
  --shell-surface: 0 0% 100%;
  --shell-surface-alpha: 0.05;
  --shell-border: 0 0% 100%;
  --shell-border-alpha: 0.10;

  /* Navbar-specific */
  --navbar-surface: 0 0% 100%;
  --navbar-surface-alpha: 0.06;
  --navbar-highlight: 0 0% 100%;
  --navbar-highlight-alpha: 0.08;
  --navbar-blur: 14px;

  /* Ambient grid */
  --ambient-grid-opacity: 0.035;

  /* Operational accent — muted cyan for active/focus */
  --accent-operational: 196 52% 58%;   /* #5BB8D4 */
  --accent-operational-fg: 216 23% 9%;

  /* Signature frost line */
  --frost-line-start: 0 0% 100%;
  --frost-line-end: 196 52% 80%;
  --frost-line-alpha: 0.12;

  /* Glass tokens */
  --glass-surface: 0 0% 100%;
  --glass-surface-alpha: 0.05;
  --glass-border: 0 0% 100%;
  --glass-border-alpha: 0.10;
  --glass-blur: 12px;
}
```

**Constraint:** `--glass-blur` and `--navbar-blur` must never exceed `16px`. Implementations must not introduce inline or utility-class blur values outside these tokens.

### Typography scale

Retain the system font stack (`ui-sans-serif, system-ui, -apple-system, ...`). Establish stronger visual hierarchy through weight and size contrast only:

| Role | Size | Weight |
|---|---|---|
| Page heading | `1.25rem` | `700` |
| Section heading | `1rem` | `600` |
| Label / caption | `0.75rem` | `500` |
| Body / table cell | `0.875rem` | `400` |
| Subtext / hint | `0.75rem` | `400`, `--muted-foreground` |

Do not introduce new font-family, letter-spacing resets, or line-height overrides beyond what Tailwind base already applies.

---

## Ambient background

The full-page background is built from three layers applied to the `<body>` or a dedicated root wrapper:

1. **Base fill** — `hsl(var(--background))`.
2. **Two radial washes** — applied as `background-image` gradients or `::before`/`::after` pseudo-elements. Light theme: one soft wash at top-left (`hsl(var(--background-secondary)) 0% → transparent 60%`) and one at bottom-right (`hsl(var(--accent-operational) / 0.06) 0% → transparent 55%`). Dark theme: reduce opacity to `0.04` and `0.05` respectively. Both washes must be `pointer-events: none` and `z-index: -1`.
3. **Grid/noise impression** — a single `background-image: repeating-linear-gradient(...)` or SVG data URI that creates a barely-visible grid at `opacity: var(--ambient-grid-opacity)`. No external image files. The grid cell is `32px × 32px`, lines are 1 px, colour is `currentColor` (inherit from `--foreground`).

**No animated properties** on background layers. `transition` and `animation` are prohibited on these elements even for theme switching.

---

## Component changes

### 1. Navbar — frosted rail

The navbar becomes a **frosted rail** fixed to the top of the viewport.

- Background: `hsl(var(--navbar-surface) / var(--navbar-surface-alpha))` with `backdrop-filter: blur(var(--navbar-blur))` and `-webkit-backdrop-filter: blur(var(--navbar-blur))`.
- Bottom border: `1px solid hsl(var(--navbar-highlight) / var(--navbar-highlight-alpha))` — this acts as the thin highlight edge.
- **Signature frost line** at the very top edge: a `2px` `background: linear-gradient(to right, hsl(var(--frost-line-start) / var(--frost-line-alpha)), hsl(var(--frost-line-end) / var(--frost-line-alpha)))` strip applied as a `border-top` or an `::before` pseudo-element on the navbar root. In dark mode this line is very subtle; in light mode it reads as a narrow cool-white-to-ice-blue streak.
- Active route: filled with `hsl(var(--accent-operational) / 0.12)` background pill or underline; text or icon colour shifts to `hsl(var(--accent-operational))`. No bold weight change on active; avoid layout shift.
- Hover: `hsl(var(--accent-operational) / 0.06)` background, no border change.
- Focus-visible: standard `outline` using existing `--ring` token; do not rely on the frosted surface for focus communication.
- **Reduced-transparency fallback:** when `@media (prefers-reduced-transparency: reduce)` is active, remove `backdrop-filter` / `-webkit-backdrop-filter` and set `background-color: hsl(var(--background-secondary))` at 100% opacity. This is the navbar-specific solid-surface replacement; the `.glass-surface` fallback rules do not govern the navbar.
- **Pointer-coarse / low-memory fallback:** on `@media (pointer: coarse)` or when `navigator.deviceMemory < 2` (detected via JS class on `<html>`), the navbar blur must also be stripped — apply the same solid-surface fallback (`hsl(var(--background-secondary))`) to avoid jank on low-end devices. The navbar must obey this boundary identically to how `.glass-surface` handles it.
- The navbar must not obscure main content — `main` must carry appropriate `padding-top`.

### 2. Card — shared glass primitive

The `.glass-surface` class introduced in 2026-07-11 is promoted to the **canonical glass card primitive**. It must encode:

- Fill: `background-color: hsl(var(--glass-surface) / var(--glass-surface-alpha))`.
- Border: `border: 1px solid hsl(var(--glass-border) / var(--glass-border-alpha))`.
- Blur: `backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur))`.
- Shadow: `box-shadow: 0 1px 2px 0 hsl(var(--glass-shadow) / var(--glass-shadow-near-alpha)), 0 12px 28px -6px hsl(var(--glass-shadow) / var(--glass-shadow-alpha))`.
- Radius: inherit current `--radius` token.
- **Solid fallback:** in the `@media (prefers-reduced-transparency: reduce)` media query and in the `@supports not (backdrop-filter: blur(1px))` block, override to `background-color: hsl(var(--glass-opaque))` and remove the blur. The solid fallback must pass all contrast requirements independently.
- No per-card `transition` on `backdrop-filter`, `background-color`, or `box-shadow` unless the card is explicitly `data-interactive`. Interactive summary cards may use a single `box-shadow` transition: `transition: box-shadow 150ms ease`.

### 3. Tables and dense data

Tables remain **opaque** per the 2026-07-11 boundary:

- `Table`: `w-full caption-bottom bg-card! text-card-foreground text-sm`
- `TableHeader`: `bg-muted! [&_tr]:border-b`

No changes to the opaque-table rule. Do not apply `.glass-surface` to table wrappers.

### 4. Skeletons

Update skeleton shimmer to match the new palette:

- Light: shimmer from `hsl(var(--background))` to `hsl(var(--background-secondary))` and back. No white flash.
- Dark: shimmer from `hsl(var(--background-secondary))` to a slightly lighter tint of the same (increase lightness by ~4–5 %). No bright flash.
- Animation duration: `1.6s`. Respect `prefers-reduced-motion` — when set, remove the animation and render a static muted surface.
- Skeleton shapes must not use glass/blur — they are opaque placeholder surfaces.

### 5. Chart tooltip

- Container: `.glass-surface` class (frosted, 12 px blur, hairline border, shadow).
- Text: use `--foreground` (ink / light-foreground) for values, `--muted-foreground` (slate) for labels.
- Background must provide sufficient contrast for both colour groups without relying on the blurred backdrop. If composited contrast falls below 4.5:1 for value text, apply a semi-opaque tint fallback (`background-color: hsl(var(--glass-opaque) / 0.9)`).
- No animation on tooltip entry/exit beyond the existing tooltip library default (`opacity` fade ≤ 100 ms).

### 6. Focus and interaction

- All interactive elements retain `focus-visible` outlines using `--ring`.
- The operational accent (`--accent-operational`) may be used for active/selected state fill at low opacity (≤ 15 %).
- Destructive and warning states continue to use red and amber respectively.

---

## Responsive constraints

- Navbar frosted rail applies at all breakpoints. On mobile the rail may collapse to a bottom navigation bar or hamburger; glass treatment follows the element regardless of placement. On `@media (pointer: coarse)` or low-memory devices, the navbar blur is stripped and the solid fallback is applied — see the Navbar section for the exact rule.
- Ambient radial washes are full-viewport and scale naturally.
- Ambient grid is a `background-image` repeat pattern; no responsive changes needed.
- Card glass applies at all breakpoints. On small viewports, `backdrop-filter` is computationally heavier; cap blur at `12px` and ensure the solid fallback is tested on low-end hardware profiles.

---

## Accessibility and performance constraints

### Contrast

- All body and UI text must maintain ≥ 4.5:1 contrast ratio against its composited background (glass fill + backdrop colour).
- Large text (≥ 18 px regular or ≥ 14 px bold) requires ≥ 3:1.
- Control boundaries (`--control-border`, `--input-border`) require ≥ 3:1 against the adjacent surface.
- The operational accent (`#2C7396`) measured against the composited light-mode navbar surface (`rgba(255,255,255,0.72)` over `#F3F7FB` ≈ `#FCFDFE`) achieves ≥ 5:1 — sufficient for normal text. In dark mode the muted-cyan focus (`#5BB8D4`) on charcoal (`#11161B`) must be verified to meet ≥ 4.5:1 before use on text; use only for decorative/fill states if it falls short.

### Reduced motion

- All `transition` and `animation` on glass surfaces, navbar, and skeleton must check `prefers-reduced-motion: reduce` via `@media` or Tailwind's `motion-safe:` / `motion-reduce:` variants.
- When reduced motion is active: no shimmer animation, no box-shadow hover transition, no frost-line fade.

### Reduced transparency

- The `prefers-reduced-transparency` media query (macOS/iOS) must trigger the solid fallback for all `.glass-surface` elements: override to `background-color: hsl(var(--glass-opaque))` and remove blur.
- For the navbar specifically, the solid fallback is `background-color: hsl(var(--background-secondary))` at 100% opacity with `backdrop-filter` removed. This differs from the card fallback token and must be implemented as a separate rule targeting the navbar element.

### Performance

- `backdrop-filter` is expensive on large surfaces. Do not stack more than two frosted layers in the same z-axis stack without profiling.
- Ambient background layers must use `will-change: auto` (default). Do not set `will-change: transform` or `will-change: filter` on static background elements.
- Per-card blur is capped at `12px` (`--glass-blur`). Navbar blur is capped at `14px` (`--navbar-blur`). No blur above `16px` anywhere.
- The grid/noise impression must be a CSS `background-image` (repeating gradient or inline SVG data URI). No external PNG/SVG fetches for the background texture.

---

## Validation criteria

A build of this design spec passes validation when:

1. All palette token values are present in both `:root` and `.dark` in `globals.css` (or equivalent token file).
2. `.glass-surface` encodes exactly the fill, border, blur, shadow, and solid-fallback rules specified above — no ad-hoc variants exist.
3. The navbar carries the frost-line signature, backdrop-blur, and active-route treatment without layout shift at any breakpoint.
4. Skeleton shimmer colours match the new palette in both themes.
5. Chart tooltip uses `.glass-surface` with a contrast-safe text colour.
6. Tables remain opaque (verified by inspecting `Table` and `TableHeader` class lists).
7. Lighthouse contrast audit reports no failures on any route under light and dark themes.
8. `prefers-reduced-motion` removes all animations and transitions from glass and skeleton surfaces.
9. `prefers-reduced-transparency` removes all backdrop-filter and glass fill from frosted surfaces.
10. No blur value above `16px` exists anywhere in CSS output.
11. Ambient background layers produce no repaints in Chrome DevTools Paint Flashing during scroll.

---

## Rollout notes

1. **Token-first:** implement all CSS custom property additions before touching component files. This keeps the diff reviewable and allows the solid fallback to be wired up before blur is activated.
1a. **`@theme inline` promotion:** immediately after updating `:root` / `.dark`, register all new tokens in Tailwind's `@theme inline` block (Tailwind v4) so they are available as Tailwind utilities. Tokens to promote: `--background-secondary`, `--shell-surface`, `--shell-surface-alpha`, `--shell-border`, `--shell-border-alpha`, `--navbar-surface`, `--navbar-surface-alpha`, `--navbar-highlight`, `--navbar-highlight-alpha`, `--navbar-blur`, `--ambient-grid-opacity`, `--accent-operational`, `--accent-operational-fg`, `--frost-line-start`, `--frost-line-end`, `--frost-line-alpha`, `--glass-surface`, `--glass-surface-alpha`, `--glass-border`, `--glass-border-alpha`, `--glass-blur`. For Tailwind v3, add equivalent entries under `theme.extend` in `tailwind.config.ts`.
2. **Component order:** (a) globals / tokens → (b) ambient background wrapper → (c) navbar → (d) card primitive → (e) skeleton → (f) chart tooltip. Test each step in isolation.
3. **No feature flag needed** — changes are purely visual and do not alter routes, data, or interaction semantics. A single PR covering the full shell is acceptable.
4. **Browser testing matrix:** Chrome, Firefox (note: Firefox has partial `backdrop-filter` support behind a flag historically — confirm current status), Safari, and Edge. Test the solid fallback path explicitly.
5. **Design token ownership:** all palette and shell tokens live in `frontend/app/globals.css`. No tokens may be hardcoded in component files.
6. **Copilot agent note:** when implementing, the agent (Morpheus — Frontend Engineer) must not modify routes, tests unrelated to visual regression, or backend files. Commit scope is `frontend/app/globals.css` and the shared UI primitive files.
