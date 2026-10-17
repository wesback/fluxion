import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const css = readFileSync(join(root, "app/globals.css"), "utf8")

function declarationsIn(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(block, `missing CSS block for ${selector}`)

  return parseDeclarations(block[1])
}

function parseDeclarations(body) {
  return Object.fromEntries(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)]
      .map(([, name, value]) => [name, value.trim()])
  )
}

function ruleBodyIn(stylesheet, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const block = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(block, `missing CSS block for ${selector}`)

  return block[1]
}

function atRuleBlock(atRule, fromIndex = 0) {
  const start = css.indexOf(atRule, fromIndex)
  assert.notEqual(start, -1, `missing CSS at-rule ${atRule}`)
  const open = css.indexOf("{", start + atRule.length)
  assert.notEqual(open, -1, `missing CSS block for ${atRule}`)

  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1
    if (css[index] === "}") depth -= 1
    if (depth === 0) {
      return { body: css.slice(open + 1, index), full: css.slice(start, index + 1) }
    }
  }

  assert.fail(`unclosed CSS block for ${atRule}`)
}

function assertDeclarations(actual, expected, label) {
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(actual[name], value, `${label} ${name}`)
  }
}

function hexToRgb(value, label) {
  assert.match(value, /^#[\da-f]{6}$/i, `${label} must be a six-digit hex color`)
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
}

function relativeLuminance(hex, label) {
  const [red, green, blue] = hexToRgb(hex, label).map((channel) => {
    const srgb = channel / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

test("localInterFontHasSystemFallback", () => {
  const fontFace = declarationsIn("@font-face")
  assert.equal(fontFace["font-family"], '"Inter Variable"')
  assert.equal(fontFace.src, 'url("./fonts/InterVariable.woff2") format("woff2")')
  assert.equal(
    existsSync(join(root, "app/fonts/InterVariable.woff2")),
    true,
    "the local font source must resolve to an app asset"
  )
  assert.doesNotMatch(fontFace.src, /https?:\/\//i, "font source must not be remote")

  assert.equal(
    declarationsIn("@theme inline")["--font-family-sans"],
    '"Inter Variable", system-ui, sans-serif'
  )
  assert.equal(declarationsIn("body")["font-family"], "var(--font-family-sans)")
})

test("glassGeometryAndOpaqueFallbacks", () => {
  assertDeclarations(declarationsIn(":root"), {
    "--radius-card": "24px",
    "--radius-control": "10px",
    "--glass-blur": "20px",
    "--card-hover-offset": "-4px",
  }, ":root")
  assertDeclarations(declarationsIn(".dark"), {
    "--glass-blur": "20px",
  }, ".dark")

  const glassSurface = parseDeclarations(ruleBodyIn(css, ".glass-surface"))
  assertDeclarations(glassSurface, {
    border: "1px solid var(--border-subtle)",
    "border-radius": "var(--radius-card)",
  }, ".glass-surface")

  const hoverMedia = atRuleBlock("@media (hover: hover) and (pointer: fine)")
  const hoverRule = parseDeclarations(ruleBodyIn(hoverMedia.body, ".glass-surface[data-interactive]:hover"))
  assertDeclarations(hoverRule, {
    transform: "translateY(var(--card-hover-offset))",
  }, ".glass-surface[data-interactive]:hover")
  assert.doesNotMatch(
    css.replace(hoverMedia.full, ""),
    /\.glass-surface\[data-interactive\]:hover/,
    ".glass-surface[data-interactive]:hover must appear only inside the fine-pointer hover media query"
  )

  const reducedMedia = atRuleBlock(
    "@media (prefers-reduced-transparency: reduce)",
    css.indexOf("@layer components")
  )
  const scriptReducedFallback = css.match(
    /html\[data-reduced-transparency="true"\]\s+\.glass-surface,\s*html\.reduced-transparency\s+\.glass-surface\s*\{([^}]*)\}/
  )
  assert.ok(scriptReducedFallback, "missing both script reduced-transparency selectors")
  const reducedCases = [
    [".glass-surface in prefers-reduced-transparency", ruleBodyIn(reducedMedia.body, ".glass-surface")],
    [
      "html[data-reduced-transparency=\"true\"] .glass-surface and html.reduced-transparency .glass-surface",
      scriptReducedFallback[1],
    ],
  ]
  const reducedExpected = {
    "background-color": "hsl(var(--card))",
    "border-color": "hsl(var(--border))",
    "-webkit-backdrop-filter": "none",
    "backdrop-filter": "none",
  }
  for (const [label, body] of reducedCases) {
    assertDeclarations(parseDeclarations(body), reducedExpected, label)
  }

  const constrainedMedia = atRuleBlock(
    "@media (max-width: 767px), (pointer: coarse) and (hover: none), (update: slow)"
  )
  assertDeclarations(
    parseDeclarations(ruleBodyIn(constrainedMedia.body, ".glass-surface")),
    {
      "background-color": "hsl(var(--glass-opaque))",
      "-webkit-backdrop-filter": "none",
      "backdrop-filter": "none",
    },
    "constrained-rendering .glass-surface"
  )
})

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
      "--chart-series-1": "196 91% 42%",
      "--chart-series-2": "217 91% 50%",
      "--chart-series-3": "262 83% 58%",
      "--chart-series-4": "292 84% 61%",
      "--chart-series-5": "198 85% 45%",
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
      "--background-grid": "rgba(71,85,105,0.025)",
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
      "--chart-series-1": "188 100% 50%",
      "--chart-series-2": "213 94% 68%",
      "--chart-series-3": "255 90% 76%",
      "--chart-series-4": "295 91% 70%",
      "--chart-series-5": "199 95% 65%",
      "--chart-grid": "rgba(148,163,184,0.09)",
      "--chart-axis": "#94A3B8",
      "--chart-tooltip": "#111928",
      "--chart-tooltip-foreground": "#E6EDF7",
      "--table-surface": "#0F172A",
      "--table-header": "#162137",
      "--table-row-hover": "#1A2940",
      "--overlay-scrim": "rgba(7,11,20,0.72)",
      "--background-accent-primary": "rgba(0,229,255,0.08)",
      "--background-accent-secondary": "rgba(124,58,237,0.09)",
      "--background-grid": "rgba(148,163,184,0.025)",
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

test("chartAxisContrastMeetsAaInBothThemes", () => {
  for (const selector of [":root", ".dark"]) {
    const tokens = declarationsIn(selector)
    const axisLuminance = relativeLuminance(tokens["--chart-axis"], `${selector} --chart-axis`)
    const cardLuminance = relativeLuminance(tokens["--surface-opaque"], `${selector} --surface-opaque`)
    const contrast = (Math.max(axisLuminance, cardLuminance) + 0.05) /
      (Math.min(axisLuminance, cardLuminance) + 0.05)

    assert.ok(
      contrast >= 4.5,
      `${selector} --chart-axis contrast against the opaque card surface must be at least 4.5:1 (was ${contrast.toFixed(2)}:1)`
    )
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
