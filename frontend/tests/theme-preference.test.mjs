import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { runInNewContext } from "node:vm"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const provider = readFileSync(join(root, "components/theme-provider.tsx"), "utf8")
const toggle = readFileSync(join(root, "components/theme-toggle.tsx"), "utf8")
const themeBootstrapMatch = provider.match(
  /const themePreferenceBootstrap = `([\s\S]*?)`/
)

assert.ok(themeBootstrapMatch, "theme provider must define a pre-hydration preference bootstrap")

const themeBootstrap = themeBootstrapMatch[1].replace(
  "${JSON.stringify(THEME_PREFERENCES)}",
  '["system", "light", "dark"]'
)

class FakeStorage {
  values = new Map()

  getItem(key) {
    return this.values.get(key) ?? null
  }

  setItem(key, value) {
    this.values.set(key, value)
  }
}

function runThemeBootstrap(storage, storageKey = "theme") {
  runInNewContext(themeBootstrap, {
    localStorage: storage,
    document: { currentScript: { dataset: { themeStorageKey: storageKey } } },
    DOMException,
  })
}

function getEffectiveTheme(storage, systemTheme, storageKey = "theme") {
  const preference = storage.getItem(storageKey) ?? "system"
  return preference === "system" ? systemTheme : preference
}

const themeSelectionHandlerMatch = toggle.match(
  /onChange=\{\(event\) => \{([\s\S]*?)\n\s{8}\}\}/
)

assert.ok(themeSelectionHandlerMatch, "theme control must define a selection handler")

const runThemeSelection = new Function(
  "event",
  "setTheme",
  "trackThemeChange",
  "selectedTheme",
  "isThemePreference",
  themeSelectionHandlerMatch[1]
)

test("themePreferencePersistsAcrossReloadAndNavigation", () => {
  assert.match(provider, /const THEME_PREFERENCES = \["system", "light", "dark"\] as const/)
  assert.match(provider, /defaultTheme="system"/)
  assert.match(provider, /enableSystem/)
  assert.match(provider, /storageKey=\{storageKey\}/)
  assert.match(provider, /localStorage\.setItem\(storageKey, "system"\)/)
  assert.match(toggle, /setTheme\(newTheme\)/)

  const cases = [
    { preference: "system", systemTheme: "dark", effectiveTheme: "dark" },
    { preference: "light", systemTheme: "dark", effectiveTheme: "light" },
    { preference: "dark", systemTheme: "light", effectiveTheme: "dark" },
  ]

  for (const { preference, systemTheme, effectiveTheme } of cases) {
    const storage = new FakeStorage()
    const selectedPreferences = []
    runThemeSelection(
      { currentTarget: { value: preference } },
      (value) => {
        selectedPreferences.push(value)
        storage.setItem("theme", value)
      },
      () => {},
      "system",
      (value) => value === "system" || value === "light" || value === "dark"
    )

    assert.deepEqual(selectedPreferences, [preference])
    assert.equal(storage.getItem("theme"), preference)
    runThemeBootstrap(storage)
    assert.equal(storage.getItem("theme"), preference)
    assert.equal(getEffectiveTheme(storage, systemTheme), effectiveTheme)

    const routeTheme = getEffectiveTheme(storage, systemTheme)
    assert.equal(storage.getItem("theme"), preference)
    assert.equal(routeTheme, effectiveTheme)
  }

  const storage = new FakeStorage()
  storage.setItem("theme", "invalid-theme")
  runThemeBootstrap(storage)

  assert.equal(storage.getItem("theme"), "system")
  assert.equal(getEffectiveTheme(storage, "light"), "light")
  assert.equal(getEffectiveTheme(storage, "dark"), "dark")
})

test("themeControlHasThreeNamedKeyboardChoices", () => {
  const options = [...toggle.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
    .map(([, value, label]) => ({ value, label }))

  assert.deepEqual(options, [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ])
  assert.match(toggle, /<select[\s\S]*?aria-label=\{`Theme: \$\{THEME_LABELS\[selectedTheme\]\}`\}/)
  assert.match(toggle, /onChange=\{\(event\) =>/)
  assert.match(toggle, /disabled=\{!mounted\}/)
  assert.doesNotMatch(toggle, /aria-label="Toggle theme"|Switch to .* mode/)
})
