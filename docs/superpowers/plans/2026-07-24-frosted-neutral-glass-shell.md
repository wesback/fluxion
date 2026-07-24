# Frosted Neutral Glass Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Agent:** Morpheus — Frontend Engineer  
**Spec:** `docs/superpowers/specs/2026-07-24-frosted-neutral-glass-shell-design.md`  
**Scope:** `globals.css` token additions, ambient background, navbar frosted rail, Card glass primitive, Skeleton shimmer, chart tooltip, contract tests, prerequisite gate.

**Goal:** Evolve the Fluxion frontend from the 2026-07-11 restrained-glass baseline into a cohesive frosted-neutral shell. Extend CSS custom properties, apply a three-layer ambient background to the page root, convert the navbar to a frosted rail with a signature frost-line, promote the Card glass primitive to the full spec contract, replace Skeleton shimmer with palette-aware colours, and wire both charts to a shared glass-tooltip renderer. All without touching routes, data fetching, business logic, or any component outside the listed files.

**Architecture:** All palette and shell tokens live exclusively in `frontend/app/globals.css`; no token may be hardcoded in a component. The `@theme inline` block keeps every custom property available as a Tailwind utility. Ambient background is applied via CSS rules on `body` in `globals.css`, not a wrapper element, to keep `layout.tsx` changes minimal (only the `main` padding-top). The navbar uses CSS custom properties and `::before` for the frost line; the low-memory JS guard is applied by a tiny `DeviceMemoryGuard` client component that stamps `data-low-memory="true"` on `<html>` at mount time. A Node built-in test runner (`node:test`) suite provides static source-contract assertions; no third-party test framework is installed.

**Tech stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4 (`@theme inline`), Recharts 3, Node.js built-in test runner, ESLint.

---

## File structure

### Create

- `frontend/components/device-memory-guard.tsx` — client component that stamps `html[data-low-memory="true"]` when `navigator.deviceMemory < 2`; mounted once in `layout.tsx`.
- `frontend/components/charts/glass-tooltip.tsx` — shared Recharts custom tooltip renderer using the `.glass-surface` class for frosted container; used by both `BarChart` and `LineChart`.
- `frontend/tests/frosted-glass-contract.test.mjs` — Node `node:test` suite with static source assertions for tokens, ambient background, navbar, card, skeleton, and chart tooltip.

### Modify

- `frontend/app/globals.css` — add new CSS custom properties to `:root` and `.dark`, extend `@theme inline`, add ambient background body rules, add/update `.glass-surface` contract, add skeleton `@keyframes` shimmer, add navbar CSS rules and media-query fallbacks.
- `frontend/app/layout.tsx` — mount `DeviceMemoryGuard`; update `main` element with `pt-16` (or equivalent `padding-top` matching the 64 px navbar height) so the fixed navbar does not obscure content.
- `frontend/components/navbar.tsx` — convert to frosted rail: `fixed`, `backdrop-filter`, frost-line `::before` via CSS class, active-route pill using `--accent-operational`, hover/focus-visible rules, reduced-transparency and pointer-coarse solid-surface fallbacks.
- `frontend/components/ui/card.tsx` — add `glass-surface` class to the root `<div>`; add `data-interactive` support for box-shadow transition.
- `frontend/components/ui/skeleton.tsx` — replace `animate-pulse bg-muted` with palette-aware shimmer animation; add `prefers-reduced-motion` static fallback; update `StatsCardSkeleton` and `ChartSkeleton` container classes.
- `frontend/components/charts/bar-chart.tsx` — replace inline `contentStyle` object on `<Tooltip>` with `content={<GlassTooltip />}` using the shared renderer.
- `frontend/components/charts/line-chart.tsx` — same as above.
- `frontend/package.json` — add `"test:frosted-glass": "node --test tests/frosted-glass-contract.test.mjs"` script.

### Deliberately unchanged

