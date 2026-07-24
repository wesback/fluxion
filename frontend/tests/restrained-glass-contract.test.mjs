import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

function read(relPath) {
  return readFileSync(join(root, relPath), "utf8")
}

// ─── tokens and transparency fallback ────────────────────────────────────────
test("tokens and transparency fallback", () => {
  const css = read("app/globals.css")

  // Glass tokens present in :root
  assert.ok(css.includes("--glass-surface"), "missing --glass-surface")
  assert.ok(css.includes("--glass-surface-alpha"), "missing --glass-surface-alpha")
  assert.ok(css.includes("--glass-border"), "missing --glass-border")
  assert.ok(css.includes("--glass-border-alpha"), "missing --glass-border-alpha")
  assert.ok(css.includes("--glass-shadow"), "missing --glass-shadow")
  assert.ok(css.includes("--glass-shadow-near-alpha"), "missing --glass-shadow-near-alpha")
  assert.ok(css.includes("--glass-shadow-alpha"), "missing --glass-shadow-alpha")
  assert.ok(css.includes("--glass-blur"), "missing --glass-blur")
  assert.ok(css.includes("--glass-opaque"), "missing --glass-opaque")
  assert.ok(css.includes("--control-border"), "missing --control-border")
  assert.ok(css.includes("--input-border"), "missing --input-border")
  assert.ok(css.includes("--control-danger"), "missing --control-danger")
  assert.ok(css.includes("--control-danger-hover"), "missing --control-danger-hover")
  assert.ok(css.includes("--control-danger-hover-surface"), "missing --control-danger-hover-surface")
  assert.ok(css.includes("--chart-grid"), "missing --chart-grid")
  assert.ok(css.includes("--chart-axis"), "missing --chart-axis")
  assert.ok(css.includes("--chart-tooltip-foreground"), "missing --chart-tooltip-foreground")
  assert.ok(css.includes("--chart-series-1"), "missing --chart-series-1")
  assert.ok(css.includes("--chart-series-2"), "missing --chart-series-2")
  assert.ok(css.includes("--chart-series-3"), "missing --chart-series-3")
  assert.ok(css.includes("--chart-series-4"), "missing --chart-series-4")
  assert.ok(css.includes("--chart-series-5"), "missing --chart-series-5")
  assert.ok(css.includes("--status-success"), "missing --status-success")
  assert.ok(css.includes("--status-success-surface"), "missing --status-success-surface")
  assert.ok(css.includes("--status-error"), "missing --status-error")
  assert.ok(css.includes("--status-error-surface"), "missing --status-error-surface")
  assert.ok(css.includes("--status-warning"), "missing --status-warning")
  assert.ok(css.includes("--status-warning-surface"), "missing --status-warning-surface")
  assert.ok(css.includes("--trend-positive"), "missing --trend-positive")
  assert.ok(css.includes("--trend-negative"), "missing --trend-negative")

  // Tailwind @theme inline mappings
  assert.ok(css.includes("--color-control-border"), "missing --color-control-border mapping")
  assert.ok(css.includes("--color-input-border"), "missing --color-input-border mapping")
  assert.ok(css.includes("--color-control-danger"), "missing --color-control-danger mapping")
  assert.ok(css.includes("--color-control-danger-hover"), "missing --color-control-danger-hover mapping")
  assert.ok(css.includes("--color-control-danger-hover-surface"), "missing --color-control-danger-hover-surface mapping")
  assert.ok(css.includes("--color-chart-grid"), "missing --color-chart-grid mapping")
  assert.ok(css.includes("--color-chart-axis"), "missing --color-chart-axis mapping")
  assert.ok(css.includes("--color-chart-tooltip-foreground"), "missing --color-chart-tooltip-foreground mapping")
  assert.ok(css.includes("--color-chart-series-1"), "missing --color-chart-series-1 mapping")
  assert.ok(css.includes("--color-chart-series-2"), "missing --color-chart-series-2 mapping")
  assert.ok(css.includes("--color-chart-series-3"), "missing --color-chart-series-3 mapping")
  assert.ok(css.includes("--color-chart-series-4"), "missing --color-chart-series-4 mapping")
  assert.ok(css.includes("--color-chart-series-5"), "missing --color-chart-series-5 mapping")
  assert.ok(css.includes("--color-status-success"), "missing --color-status-success mapping")
  assert.ok(css.includes("--color-status-success-surface"), "missing --color-status-success-surface mapping")
  assert.ok(css.includes("--color-status-error"), "missing --color-status-error mapping")
  assert.ok(css.includes("--color-status-error-surface"), "missing --color-status-error-surface mapping")
  assert.ok(css.includes("--color-status-warning"), "missing --color-status-warning mapping")
  assert.ok(css.includes("--color-status-warning-surface"), "missing --color-status-warning-surface mapping")
  assert.ok(css.includes("--color-trend-positive"), "missing --color-trend-positive mapping")
  assert.ok(css.includes("--color-trend-negative"), "missing --color-trend-negative mapping")

  // .glass-surface class with backdrop-filter
  assert.ok(css.includes(".glass-surface"), "missing .glass-surface class")
  assert.ok(css.includes("backdrop-filter:"), "missing backdrop-filter in .glass-surface")
  assert.ok(css.includes("-webkit-backdrop-filter:"), "missing -webkit-backdrop-filter in .glass-surface")
  // 12px blur maximum — present in the token declaration
  assert.ok(css.includes("12px"), "glass-surface must use blur(12px) maximum")
  // blur applied via CSS variable or literal
  assert.ok(css.includes("blur("), "glass-surface must include a blur()")
  // two-layer shadow
  assert.ok(css.includes("--glass-shadow"), "glass-surface must reference --glass-shadow")

  // ── Exact spec token values (2026-07-24 frosted-neutral supersession) ────
  // :root
  assert.ok(css.includes("--glass-surface-alpha: 0.62"), ":root --glass-surface-alpha must be 0.62")
  assert.ok(css.includes("--glass-border: 213 30% 88%"), ":root --glass-border must be 213 30% 88%")
  assert.ok(css.includes("--glass-border-alpha: 0.68"), ":root --glass-border-alpha must be 0.68")
  assert.ok(css.includes("--glass-shadow: 222 47% 11%"), ":root --glass-shadow must be 222 47% 11%")
  assert.ok(css.includes("--glass-shadow-near-alpha: 0.08"), ":root --glass-shadow-near-alpha must be 0.08")
  assert.ok(css.includes("--glass-shadow-alpha: 0.12"), ":root --glass-shadow-alpha must be 0.12")
  assert.ok(css.includes("--glass-opaque: var(--card)"), "--glass-opaque must be var(--card) in both themes")
  assert.ok(css.includes("--control-border: 0 0% 52%"), ":root --control-border must be 0 0% 52%")
  assert.ok(css.includes("--input-border: 0 0% 52%"), ":root --input-border must be 0 0% 52%")
  // .dark
  assert.ok(css.includes("--glass-surface: 0 0% 100%"), ".dark --glass-surface must be 0 0% 100% (semi-transparent white)")
  assert.ok(css.includes("--glass-surface-alpha: 0.05"), ".dark --glass-surface-alpha must be 0.05")
  assert.ok(css.includes("--glass-border-alpha: 0.10"), ".dark --glass-border-alpha must be 0.10")
  assert.ok(css.includes("--glass-shadow-near-alpha: 0.28"), ".dark --glass-shadow-near-alpha must be 0.28")
  assert.ok(css.includes("--glass-shadow-alpha: 0.32"), ".dark --glass-shadow-alpha must be 0.32")
  assert.ok(css.includes("--control-border: 0 0% 65%"), ".dark --control-border must be 0 0% 65%")
  assert.ok(css.includes("--input-border: 0 0% 65%"), ".dark --input-border must be 0 0% 65%")

  // ── Exact .glass-surface shadow layers ───────────────────────────────────
  assert.ok(
    css.includes("0 1px 2px 0 hsl(var(--glass-shadow) / var(--glass-shadow-near-alpha))"),
    ".glass-surface near shadow must be 0 1px 2px 0 hsl(...)"
  )
  assert.ok(
    css.includes("0 12px 28px -6px hsl(var(--glass-shadow) / var(--glass-shadow-alpha))"),
    ".glass-surface outer shadow must be 0 12px 28px -6px hsl(...)"
  )

  // ── background-color longhand and glass-border token usage ───────────────
  assert.ok(
    css.includes("background-color: hsl(var(--glass-surface)"),
    ".glass-surface must use background-color (not background shorthand)"
  )
  assert.ok(
    css.includes("hsl(var(--glass-border)"),
    ".glass-surface must reference the --glass-border token"
  )

  // ── Reduced-transparency fallback properties ──────────────────────────────
  assert.ok(
    css.includes("background-color: hsl(var(--card))"),
    "reduced-transparency fallback must use background-color: hsl(var(--card))"
  )
  assert.ok(
    css.includes("border-color: hsl(var(--border))"),
    "reduced-transparency fallback must use border-color: hsl(var(--border))"
  )

  // reduced-transparency fallbacks
  assert.ok(
    css.includes('html[data-reduced-transparency="true"]') ||
      css.includes("html[data-reduced-transparency=true]"),
    "missing html[data-reduced-transparency] fallback selector"
  )
  assert.ok(css.includes("html.reduced-transparency"), "missing html.reduced-transparency fallback selector")

  // constrained-rendering media query
  assert.ok(
    css.includes("max-width: 767px") || css.includes("max-width:767px"),
    "missing constrained-rendering 767px boundary"
  )
  assert.ok(css.includes("pointer: coarse"), "missing pointer:coarse constraint")
  assert.ok(css.includes("--glass-opaque"), "missing --glass-opaque usage in constrained rendering")
})

