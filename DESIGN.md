---
name: Fluxion
description: A calm, precise visual system for Linux package and host activity.
colors:
  primary-light: "#0284C7"
  primary-dark: "#00E5FF"
  secondary: "#7C3AED"
  action-light: "#0369A1"
  action-dark: "#00E5FF"
  background-light: "#F8FAFC"
  background-dark: "#070B14"
  surface-light: "#FFFFFF"
  surface-dark: "#0F172A"
  foreground-light: "#0F172A"
  foreground-dark: "#E6EDF7"
  muted-light: "#475569"
  muted-dark: "#94A3B8"
  border-light: "rgba(15,23,42,0.08)"
  border-dark: "rgba(255,255,255,0.08)"
  chart-series-1-light: "hsl(196 91% 42%)"
  chart-series-1-dark: "hsl(188 100% 50%)"
  chart-series-2-light: "hsl(217 91% 50%)"
  chart-series-2-dark: "hsl(213 94% 68%)"
  chart-series-3-light: "hsl(262 83% 58%)"
  chart-series-3-dark: "hsl(255 90% 76%)"
  chart-series-4-light: "hsl(292 84% 61%)"
  chart-series-4-dark: "hsl(295 91% 70%)"
  chart-series-5-light: "hsl(198 85% 45%)"
  chart-series-5-dark: "hsl(199 95% 65%)"
  status-success-light: "#047857"
  status-success-dark: "#00D68F"
  status-warning-light: "#92400E"
  status-warning-dark: "#FFB020"
  status-danger-light: "#BE123C"
  status-danger-dark: "#FF5D7A"
typography:
  display:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter Variable, system-ui, sans-serif"
  label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
rounded:
  control: "6px"
  nav-item: "12px"
  card: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "var(--action-primary)"
    textColor: "var(--on-action-primary)"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "var(--background)"
    textColor: "var(--foreground)"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "8px 16px"
  card:
    backgroundColor: "hsl(var(--glass-surface) / var(--glass-surface-alpha))"
    textColor: "var(--foreground)"
    rounded: "{rounded.card}"
  input:
    backgroundColor: "var(--surface-opaque)"
    textColor: "var(--foreground)"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "8px 12px"
---

# Design System: Fluxion

## Overview

**Creative North Star: "The Quiet Operations Console"**

Fluxion pairs a restrained infrastructure-console layout with polished, lightly futuristic materials. Inter Variable, a cool navy-and-white foundation, semantic light and dark themes, and a small family of vivid chart colors keep package activity and host reporting easy to scan without making the interface feel sterile.

Frosted surfaces, subtle ambient color and grid, fine borders, and modest motion add depth without obscuring operational content. A slow, low-amplitude gradient drift is reserved for the health overview and stops when reduced motion is requested. Status describes package-report recency, not host availability. Dashboard metrics and reporting recency come from existing APIs; visual guidance must not imply unsupported uptime, latency, or period-over-period change.

**Key Characteristics:**
- Calm, high-contrast semantic surfaces in both themes.
- Light-touch frost with opaque fallbacks for constrained rendering.
- Data-led color and understated, compact navigation.

## Colors

The palette is organized around a cool, near-neutral foundation; cyan/blue actions and chart series provide focus, with violet and magenta reserved for chart differentiation.

### Primary
- **Operational Cyan:** `primary-light` and `primary-dark` identify the theme-specific accent used for focus, selected navigation, and operational emphasis.
- **Action Blue / Cyan:** `action-light` and `action-dark` identify the primary action and its contrasting foreground.

### Secondary
- **Violet:** `secondary` is a supporting accent, also used in the ambient background and chart series.

### Neutral
- **Cool Background:** `background-light` and `background-dark` ground each theme.
- **Navy and White Surfaces:** `surface-light` and `surface-dark` are the opaque surface anchors; elevated surfaces use semantic glass tokens.
- **Deep and Soft Text:** `foreground-light` / `foreground-dark` carry primary text; `muted-light` / `muted-dark` carry supporting text.
- **Subtle Theme Borders:** `border-light` and `border-dark` separate adjacent surfaces without heavy rules.
- **Chart Series:** `chart-series-1` through `chart-series-5` have light and dark values for data distinction; they are not status indicators.
- **Reporting Status:** success, warning, and danger colors have separate light and dark values. Use semantic status surfaces from the theme rather than deriving new fills.

**The Source-Labeled Status Rule.** A status communicates host package-report recency or a defined UI state; never present it as host availability or uptime.

**The Opaque Escape Hatch Rule.** Frost and blur are progressive enhancement: preserve semantic content and surface contrast with the existing opaque fallbacks when transparency or rendering support is constrained.

## Typography

**Display Font:** Inter Variable (self-hosted; system-ui, sans-serif fallback)
**Body Font:** Inter Variable (self-hosted; system-ui, sans-serif fallback)

**Character:** A single variable sans family keeps dense operational labels and prominent values coherent. Slightly tight headings and tabular numeric values favor fast scanning over display-style contrast.

### Hierarchy
- **Display** (weight 680, 1.5rem, line-height 1.2): Dashboard and section headings.
- **Title** (weight 650, 1.125rem): Overview and card titles.
- **Body** (Inter Variable): Supporting copy and interface text; use the component’s established size rather than introducing a new scale.
- **Label** (weight 600, 0.75rem): Compact status labels and metric descriptors.
- **Metric** (weight 680, 1.5rem, tabular numerals): Dashboard totals and KPI values.