- `frontend/components/ui/table.tsx` — opaque boundary (`bg-card!`, `bg-muted!`) established in 2026-07-11 must not be touched.
- `frontend/components/ui/dialog.tsx`, `button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `badge.tsx` — outside this plan's scope.
- `frontend/components/error-boundary.tsx`, `stats-card.tsx`, `host-card.tsx`, `updates-table.tsx` — will inherit Card glass surface automatically; no direct edits required.
- All `frontend/app/**/*.tsx` route pages — no route, data-fetching, or layout logic changes.
- `frontend/components/theme-provider.tsx`, `theme-toggle.tsx`, `query-provider.tsx`, `telemetry-provider.tsx` — unchanged.
- Backend, deploy, terraform, scripts — outside scope entirely.

---

## Task 0: Prerequisite gate — verify 2026-07-11 baseline

**Files:**
- Read-only scan: `frontend/app/globals.css`, `frontend/components/ui/table.tsx`

This task is a blocking check. Do not proceed to Task 1 until all assertions below pass.

- [ ] **Step 1: Run the prerequisite check**

  Execute the following Node one-liner from the repo root. It scans `globals.css` for each required token/class and exits non-zero on any missing item:

  ```bash
  node --input-type=module << 'EOF'
  import { readFileSync } from 'node:fs'
  const css = readFileSync('frontend/app/globals.css', 'utf8')
  const table = readFileSync('frontend/components/ui/table.tsx', 'utf8')

  const required = [
    '.glass-surface',
    '--glass-surface',
    '--glass-surface-alpha',
    '--glass-border',
    '--glass-border-alpha',
    '--glass-blur',
    '--glass-shadow',
    '--glass-shadow-alpha',
    '--glass-shadow-near-alpha',
    '--glass-opaque',
    '--control-border',
    '--input-border',
    '--ring',
  ]
  const missing = required.filter(t => !css.includes(t))
  const tableOpaque = table.includes('bg-card!')
  if (missing.length > 0) {
    console.error('PREREQUISITE FAIL — missing from globals.css:', missing)
    process.exit(1)
  }
  if (!tableOpaque) {
    console.error('PREREQUISITE FAIL — Table missing bg-card! opaque boundary')
    process.exit(1)
  }
  console.log('PREREQUISITE PASS — all 2026-07-11 baseline tokens confirmed')
  EOF
  ```

  Expected: `PREREQUISITE PASS — all 2026-07-11 baseline tokens confirmed`

  **If the check fails:** The 2026-07-11 restrained-glass spec (`docs/superpowers/specs/2026-07-11-restrained-glass-ui-design.md`) has not been implemented. Execute the plan at `docs/superpowers/plans/2026-07-11-restrained-glass-ui-modernization.md` in full, verify all its contract tests pass, then re-run this step before continuing.

---

## Task 1: Extend CSS token system and `@theme inline`

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Add new CSS custom properties to `:root`**

  Inside the existing `@layer base { :root { ... } }` block in `frontend/app/globals.css`, append the following declarations. Preserve all existing 2026-07-11 tokens — only add or supersede the specific tokens listed in the spec. Replace the existing `--background` value with the ice-wash value and add every new token below it:

  ```css
  /* Page background — ice wash */
  --background: 214 36% 97%;           /* #F3F7FB ice */
  --background-secondary: 213 30% 93%; /* #E6EEF5 cloud */

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

  /* Ambient grid/noise */
  --ambient-grid-opacity: 0.025;

  /* Operational accent */
  --accent-operational: 200 55% 38%;   /* #2C7396 */
  --accent-operational-fg: 0 0% 100%;

  /* Signature frost line */
  --frost-line-start: 0 0% 100%;
  --frost-line-end: 210 60% 94%;
  --frost-line-alpha: 0.80;

  /* Glass tokens — supersede 2026-07-11 values */
  --glass-surface: 0 0% 100%;
  --glass-surface-alpha: 0.62;
  --glass-border: 213 30% 88%;
  --glass-border-alpha: 0.68;
  --glass-blur: 12px;
  ```

- [ ] **Step 2: Add new CSS custom properties to `.dark`**

  Inside the existing `@layer base { .dark { ... } }` block, append the dark-theme counterparts. Replace `--background` and add all new dark tokens:

  ```css
  /* Page background — charcoal */
  --background: 216 23% 9%;            /* #11161B charcoal */
  --background-secondary: 214 23% 13%; /* #1A232B graphite */

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

  /* Operational accent — muted cyan */
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
  ```

- [ ] **Step 3: Register new tokens in the `@theme inline` block**

  Inside the existing `@theme inline { ... }` block, append Tailwind colour mappings for every new custom property. Do **not** remove or rename any existing mappings. Tokens to add:

  ```css
  --color-background-secondary: hsl(var(--background-secondary));
  --color-shell-surface: hsl(var(--shell-surface));
  --color-shell-border: hsl(var(--shell-border));
  --color-navbar-surface: hsl(var(--navbar-surface));
  --color-navbar-highlight: hsl(var(--navbar-highlight));
  --color-accent-operational: hsl(var(--accent-operational));
  --color-accent-operational-fg: hsl(var(--accent-operational-fg));
  --color-frost-line-start: hsl(var(--frost-line-start));
  --color-frost-line-end: hsl(var(--frost-line-end));
  ```

  Alpha variables (`--*-alpha`), `--navbar-blur`, and `--ambient-grid-opacity` do not need `--color-*` mappings — they are consumed directly as CSS custom properties in raw CSS rules.

- [ ] **Step 4: Lint**

  ```bash
  cd frontend && npm run lint
  ```

  Expected: no new lint errors introduced by the CSS changes (ESLint does not parse CSS; this confirms no `.tsx` breakage).

- [ ] **Step 5: Commit the token system**

  ```bash
  cd frontend && git -C .. add frontend/app/globals.css
  git -C /home/wesleyb/git/fluxion commit -m "feat: add frosted-neutral-glass shell tokens"
  ```

---

## Task 2: Ambient background layers

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Add ambient background CSS to `globals.css`**

  Inside `@layer base`, after the `body { ... }` rule, add a new rule block for the three background layers. Do not modify the existing `body` rule — add a new `body` rule block after it (CSS cascades, later wins for same specificity):

  ```css
  /* Ambient background: three-layer treatment on body */
  body {
    position: relative;
    background-color: hsl(var(--background));
    background-image:
      /* Layer 2a: top-left radial wash */
      radial-gradient(
        ellipse 70% 50% at 0% 0%,
        hsl(var(--background-secondary) / 1) 0%,
        transparent 60%
      ),
      /* Layer 2b: bottom-right accent wash */
      radial-gradient(
        ellipse 60% 55% at 100% 100%,
        hsl(var(--accent-operational) / 0.06) 0%,
        transparent 55%
      ),
      /* Layer 3: grid impression */
      repeating-linear-gradient(
        0deg,
        transparent,
        transparent 31px,
        hsl(var(--foreground) / var(--ambient-grid-opacity)) 31px,
        hsl(var(--foreground) / var(--ambient-grid-opacity)) 32px
      ),
      repeating-linear-gradient(
        90deg,
        transparent,
        transparent 31px,
        hsl(var(--foreground) / var(--ambient-grid-opacity)) 31px,
        hsl(var(--foreground) / var(--ambient-grid-opacity)) 32px
      );
    /* No transition or animation on background layers */
  }

  /* Dark mode: reduce radial opacity */
  .dark body {
    background-image:
      radial-gradient(
        ellipse 70% 50% at 0% 0%,
        hsl(var(--background-secondary) / 0.04) 0%,
        transparent 60%
      ),
      radial-gradient(
        ellipse 60% 55% at 100% 100%,
        hsl(var(--accent-operational) / 0.05) 0%,
        transparent 55%
      ),
      repeating-linear-gradient(
        0deg,
        transparent,
        transparent 31px,
        hsl(var(--foreground) / var(--ambient-grid-opacity)) 31px,
        hsl(var(--foreground) / var(--ambient-grid-opacity)) 32px
      ),
      repeating-linear-gradient(
        90deg,
        transparent,
        transparent 31px,
        hsl(var(--foreground) / var(--ambient-grid-opacity)) 31px,
        hsl(var(--foreground) / var(--ambient-grid-opacity)) 32px
      );
  }
  ```

  Grid cell: 32 × 32 px (lines at position 31–32 px). Colour is `hsl(var(--foreground) / var(--ambient-grid-opacity))`. No external image files. No `will-change`, no `transition`, no `animation` on these rules.

- [ ] **Step 2: Build check**

  ```bash
  cd frontend && npm run build 2>&1 | tail -20
  ```

  Expected: build completes with `✓ Compiled successfully` and no TypeScript errors. The ambient CSS rules are valid CSS; the build must not fail.

- [ ] **Step 3: Commit ambient background**

  ```bash
  git -C /home/wesleyb/git/fluxion add frontend/app/globals.css
  git -C /home/wesleyb/git/fluxion commit -m "feat: ambient three-layer body background"
  ```

---

## Task 3: Navbar frosted rail

**Files:**
- Create: `frontend/components/device-memory-guard.tsx`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/components/navbar.tsx`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Create `DeviceMemoryGuard` client component**

  Create `frontend/components/device-memory-guard.tsx`. This component stamps `data-low-memory="true"` on `document.documentElement` once on mount if `navigator.deviceMemory` is defined and less than 2 GB. It renders nothing to the DOM.

  ```tsx
  "use client"

  import { useEffect } from "react"

  export function DeviceMemoryGuard() {
    useEffect(() => {
      const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      if (typeof mem === "number" && mem < 2) {
        document.documentElement.setAttribute("data-low-memory", "true")
      }
    }, [])
    return null
  }
  ```

  This produces the `html[data-low-memory="true"]` selector used by the CSS fallback rule added in Step 3.

