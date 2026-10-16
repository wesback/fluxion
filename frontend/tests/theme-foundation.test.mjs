import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(__dirname, "..")
const css = readFileSync(join(frontend, "app/globals.css"), "utf8")

function blockAfter(source, selector) {
  const start = source.indexOf(selector)
  assert.notEqual(start, -1, `missing ${selector}`)
  const open = source.indexOf("{", start)
  assert.notEqual(open, -1, `missing block for ${selector}`)
  let depth = 1
  for (let index = open + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1
    if (source[index] === "}") depth -= 1
    if (depth === 0) return source.slice(open + 1, index)
  }
  assert.fail(`unterminated block for ${selector}`)
}

function valueOf(block, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = block.match(new RegExp(`(?:^|\\n)\\s*${escaped}:\\s*([^;]+);`))
  assert.ok(match, `missing ${property}`)
  return match[1].trim()
}

function ruleIn(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`${escaped}\\s*\\{`).exec(source)
  assert.ok(match, `missing rule ${selector}`)
  return blockAfter(source.slice(match.index), selector)
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return [path]
  })
}

const lightTokens = {
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
}

const darkTokens = {
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
}

test("bothThemesUseExactSemanticTokensAliasesAndNoRouteLiterals", () => {
  const light = blockAfter(css, ":root")
  const dark = blockAfter(css, ".dark")
  for (const [token, value] of Object.entries(lightTokens)) {
    assert.equal(valueOf(light, token), value, `:root ${token}`)
  }
  for (const [token, value] of Object.entries(darkTokens)) {
    assert.equal(valueOf(dark, token), value, `.dark ${token}`)
  }

  const theme = blockAfter(css, "@theme inline")
  const aliases = {
    "--color-card": "--table-surface",
    "--color-card-foreground": "--foreground",
    "--color-popover": "--surface-opaque",
    "--color-popover-foreground": "--foreground",
    "--color-muted": "--surface-subtle",
    "--color-muted-foreground": "--foreground-muted",
    "--color-primary": "--action-primary",
    "--color-primary-foreground": "--on-action-primary",
    "--color-accent": "--surface-selected",
    "--color-accent-foreground": "--foreground",
    "--color-destructive": "--status-danger",
    "--color-destructive-foreground": "--foreground",
    "--color-input": "--border-control",
    "--color-ring": "--focus-ring",
    "--color-border": "--border-default",
    "--color-control-border": "--border-control",
    "--color-input-border": "--border-control",
    "--color-control-danger": "--status-danger",
    "--color-control-danger-hover": "--status-danger",
    "--color-control-danger-hover-surface": "--status-danger-surface",
    "--color-status-success": "--status-success",
    "--color-status-success-surface": "--status-success-surface",
    "--color-status-warning": "--status-warning",
    "--color-status-warning-surface": "--status-warning-surface",
    "--color-status-danger": "--status-danger",
    "--color-status-danger-surface": "--status-danger-surface",
    "--color-status-error": "--status-danger",
    "--color-status-error-surface": "--status-danger-surface",
    "--color-status-info": "--status-info",
    "--color-status-info-surface": "--status-info-surface",
    "--color-status-unknown": "--status-unknown",
    "--color-status-unknown-surface": "--status-unknown-surface",
    "--color-trend-positive": "--status-success",
    "--color-trend-negative": "--status-danger",
    "--color-chart-series-1": "--chart-cyan",
    "--color-chart-series-2": "--chart-blue",
    "--color-chart-series-3": "--chart-violet",
    "--color-chart-series-4": "--chart-magenta",
    "--color-chart-series-5": "--chart-blue-soft",
  }
  for (const [alias, token] of Object.entries(aliases)) {
    assert.equal(valueOf(theme, alias), `var(${token})`, `${alias} must alias ${token}`)
  }

  assert.equal(valueOf(light, "--background-secondary"), "var(--surface-subtle)")
  assert.equal(valueOf(light, "--status-error"), "var(--status-danger)")
  assert.equal(valueOf(light, "--trend-positive"), "var(--status-success)")
  assert.equal(valueOf(light, "--trend-negative"), "var(--status-danger)")
  assert.equal(valueOf(light, "--control-border"), "var(--border-control)")
  assert.equal(valueOf(light, "--input-border"), "var(--border-control)")
  assert.equal(valueOf(light, "--control-danger"), "var(--status-danger)")
  assert.equal(valueOf(light, "--control-danger-hover-surface"), "var(--status-danger-surface)")

  assert.doesNotMatch(
    css,
    /(?:--[\w-]+:\s*[\d.]+\s+[\d.]+%\s+[\d.]+%|--glass-blur:\s*12px|--(?:frost-line-alpha|glass-surface-alpha|glass-border-alpha|glass-shadow-near-alpha|glass-shadow-alpha):)/,
    "superseded palette and blur values must not return",
  )

  const appSources = sourceFiles(join(frontend, "app"))
    .filter((path) => extname(path).match(/^\.(?:js|jsx|ts|tsx|css)$/) && path !== join(frontend, "app/globals.css"))
  const componentSources = sourceFiles(join(frontend, "components"))
    .filter((path) => extname(path).match(/^\.(?:js|jsx|ts|tsx|css)$/))
  const literalColor = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\(\s*(?:#|(?:\d|\.)|(?:\.\d))/i
  for (const path of [...appSources, ...componentSources]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), literalColor, `${path} must use semantic color tokens`)
  }
})