// ─── shared primitive adoption ────────────────────────────────────────────────
test("shared primitive adoption", () => {
  const card = read("components/ui/card.tsx")
  assert.ok(card.includes("glass-surface"), "Card must use glass-surface class")

  const dialog = read("components/ui/dialog.tsx")
  assert.ok(dialog.includes("glass-surface"), "DialogContent must use glass-surface class")
  assert.ok(!dialog.includes("bg-background"), "DialogContent must not use competing bg-background")

  const button = read("components/ui/button.tsx")
  assert.ok(button.includes("border-control-border"), "outline Button must use border-control-border")

  const input = read("components/ui/input.tsx")
  assert.ok(input.includes("border-input-border"), "Input must use border-input-border")
  assert.ok(input.includes("bg-card"), "Input must use opaque bg-card fill")

  const textarea = read("components/ui/textarea.tsx")
  assert.ok(textarea.includes("border-input-border"), "Textarea must use border-input-border")
  assert.ok(textarea.includes("bg-card"), "Textarea must use opaque bg-card fill")

  const select = read("components/ui/select.tsx")
  assert.ok(select.includes("border-input-border"), "Select must use border-input-border")
  assert.ok(select.includes("bg-card"), "Select must use opaque bg-card fill")

  const badge = read("components/ui/badge.tsx")
  assert.ok(badge.includes("bg-status-success-surface"), "Badge success must use bg-status-success-surface")
  assert.ok(badge.includes("text-status-success"), "Badge success must use text-status-success")
  assert.ok(badge.includes("bg-status-error-surface"), "Badge destructive must use bg-status-error-surface")
  assert.ok(badge.includes("text-status-error"), "Badge destructive must use text-status-error")
  assert.ok(badge.includes("bg-status-warning-surface"), "Badge warning/outline must use bg-status-warning-surface")
  assert.ok(badge.includes("text-status-warning"), "Badge warning/outline must use text-status-warning")
  assert.ok(!badge.includes("text-emerald-"), "Badge must not use hard-coded text-emerald-* classes")

  const skeleton = read("components/ui/skeleton.tsx")
  assert.ok(skeleton.includes("skeleton-shimmer"), "Skeleton must use skeleton-shimmer class (non-glass per frosted-neutral shell)")
  assert.ok(skeleton.includes('role="status"'), "skeleton must retain role=status")
  assert.ok(skeleton.includes("aria-busy"), "skeleton must retain aria-busy")
  assert.ok(skeleton.includes("sr-only"), "skeleton must retain sr-only loading text")

  const errorBoundary = read("components/error-boundary.tsx")
  assert.ok(errorBoundary.includes("text-status-error"), "ErrorBoundary must use text-status-error for fallback text and icon")

  const statsCard = read("components/stats-card.tsx")
  assert.ok(statsCard.includes("text-trend-positive"), "StatsCard must use text-trend-positive")
  assert.ok(statsCard.includes("text-trend-negative"), "StatsCard must use text-trend-negative")
})