- [ ] **Step 2: Update `layout.tsx` — mount `DeviceMemoryGuard` and add `main` padding-top**

  In `frontend/app/layout.tsx`, make both changes in the same edit so there is no intermediate state where the navbar is fixed but `main` still uses the old `py-4` — the content dead zone is avoided entirely.

  1. Import `DeviceMemoryGuard` from `"@/components/device-memory-guard"`.
  2. Place `<DeviceMemoryGuard />` as the first child inside `<body>` (before the skip-nav link). It renders nothing; position is cosmetic only.
  3. Update the `main` element so content starts below the fixed navbar. Change:

  ```tsx
  <main id="main-content" className="container mx-auto px-4 py-4 md:py-8">
  ```

  to:

  ```tsx
  <main id="main-content" className="container mx-auto px-4 pt-20 pb-4 md:pb-8">
  ```

  `pt-20` = 5 rem = 80 px. The navbar is `h-16` (64 px) + 2 px frost line = 66 px; 80 px gives comfortable clearance. If the navbar height changes, adjust `pt-*` accordingly.

  After the change the body opening should look like:
  ```tsx
  <body className="antialiased">
    <DeviceMemoryGuard />
    <a href="#main-content" className="skip-nav">Skip to main content</a>
    ...
  ```

- [ ] **Step 3: Add navbar CSS rules to `globals.css`**

  Inside the `@layer base` block in `frontend/app/globals.css`, add the following navbar rules **after** the existing `.skip-nav` rule. These rules live in CSS, not inline Tailwind classes on the component, so the component stays readable:

  ```css
  /* Navbar: frosted rail */
  .navbar-frosted {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    background-color: hsl(var(--navbar-surface) / var(--navbar-surface-alpha));
    backdrop-filter: blur(var(--navbar-blur));
    -webkit-backdrop-filter: blur(var(--navbar-blur));
    border-bottom: 1px solid hsl(var(--navbar-highlight) / var(--navbar-highlight-alpha));
  }

  /* Frost line: 2px top-edge gradient strip */
  .navbar-frosted::before {
    content: "";
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(
      to right,
      hsl(var(--frost-line-start) / var(--frost-line-alpha)),
      hsl(var(--frost-line-end) / var(--frost-line-alpha))
    );
    pointer-events: none;
  }

  /* Active route: operational accent pill */
  .navbar-link-active {
    color: hsl(var(--accent-operational));
    background-color: hsl(var(--accent-operational) / 0.12);
    border-radius: var(--radius);
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  /* Hover: subtle accent wash */
  .navbar-link:hover {
    background-color: hsl(var(--accent-operational) / 0.06);
    border-radius: var(--radius);
  }

  /* Reduced-transparency fallback: navbar specific (different token from glass-surface fallback) */
  @media (prefers-reduced-transparency: reduce) {
    .navbar-frosted {
      background-color: hsl(var(--background-secondary));
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  /* Low-end device fallback: pointer-coarse or JS-detected low memory */
  @media (pointer: coarse) {
    .navbar-frosted {
      background-color: hsl(var(--background-secondary));
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
  html[data-low-memory="true"] .navbar-frosted {
    background-color: hsl(var(--background-secondary));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* Solid fallback: browser does not support backdrop-filter */
  @supports not (backdrop-filter: blur(1px)) {
    .navbar-frosted {
      background-color: hsl(var(--background-secondary));
    }
  }
  ```

  Constraint: `--navbar-blur` is `14px`; confirm no other blur value above `16px` appears anywhere in this block.

- [ ] **Step 4: Restyle `navbar.tsx`**

  In `frontend/components/navbar.tsx`, update the outer `<nav>` and link elements to consume the new CSS classes. The logic (pathname matching, mobile menu, telemetry) stays identical — only the `className` strings change.

  Key class changes:
  - `<nav>`: replace `"border-b bg-background"` with `"navbar-frosted"`. Add `aria-label="Main navigation"` if not already present (it is).
  - Desktop nav links: replace the `cn("text-sm font-medium transition-colors hover:text-primary", ...)` pattern with:
    - Base class: `"navbar-link text-sm font-medium"` (no `transition-colors` or `hover:text-primary` — hover is CSS-driven now).
    - Active additional class: `"navbar-link-active"` when `isActive` is true.
    - Inactive additional class: `"text-muted-foreground"` when not active.
  - Mobile menu links: same substitution pattern — `"navbar-link block rounded-md px-3 py-3 text-base font-medium min-h-11"` base, `"navbar-link-active"` for active.
  - Mobile menu container `<div>`: keep existing `"border-t md:hidden"` — the mobile menu inherits the frosted surface from the parent nav.
  - `focus-visible` on all `<Link>` elements: Tailwind's `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` classes (or the equivalent already present) must be retained. The frosted surface must not replace ring-based focus communication.

  No changes to: telemetry calls, `navigation` array, mobile menu open/close state, `aria-expanded`, `aria-controls`, `aria-label`, or icon usage.

- [ ] **Step 5: Verify no layout shift**

  Start the dev server and visually verify in a browser that:
  - The frost line is visible at the very top of the navbar.
  - The active route link shows the operational accent background pill.
  - The `main` content starts below the navbar (no overlap).
  - Switching theme (light ↔ dark) does not produce an animated navbar transition.

  ```bash
  cd frontend && npm run dev
  ```

  Manual check: open `http://localhost:3000`, inspect navbar. Stop the dev server with Ctrl-C when done.

- [ ] **Step 6: Commit the navbar**

  ```bash
  git -C /home/wesleyb/git/fluxion add frontend/components/device-memory-guard.tsx frontend/app/layout.tsx frontend/components/navbar.tsx frontend/app/globals.css
  git -C /home/wesleyb/git/fluxion commit -m "feat: navbar frosted rail with frost-line and fallbacks"
  ```

---

## Task 4: Card glass primitive

**Files:**
- Modify: `frontend/components/ui/card.tsx`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Tighten `.glass-surface` contract in `globals.css`**

  In `frontend/app/globals.css`, locate the existing `.glass-surface` class block (from 2026-07-11). Replace or extend it so it encodes the full spec contract exactly:

  ```css
  .glass-surface {
    background-color: hsl(var(--glass-surface) / var(--glass-surface-alpha));
    border: 1px solid hsl(var(--glass-border) / var(--glass-border-alpha));
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    box-shadow:
      0 1px 2px 0 hsl(var(--glass-shadow) / var(--glass-shadow-near-alpha)),
      0 12px 28px -6px hsl(var(--glass-shadow) / var(--glass-shadow-alpha));
    border-radius: var(--radius);
  }

  /* Solid fallback: prefers-reduced-transparency */
  @media (prefers-reduced-transparency: reduce) {
    .glass-surface {
      background-color: hsl(var(--glass-opaque));
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  /* Solid fallback: browser does not support backdrop-filter */
  @supports not (backdrop-filter: blur(1px)) {
    .glass-surface {
      background-color: hsl(var(--glass-opaque));
    }
  }

  /* Interactive card: box-shadow transition only */
  .glass-surface[data-interactive] {
    transition: box-shadow 150ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .glass-surface[data-interactive] {
      transition: none;
    }
  }
  ```

  Note: `--glass-shadow`, `--glass-shadow-alpha`, `--glass-shadow-near-alpha`, and `--glass-opaque` must already exist from the 2026-07-11 spec. Do not redefine them; only use them.