test("geometryAndOpaqueFallbacks", () => {
  const root = blockAfter(css, ":root")
  const glass = ruleIn(css, ".glass-surface")
  assert.equal(valueOf(root, "--radius-card"), "24px")
  assert.equal(valueOf(root, "--radius-control"), "10px")
  assert.equal(valueOf(root, "--glass-blur"), "20px")
  assert.equal(valueOf(glass, "border"), "1px solid var(--border-subtle)")
  assert.equal(valueOf(glass, "border-radius"), "var(--radius-card)")
  assert.equal(valueOf(glass, "backdrop-filter"), "blur(var(--glass-blur))")
  assert.equal(valueOf(glass, "-webkit-backdrop-filter"), "blur(var(--glass-blur))")

  const hover = blockAfter(css, "@media (hover: hover) and (pointer: fine)")
  assert.equal(valueOf(ruleIn(hover, ".glass-surface[data-interactive]:hover"), "transform"), "translateY(-4px)")
  assert.equal([...css.matchAll(/transform:\s*translateY\(-4px\)/g)].length, 1, "hover offset must not appear outside the fine-pointer query")

  const componentCss = css.slice(css.indexOf("@layer components"))
  const reduced = blockAfter(componentCss, "@media (prefers-reduced-transparency: reduce)")
  const reducedGlass = ruleIn(reduced, ".glass-surface")
  assert.equal(valueOf(reducedGlass, "background-color"), "var(--surface-opaque)")
  assert.equal(valueOf(reducedGlass, "-webkit-backdrop-filter"), "none")
  assert.equal(valueOf(reducedGlass, "backdrop-filter"), "none")

  const constrained = blockAfter(componentCss, "@media (max-width: 767px)")
  const constrainedGlass = ruleIn(constrained, ".glass-surface")
  assert.equal(valueOf(constrainedGlass, "background-color"), "var(--surface-opaque)")
  assert.equal(valueOf(constrainedGlass, "-webkit-backdrop-filter"), "none")
  assert.equal(valueOf(constrainedGlass, "backdrop-filter"), "none")

  const unsupported = blockAfter(componentCss, "@supports not (backdrop-filter: blur(1px))")
  const unsupportedGlass = ruleIn(unsupported, ".glass-surface")
  assert.equal(valueOf(unsupportedGlass, "background-color"), "var(--surface-opaque)")
  assert.equal(valueOf(unsupportedGlass, "-webkit-backdrop-filter"), "none")
  assert.equal(valueOf(unsupportedGlass, "backdrop-filter"), "none")
})

test("localInterFontHasSystemFallback", () => {
  const layoutPath = join(frontend, "app/layout.tsx")
  const layout = readFileSync(layoutPath, "utf8")
  const source = layout.match(/src:\s*"([^"]+InterVariable\.woff2)"/)?.[1]
  assert.ok(source, "localFont must register the Inter Variable WOFF2 source")
  assert.equal(resolve(dirname(layoutPath), source), join(frontend, "app/fonts/InterVariable.woff2"))
  assert.ok(existsSync(join(frontend, "app/fonts/InterVariable.woff2")), "local font asset must exist")
  const font = readFileSync(join(frontend, "app/fonts/InterVariable.woff2"))
  assert.equal(font.toString("ascii", 0, 4), "wOF2", "font asset must be WOFF2")
  assert.match(layout, /variable:\s*"--font-inter-variable"/, "font family must be registered as Inter Variable")
  assert.match(layout, /fallback:\s*\["system-ui",\s*"sans-serif"\]/, "local font must provide system-ui and sans-serif fallbacks")
  assert.match(layout, /<body className=\{`\$\{interVariable\.variable\} antialiased`\}>/)
  assert.match(css, /--font-family-sans:\s*var\(--font-inter-variable\),\s*system-ui,\s*sans-serif/)
  assert.match(css, /font-family:\s*var\(--font-family-sans\)/)
})