## Layout

The dashboard uses a compact fixed shell above a content canvas. At narrow widths, navigation is a 64px top bar with a collapsible menu. From 768px, the shell adds a 72px icon rail; from 1280px, the rail expands to 240px and reveals labels and reporting context. Search appears from 640px. Main content uses responsive grids, with two-column charts at large widths and a four-column KPI layout at extra-large widths; overview metrics change from four columns to two on narrow screens.

Spacing is drawn from repeated 4px increments: 4px, 8px, 12px, 16px, 20px, and 24px. Keep dense data regions aligned and let section gaps distinguish content groups.

## Elevation & Depth

Depth is a hybrid of semantic tonal layering, fine borders, a soft shadow, and frosted glass. The glass surface uses a subtle near shadow and a broader ambient shadow; interactive glass cards lift slightly and gain a restrained accent glow on hover. Navbar and glass surfaces switch to opaque fills and disable blur under reduced-transparency, coarse-pointer, small-screen, low-memory, or unsupported-browser conditions. Reduced-motion preferences remove or minimize transitions and animation.

### Shadow Vocabulary
- **Soft surface:** `0 8px 24px rgba(15,23,42,0.06)` is the light-theme ambient shadow.
- **Glass near and ambient:** layered theme-specific shadow tokens establish the glass surface; interactive cards replace them with the existing hover shadow and accent glow.

## Shapes

Cards use generously rounded 24px corners; controls use the compact rounded-md form (6px), while navigation items are softly rounded (12px) and reporting status uses a capsule. Thin semantic borders define controls and panels. Clip chart content within its card; avoid hard, decorative geometry that competes with data.

## Components

### Buttons
- **Character:** Compact, clear actions with restrained color change.
- **Shape:** Gently rounded (6px); default height is 40px, with larger and icon size variants available.
- **Primary:** Semantic action fill and contrasting foreground; default padding is 8px 16px.
- **Hover / Focus:** Default hover shifts the action fill; focus-visible uses the shared 2px semantic ring with 2px offset. Disabled controls reduce opacity and do not respond to pointer events.
- **Outline / Ghost / Link:** Outline uses a border and theme background, with selected-surface hover; ghost is transparent until hover; link is underlined on hover.

### Cards / Containers
- **Character:** Quiet frosted panels with readable opaque fallbacks.
- **Corner Style:** 24px for the reusable glass surface.
- **Background:** Theme-aware glass surface over a semantic card surface; opaque card fill under reduced-transparency and constrained-rendering fallbacks.
- **Shadow Strategy:** Use the layered treatment in Elevation & Depth; interactive statistic cards lift 4px on fine-pointer hover.
- **Border:** One subtle semantic border.
- **Internal Padding:** Card header and content use 24px component padding; dashboard statistic cards use 16px.

### Inputs / Fields
- **Style:** Full-width, 40px-high field with a 1px semantic control border, opaque surface, 6px corners, and 12px horizontal padding.
- **Focus:** Shared 2px focus outline with 2px offset; the global search also uses a semantic border and subtle focus halo.
- **Disabled:** Reduced opacity and a not-allowed cursor.

### Navigation
- **Style:** Fixed frosted header with the brand, responsive search, theme selector, and mobile menu. Desktop navigation is a fixed 72px icon rail, expanding to 240px with labels on wide screens.
- **States:** Muted links gain operational accent and a subtle selected surface on hover; the active route retains that semantic selected treatment and exposes `aria-current="page"`.
- **Mobile:** A 64px header opens a full-width opaque navigation panel; the menu supports Escape and returns focus to its trigger when closed.

### Reporting Status
- **Character:** A compact semantic label for host reporting recency.
- **Style:** Capsule with a small current-color status dot, subtle border, and elevated surface.
- **States:** Healthy and attention use their semantic foreground and surface colors; unknown remains neutral. Status meaning and copy come from the reporting-health state, not decorative color alone.

### Bar Charts
- **Character:** Quiet, data-first bars inside the shared glass card.
- **Style:** Five theme-aware cyan, blue, violet, and magenta series gradients; fine dashed grid, semantic axis labels, and a glass tooltip. Bars have gently rounded top corners and no chart animation.
- **Accessibility:** Preserve the chart’s accessible ranked-value list alongside the visualization.

## Do's and Don'ts

### Do:
- **Do** keep colors semantic across light and dark themes; use the existing theme variables for surfaces, text, borders, focus, status, and charts.
- **Do** use tabular numerals for dashboard metrics and preserve the chart’s accessible ranked values.
- **Do** keep host reporting language tied to the existing recency state and API-backed data.
- **Do** retain opaque surface fallbacks and honor reduced-motion preferences.

### Don't:
- **Don't** describe reporting recency as uptime, availability, or host health beyond package reporting.
- **Don't** imply latency, unsupported time comparisons, or operational measurements absent from the APIs.
- **Don't** use chart series colors as a substitute for semantic success, warning, or error states.
- **Don't** add notification-inbox or account-profile UI to this system; those surfaces are deferred.
