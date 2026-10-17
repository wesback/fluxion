import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { runInNewContext } from "node:vm"

const require = createRequire(import.meta.url)
class FakeStorage {
  values = new Map()

  getItem(key) {
    return this.values.get(key) ?? null
  }

  setItem(key, value) {
    this.values.set(key, value)
  }
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { matchMedia: () => ({ matches: false }) },
})
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new FakeStorage(),
})

const React = require("react")
const { ThemeProvider: NextThemesProvider } = require("next-themes")
if (originalWindow) {
  Object.defineProperty(globalThis, "window", originalWindow)
} else {
  delete globalThis.window
}
if (originalStorage) {
  Object.defineProperty(globalThis, "localStorage", originalStorage)
} else {
  delete globalThis.localStorage
}

const reactInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
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

const transpiledProvider = require("typescript").transpileModule(provider, {
  compilerOptions: {
    jsx: require("typescript").JsxEmit.React,
    module: require("typescript").ModuleKind.CommonJS,
  },
}).outputText
const productionProviderModule = { exports: {} }
runInNewContext(transpiledProvider, {
  exports: productionProviderModule.exports,
  require: (name) => {
    if (name === "react") return React
    if (name === "next-themes") return { ThemeProvider: NextThemesProvider }
    throw new Error(`Unexpected provider dependency: ${name}`)
  },
})

function runThemeBootstrap(storage, storageKey = "theme") {
  runInNewContext(themeBootstrap, {
    localStorage: storage,
    document: { currentScript: { dataset: { themeStorageKey: storageKey } } },
    DOMException,
  })
}

function withProductionThemeProvider(storage, systemTheme, run) {
  const originalDispatcher = reactInternals.H
  const originalCreateElement = React.createElement
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const stateUpdates = []

  reactInternals.H = {
    useContext: () => null,
    useState: (initialValue) => [
      typeof initialValue === "function" ? initialValue() : initialValue,
      (value) => stateUpdates.push(value),
    ],
    useCallback: (callback) => callback,
    useEffect: () => {},
    useMemo: (factory) => factory(),
  }
  React.createElement = (type, props, ...children) => ({ type, props, children })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      matchMedia: () => ({
        matches: systemTheme === "dark",
        addListener: () => {},
        removeListener: () => {},
      }),
    },
  })
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  })

  try {
    const applicationProviderElement = productionProviderModule.exports.ThemeProvider({
      children: null,
    })
    const providerWrapperElement = applicationProviderElement.children[1]
    const nextThemesElement = providerWrapperElement.type(providerWrapperElement.props)
    const providerElement = nextThemesElement.type(nextThemesElement.props)
    return run(providerElement.props.value, stateUpdates)
  } finally {
    reactInternals.H = originalDispatcher
    React.createElement = originalCreateElement
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow)
    } else {
      delete globalThis.window
    }
    if (previousStorage) {
      Object.defineProperty(globalThis, "localStorage", previousStorage)
    } else {
      delete globalThis.localStorage
    }
  }
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
    let selectedPreferences
    withProductionThemeProvider(storage, systemTheme, ({ setTheme }, stateUpdates) => {
      runThemeSelection(
        { currentTarget: { value: preference } },
        setTheme,
        () => {},
        "system",
        (value) => value === "system" || value === "light" || value === "dark"
      )
      selectedPreferences = stateUpdates
    })

    assert.deepEqual(selectedPreferences, [preference])
    assert.equal(storage.getItem("theme"), preference)
    runThemeBootstrap(storage)
    assert.equal(storage.getItem("theme"), preference)

    const reloadedTheme = withProductionThemeProvider(storage, systemTheme, ({ theme, resolvedTheme }) => ({
      theme,
      resolvedTheme,
    }))
    assert.deepEqual(reloadedTheme, { theme: preference, resolvedTheme: effectiveTheme })
    assert.equal(storage.getItem("theme"), preference)

    const routeTheme = withProductionThemeProvider(storage, systemTheme, ({ theme, resolvedTheme }) => ({
      theme,
      resolvedTheme,
    }))
    assert.deepEqual(routeTheme, { theme: preference, resolvedTheme: effectiveTheme })
  }

  const storage = new FakeStorage()
  storage.setItem("theme", "invalid-theme")
  runThemeBootstrap(storage)

  assert.equal(storage.getItem("theme"), "system")
  const invalidStorageTheme = withProductionThemeProvider(storage, "light", ({ theme, resolvedTheme }) => ({
    theme,
    resolvedTheme,
  }))
  assert.deepEqual(invalidStorageTheme, { theme: "system", resolvedTheme: "light" })
  assert.equal(storage.getItem("theme"), "system")
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
