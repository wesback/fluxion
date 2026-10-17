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

  // Regression guard: the full horizontal nav must switch on at `lg:` (1024px),
  // not `md:` (768px). 768px and 820px are real iPad portrait widths (mini,
  // Air/Pro 11") that cannot fit 7 nav items + icons horizontally — at `md:`
  // the nav wrapped and overlapped the theme toggle/hamburger button. `lg:`
  // is the narrowest breakpoint that measured clean (no wrap/overflow) across
  // the full iPad portrait+landscape matrix.
  it("desktop nav switches on at lg: (not md:) to clear the iPad portrait range", () => {
    assert.match(navbar, /hidden lg:flex gap-6/)
    assert.ok(!/hidden md:flex/.test(navbar), "navbar must not reintroduce the md: (768px) horizontal-nav switch")
  })
  it("mobile menu toggle and panel hide at lg: (matching the nav switch)", () => {
    assert.match(navbar, /p-2 lg:hidden/)
    assert.match(navbar, /border-t lg:hidden/)
  })
  it("navbar-frosted pads for safe-area insets (landscape iPad rounded corners)", () => {
    assert.match(css, /\.navbar-frosted[\s\S]*env\(safe-area-inset-left\)/)
    assert.match(css, /\.navbar-frosted[\s\S]*env\(safe-area-inset-right\)/)
  })
})

// ── Group 5: Card primitive ────────────────────────────────────────────────
describe("card glass primitive", () => {
  const card = read("components/ui/card.tsx")

  it("Card root uses glass-surface class", () => {
    assert.match(card, /glass-surface/)
  })
})

// ── Group 6: Skeleton shimmer ──────────────────────────────────────────────
describe("skeleton shimmer", () => {
  const css = read("app/globals.css")
  const sk = read("components/ui/skeleton.tsx")

  it("defines @keyframes skeleton-shimmer", () => {
    assert.match(css, /@keyframes skeleton-shimmer/)
  })
  it("shimmer uses --background and --surface-subtle semantic tokens", () => {
    assert.match(css, /\.skeleton-shimmer\s*\{[^}]*background:\s*var\(--background\);/)
    assert.match(css, /\.skeleton-shimmer::before\s*\{[^}]*var\(--surface-subtle\) 50%/)
    assert.doesNotMatch(css, /hsl\(var\(--background\)\)/)
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
  const css = read("app/globals.css")
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
  it("bar-chart passes content prop to Tooltip", () => {
    assert.match(bar, /content=\{<GlassTooltip/)
  })
  it("bar-chart has no inline contentStyle object", () => {
    assert.ok(!bar.includes("contentStyle"), "bar-chart must not use inline contentStyle after GlassTooltip adoption")
  })
  it("line-chart passes content prop to Tooltip", () => {
    assert.match(line, /content=\{<GlassTooltip/)
  })
  it("line-chart has no inline contentStyle object", () => {
    assert.ok(!line.includes("contentStyle"), "line-chart must not use inline contentStyle after GlassTooltip adoption")
  })
  it("GlassTooltip applies glass-surface-tooltip modifier for dark-mode chart contrast", () => {
    // Dark mode: glass-surface-alpha 0.05 is nearly transparent over bright chart series.
    // glass-surface-tooltip raises the background to hsl(var(--card)/0.82) so
    // muted-foreground clears 4.5:1 against any chart color behind the backdrop blur.
    assert.match(tooltip, /glass-surface-tooltip/, "GlassTooltip must apply glass-surface-tooltip modifier")
  })
  it("globals.css defines :where(.dark) .glass-surface-tooltip smoked-glass background", () => {
    // :where(.dark) keeps specificity at (0,1,0) so OS-level fallback rules win by source order.
    assert.match(css, /:where\(\.dark\)\s+\.glass-surface-tooltip[\s\S]*background-color/, "dark-mode smoked-glass override must use :where(.dark) for correct specificity")
  })
})

// ── Group 8: DeviceMemoryGuard ─────────────────────────────────────────────
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

// ── Group 9: Viewport / iPad shell regression guard ───────────────────────
describe("viewport and full-height shell", () => {
  const layout = read("app/layout.tsx")
  const css = read("app/globals.css")

  it("exports a viewport config with viewport-fit: cover for safe-area insets", () => {
    assert.match(layout, /export const viewport[\s\S]*viewportFit:\s*"cover"/)
  })
  it("does not lock zoom via maximumScale or userScalable (accessibility floor)", () => {
    assert.ok(!/maximumScale/.test(layout), "layout.tsx must not set maximumScale")
    assert.ok(!/userScalable/.test(layout), "layout.tsx must not set userScalable")
  })
  it("no raw 100vh remains in globals.css or layout.tsx (iOS toolbar overflow trap)", () => {
    assert.ok(!/100vh/.test(css), "globals.css must not use 100vh")
    assert.ok(!/100vh/.test(layout), "layout.tsx must not use 100vh")
  })
})
