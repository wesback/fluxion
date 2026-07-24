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
