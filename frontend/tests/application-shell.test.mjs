import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const navbar = readFileSync(join(root, "components/navbar.tsx"), "utf8")
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8")

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8")
}

function getNavigation() {
  const block = navbar.match(/const navigation = \[([\s\S]*?)\] as const/)
  assert.ok(block, "navigation destinations must be declared")
  return [...block[1].matchAll(/\{ name: "([^"]+)", href: "([^"]+)", icon: \w+ \}/g)]
    .map(([, name, href]) => ({ name, href }))
}

function getActiveMatcher() {
  const body = navbar.match(
    /function isNavigationActive\(itemHref: string, pathname: string\) \{([\s\S]*?)\n\}/
  )
  assert.ok(body, "the shell must define its route-to-navigation mapping")
  return new Function("itemHref", "pathname", body[1])
}

test("navigationDestinationsAndActiveState", () => {
  const navigation = getNavigation()
  assert.deepEqual(navigation, [
    { name: "Dashboard", href: "/" },
    { name: "Hosts", href: "/hosts" },
    { name: "Packages", href: "/packages" },
    { name: "Updates", href: "/activity" },
    { name: "Reports", href: "/reports" },
    { name: "Alerts", href: "/alerts" },
    { name: "Settings", href: "/admin" },
    { name: "Kernels", href: "/kernels" },
    { name: "Security", href: "/security" },
  ])

  const isActive = getActiveMatcher()
  const routes = [
    ["/", "Dashboard"],
    ["/hosts", "Hosts"],
    ["/hosts/node-1", "Hosts"],
    ["/packages", "Packages"],
    ["/activity", "Updates"],
    ["/security", "Security"],
    ["/kernels", "Kernels"],
    ["/admin", "Settings"],
    ["/admin/api-keys", "Settings"],
    ["/admin/webhooks", "Settings"],
    ["/admin/diagnostics", "Settings"],
  ]
  for (const [pathname, expected] of routes) {
    assert.deepEqual(
      navigation.filter(({ href }) => isActive(href, pathname)).map(({ name }) => name),
      [expected],
      pathname
    )
  }
  for (const pathname of ["/reports/archive", "/alerts/history", "/hosts-extra"]) {
    assert.deepEqual(
      navigation.filter(({ href }) => isActive(href, pathname)),
      [],
      `${pathname} must not claim an existing destination`
    )
  }

  assert.match(navbar, /aria-current=\{isActive && \(drawer \? mobileMenuOpen : !mobileMenuOpen\) \? "page" : undefined\}/)
  assert.match(navbar, /navbar-link focus-visible:outline-none focus-visible:ring-2/)
})

test("shellBreakpointsAndDrawerContract", () => {
  const tabletBreakpoint = Number(navbar.match(/min-\[(\d+)px\]:flex/)?.[1])
  const wideMatch = navbar.match(/min-\[(\d+)px\]:w-\[240px\]/)
  const compactWidth = Number(navbar.match(/w-\[(\d+)px\]/)?.[1])
  assert.equal(tabletBreakpoint, 1024)
  assert.ok(wideMatch, "wide rail must have an explicit breakpoint")
  assert.equal(Number(wideMatch[1]), 1280)
  const wideWidth = Number(wideMatch[0].match(/w-\[(\d+)px\]/)?.[1])
  assert.equal(compactWidth, 72)
  assert.equal(wideWidth, 240)
  assert.match(navbar, /hidden lg:flex gap-6 flex-col/)
  assert.match(navbar, /min-\[1024px\]:flex/)
  assert.match(navbar, /min-\[1280px\]:w-\[240px\]/)
  assert.match(navbar, /h-16/)
  assert.match(navbar, /id="mobile-navigation"[\s\S]*?lg:hidden/)
  assert.match(layout, /min-\[1024px\]:ml-\[72px\]/)
  assert.match(layout, /min-\[1280px\]:ml-\[240px\]/)

  const shellAt = (width) => ({
    railWidth: width < tabletBreakpoint ? 0 : width < Number(wideMatch[1]) ? compactWidth : wideWidth,
    mobileDrawer: width < tabletBreakpoint,
    headerHeight: 64,
  })
  assert.deepEqual([1023, 1024, 1279, 1280].map(shellAt), [
    { railWidth: 0, mobileDrawer: true, headerHeight: 64 },
    { railWidth: 72, mobileDrawer: false, headerHeight: 64 },
    { railWidth: 72, mobileDrawer: false, headerHeight: 64 },
    { railWidth: 240, mobileDrawer: false, headerHeight: 64 },
  ])

  const closeControl = [...navbar.matchAll(/<button\b[\s\S]*?<\/button>/g)]
    .find(([button]) => button.includes('aria-label="Close navigation"'))
  assert.ok(closeControl, "drawer must include a dismiss control")
  assert.match(closeControl[0], /type="button"/)
  assert.match(closeControl[0], /onClick=\{\(\) => setMobileMenuOpen\(false\)\}/)
  assert.match(closeControl[0], /min-h-11 min-w-11/)
})

test("sharedLandmarksAndRoutes", () => {
  const routes = [
    "app/page.tsx",
    "app/hosts/page.tsx",
    "app/hosts/[hostname]/page.tsx",
    "app/packages/page.tsx",
    "app/activity/page.tsx",
    "app/security/page.tsx",
    "app/kernels/page.tsx",
    "app/admin/page.tsx",
    "app/admin/api-keys/page.tsx",
    "app/admin/webhooks/page.tsx",
    "app/admin/diagnostics/page.tsx",
  ]

  assert.match(layout, /<a href="#main-content" className="skip-nav">/)
  assert.equal((layout.match(/<main\b/g) ?? []).length, 1)
  assert.match(layout, /<main[\s\S]*?id="main-content"/)
  assert.match(layout, /<Navbar\s*\/>/)
  assert.match(navbar, /<span>Fluxion<\/span>/)

  for (const route of routes) {
    assert.ok(existsSync(join(root, route)), `missing existing route: ${route}`)
    assert.doesNotMatch(read(route), /<main(?:\s|>)/, `${route} must use the shared main landmark`)
  }
})

test("headerContainsOnlySupportedControls", () => {
  const header = navbar.match(/<header\b[\s\S]*?<\/header>/)
  assert.ok(header, "the shared shell must render a header")
  assert.match(header[0], /className="[^"]*\bh-16\b/)
  assert.match(header[0], /href="\/"[\s\S]*?<span>Fluxion<\/span>/)
  assert.match(header[0], /<ThemeToggle\s*\/>/)
  assert.equal((header[0].match(/<button\b/g) ?? []).length, 1)
  assert.match(header[0], /aria-expanded=\{mobileMenuOpen\}/)
  assert.match(header[0], /aria-controls="mobile-navigation"/)
  assert.match(header[0], /aria-label=\{mobileMenuOpen \? "Close navigation" : "Open navigation"\}/)
  assert.match(header[0], /onClick=\{\(\) => setMobileMenuOpen\(\(open\) => !open\)\}/)
  assert.doesNotMatch(header[0], /avatar|account|notification|inbox|badge/i)

  const controls = [...navbar.matchAll(/<button\b[\s\S]*?<\/button>/g)]
  assert.equal(controls.length, 2)
  for (const [control] of controls) {
    assert.match(control, /type="button"/)
    assert.match(control, /onClick=/, "every button must perform a supported action")
  }
})
