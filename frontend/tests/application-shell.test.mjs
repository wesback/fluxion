import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const navbar = readFileSync(join(root, "components/navbar.tsx"), "utf8")
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8")
const destinations = [...navbar.matchAll(/\{\s*name:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)]
  .map(([, name, href]) => [name, href])

test("desktopShellDimensions", () => {
  assert.match(navbar, /flex h-\[64px\] items-center/, "header must be exactly 64px high")
  assert.match(navbar, /min-\[1280px\]:w-\[240px\]/, "desktop navigation rail must be exactly 240px wide")
  assert.match(navbar, /min-\[1280px\]:top-16/, "rail must begin below the 64px header")
  assert.match(navbar, /min-\[1280px\]:fixed/, "desktop rail must remain viewport-fixed")
  assert.ok(navbar.indexOf("</header>") < navbar.indexOf('aria-label="Primary navigation"'), "fixed rail must not be constrained by the frosted header")
  assert.match(layout, /min-\[1280px\]:ml-\[240px\]/, "main content must clear the desktop rail")
})

test("navigationDestinations", () => {
  assert.deepEqual(destinations, [
    ["Dashboard", "/"],
    ["Hosts", "/hosts"],
    ["Packages", "/packages"],
    ["Updates", "/activity"],
    ["Reports", "/reports"],
    ["Alerts", "/alerts"],
    ["Settings", "/admin"],
    ["Kernels", "/kernels"],
    ["Security", "/security"],
  ])
  assert.equal(existsSync(join(root, "app/reports/page.tsx")), false)
  assert.equal(existsSync(join(root, "app/alerts/page.tsx")), false)
})

test("navigationActiveState", () => {
  const helper = navbar.match(/function activeNavigationHref\(pathname: string\): string \| undefined \{([\s\S]*?)\n\}/)
  assert.ok(helper, "active route resolver must be present")
  const activeNavigationHref = new Function("pathname", helper[1])
  assert.match(navbar, /aria-current=\{isActive \? "page" : undefined\}/)

  const cases = [
    ["/", "/"],
    ["/hosts", "/hosts"],
    ["/hosts/node-01", "/hosts"],
    ["/packages", "/packages"],
    ["/activity", "/activity"],
    ["/security", "/security"],
    ["/kernels", "/kernels"],
    ["/admin", "/admin"],
    ["/admin/api-keys", "/admin"],
    ["/admin/webhooks", "/admin"],
    ["/admin/diagnostics", "/admin"],
  ]

  for (const [pathname, expectedHref] of cases) {
    const current = destinations.filter(([, href]) => href === activeNavigationHref(pathname))
    assert.deepEqual(current.map(([, href]) => href), [expectedHref], pathname)
  }
})

test("sharedLandmarksAndRoutes", () => {
  const routes = [
    ["app/page.tsx", "/"],
    ["app/hosts/page.tsx", "/hosts"],
    ["app/hosts/[hostname]/page.tsx", "/hosts/{hostname}"],
    ["app/packages/page.tsx", "/packages"],
    ["app/activity/page.tsx", "/activity"],
    ["app/security/page.tsx", "/security"],
    ["app/kernels/page.tsx", "/kernels"],
    ["app/admin/page.tsx", "/admin"],
    ["app/admin/api-keys/page.tsx", "/admin/api-keys"],
    ["app/admin/webhooks/page.tsx", "/admin/webhooks"],
    ["app/admin/diagnostics/page.tsx", "/admin/diagnostics"],
  ]
  const mainLandmarks = layout.match(/<main(?:\s|>)/g) ?? []
  assert.equal(mainLandmarks.length, 1, "shared layout must provide exactly one main landmark")
  assert.match(layout, /<a href="#main-content"[^>]*>Skip to main content<\/a>/)
  assert.match(layout, /<main id="main-content"/)
  assert.match(layout, /<Navbar \/>/)
  assert.match(navbar, /<span>Fluxion<\/span>/)
  assert.match(navbar, /<nav[\s\S]*?aria-label="Primary navigation"/)
  assert.match(navbar, /<Link[\s\S]*?href=\{item\.href\}/)

  for (const [file, route] of routes) {
    assert.equal(existsSync(join(root, file)), true, `${route} route must exist`)
    const source = readFileSync(join(root, file), "utf8")
    assert.doesNotMatch(source, /<main(?:\s|>)/, `${route} must use the shared main landmark`)
  }
})

test("supportedHeaderControls", () => {
  assert.match(navbar, /<span>Fluxion<\/span>/)
  assert.match(navbar, /<ThemeToggle \/>/)
  assert.doesNotMatch(navbar, /avatar|account|notification|inbox|badge/i)

  const buttons = [...navbar.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(([button]) => button)
  assert.equal(buttons.length, 1, "header may expose only its functional mobile navigation button")
  assert.match(buttons[0], /onClick=\{\(\) => setMobileMenuOpen\(!mobileMenuOpen\)\}/)
  assert.match(buttons[0], /aria-label=\{mobileMenuOpen \? "Close menu" : "Open menu"\}/)
  assert.match(buttons[0], /aria-expanded=\{mobileMenuOpen\}/)
})