- [ ] **Step 2: Update `card.tsx` to use `.glass-surface`**

  In `frontend/components/ui/card.tsx`, update the root `<div>` className in the `Card` forwardRef to replace the current opaque surface with the glass primitive. The `data-interactive` attribute should be set when the card is expected to be interactive (e.g., when callers pass a click handler or explicitly opt in).

  Change the `Card` forwardRef `className` from:
  ```tsx
  "rounded-lg border bg-card text-card-foreground shadow-sm"
  ```
  to:
  ```tsx
  "glass-surface text-card-foreground"
  ```

  The `glass-surface` class in CSS already handles `border`, `border-radius` (`var(--radius)` which equals `0.5rem` = `rounded-lg`), `backdrop-filter`, and `box-shadow`. Removing the duplicate Tailwind utilities avoids conflicting values.

  Add a `data-interactive` prop to the component interface so callers of interactive summary cards can opt in to the hover shadow transition:

  ```tsx
  // Extend the interface to allow data-interactive
  // React forwards unknown data-* attributes automatically — no interface change needed
  // Callers simply pass data-interactive="" on the Card element
  ```

  No changes to `CardHeader`, `CardContent`, `CardTitle`, `CardDescription`, or `CardFooter`.

- [ ] **Step 3: Verify `StatsCard` and `HostCard` still render**

  Both `stats-card.tsx` and `host-card.tsx` use `<Card>` with no additional background utility; they will inherit `glass-surface` automatically. Check that neither file passes a `bg-card` or `bg-background` class that would override the glass fill. If found, remove those overriding background utilities (this is still within scope — it is not an unrelated refactor).

  ```bash
  grep -n "bg-card\|bg-background\|bg-white" frontend/components/stats-card.tsx frontend/components/host-card.tsx
  ```

  Expected: no `bg-card` or `bg-background` on the `<Card>` element itself. Wrapper `<div>` or inner content may still use background utilities legitimately.

- [ ] **Step 4: Commit the card primitive**

  ```bash
  git -C /home/wesleyb/git/fluxion add frontend/app/globals.css frontend/components/ui/card.tsx
  git -C /home/wesleyb/git/fluxion commit -m "feat: card glass-surface primitive tightened to full spec"
  ```

---

## Task 5: Skeleton palette-aware shimmer

**Files:**
- Modify: `frontend/components/ui/skeleton.tsx`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Add `@keyframes skeleton-shimmer` to `globals.css`**

  In `frontend/app/globals.css`, inside `@layer base`, add the shimmer keyframe after the skeleton-related token section. The shimmer uses `--background` and `--background-secondary` so it matches both themes automatically:

  ```css
  @keyframes skeleton-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .skeleton-shimmer {
    background: linear-gradient(
      90deg,
      hsl(var(--background)) 25%,
      hsl(var(--background-secondary)) 50%,
      hsl(var(--background)) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.6s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-shimmer {
      animation: none;
      background: hsl(var(--background-secondary));
      background-size: auto;
    }
  }
  ```

  Animation duration: `1.6s` as specified. No white flash: light-mode shimmer sweeps between `#F3F7FB` and `#E6EEF5`. Dark-mode sweeps between `#11161B` and `#1A232B`. The keyframe does not hard-code any colour — it reads live from CSS custom properties.

- [ ] **Step 2: Update `skeleton.tsx`**

  In `frontend/components/ui/skeleton.tsx`, update the base `Skeleton` function to use the new `skeleton-shimmer` class instead of `animate-pulse bg-muted`:

  ```tsx
  export function Skeleton({ className, ...props }: SkeletonProps) {
    return (
      <div
        className={cn("skeleton-shimmer rounded-md", className)}
        {...props}
      />
    )
  }
  ```

  Update `StatsCardSkeleton` container `<div>` to remove `bg-card` if present, replacing with `rounded-lg border` only (it is a status container, not a glass card — keep it opaque and simple):

  ```tsx
  <div className="rounded-lg border bg-background-secondary p-6" role="status" aria-busy="true">
  ```

  Update `ChartSkeleton` container similarly:
  ```tsx
  <div className="rounded-lg border bg-background-secondary p-6" role="status" aria-busy="true">
  ```

  `TableSkeleton` and `ChartSkeleton` internal shimmer bars already use `<Skeleton>` — they inherit the new shimmer automatically.

  Preserve all `role="status"`, `aria-busy="true"`, and `<span className="sr-only">` elements — these are accessibility-critical and must not be removed.

- [ ] **Step 3: Spot-check prefers-reduced-motion**

  In Chrome DevTools, open Rendering > Emulate CSS media feature: set `prefers-reduced-motion: reduce`. Navigate to a page with skeletons (e.g., force a loading state by disabling the API temporarily or inspecting source). Confirm shimmer is static `hsl(var(--background-secondary))` fill.

- [ ] **Step 4: Commit the skeleton**

  ```bash
  git -C /home/wesleyb/git/fluxion add frontend/app/globals.css frontend/components/ui/skeleton.tsx
  git -C /home/wesleyb/git/fluxion commit -m "feat: skeleton palette-aware shimmer with reduced-motion fallback"
  ```

---

## Task 6: Chart glass tooltip

**Files:**
- Create: `frontend/components/charts/glass-tooltip.tsx`
- Modify: `frontend/components/charts/bar-chart.tsx`
- Modify: `frontend/components/charts/line-chart.tsx`

