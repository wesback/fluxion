import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { approvedSearchPages, createPackageSearchHref, isSafeSearchDestination } from "../lib/safe-navigation.mjs"

const require = createRequire(import.meta.url), React = require("react"), { renderToStaticMarkup } = require("react-dom/server"), ts = require("typescript")
const root = join(dirname(fileURLToPath(import.meta.url)), ".."), source = readFileSync(join(root, "components/global-search.tsx"), "utf8")
const packagePage = readFileSync(join(root, "app/packages/page.tsx"), "utf8")
const searchRouting = { exports: {} }
runInNewContext(ts.transpileModule(readFileSync(join(root, "lib/search-routing.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: searchRouting.exports })
test("globalSearchTargetsExistingHostAndPackageSearchRoutes", () => {
  const { getGlobalSearchHref } = searchRouting.exports
  assert.equal(getGlobalSearchHref("packages", " openssl "), "/packages?q=openssl")
  assert.equal(getGlobalSearchHref("hosts", "node 01"), "/hosts?q=node%2001")
  assert.equal(getGlobalSearchHref("packages", "lib&ssl"), "/packages?q=lib%26ssl")
  assert.equal(getGlobalSearchHref("hosts", "   "), null)
})
let slots = [], index = 0, refIndex = 0, effectDeps = [], effects = [], tree
let hostsQuery, packageQuery, requests, packageRequests, hostsRequested, lastPackage, activeElement
const listeners = []
const documentStub = {
  addEventListener: (_type, listener) => listeners.push(listener),
  get activeElement() { return activeElement },
}
const reactStub = {
  useState(value) { const i = index++; if (!(i in slots)) slots[i] = value; return [slots[i], (next) => { slots[i] = next }] },
  useRef() {
    const i = index++
    if (!(i in slots)) { const label = refIndex++ === 0 ? "Search" : "Search pages, hosts, or packages"; slots[i] = { current: { focus: () => { activeElement = label }, querySelectorAll: () => [] } } }
    return slots[i]
  },
  useEffect(fn, deps) {
    const i = index++
    if (!effectDeps[i] || deps.some((value, j) => value !== effectDeps[i][j])) effects.push(() => { effectDeps[i] = deps; fn() })
  },
}
const mocks = {
  react: reactStub,
  "react/jsx-runtime": require("react/jsx-runtime"),
  "lucide-react": { Loader2: () => null, Search: () => null, X: () => null },
  "@/lib/safe-navigation.mjs": { approvedSearchPages, createPackageSearchHref, isSafeSearchDestination },
  "@/lib/hooks/use-api": {
    useHosts: (options) => {
      if (options.enabled && !hostsRequested) { requests.push({ url: "/api/hosts", headers: {} }); hostsRequested = true }
      return hostsQuery
    },
    usePackageSearch: (name) => {
      if (name && name !== lastPackage) {
        const url = `/api/packages/${encodeURIComponent(name)}/hosts`
        requests.push({ url, headers: {} }); packageRequests.push(url); lastPackage = name
      } else if (!name) lastPackage = ""
      return packageQuery
    },
  },
}
const searchModule = { exports: {} }
runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, {
  exports: searchModule.exports, document: documentStub, require: (name) => {
  if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
  return mocks[name]
} })
function reset(hosts = { items: [] }, packages = { items: [] }) {
  slots = []; index = 0; refIndex = 0; effectDeps = []; effects = []; requests = []; packageRequests = []
  hostsRequested = false; lastPackage = ""; activeElement = null; listeners.splice(0)
  hostsQuery = { data: hosts.items ? hosts : undefined, isLoading: !!hosts.loading, error: hosts.error ?? null }; packageQuery = { data: packages, isLoading: false, error: null }
}
function walk(node, visit) {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  if (React.isValidElement(node)) { visit(node); walk(node.props.children, visit) }
}
function find(predicate) { let found; walk(tree, (node) => { if (!found && predicate(node)) found = node }); return found }
function render() { index = 0; refIndex = 0; effects = []; tree = searchModule.exports.GlobalSearch(); effects.forEach((effect) => effect()); return tree }
const markup = () => renderToStaticMarkup(tree)
function open() { find((node) => node.type === "button" && node.props["aria-label"] === "Search").props.onClick(); render() }
function type(value) { find((node) => node.type === "input").props.onChange({ target: { value } }); render() }
function submit() { find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); render() }
test("searchDialogKeyboardAndResultStates", () => {
  reset({ items: [], loading: true }); render(); open()
  assert.equal(find((node) => node.props.role === "dialog").props["aria-modal"], "true")
  assert.equal(activeElement, "Search pages, hosts, or packages")
  assert.match(markup(), /Loading hosts\.\.\./)
  find((node) => node.props.role === "dialog").props.onKeyDown({ key: "Escape", preventDefault() {} }); render(); assert.equal(activeElement, "Search")
  listeners[0]({ ctrlKey: true, key: "k", preventDefault() {} }); render(); assert.ok(find((node) => node.props.role === "dialog"))
  find((node) => node.props.role === "dialog").props.onKeyDown({ key: "Escape", preventDefault() {} }); render()
  listeners[0]({ metaKey: true, key: "k", preventDefault() {} }); render(); type("no-matching-result")
  hostsQuery = { data: { items: [] }, isLoading: false, error: null }; render()
  assert.match(markup(), /No results found\./); hostsQuery = { data: undefined, isLoading: false, error: new Error("failed") }; render()
  assert.match(markup(), /Search failed\. Please try again\./)
  reset({ items: [] }); render(); open(); type("package-status")
  packageQuery = { data: undefined, isLoading: true, error: null }; submit()
  assert.equal(find((node) => node.props.role === "status").props.children, "Loading package results...")
  packageQuery = { data: { items: [] }, isLoading: false, error: null }; render()
  assert.equal(find((node) => node.props.role === "status").props.children, "No results found.")
  packageQuery = { data: undefined, isLoading: false, error: new Error("failed") }; render()
  assert.equal(find((node) => node.props.role === "alert").props.children, "Package search failed. Please try again.")
  assert.equal(find((node) => node.props.role === "status"), undefined)
})
test("searchTriggerKeepsAnAccessibleIconWhenMobileLabelsAreHidden", () => {
  reset(); render()
  const trigger = find((node) => node.type === "button" && node.props["aria-label"] === "Search")
  assert.equal(trigger.props["aria-label"], "Search")
  assert.equal(find((node) => node.type === "span" && node.props.children === "Search").props.className, "hidden sm:inline")
  assert.equal(find((node) => node.type === "kbd").props.className, "hidden text-xs text-muted-foreground sm:inline")
  open()
  assert.equal(find((node) => node.props.role === "dialog").props["aria-modal"], "true")
})
test("packageLookupIsExplicitAndBounded", () => {
  reset({ items: [{ hostname: "node-01" }] }); render(); open(); type("pkg & #?")
  assert.equal(packageRequests.length, 0); assert.deepEqual(requests.map(({ url }) => url), ["/api/hosts"])
  submit(); assert.equal(packageRequests.length, 1)
  assert.deepEqual(packageRequests, ["/api/packages/pkg%20%26%20%23%3F/hosts"])
  type("another package"); assert.equal(packageRequests.length, 1)
  assert.equal(requests.some(({ url }) => url.includes("/updates")), false)
})
test("untrustedValuesStayTextAndDestinationsStaySameOrigin", () => {
  const hostile = ['"><svg onload=alert(1)>', "<img src=x onerror=alert(1)>", "javascript:alert(1)"]
  reset({ items: hostile.map((hostname) => ({ hostname })) }); render(); open()
  for (const value of hostile) {
    type(value)
    assert.ok(markup().includes(value.replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")))
    assert.doesNotMatch(markup(), /<svg onload=|<img src=x onerror=/)
  }
  for (const href of ["javascript:alert(1)", "https://evil.example", "//evil.example"]) {
    assert.equal(isSafeSearchDestination(href, hostile), false, href)
  }
  assert.equal(isSafeSearchDestination("/hosts/node-01", ["node-01"]), true); assert.equal(isSafeSearchDestination("/hosts/node-01", []), false)
  const href = createPackageSearchHref("pkg & #?")
  assert.equal(href, "/packages?q=pkg+%26+%23%3F")
  assert.equal(new URLSearchParams(href.split("?")[1]).get("q"), "pkg & #?")
})
test("searchUsesOnlyApprovedSources", () => {
  reset({ items: [{ hostname: "packages-node" }] }, { items: [{ hostname: "packages-node", package_name: "packages" }] })
  render(); open(); type("packages"); submit()
  assert.equal(approvedSearchPages.map(({ href }) => href).join(","), "/,/hosts,/packages,/activity,/security,/kernels,/admin")
  for (const label of ["Page", "Host", "Package"]) assert.ok(markup().includes(`>${label}</span>`))
  assert.ok(markup().includes('href="/hosts/packages-node"') && markup().includes('href="/packages?q=packages"'))
  assert.deepEqual(requests.map(({ url }) => url), ["/api/hosts", "/api/packages/packages/hosts"])
  for (const path of ["/api/admin/ingest-diagnostics", "/api/admin/webhook-coverage", "/api/admin/webhooks"]) {
    assert.equal(requests.filter(({ url }) => url === path).length, 0)
  }
  assert.match(packagePage, /useState\(initialQuery\)[\s\S]*useState\(initialQuery\)[\s\S]*useSearchParams\(\)\.get\("q"\) \?\? ""[\s\S]*key=\{initialQuery\}/)
})
test("searchKeepsCredentialsBehindProxy", () => {
  reset({ items: [{ hostname: "node-01" }] }, { items: [{ hostname: "node-01", package_name: "safe" }] })
  render(); open(); type("safe"); submit()
  const data = JSON.stringify({ requests, hostsQuery, packageQuery })
  for (const sentinel of ["FLUXION_API_KEY", "FLUXION_SERVICE_TOKEN_SENTINEL"]) assert.equal(data.includes(sentinel), false)
  assert.deepEqual(requests.map(({ url }) => url), ["/api/hosts", "/api/packages/safe/hosts"])
  assert.ok(requests.every(({ headers }) => Object.keys(headers).length === 0))
})
