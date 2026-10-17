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