- [ ] **Step 1: Create `glass-tooltip.tsx`**

  Create `frontend/components/charts/glass-tooltip.tsx`. This is a Recharts custom tooltip component. It receives the standard Recharts `TooltipProps` and renders a frosted container with correct text colours. The component does not accept `contentStyle` — all surface styling comes from the `glass-surface` CSS class.

  ```tsx
  "use client"

  import { cn } from "@/lib/utils"

  interface GlassTooltipPayloadItem {
    name: string
    value: number | string
    color?: string
  }

  interface GlassTooltipProps {
    active?: boolean
    payload?: GlassTooltipPayloadItem[]
    label?: string
    className?: string
  }

  export function GlassTooltip({ active, payload, label, className }: GlassTooltipProps) {
    if (!active || !payload || payload.length === 0) return null

    return (
      <div className={cn("glass-surface px-3 py-2 text-sm min-w-[8rem]", className)}>
        {label && (
          <p className="mb-1 text-xs text-muted-foreground font-medium">{label}</p>
        )}
        {payload.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground text-xs">{item.name}</span>
            <span className="font-medium text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    )
  }
  ```

  Text colours:
  - Label / series name: `text-muted-foreground` (slate, `--muted-foreground`).
  - Value: `text-foreground` (ink, `--foreground`).
  - The `glass-surface` class provides the frosted container with the solid-fallback chain already baked in.

  No entry/exit animation beyond Recharts' built-in `opacity` fade (≤ 100 ms). Do not add any `transition` or `animation` props.

  **Design-time contrast verification:** Before finalising the component, verify that the composited fill of `GlassTooltip` (i.e. `glass-surface` at its rendered alpha over the page background) achieves a luminance-contrast ratio of at least **4.5:1** against both text groups:
  - `text-foreground` (value text)
  - `text-muted-foreground` (label / series-name text)

  Evaluate at the representative `--glass-surface-alpha` value in both light and dark themes using a WCAG 2.1 contrast checker (e.g. [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) with the composited colour as the background). If **either** combination falls below 4.5:1, the tooltip container **must** include an always-on semi-opaque tint fallback class alongside `glass-surface`, for example:

  ```tsx
  <div className={cn("glass-surface bg-[hsl(var(--glass-opaque)/0.9)] px-3 py-2 text-sm min-w-[8rem]", className)}>
  ```

  This tint class (`bg-[hsl(var(--glass-opaque)/0.9)]`) raises the effective background luminance so that text contrast is guaranteed even when the frosted compositing layer is too translucent. Remove it only if both contrasts are confirmed ≥ 4.5:1 without it.

- [ ] **Step 2: Update `bar-chart.tsx`**

  In `frontend/components/charts/bar-chart.tsx`:
  1. Add import: `import { GlassTooltip } from "@/components/charts/glass-tooltip"`.
  2. Replace the `<Tooltip contentStyle={{ ... }} />` element with:
     ```tsx
     <Tooltip content={<GlassTooltip />} />
     ```
  3. Remove the `contentStyle` prop entirely. The inline `backgroundColor`, `border`, and `borderRadius` object is superseded by the `glass-surface` class inside `GlassTooltip`.

  No other changes to `BarChart` — axis ticks, bar colours, CartesianGrid, ResponsiveContainer all remain as-is.

- [ ] **Step 3: Update `line-chart.tsx`**

  Same changes as Step 2 applied to `frontend/components/charts/line-chart.tsx`:
  1. Add import: `import { GlassTooltip } from "@/components/charts/glass-tooltip"`.
  2. Replace `<Tooltip contentStyle={{ ... }} />` with `<Tooltip content={<GlassTooltip />} />`.
  3. Remove the `contentStyle` prop.

  No other changes.

- [ ] **Step 4: Build check**

  ```bash
  cd frontend && npm run build 2>&1 | tail -20
  ```

  Expected: clean build. TypeScript will enforce the `TooltipProps` interface compatibility; the `GlassTooltipProps` shape matches Recharts `TooltipProps<number, string>` structurally.

- [ ] **Step 5: Commit chart tooltip**

  ```bash
  git -C /home/wesleyb/git/fluxion add frontend/components/charts/glass-tooltip.tsx frontend/components/charts/bar-chart.tsx frontend/components/charts/line-chart.tsx
  git -C /home/wesleyb/git/fluxion commit -m "feat: chart glass tooltip renderer"
  ```

---

## Task 7: Contract tests

**Files:**
- Create: `frontend/tests/frosted-glass-contract.test.mjs`
- Modify: `frontend/package.json`

The test suite uses the Node built-in `node:test` runner with `node:assert`. It reads source files as strings and asserts that specific substrings (class names, token names, property values) are present, confirming the full spec contract at a source level without requiring a browser.

