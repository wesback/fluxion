import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const css = readFileSync(join(root, "app/globals.css"), "utf8")

function declarationsIn(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(block, `missing CSS block for ${selector}`)

  return Object.fromEntries(
    [...block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
      .map(([, name, value]) => [name, value.trim()])
  )
}

test("coreSemanticTokensUseExactLightAndDarkValues", () => {
  const expected = {
    ":root": {
      "--background": "#F8FAFC",
      "--surface": "#FFFFFF",
      "--surface-elevated": "rgba(255,255,255,0.88)",
      "--surface-opaque": "#FFFFFF",
      "--surface-subtle": "#F1F5F9",
      "--surface-hover": "#EAF2F8",
      "--surface-selected": "rgba(2,132,199,0.10)",
      "--foreground": "#0F172A",
      "--foreground-muted": "#475569",
      "--foreground-subtle": "#52627A",
      "--foreground-disabled": "#94A3B8",
      "--border-subtle": "rgba(15,23,42,0.08)",
      "--border-default": "rgba(71,85,105,0.20)",
      "--border-control": "#64748B",
      "--accent-primary": "#0284C7",
      "--accent-secondary": "#7C3AED",
      "--accent-text": "#0369A1",
      "--accent-secondary-text": "#6D28D9",
      "--action-primary": "#0369A1",
      "--action-primary-hover": "#075985",
      "--on-action-primary": "#FFFFFF",
      "--focus-ring": "#0369A1",
    },
    ".dark": {
      "--background": "#070B14",
      "--surface": "#0F172A",
      "--surface-elevated": "rgba(17,25,40,0.75)",
      "--surface-opaque": "#111928",
      "--surface-subtle": "#111C30",
      "--surface-hover": "#17243A",
      "--surface-selected": "rgba(0,229,255,0.10)",
      "--foreground": "#E6EDF7",
      "--foreground-muted": "#94A3B8",
      "--foreground-subtle": "#A3B1C6",
      "--foreground-disabled": "#64748B",
      "--border-subtle": "rgba(255,255,255,0.08)",
      "--border-default": "rgba(148,163,184,0.22)",
      "--border-control": "#64748B",
      "--accent-primary": "#00E5FF",
      "--accent-secondary": "#7C3AED",
      "--accent-text": "#00E5FF",
      "--accent-secondary-text": "#C4B5FD",
      "--action-primary": "#00E5FF",
      "--action-primary-hover": "#67EFFF",
      "--on-action-primary": "#070B14",
      "--focus-ring": "#00E5FF",
    },
  }

  for (const [selector, tokens] of Object.entries(expected)) {
    const declarations = declarationsIn(selector)
    for (const [name, value] of Object.entries(tokens)) {
      assert.equal(declarations[name], value, `${selector} ${name}`)
    }
  }
})

test("coreTailwindAliasesUseSemanticTokens", () => {
  const aliases = declarationsIn("@theme inline")
  const expected = {
    "--color-card": "var(--surface-opaque)",
    "--color-card-foreground": "var(--foreground)",
    "--color-popover": "var(--surface-elevated)",
    "--color-popover-foreground": "var(--foreground)",
    "--color-muted": "var(--surface-subtle)",
    "--color-muted-foreground": "var(--foreground-muted)",
    "--color-primary": "var(--action-primary)",
    "--color-primary-foreground": "var(--on-action-primary)",
    "--color-accent": "var(--surface-selected)",
    "--color-accent-foreground": "var(--foreground)",
    "--color-destructive": "var(--status-danger)",
    "--color-destructive-foreground": "var(--surface)",
    "--color-input": "var(--border-control)",
    "--color-ring": "var(--focus-ring)",
    "--color-border": "var(--border-default)",
  }

  for (const [name, value] of Object.entries(expected)) {
    assert.equal(aliases[name], value, name)
  }
})

test("statusTrendControlAndChartTokensUseExactValues", () => {
  const expected = {
    ":root": {
      "--status-success": "#047857",
      "--status-success-surface": "#ECFDF5",
      "--status-warning": "#92400E",
      "--status-warning-surface": "#FFFBEB",
      "--status-danger": "#BE123C",
      "--status-danger-surface": "#FFF1F2",
      "--status-info": "#075985",
      "--status-info-surface": "#F0F9FF",
      "--status-unknown": "#475569",
      "--status-unknown-surface": "#F1F5F9",
      "--chart-cyan": "#0284C7",
      "--chart-blue": "#2563EB",
      "--chart-violet": "#7C3AED",
      "--chart-magenta": "#A21CAF",
      "--chart-blue-soft": "#0369A1",
      "--chart-grid": "rgba(71,85,105,0.10)",
      "--chart-axis": "#475569",
      "--chart-tooltip": "#FFFFFF",
      "--chart-tooltip-foreground": "#0F172A",
      "--table-surface": "#FFFFFF",
      "--table-header": "#F1F5F9",
      "--table-row-hover": "#EAF2F8",
      "--overlay-scrim": "rgba(15,23,42,0.32)",
      "--background-accent-primary": "rgba(2,132,199,0.05)",
      "--background-accent-secondary": "rgba(124,58,237,0.05)",
      "--background-grid": "rgba(71,85,105,0.04)",
      "--glow-primary": "rgba(2,132,199,0.08)",
      "--shadow-soft": "0 8px 24px rgba(15,23,42,0.06)",
    },
    ".dark": {
      "--status-success": "#00D68F",
      "--status-success-surface": "rgba(0,214,143,0.12)",
      "--status-warning": "#FFB020",
      "--status-warning-surface": "rgba(255,176,32,0.12)",
      "--status-danger": "#FF5D7A",
      "--status-danger-surface": "rgba(255,93,122,0.12)",
      "--status-info": "#7DD3FC",
      "--status-info-surface": "rgba(125,211,252,0.10)",
      "--status-unknown": "#CBD5E1",
      "--status-unknown-surface": "#1E293B",
      "--chart-cyan": "#00E5FF",
      "--chart-blue": "#60A5FA",
      "--chart-violet": "#A78BFA",
      "--chart-magenta": "#E879F9",
      "--chart-blue-soft": "#7DD3FC",
      "--chart-grid": "rgba(148,163,184,0.12)",
      "--chart-axis": "#94A3B8",
      "--chart-tooltip": "#111928",
      "--chart-tooltip-foreground": "#E6EDF7",
      "--table-surface": "#0F172A",
      "--table-header": "#162137",
      "--table-row-hover": "#1A2940",
      "--overlay-scrim": "rgba(7,11,20,0.72)",
      "--background-accent-primary": "rgba(0,229,255,0.08)",
      "--background-accent-secondary": "rgba(124,58,237,0.09)",
      "--background-grid": "rgba(148,163,184,0.04)",
      "--glow-primary": "rgba(0,229,255,0.12)",
      "--shadow-soft": "0 8px 24px rgba(2,6,23,0.16)",
    },
  }

  for (const [selector, tokens] of Object.entries(expected)) {
    const declarations = declarationsIn(selector)
    for (const [name, value] of Object.entries(tokens)) {
      assert.equal(declarations[name], value, `${selector} ${name}`)
    }
  }
})

test("statusTrendControlAndChartAliasesReferenceSemanticTokens", () => {
  const aliases = declarationsIn("@theme inline")
  const expected = {
    "--color-status-success": "var(--status-success)",
    "--color-status-success-surface": "var(--status-success-surface)",
    "--color-status-warning": "var(--status-warning)",
    "--color-status-warning-surface": "var(--status-warning-surface)",
    "--color-status-danger": "var(--status-danger)",
    "--color-status-danger-surface": "var(--status-danger-surface)",
    "--color-status-info": "var(--status-info)",
    "--color-status-info-surface": "var(--status-info-surface)",
    "--color-status-unknown": "var(--status-unknown)",
    "--color-status-unknown-surface": "var(--status-unknown-surface)",
    "--color-trend-positive": "hsl(var(--trend-positive))",
    "--color-trend-negative": "hsl(var(--trend-negative))",
    "--color-control-border": "hsl(var(--control-border))",
    "--color-input-border": "hsl(var(--input-border))",
    "--color-control-danger": "hsl(var(--control-danger))",
    "--color-control-danger-hover": "hsl(var(--control-danger-hover))",
    "--color-control-danger-hover-surface": "hsl(var(--control-danger-hover-surface))",
    "--color-chart-cyan": "var(--chart-cyan)",
    "--color-chart-blue": "var(--chart-blue)",
    "--color-chart-violet": "var(--chart-violet)",
    "--color-chart-magenta": "var(--chart-magenta)",
    "--color-chart-blue-soft": "var(--chart-blue-soft)",
    "--color-chart-grid": "var(--chart-grid)",
    "--color-chart-axis": "var(--chart-axis)",
    "--color-chart-tooltip": "var(--chart-tooltip)",
    "--color-chart-tooltip-foreground": "var(--chart-tooltip-foreground)",
    "--color-chart-series-1": "hsl(var(--chart-series-1))",
    "--color-chart-series-2": "hsl(var(--chart-series-2))",
    "--color-chart-series-3": "hsl(var(--chart-series-3))",
    "--color-chart-series-4": "hsl(var(--chart-series-4))",
    "--color-chart-series-5": "hsl(var(--chart-series-5))",
  }

  for (const [name, value] of Object.entries(expected)) {
    assert.equal(aliases[name], value, name)
  }
})
