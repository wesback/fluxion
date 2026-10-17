import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const { QueryClient, QueryClientProvider, useQuery } = require("@tanstack/react-query")
const ts = require("typescript")
const fixedTime = Date.parse("2026-01-01T00:00:00.000Z")
let currentTime = fixedTime
let queryClientForPage = false
let observedRequests = []
let fetchSpyCalls = []
let adminHookCalls = []
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [currentTime])) }
  static now() { return currentTime }
}
const helper = { exports: {} }
runInNewContext(ts.transpileModule(readFileSync(join(root, "lib/host-health.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: helper.exports, Date: FixedDate })
const days = (value) => new Date(currentTime - value * 86400000).toISOString()
let query
let requests = 0
const pageSource = readFileSync(join(root, "app/alerts/page.tsx"), "utf8")
const page = { exports: {} }
runInNewContext(ts.transpileModule(pageSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports: page.exports,
  Date: FixedDate,
  encodeURIComponent,
  require: (name) => {
    if (name === "react/jsx-runtime") return require("react/jsx-runtime")
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) }
    if (name === "lucide-react") return { AlertTriangle: () => null, RefreshCw: () => null }
    if (name === "@/components/ui/button") return { Button: ({ children, ...props }) => React.createElement("button", props, children) }
    if (name === "@/lib/host-health") return helper.exports
    if (name === "@/lib/hooks/use-api") return {
      useHosts: () => queryClientForPage
        ? useQuery({ queryKey: ["hosts"], queryFn: async () => {
          observedRequests.push("/api/hosts")
          return query
        }, staleTime: Infinity })
        : query,
      useIngestDiagnostics: () => useAdminQuery("/api/admin/ingest-diagnostics"),
      useWebhookCoverage: () => useAdminQuery("/api/admin/webhook-coverage"),
      useWebhooks: () => useAdminQuery("/api/admin/webhooks"),
    }
    throw new Error(`Unexpected page dependency: ${name}`)
  },
  fetch: async (url) => {
    fetchSpyCalls.push(String(url))
    return { ok: true, json: async () => ({}) }
  },
})
function useAdminQuery(endpoint) {
  adminHookCalls.push(endpoint)
  return useQuery({
    queryKey: [endpoint],
    queryFn: async () => {
      observedRequests.push(endpoint)
      return { marker: `${endpoint}-response` }
    },
    retry: false,
  })
}
function configure(data, options = {}) {
  requests = options.requests ?? 1
  query = { data, isLoading: false, isFetching: false, error: null,
    dataUpdatedAt: data ? fixedTime : 0, refetch: async () => { requests++; return { data } }, ...options }
}
function resolve(node) {
  if (Array.isArray(node)) return node.map((child, index) => {
    const resolved = resolve(child)
    return React.isValidElement(resolved) && resolved.key === null
      ? React.cloneElement(resolved, { key: `test-${index}` })
      : resolved
  })
  if (!React.isValidElement(node)) return node
  if (typeof node.type === "function") return resolve(node.type(node.props))
  if (node.type === React.Fragment) return resolve(node.props.children)
  return React.cloneElement(node, { children: resolve(node.props.children) })
}
function render() {
  const tree = resolve(page.exports.default())
  return { tree, markup: renderToStaticMarkup(tree) }
}
function renderWithQueryClient(client) {
  const tree = React.createElement(QueryClientProvider, {
    client,
    children: React.createElement(page.exports.default),
  })
  return { tree, markup: renderToStaticMarkup(tree) }
}
function elements(node, predicate, found = []) {
  if (Array.isArray(node)) node.forEach((child) => elements(child, predicate, found))
  else if (React.isValidElement(node)) {
    if (predicate(node)) found.push(node)
    elements(node.props.children, predicate, found)
  }
  return found
}
test("hostSignalsAreCurrentReadOnlyAndStable", () => {
  const input = [
    { hostname: "z-missing", last_seen: null },
    { hostname: "b-healthy", last_seen: days(30) },
    { hostname: "a-healthy", last_seen: days(30) },
    { hostname: "a-stale", last_seen: days(30 + 1 / 86400000) },
    { hostname: "b-missing", last_seen: days(365 + 1 / 86400000) },
    { hostname: "c-stale", last_seen: days(365) },
    { hostname: "a-missing", last_seen: days(366) },
  ]
  const expected = ["a-missing", "b-missing", "z-missing", "a-stale", "c-stale"]
  assert.equal(helper.exports.getHostHealthStatus("invalid", new FixedDate()), "missing")
  configure({ items: input })
  const first = render()
  assert.deepEqual(elements(first.tree, (e) => e.type === "li").map((e) => [e.key, e.props.children[0].props.children, e.props.children[1].props.children]), expected.map((host) => [
    `${host.includes("missing") ? "missing" : "stale"}:${host}`,
    host.includes("missing") ? "Missing" : "Stale",
    host,
  ]))
  assert.match(first.markup, /Missing hosts<\/dt><dd[^>]*>3</)
  assert.match(first.markup, /Stale hosts<\/dt><dd[^>]*>2</)
  assert.match(first.markup, /Source: Package reporters/)
  assert.ok(first.markup.includes(new Date(fixedTime).toISOString()))
  assert.doesNotMatch(first.markup, /acknowledge|resolve|snooze|dispatch|incident/i)
  configure({ items: input.map((host) => ({
    ...host, last_seen: host.hostname.includes("missing") ? days(366) :
      host.hostname.includes("stale") ? days(31) : days(30),
  })) }, { dataUpdatedAt: fixedTime + 1000 })
  const second = render()
  assert.deepEqual(elements(second.tree, (e) => e.type === "li").map((e) => e.key), elements(first.tree, (e) => e.type === "li").map((e) => e.key))
})
test("signalTextAndHostLinksAreSafe", () => {
  const names = ['"><svg onload=alert(1)>', "<img src=x onerror=alert(1)>", "javascript:alert(1)"]
  configure({ items: names.map((hostname) => ({ hostname, last_seen: null })) })
  const { tree, markup } = render()
  const links = elements(tree, (e) => e.type === "a")
  assert.deepEqual(links.map((link) => [link.props.children, link.props.href]), names.map((hostname) => [
    hostname, `/hosts?q=${encodeURIComponent(hostname)}&status=missing`,
  ]))
  for (const hostname of names) {
    assert.ok(markup.includes(hostname.replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")))
    const url = new URL(links.find((link) => link.props.children === hostname).props.href, "https://same.test")
    assert.equal(url.origin, "https://same.test")
    assert.equal(url.pathname, "/hosts")
    assert.equal(url.searchParams.get("q"), hostname)
  }
  assert.doesNotMatch(markup, /<svg|<img|href="javascript:/)
})
test("adminDataIsNotRequestedOrCached", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const secrets = ["diagnostics-secret", "coverage-secret", "webhooks-secret"]
  const keys = ["/api/admin/ingest-diagnostics", "/api/admin/webhook-coverage", "/api/admin/webhooks"]
  keys.forEach((key, i) => client.setQueryData([key], { marker: secrets[i] }))
  const hostData = { items: [{ hostname: "reporting-host", last_seen: null }] }
  configure(hostData)
  client.setQueryData(["hosts"], hostData)
  const cacheBeforeRender = client.getQueryCache().getAll().map(({ queryKey, state }) => [queryKey, state.data])
  observedRequests = []
  fetchSpyCalls = []
  adminHookCalls = []
  queryClientForPage = true
  let markup
  try {
    markup = renderWithQueryClient(client).markup
  } finally {
    queryClientForPage = false
  }
  assert.deepEqual(adminHookCalls, [])
  assert.deepEqual(observedRequests, [])
  assert.deepEqual(fetchSpyCalls, [])
  assert.ok(markup.includes("reporting-host"))
  for (const secret of secrets) assert.ok(!markup.includes(secret))
  assert.deepEqual(
    client.getQueryCache().getAll().map(({ queryKey, state }) => [queryKey, state.data]),
    cacheBeforeRender,
  )
  assert.deepEqual(keys.map((key) => client.getQueryData([key])), secrets.map((marker) => ({ marker })))
  assert.ok(markup.includes("Admin signals are not loaded on this page; host reporter signals remain available."))
  assert.doesNotMatch(pageSource, /\/api\/admin\/(?:ingest-diagnostics|webhook-coverage|webhooks)/)
})
test("hostAlertStatesNeverHideFailure", () => {
  const states = [
    [{ items: [] }, {}, "No missing or stale package reporters", "Missing hosts", "0"],
    [{ items: [{ hostname: "old-host", last_seen: days(31) }] }, { dataUpdatedAt: fixedTime }, "Stale hosts", "Stale hosts", "1"],
    [{ items: [{ hostname: "cached", last_seen: null }] }, { error: new Error("denied") }, "stale cached reporter signals", "Missing hosts", "1"],
    [undefined, { error: new Error("denied") }, "Failed to load package reporter signals.", "Missing hosts", null],
    [{ items: [{}] }, {}, "invalid host response", "Missing hosts", null],
    [{ items: [{ hostname: "", last_seen: null }] }, {}, "invalid host response", "Missing hosts", null],
    [{ items: [{ hostname: "bad-date", last_seen: "yesterday-ish" }] }, {}, "invalid host response", "Missing hosts", null],
    [{ items: [{ hostname: "missing-last-seen" }] }, {}, "invalid host response", "Missing hosts", null],
  ]
  for (const [data, options, text, countLabel, count] of states) {
    configure(data, options)
    const { markup } = render()
    assert.ok(markup.includes(text), text)
    if (count === null) assert.doesNotMatch(markup, /Missing hosts<\/dt>/)
    else assert.match(markup, new RegExp(`${countLabel}<\\/dt><dd[^>]*>${count}<`))
  }
  configure(undefined, { isLoading: true, error: null })
  assert.match(render().markup, /Loading package reporter signals/)
  configure({ nope: [] })
  assert.match(render().markup, /invalid host response/)
  configure({ items: [{ hostname: "cached", last_seen: null }] }, { error: new Error("refresh"), dataUpdatedAt: fixedTime })
  const stale = render().markup
  assert.ok(stale.includes(`Stale · last successful fetch: <time dateTime="${new Date(fixedTime).toISOString()}">`))
  assert.doesNotMatch(stale, /Healthy/)
})
test("alertsDoNotPoll", async () => {
  const useApiSource = readFileSync(join(root, "lib/hooks/use-api.ts"), "utf8")
  const hostHook = useApiSource.split("export function useHosts")[1].split("\n/**")[0]
  assert.ok(/useHosts\(\)/.test(pageSource) && /queryKey:\s*queryKeys\.hosts/.test(hostHook) &&
    !/refetchInterval/.test(hostHook) && !/setInterval|refetchInterval/.test(pageSource))
  configure({ items: [{ hostname: "one", last_seen: null }] })
  const { tree } = render()
  const before = requests
  currentTime += 2 * 60 * 1000
  assert.equal(requests, before)
  const refresh = elements(tree, (e) => e.type === "button")[0]
  await refresh.props.onClick()
  assert.equal(requests, before + 1)
})