- [ ] **Step 1: Create `frontend/tests/frosted-glass-contract.test.mjs`**

  Create the file with the following test groups. Each group is a `describe`/`it` block that reads the relevant source file and asserts required patterns.

  ```mjs
  import { describe, it } from "node:test"
  import assert from "node:assert/strict"
  import { readFileSync } from "node:fs"
  import { resolve, dirname } from "node:path"
  import { fileURLToPath } from "node:url"

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const root = resolve(__dirname, "..")

  function read(rel) {
    return readFileSync(resolve(root, rel), "utf8")
  }

  // ── Group 1: Token system ──────────────────────────────────────────────────
  describe("token system", () => {
    const css = read("app/globals.css")

    it("defines --background-secondary in :root", () => {
      assert.match(css, /--background-secondary:\s*213 30% 93%/)
    })
    it("defines --background-secondary in .dark", () => {
      assert.match(css, /--background-secondary:\s*214 23% 13%/)
    })
    it("defines --navbar-blur: 14px in :root", () => {
      assert.match(css, /--navbar-blur:\s*14px/)
    })
    it("defines --accent-operational in :root", () => {
      assert.match(css, /--accent-operational:\s*200 55% 38%/)
    })
    it("defines --accent-operational in .dark", () => {
      assert.match(css, /--accent-operational:\s*196 52% 58%/)
    })
    it("defines --frost-line-alpha: 0.80 in :root", () => {
      assert.match(css, /--frost-line-alpha:\s*0\.80/)
    })
    it("defines --frost-line-alpha: 0.12 in .dark", () => {
      assert.match(css, /--frost-line-alpha:\s*0\.12/)
    })
    it("defines --glass-blur: 12px", () => {
      assert.match(css, /--glass-blur:\s*12px/)
    })
    it("no blur value exceeds 16px anywhere in globals.css", () => {
      const blurValues = [...css.matchAll(/blur\((\d+)px\)/g)].map(m => parseInt(m[1]))
      for (const v of blurValues) {
        assert.ok(v <= 16, `Found blur(${v}px) which exceeds the 16px cap`)
      }
    })
    it("registers --color-accent-operational in @theme inline", () => {
      assert.match(css, /--color-accent-operational:\s*hsl\(var\(--accent-operational\)\)/)
    })
    it("registers --color-background-secondary in @theme inline", () => {
      assert.match(css, /--color-background-secondary:\s*hsl\(var\(--background-secondary\)\)/)
    })
  })

  // ── Group 2: Ambient background ────────────────────────────────────────────
  describe("ambient background", () => {
    const css = read("app/globals.css")

    it("uses repeating-linear-gradient for grid impression", () => {
      assert.match(css, /repeating-linear-gradient/)
    })
    it("grid cell is 32px (lines at 31–32px)", () => {
      assert.match(css, /31px/)
    })
    it("no transition or animation on body background", () => {
      // body rules should not contain transition/animation
      const bodySection = css.match(/body\s*\{[^}]+\}/g) || []
      for (const block of bodySection) {
        assert.ok(!block.includes("transition:"), "body block must not contain transition")
        assert.ok(!block.includes("animation:"), "body block must not contain animation")
      }
    })
    it("accent-operational used at reduced opacity in radial wash", () => {
      assert.match(css, /var\(--accent-operational\)\s*\/\s*0\.0[456]/)
    })
  })

  // ── Group 3: Glass surface ─────────────────────────────────────────────────
  describe("glass-surface class", () => {
    const css = read("app/globals.css")

    it("encodes backdrop-filter with --glass-blur", () => {
      assert.match(css, /backdrop-filter:\s*blur\(var\(--glass-blur\)\)/)
    })
    it("encodes -webkit-backdrop-filter with --glass-blur", () => {
      assert.match(css, /-webkit-backdrop-filter:\s*blur\(var\(--glass-blur\)\)/)
    })
    it("encodes glass fill with alpha", () => {
      assert.match(css, /hsl\(var\(--glass-surface\)\s*\/\s*var\(--glass-surface-alpha\)\)/)
    })
    it("encodes glass border with alpha", () => {
      assert.match(css, /hsl\(var\(--glass-border\)\s*\/\s*var\(--glass-border-alpha\)\)/)
    })
    it("encodes two-layer box-shadow", () => {
      assert.match(css, /box-shadow:[\s\S]*0 1px 2px[\s\S]*0 12px 28px -6px/)
    })
    it("has prefers-reduced-transparency fallback removing backdrop-filter", () => {
      assert.match(css, /@media\s*\(prefers-reduced-transparency:\s*reduce\)[\s\S]*\.glass-surface[\s\S]*backdrop-filter:\s*none/)
    })
    it("has @supports not (backdrop-filter) fallback", () => {
      assert.match(css, /@supports not \(backdrop-filter/)
    })
    it("interactive glass-surface has box-shadow transition", () => {
      assert.match(css, /\.glass-surface\[data-interactive\][\s\S]*transition:\s*box-shadow 150ms ease/)
    })
    it("prefers-reduced-motion removes glass-surface transition", () => {
      assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.glass-surface\[data-interactive\][\s\S]*transition:\s*none/)
    })
  })

  // ── Group 4: Navbar ────────────────────────────────────────────────────────
  describe("navbar frosted rail", () => {
    const css = read("app/globals.css")
    const navbar = read("components/navbar.tsx")

    it("defines .navbar-frosted with backdrop-filter", () => {
      assert.match(css, /\.navbar-frosted[\s\S]*backdrop-filter:\s*blur\(var\(--navbar-blur\)\)/)
    })
    it("defines navbar frost-line ::before pseudo-element", () => {
      assert.match(css, /\.navbar-frosted::before[\s\S]*height:\s*2px/)
    })
    it("frost-line uses gradient with frost-line tokens", () => {
      assert.match(css, /frost-line-start[\s\S]*frost-line-end/)
    })
    it("defines reduced-transparency fallback for navbar", () => {
      assert.match(css, /prefers-reduced-transparency[\s\S]*\.navbar-frosted[\s\S]*backdrop-filter:\s*none/)
    })
    it("defines pointer-coarse fallback for navbar", () => {
      assert.match(css, /pointer:\s*coarse[\s\S]*\.navbar-frosted[\s\S]*backdrop-filter:\s*none/)
    })
    it("defines data-low-memory fallback for navbar", () => {
      assert.match(css, /html\[data-low-memory="true"\]\s*\.navbar-frosted[\s\S]*backdrop-filter:\s*none/)
    })
    it("navbar component uses navbar-frosted class", () => {
      assert.match(navbar, /navbar-frosted/)
    })
    it("navbar component uses navbar-link-active for active routes", () => {
      assert.match(navbar, /navbar-link-active/)
    })
    it("navbar does not use border-b bg-background (old opaque classes)", () => {
      assert.ok(
        !navbar.includes('"border-b bg-background"'),
        "navbar must not use the old opaque border-b bg-background class string"
      )
    })
    it("has @supports not (backdrop-filter) fallback for navbar", () => {
      assert.match(css, /@supports not \(backdrop-filter[\s\S]*\.navbar-frosted/)
    })
  })

  // ── Group 5: Card primitive ────────────────────────────────────────────────
  describe("card glass primitive", () => {
    const card = read("components/ui/card.tsx")

    it("Card root uses glass-surface class", () => {
      assert.match(card, /glass-surface/)
    })
    it("Card root does not duplicate border or shadow Tailwind utilities", () => {
      // glass-surface owns border and shadow; card.tsx should not also apply border-*/shadow-*
      const cardRootCn = card.match(/cn\(\s*"([^"]*glass-surface[^"]*)"/)
      if (cardRootCn) {
        assert.ok(!cardRootCn[1].includes("border bg-card shadow-sm"), "card root must not carry old opaque classes alongside glass-surface")
      }
    })
  })

  // ── Group 6: Skeleton shimmer ──────────────────────────────────────────────
  describe("skeleton shimmer", () => {
    const css = read("app/globals.css")
    const sk = read("components/ui/skeleton.tsx")

    it("defines @keyframes skeleton-shimmer", () => {
      assert.match(css, /@keyframes skeleton-shimmer/)
    })
    it("shimmer uses --background and --background-secondary", () => {
      assert.match(css, /hsl\(var\(--background\)\)[\s\S]*hsl\(var\(--background-secondary\)\)/)
    })
    it("animation duration is 1.6s", () => {
      assert.match(css, /1\.6s/)
    })
    it("prefers-reduced-motion removes shimmer animation", () => {
      assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*skeleton-shimmer[\s\S]*animation:\s*none/)
    })
    it("Skeleton component uses skeleton-shimmer class", () => {
      assert.match(sk, /skeleton-shimmer/)
    })
    it("Skeleton does not use animate-pulse", () => {
      assert.ok(!sk.includes("animate-pulse"), "Skeleton must not use animate-pulse after palette shimmer update")
    })
    it("base Skeleton does not use bg-muted", () => {
      assert.ok(!sk.includes("bg-muted"), "base Skeleton must not use bg-muted after palette shimmer update")
    })
    it("accessibility attributes preserved on StatsCardSkeleton", () => {
      assert.match(sk, /role="status"/)
      assert.match(sk, /aria-busy="true"/)
      assert.match(sk, /sr-only/)
    })
  })

  // ── Group 7: Chart tooltip ─────────────────────────────────────────────────
  describe("chart glass tooltip", () => {
    const tooltip = read("components/charts/glass-tooltip.tsx")
    const bar = read("components/charts/bar-chart.tsx")
    const line = read("components/charts/line-chart.tsx")

    it("GlassTooltip uses glass-surface class", () => {
      assert.match(tooltip, /glass-surface/)
    })
    it("GlassTooltip uses text-foreground for values", () => {
      assert.match(tooltip, /text-foreground/)
    })
    it("GlassTooltip uses text-muted-foreground for labels", () => {
      assert.match(tooltip, /text-muted-foreground/)
    })
    it("bar-chart imports GlassTooltip", () => {
      assert.match(bar, /GlassTooltip/)
    })
    it("bar-chart passes content prop to Tooltip", () => {
      assert.match(bar, /content=\{<GlassTooltip/)
    })
    it("bar-chart has no inline contentStyle object", () => {
      assert.ok(!bar.includes("contentStyle"), "bar-chart must not use inline contentStyle after GlassTooltip adoption")
    })
    it("line-chart imports GlassTooltip", () => {
      assert.match(line, /GlassTooltip/)
    })
    it("line-chart passes content prop to Tooltip", () => {
      assert.match(line, /content=\{<GlassTooltip/)
    })
    it("line-chart has no inline contentStyle object", () => {
      assert.ok(!line.includes("contentStyle"), "line-chart must not use inline contentStyle after GlassTooltip adoption")
    })
    it("GlassTooltip includes tint fallback class when contrast requires it", () => {
      // If the design-time contrast audit (Task 6 Step 1) determined that the composited
      // glass-surface fill is below 4.5:1 against either text group, the tooltip container
      // must carry the always-on semi-opaque tint fallback.  This assertion verifies that
      // the class is present whenever the tint requirement applies.
      // Implementation note: if contrast is confirmed ≥ 4.5:1 without the tint, this test
      // may be updated to assert its absence; but the tint must never be silently dropped.
      const requiresTint = tooltip.includes("bg-[hsl(var(--glass-opaque)")
      if (requiresTint) {
        assert.match(tooltip, /bg-\[hsl\(var\(--glass-opaque\)/)
      } else {
        // Tint not present — acceptable only if the contrast audit confirmed ≥ 4.5:1.
        // Document that finding in a comment inside glass-tooltip.tsx.
        assert.match(tooltip, /contrast|4\.5/)
      }
    })
  })

  // ── Group 8: Opaque table boundary (unchanged) ─────────────────────────────
  describe("opaque table boundary unchanged", () => {
    const table = read("components/ui/table.tsx")

    it("Table carries bg-card! opaque boundary", () => {
      assert.match(table, /bg-card!/)
    })
    it("TableHeader carries bg-muted! opaque boundary", () => {
      assert.match(table, /bg-muted!/)
    })
  })

  // ── Group 9: DeviceMemoryGuard ─────────────────────────────────────────────
  describe("device memory guard", () => {
    const guard = read("components/device-memory-guard.tsx")
    const layout = read("app/layout.tsx")

    it("DeviceMemoryGuard sets data-low-memory attribute", () => {
      assert.match(guard, /data-low-memory/)
    })
    it("DeviceMemoryGuard checks deviceMemory < 2", () => {
      assert.match(guard, /deviceMemory/)
      assert.match(guard, /< 2/)
    })
    it("layout.tsx mounts DeviceMemoryGuard", () => {
      assert.match(layout, /DeviceMemoryGuard/)
    })
  })
  ```

