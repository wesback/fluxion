import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const navbar = readFileSync(join(root, "components/navbar.tsx"), "utf8")
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8")
const css = readFileSync(join(root, "app/globals.css"), "utf8")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const typescript = require("typescript")
let pathname = "/"

const transpiledNavbar = typescript.transpileModule(navbar, {
  compilerOptions: { jsx: typescript.JsxEmit.ReactJSX, module: typescript.ModuleKind.CommonJS },
}).outputText
const navbarModule = { exports: {} }
const icon = () => React.createElement("svg", { "aria-hidden": "true" })
runInNewContext(transpiledNavbar, {
  exports: navbarModule.exports,
  require: (name) => {
    if (name === "react") return React
    if (name === "react/jsx-runtime") return require("react/jsx-runtime")
    if (name === "next/link") return {
      default: ({ children, ...props }) => React.createElement("a", props, children),
    }
    if (name === "next/navigation") return { usePathname: () => pathname }
    if (name === "@/components/theme-toggle") return { ThemeToggle: () => null }
    if (name === "@/components/global-search") {
      return { GlobalSearch: () => React.createElement("form", { role: "search", "aria-label": "Global search" }) }
    }
    if (name === "lucide-react") {
      return {
        Activity: icon,
        AlertTriangle: icon,
        BarChart3: icon,
        CheckCircle2: icon,
        Cpu: icon,
        Menu: icon,
        Package: icon,
        RefreshCw: icon,
        Server: icon,
        Settings: icon,
        ShieldCheck: icon,
        X: icon,
      }
    }
    if (name === "@/lib/utils") return { cn: (...classes) => classes.filter(Boolean).join(" ") }
    if (name === "@/lib/telemetry") return { useClickTracking: () => () => {} }
    if (name === "@/lib/hooks/use-api") return {
      useHosts: () => ({ data: { items: [] }, isLoading: false, error: null, dataUpdatedAt: 0 }),
    }
    if (name === "@/lib/host-health") return {
      getReportingHealthState: () => ({
        status: "No hosts reporting",
        message: null,
        counts: { stale: 0, missing: 0 },
        lastSuccessfulCheck: null,
        canRetry: false,
      }),
    }
    throw new Error(`Unexpected navbar dependency: ${name}`)
  },
})

function renderNavbar(currentPathname = "/") {
  pathname = currentPathname
  return renderToStaticMarkup(React.createElement(navbarModule.exports.Navbar))
}

function primaryLinks(html) {
  const primaryNav = html.match(/<nav aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/)
  assert.ok(primaryNav, "Navbar must render primary navigation")
  return [...primaryNav[1].matchAll(/<a\b([^>]*)>/g)].map(([, attributes]) => ({
    href: attributes.match(/\bhref="([^"]*)"/)?.[1],
    current: attributes.match(/\baria-current="([^"]*)"/)?.[1],
  }))
}

test("primaryNavigationKeepsEveryExistingDestinationAndMarksOneCurrentRoute", () => {
  const expected = [
    ["/", "/"],
    ["/hosts", "/hosts"],
    ["/hosts/node-01", "/hosts"],
    ["/packages", "/packages"],
    ["/activity", "/activity"],
    ["/reports", "/reports"],
    ["/alerts", "/alerts"],
    ["/security", "/security"],
    ["/kernels", "/kernels"],
    ["/admin", "/admin"],
    ["/admin/api-keys", "/admin"],
    ["/admin/webhooks", "/admin"],
    ["/admin/diagnostics", "/admin"],
    ["/hosts-malicious", undefined],
    ["/reports-malicious", undefined],
    ["/admin/unknown", undefined],
  ]
  const destinations = ["/", "/hosts", "/packages", "/activity", "/reports", "/alerts", "/admin", "/kernels", "/security"]

  for (const [path, currentHref] of expected) {
    const links = primaryLinks(renderNavbar(path))
    assert.deepEqual(links.map(({ href }) => href), destinations, `${path} destinations`)
    assert.deepEqual(
      links.filter(({ current }) => current === "page").map(({ href }) => href),
      currentHref ? [currentHref] : [],
      `${path} current route`
    )
  }
})

test("shellIncludesBrandSearchThemeAndTruthfulHostReportingStatus", () => {
  const html = renderNavbar("/")
  assert.match(html, /Fluxion/)
  assert.match(html, /role="search" aria-label="Global search"/)
  assert.match(navbar, /<ThemeToggle \/>/)
  assert.match(html, /aria-label="Host reporting status: No hosts reporting"/)
  assert.doesNotMatch(navbar, /avatar|account|notification|inbox/i)
})

test("responsiveRailAndMainOffsetAlignAtTabletAndDesktopWidths", () => {
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*?\.primary-navigation\s*\{[^}]*width:\s*72px/)
  assert.match(css, /@media \(min-width: 1280px\)[\s\S]*?\.primary-navigation\s*\{[^}]*width:\s*240px/)
  assert.match(css, /\.primary-navigation\s*\{[^}]*top:\s*64px/)
  assert.match(layout, /min-\[768px\]:ml-\[72px\].*min-\[1280px\]:ml-\[240px\]/)
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*?\.mobile-menu-trigger\s*\{[^}]*display:\s*none/)
  assert.match(css, /\.mobile-menu-panel\s*\{[^}]*position:\s*fixed[^}]*top:\s*64px/)
})

test("mobileNavigationRemainsKeyboardOperableAndHiddenWhenClosed", () => {
  const html = renderNavbar("/")
  const button = html.match(/<button\b([^>]*)>/)
  assert.ok(button, "mobile menu trigger must exist")
  const attribute = (name) => button[1].match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1]
  assert.equal(attribute("aria-label"), "Open menu")
  assert.equal(attribute("aria-expanded"), "false")
  assert.equal(attribute("aria-controls"), "mobile-menu")

  const target = html.match(/<nav\b([^>]*)id="mobile-menu"([^>]*)>/)
  assert.ok(target, "mobile menu target must be present while closed")
  assert.match(`${target[1]}${target[2]}`, /\shidden(?:="")?(?:\s|$)/)
  assert.match(`${target[1]}${target[2]}`, /\baria-hidden="true"/)
  assert.match(navbar, /event\.key === "Escape"/)
})

test("allRoutesShareOneMainLandmarkAndRetainTheirFiles", () => {
  const routes = [
    ["app/page.tsx", "/"],
    ["app/hosts/page.tsx", "/hosts"],
    ["app/hosts/[hostname]/page.tsx", "/hosts/{hostname}"],
    ["app/packages/page.tsx", "/packages"],
    ["app/activity/page.tsx", "/activity"],
    ["app/reports/page.tsx", "/reports"],
    ["app/alerts/page.tsx", "/alerts"],
    ["app/security/page.tsx", "/security"],
    ["app/kernels/page.tsx", "/kernels"],
    ["app/admin/page.tsx", "/admin"],
    ["app/admin/api-keys/page.tsx", "/admin/api-keys"],
    ["app/admin/webhooks/page.tsx", "/admin/webhooks"],
    ["app/admin/diagnostics/page.tsx", "/admin/diagnostics"],
  ]
  assert.equal((layout.match(/<main(?:\s|>)/g) ?? []).length, 1)
  assert.match(layout, /<a href="#main-content"[^>]*>Skip to main content<\/a>/)
  assert.match(layout, /<main id="main-content"/)
  assert.match(layout, /<Navbar \/>/)

  for (const [file, route] of routes) {
    assert.equal(existsSync(join(root, file)), true, `${route} route must still exist`)
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /<main(?:\s|>)/, `${route} uses shared main landmark`)
  }
})