// ─── opaque table source contract ────────────────────────────────────────────
test("opaque table source contract", () => {
  const table = read("components/ui/table.tsx")

  // The wrapper div must remain exactly responsive overflow
  assert.ok(
    table.includes('"relative w-full overflow-auto"'),
    "Table wrapper must be exactly relative w-full overflow-auto"
  )

  // Suffix-important locked classes
  assert.ok(table.includes("bg-card!"), "Table must use suffix-important bg-card!")
  assert.ok(table.includes("bg-muted!"), "TableHeader/Footer/Row hover must use suffix-important bg-muted!")
  assert.ok(table.includes("bg-accent!"), "TableRow selected must use suffix-important bg-accent!")

  // Sanitizer import
  assert.ok(
    table.includes("withoutTableSurfaceUtilities"),
    "table.tsx must import and use withoutTableSurfaceUtilities"
  )
  assert.ok(
    table.includes("without-table-surface-utilities"),
    "table.tsx must import from without-table-surface-utilities module"
  )
})

// ─── shared chart and navigation ─────────────────────────────────────────────
test("shared chart and navigation", () => {
  const barChart = read("components/charts/bar-chart.tsx")
  const lineChart = read("components/charts/line-chart.tsx")
  const glassTooltip = read("components/charts/glass-tooltip.tsx")

  // Charts must use shared glass tooltip
  assert.ok(
    barChart.includes("GlassTooltip") || barChart.includes("glass-tooltip"),
    "BarChart must use shared GlassTooltip"
  )
  assert.ok(
    lineChart.includes("GlassTooltip") || lineChart.includes("glass-tooltip"),
    "LineChart must use shared GlassTooltip"
  )

  // No inline tooltip surface objects
  assert.ok(!barChart.includes("backgroundColor"), "BarChart must not use inline tooltip backgroundColor")
  assert.ok(!lineChart.includes("backgroundColor"), "LineChart must not use inline tooltip backgroundColor")

  // No stroke-muted
  assert.ok(!barChart.includes("stroke-muted"), "BarChart must not use stroke-muted")
  assert.ok(!lineChart.includes("stroke-muted"), "LineChart must not use stroke-muted")

  // No hash-generated HSL / stringToColor
  assert.ok(!barChart.includes("stringToColor"), "BarChart must not use stringToColor hash function")
  assert.ok(!barChart.includes("colorCache"), "BarChart must not use colorCache")

  // Chart tokens
  assert.ok(barChart.includes("chart-series-"), "BarChart must use chart-series tokens")
  assert.ok(barChart.includes("chart-grid"), "BarChart must use chart-grid token")
  assert.ok(barChart.includes("chart-axis"), "BarChart must use chart-axis token")
  assert.ok(lineChart.includes("chart-series-1"), "LineChart must use chart-series-1 token")
  assert.ok(lineChart.includes("chart-grid"), "LineChart must use chart-grid token")
  assert.ok(lineChart.includes("chart-axis"), "LineChart must use chart-axis token")

  // Glass tooltip component
  assert.ok(glassTooltip.includes("glass-surface"), "GlassTooltip must use glass-surface class")
  assert.ok(glassTooltip.includes("text-foreground"), "GlassTooltip must use text-foreground for values")
  assert.ok(glassTooltip.includes("text-muted-foreground"), "GlassTooltip must use text-muted-foreground for labels")

  // Navbar
  const navbar = read("components/navbar.tsx")
  assert.ok(navbar.includes("navbar-frosted"), "Navbar must use navbar-frosted class")
  assert.ok(!navbar.includes("bg-background"), "Navbar nav element must not use competing bg-background")
  assert.ok(navbar.includes('aria-label'), "Navbar must retain aria-label")
  assert.ok(navbar.includes('aria-current'), "Navbar must retain aria-current")

  // Admin layout
  const adminLayout = read("app/admin/layout.tsx")
  assert.ok(adminLayout.includes("glass-surface"), "Admin nav must use glass-surface class")
  assert.ok(adminLayout.includes('aria-label'), "Admin nav must retain aria-label")
  assert.ok(adminLayout.includes('aria-current'), "Admin nav must retain aria-current")
})