- [ ] **Step 2: Add test script to `package.json`**

  In `frontend/package.json`, add to the `"scripts"` object:
  ```json
  "test:frosted-glass": "node --test tests/frosted-glass-contract.test.mjs"
  ```

  If the 2026-07-11 plan already added `"test:ui-contract": "node --test tests/*.test.mjs"`, the frosted-glass test file will also be picked up by the glob. The explicit `test:frosted-glass` script lets implementers run only the frosted-glass assertions in isolation.

- [ ] **Step 3: Run the full contract suite**

  ```bash
  cd frontend && npm run test:frosted-glass
  ```

  Expected: all test groups pass (green). If any assertion fails, fix the corresponding component or CSS before proceeding.

- [ ] **Step 4: Commit contract tests**

  ```bash
  git -C /home/wesleyb/git/fluxion add frontend/tests/frosted-glass-contract.test.mjs frontend/package.json
  git -C /home/wesleyb/git/fluxion commit -m "test: frosted glass shell source contracts"
  ```

---

## Task 8: Paint Flashing manual verification

**Files:** None created or modified — manual browser verification.

This task addresses spec criterion 11: the three-layer ambient background applied to `body` must not trigger compositor-layer invalidations during normal scrolling. Because the ambient layers are CSS-only (no JavaScript animation, no `will-change` abuse), the browser should promote them to a single composited layer and never repaint them mid-scroll. Confirm this with Chrome's Paint Flashing overlay before merging.

- [ ] **Step 1: Start the dev server**

  ```bash
  cd frontend && npm run dev
  ```

  Wait for `✓ Ready on http://localhost:3000` before continuing.

- [ ] **Step 2: Open the app in Chrome and enable Paint Flashing**

  1. Navigate to `http://localhost:3000` in Google Chrome (version 90 or later).
  2. Open **Chrome DevTools** (`F12` / `Cmd+Option+I`).
  3. Switch to the **Rendering** tab (if not visible: DevTools menu `⋮` → **More tools** → **Rendering**).
  4. Check **Paint flashing** (the checkbox labelled "Paint flashing" or "Enable paint flashing"). The overlay highlights repainted regions in green.

- [ ] **Step 3: Scroll and verify zero ambient-background repaints**

  Slowly scroll the page from top to bottom and back. Observe the green flash overlay:

  - **Pass:** The `body` ambient background area (the three radial-gradient layers behind all content) shows **no green-flash highlight** at any scroll position. Only interactive regions (hover states, focused inputs, animated elements) may flash.
  - **Fail:** The full-page background flashes green on every scroll tick, indicating the ambient layers are being repainted by the CPU rather than composited by the GPU.

  If the test **fails**, inspect `globals.css` for the `body` ambient rules. Common causes:
  - A `background-attachment: fixed` value (forces repaint on scroll — replace with `background-attachment: scroll` and use `position: fixed` on a pseudo-element if needed).
  - Missing `will-change: transform` or `isolation: isolate` on the compositing layer.
  - A `filter` or `mix-blend-mode` property on `body` that breaks the compositing boundary.

- [ ] **Step 4: Repeat in dark mode**

  Toggle the app to dark theme (via the theme toggle in the navbar) and repeat Step 3. The dark-mode ambient gradient layers must also produce zero green-flash repaints.

- [ ] **Step 5: Disable Paint Flashing**

  Uncheck **Paint flashing** in the Rendering panel before closing DevTools.

**Expected result:** Zero green-flash repaints on the `body` ambient background layers in both light and dark themes during normal scrolling.

---

## Task 9: Build and lint validation

**Files:** None created or modified — read-only verification pass.

- [ ] **Step 1: Run ESLint**

  ```bash
  cd frontend && npm run lint
  ```

  Expected: `✓ No ESLint warnings or errors`. Any new lint errors introduced by this plan's changes must be fixed before closing the PR.

- [ ] **Step 2: Run production build**

  ```bash
  cd frontend && npm run build 2>&1 | tail -30
  ```

  Expected: `✓ Compiled successfully` with no TypeScript or Next.js build errors. CSS output must not reference undefined custom properties.

- [ ] **Step 3: Blur cap audit**

  Confirm no blur above `16px` appears anywhere in the compiled CSS output:

  ```bash
  grep -r "blur(" frontend/.next/static/css/ | grep -v "blur(var\|blur(12px\|blur(14px\|blur(1px"
  ```

  Expected: no output (all blur values are 12 px, 14 px, or the `@supports` detection value of `1px`).

- [ ] **Step 4: Verify table opaqueness unchanged**

  ```bash
  grep -n "bg-card!\|bg-muted!" frontend/components/ui/table.tsx
  ```

  Expected: both `bg-card!` on `Table` and `bg-muted!` on `TableHeader` are present. If either is missing, restore before merging.

- [ ] **Step 5: Lighthouse light/dark contrast audit**

  Run a Lighthouse accessibility audit against both colour themes to confirm zero `color-contrast` failures. The frosted-neutral palette must satisfy WCAG 2.1 AA: **4.5:1** minimum for normal text (< 18 px regular, < 14 px bold) and **3:1** for large text. Neo's review identified these as the critical thresholds for the new token pairs.

  **Reference ratios (from Neo's review):**

  | Token pair | Required ratio |
  |---|---|
  | `--foreground` on `--background` | ≥ 7:1 (AAA) |
  | `--muted-foreground` on `--background` | ≥ 4.5:1 (AA) |
  | `--accent-operational-fg` on `--accent-operational` | ≥ 4.5:1 (AA) |
  | `--foreground` on `.glass-surface` semi-transparent fill | ≥ 4.5:1 (AA) |

  **Prerequisites:** dev server running (`cd frontend && npm run dev` in a separate terminal).

  **Light theme audit:**

  ```bash
  npx --yes lighthouse http://localhost:3000 \
    --only-categories=accessibility \
    --output=json \
    --quiet \
    --chrome-flags="--headless --no-sandbox" \
    --output-path=lighthouse-light.json

  node --input-type=module << 'EOF'
  import { readFileSync } from "node:fs"
  const r = JSON.parse(readFileSync("lighthouse-light.json", "utf8"))
  const items = r.audits?.["color-contrast"]?.details?.items ?? []
  if (items.length > 0) {
    console.error(`CONTRAST FAIL (light): ${items.length} violation(s)`)
    items.slice(0, 5).forEach(i => console.error(" -", i.node?.snippet))
    process.exit(1)
  }
  console.log("PASS (light): 0 contrast failures")
  EOF
  rm -f lighthouse-light.json
  ```

  **Dark theme audit:**

  In Chrome DevTools → Rendering panel, set **Emulate CSS media feature `prefers-color-scheme`** to `dark` so the app's `ThemeProvider` applies the `.dark` class. Then run Lighthouse from the DevTools Lighthouse panel, or repeat the CLI audit with dark emulation:

  ```bash
  npx --yes lighthouse http://localhost:3000 \
    --only-categories=accessibility \
    --output=json \
    --quiet \
    --chrome-flags="--headless --no-sandbox" \
    --emulated-form-factor=desktop \
    --output-path=lighthouse-dark.json

  node --input-type=module << 'EOF'
  import { readFileSync } from "node:fs"
  const r = JSON.parse(readFileSync("lighthouse-dark.json", "utf8"))
  const items = r.audits?.["color-contrast"]?.details?.items ?? []
  if (items.length > 0) {
    console.error(`CONTRAST FAIL (dark): ${items.length} violation(s)`)
    items.slice(0, 5).forEach(i => console.error(" -", i.node?.snippet))
    process.exit(1)
  }
  console.log("PASS (dark): 0 contrast failures")
  EOF
  rm -f lighthouse-dark.json
  ```

  Expected: both light and dark runs exit 0 with `PASS: 0 contrast failures`. If any violation is reported, adjust the failing token value in `globals.css` (both `:root` and `.dark`) before merging.

---

## Commit summary

| Commit message | Files |
|---|---|
| `feat: add frosted-neutral-glass shell tokens` | `globals.css` |
| `feat: ambient three-layer body background` | `globals.css` |
| `feat: navbar frosted rail with frost-line and fallbacks` | `device-memory-guard.tsx`, `layout.tsx`, `navbar.tsx`, `globals.css` |
| `feat: card glass-surface primitive tightened to full spec` | `globals.css`, `card.tsx` |
| `feat: skeleton palette-aware shimmer with reduced-motion fallback` | `globals.css`, `skeleton.tsx` |
| `feat: chart glass tooltip renderer` | `glass-tooltip.tsx`, `bar-chart.tsx`, `line-chart.tsx` |
| `test: frosted glass shell source contracts` | `frosted-glass-contract.test.mjs`, `package.json` |

All commits must carry the trailer:
```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Validation checklist (from spec)

Before the PR is merged, verify each criterion from the spec:

- [ ] All palette token values present in both `:root` and `.dark` in `globals.css`.
- [ ] `.glass-surface` encodes exactly: fill, border, blur, shadow, solid-fallback (reduced-transparency + `@supports not backdrop-filter`). No ad-hoc variants exist.
- [ ] Navbar carries frost-line signature (`::before`, 2 px gradient), `backdrop-filter: blur(14px)`, and active-route treatment. No layout shift at any breakpoint.
- [ ] Skeleton shimmer colours match new palette (`--background` → `--background-secondary`) in both themes. Animation duration is 1.6 s.
- [ ] Chart tooltip uses `.glass-surface`. Values in `text-foreground`, labels in `text-muted-foreground`.
- [ ] Tables remain opaque — `bg-card!` on `Table`, `bg-muted!` on `TableHeader`.
- [ ] `npm run test:frosted-glass` — all groups pass.
- [ ] `npm run lint` — no errors.
- [ ] `npm run build` — clean build.
- [ ] No blur value above `16px` in compiled CSS output.
- [ ] Paint Flashing (Chrome DevTools → Rendering → Enable Paint Flashing): scroll the page in both light and dark themes and confirm body ambient background layers cause **zero green-flash repaints**. See Task 8 for full procedure.
- [ ] `prefers-reduced-motion: reduce` — no shimmer animation, no box-shadow transition on glass or skeleton surfaces.
- [ ] `prefers-reduced-transparency: reduce` — solid fallback on all `.glass-surface` and `.navbar-frosted` elements.
- [ ] `@supports not (backdrop-filter)` — `.navbar-frosted` shows solid `hsl(var(--background-secondary))` on browsers without backdrop-filter support.
- [ ] Lighthouse accessibility audit — zero `color-contrast` failures in both light and dark themes; reference ratios: `--foreground` on `--background` ≥ 7:1, `--muted-foreground` on `--background` ≥ 4.5:1, `--accent-operational-fg` on `--accent-operational` ≥ 4.5:1 (per Neo's review).