// ─── route adoption ───────────────────────────────────────────────────────────
test("route adoption", () => {
  const pageTsx = read("app/page.tsx")
  // Direct error panels must use glass-surface border-status-error text-status-error
  assert.ok(
    pageTsx.includes("glass-surface") && pageTsx.includes("border-status-error") && pageTsx.includes("text-status-error"),
    "app/page.tsx error panels must use glass-surface border-status-error text-status-error"
  )
  // Must not use bg-destructive/10 or bg-background in error panels
  assert.ok(
    !pageTsx.includes("bg-destructive/10"),
    "app/page.tsx must not use bg-destructive/10 in error panels"
  )

  const hostsPage = read("app/hosts/page.tsx")
  assert.ok(
    hostsPage.includes("glass-surface") && hostsPage.includes("border-status-error") && hostsPage.includes("text-status-error"),
    "app/hosts/page.tsx error panel must use glass-surface border-status-error text-status-error"
  )
  assert.ok(!hostsPage.includes("bg-destructive/10"), "app/hosts/page.tsx must not use bg-destructive/10")

  const hostDetailPage = read("app/hosts/[hostname]/page.tsx")
  assert.ok(
    hostDetailPage.includes("glass-surface") && hostDetailPage.includes("border-status-error") && hostDetailPage.includes("text-status-error"),
    "app/hosts/[hostname]/page.tsx error panels must use glass-surface border-status-error text-status-error"
  )
  assert.ok(!hostDetailPage.includes("bg-destructive/10"), "host detail must not use bg-destructive/10")

  const packagesPage = read("app/packages/page.tsx")
  assert.ok(
    packagesPage.includes("border-status-error") && packagesPage.includes("text-status-error"),
    "app/packages/page.tsx error Card must use border-status-error and text-status-error"
  )

  const apiKeysPage = read("app/admin/api-keys/page.tsx")
  assert.ok(
    apiKeysPage.includes("glass-surface") && apiKeysPage.includes("border-status-error") && apiKeysPage.includes("text-status-error"),
    "api-keys page error panel must use glass-surface border-status-error text-status-error"
  )
  assert.ok(!apiKeysPage.includes("bg-destructive/10"), "api-keys page must not use bg-destructive/10 in error panels")
  // Warning text and icon
  assert.ok(apiKeysPage.includes("text-status-warning"), "api-keys page must use text-status-warning for warning")
  // Destructive ghost delete button
  assert.ok(
    apiKeysPage.includes("text-control-danger") && apiKeysPage.includes("hover:text-control-danger-hover") && apiKeysPage.includes("hover:bg-control-danger-hover-surface"),
    "api-keys delete button must use text-control-danger contract"
  )
  assert.ok(
    !apiKeysPage.includes("text-destructive hover:text-destructive hover:bg-destructive/10"),
    "api-keys delete button must not use legacy destructive classes"
  )

  const webhooksPage = read("app/admin/webhooks/page.tsx")
  assert.ok(
    webhooksPage.includes("glass-surface") && webhooksPage.includes("border-status-error") && webhooksPage.includes("text-status-error"),
    "webhooks page error panel must use glass-surface border-status-error text-status-error"
  )
  assert.ok(!webhooksPage.includes("bg-destructive/10"), "webhooks page must not use bg-destructive/10")
  // URL validation text-status-error
  assert.ok(webhooksPage.includes("text-status-error"), "webhooks URL validation text must use text-status-error")
  // Destructive ghost delete button
  assert.ok(
    webhooksPage.includes("text-control-danger") && webhooksPage.includes("hover:text-control-danger-hover") && webhooksPage.includes("hover:bg-control-danger-hover-surface"),
    "webhooks delete button must use text-control-danger contract"
  )
  assert.ok(
    !webhooksPage.includes("text-destructive hover:text-destructive hover:bg-destructive/10"),
    "webhooks delete button must not use legacy destructive classes"
  )
  // Checkbox border-control-border
  assert.ok(webhooksPage.includes("border-control-border"), "webhooks checkbox must use border-control-border")
  // Event-type button unselected branch border-control-border
  assert.ok(
    webhooksPage.includes("border-control-border"),
    "webhooks event-type button unselected branch must use border-control-border"
  )
})
