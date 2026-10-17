import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const pagePath = join(root, "app/reports/page.tsx")
const hooksPath = join(root, "lib/hooks/use-api.ts")
assert.equal(existsSync(pagePath), true, "/reports page must exist")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const typescript = require("typescript")
const compiled = typescript.transpileModule(readFileSync(pagePath, "utf8"), { compilerOptions: {
  jsx: typescript.JsxEmit.ReactJSX, module: typescript.ModuleKind.CommonJS,
} }).outputText
let search = ""
let activity = { items: [] }
let security = { items: [] }
const requests = []
const securityRequests = []
const refreshCalls = { activity: 0, security: 0 }
let sourceMocks = { activity: null, security: null }
let buttonActions = []
let fakeNow = Date.now()
const noop = () => {}
const Icon = () => React.createElement("svg", { "aria-hidden": "true" })
const StatsCard = ({ title, value }) => React.createElement("article", { "data-title": title }, React.createElement("h3", null, title), React.createElement("output", null, value))
const LineChart = ({ title, data }) => React.createElement("div", { role: "img", "aria-label": title }, data.map((point) => React.createElement("span", { key: point.name }, `${point.name}: ${point.value}`)))
const plain = (value) => JSON.parse(JSON.stringify(value))
const dateClock = class extends Date {
  constructor(...args) { super(...(args.length ? args : [fakeNow])) }
  static now() { return fakeNow }
}
function queryResult(source, fallbackData) {
  const mock = sourceMocks[source] ?? {}
  const data = Object.hasOwn(mock, "data") ? mock.data : fallbackData
  return {
    data,
    isLoading: mock.isLoading ?? false,
    isFetching: mock.isFetching ?? false,
    error: mock.error ?? null,
    dataUpdatedAt: mock.dataUpdatedAt ?? 0,
    refetch: () => {
      refreshCalls[source] += 1
      return Promise.resolve({ data })
    },
  }
}
function loadPage(queryHooks) {
  const pageModule = { exports: {} }
  runInNewContext(compiled, {
    exports: pageModule.exports,
    URLSearchParams,
    Date: dateClock,
    Promise,
    window: { get location() { return { search, pathname: "/reports" } }, history: { replaceState: noop } },
    require: (name) => {
      if (name === "react/jsx-runtime") return require("react/jsx-runtime")
      if (name === "lucide-react") return { Activity: Icon, RefreshCw: Icon }
      if (name === "@/lib/hooks/use-api") return queryHooks ?? {
        useActivity: (options, queryOptions) => {
          if (queryOptions.enabled) requests.push(options)
          return queryResult("activity", activity)
        },
        useSecurityFeed: (options, queryOptions) => {
          if (queryOptions.enabled) securityRequests.push(options)
          return queryResult("security", security)
        },
      }
      if (name === "@/lib/hooks/use-query-state") return {
        useQueryState: (key, fallback = "") => [new URLSearchParams(search).get(key) ?? fallback, noop], useQueryStateReady: () => true,
      }
      if (name === "@/components/filter-bar") return { FilterBar: ({ children }) => children }
      if (name === "@/components/ui/skeleton") return { ChartSkeleton: () => React.createElement("div", { role: "status" }, "Loading report data...") }
      if (name === "@/components/ui/card") return { Card: ({ children, ...props }) => React.createElement("div", props, children) }
      if (name === "@/components/ui/input") return { Input: (props) => React.createElement("input", props) }
      if (name === "@/components/ui/select") return { Select: (props) => React.createElement("select", props) }
      if (name === "@/components/ui/button") return { Button: ({ children, onClick, ...props }) => {
        delete props.variant
        if (onClick) buttonActions.push(onClick)
        return React.createElement("button", props, children)
      } }
      if (name === "@/components/charts/line-chart") return { LineChart }
      if (name === "@/components/stats-card") return { StatsCard }
      if (name === "@/components/error-boundary") return { ErrorBoundary: ({ children }) => children }
      if (name === "sonner") return { toast: { promise: (promise) => promise } }
      throw new Error(`Unexpected reports dependency: ${name}`)
    },
  })
  return pageModule.exports
}
function renderReport(query, { client, queryHooks } = {}) {
  search = query
  buttonActions = []
  const page = React.createElement(loadPage(queryHooks).default)
  return renderToStaticMarkup(client
    ? React.createElement(require("@tanstack/react-query").QueryClientProvider, { client, children: page })
    : page)
}
function setSources(next) {
  sourceMocks = { activity: null, security: null, ...next }
  requests.length = 0
  securityRequests.length = 0
  refreshCalls.activity = 0
  refreshCalls.security = 0
}

test("reportFilterContract", () => {
  const { parseReportFilters, activityOptionsForReport } = loadPage()
  const now = new Date(2026, 9, 17, 12)
  const defaults = parseReportFilters("", now)
  assert.deepEqual([defaults.fromDate, defaults.toDate, defaults.bucket], ["2026-10-11", "2026-10-17", "day"])

  const parsed = parseReportFilters("?host=node-1&package=openssl&from=2026-10-12&to=2026-10-16&security=false&install=true&kernel=false&bucket=week", now)
  assert.deepEqual(plain(activityOptionsForReport(parsed)), {
    hostname: "node-1", package_name: "openssl", from_date: "2026-10-12", to_date: "2026-10-16",
    is_security: false, is_install: true, is_kernel: false, bucket: "week",
  })
  assert.deepEqual(plain(activityOptionsForReport(parseReportFilters("?host=node-2&bucket=hour", now))), {
    hostname: "node-2",
    from_date: "2026-10-11",
    to_date: "2026-10-17",
    bucket: "hour",
  })
  for (const [key, option] of [["security", "is_security"], ["install", "is_install"], ["kernel", "is_kernel"]])
    for (const value of ["true", "false"])
      assert.equal(plain(activityOptionsForReport(parseReportFilters(`?${key}=${value}`, now)))[option], value === "true", `${key}=${value}`)
  for (const invalid of [
    "?tenant=outside", "?role=admin", "?debug=true", "?host=node-1&host=node-2",
    "?host=", "?bucket=month", "?security=yes", "?from=2026-10-18&to=2026-10-17",
  ]) {
    requests.length = 0
    assert.equal(parseReportFilters(invalid, now), null, invalid)
    renderReport(invalid)
    assert.equal(requests.length, 0, `${invalid} must not request activity`)
  }
})

test("reportTotalsUseReturnedBuckets", () => {
  search = "?from=2026-10-11&to=2026-10-17&bucket=day"
  activity = { items: [
    { bucket: "2026-10-16", updates: 7, installs: 2, upgrades: 5, security_updates: 1, kernel_updates: 2 },
    { bucket: "2026-10-17", updates: 5, installs: 1, upgrades: 4, security_updates: 3, kernel_updates: 1 },
  ] }
  requests.length = 0
  const markup = renderReport(search)
  const totals = [...markup.matchAll(/<article data-title="([^"]+)"><h3>\1<\/h3><output>(\d+)<\/output><\/article>/g)].map(([, title, value]) => [title, Number(value)])
  assert.deepEqual(totals, [
    ["Updates", 12], ["Installs", 3], ["Upgrades", 9],
    ["Security Updates", 4], ["Kernel Updates", 3],
  ])
  assert.deepEqual(plain(requests), [{ from_date: "2026-10-11", to_date: "2026-10-17", bucket: "day" }])
  assert.match(markup, /aria-label="Updates over time"/); assert.match(markup, /Oct 16: 7/); assert.match(markup, /Oct 17: 5/)
  assert.doesNotMatch(markup, /package_name|raw-update/)
  assert.match(markup, /Reports/)
})

test("hourlyReportChartLabelsIncludeTimes", () => {
  search = "?from=2026-10-17&to=2026-10-17&bucket=hour"
  activity = { items: [
    { bucket: "2026-10-17T10:00:00", updates: 4, installs: 0, upgrades: 4, security_updates: 0, kernel_updates: 0 },
    { bucket: "2026-10-17T11:00:00", updates: 6, installs: 0, upgrades: 6, security_updates: 0, kernel_updates: 0 },
  ] }
  const markup = renderReport(search)
  const chartMarkup = markup.match(/<div role="img" aria-label="Updates over time">([\s\S]*?)<\/div>/)?.[1]
  assert.notEqual(chartMarkup, undefined)
  const labels = [...chartMarkup.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map(([, label]) => label)
  const formatHourlyLabel = (bucket, updates) =>
    `${new Date(bucket).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}: ${updates}`
  assert.deepEqual(labels, [
    formatHourlyLabel("2026-10-17T10:00:00", 4),
    formatHourlyLabel("2026-10-17T11:00:00", 6),
  ])
  assert.notEqual(labels[0], labels[1])
})

test("dailyReportChartLabelsPreserveCalendarDatesInNegativeTimezones", () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = "America/Los_Angeles"
  try {
    search = "?from=2026-10-16&to=2026-10-16&bucket=day"
    activity = { items: [
      { bucket: "2026-10-16", updates: 7, installs: 0, upgrades: 7, security_updates: 0, kernel_updates: 0 },
    ] }
    const markup = renderReport(search)
    const chartMarkup = markup.match(/<div role="img" aria-label="Updates over time">([\s\S]*?)<\/div>/)?.[1]
    assert.notEqual(chartMarkup, undefined)
    const labels = [...chartMarkup.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map(([, label]) => label)
    assert.deepEqual(labels, ["Oct 16: 7"])
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

const activityData = (bucket = "2026-10-17", updates = 1) => ({ items: [{ bucket, updates, installs: 0, upgrades: updates, security_updates: 0, kernel_updates: 0 }] })
const securityData = (hostname = "host-1", package_name = "pkg-1", new_version = "2") => ({ items: [{ hostname, package_name, old_version: "1", new_version }] })

test("reportSourcesFailIndependently", () => {
  const query = "?from=2026-10-11&to=2026-10-17&bucket=day"
  setSources({ activity: { data: null, isLoading: true }, security: { data: null, isLoading: true } })
  let markup = renderReport(query)
  assert.equal((markup.match(/Loading report data\.\.\./g) ?? []).length, 2)

  setSources({ activity: { data: { items: [] } }, security: { data: { items: [] } } })
  markup = renderReport(query)
  assert.match(markup, /There is no activity for this report\./)
  assert.match(markup, /There are no security updates for this report\./)
  assert.doesNotMatch(markup, /data-title="Updates"/)

  for (const [source, status] of [["activity", 401], ["activity", 403], ["security", 401], ["security", 403]]) {
    const other = source === "activity" ? "security" : "activity"
    setSources({ [source]: { data: null, error: { status } }, [other]: { data: source === "activity" ? securityData("ok-host") : activityData() } })
    markup = renderReport(query)
    assert.match(markup, new RegExp(`Access denied to ${source} report\\.`))
    assert.match(markup, source === "activity" ? /ok-host/ : /data-title="Updates"/)
  }
  for (const [source, status] of [["activity", 500], ["security", 502]]) {
    const other = source === "activity" ? "security" : "activity"
    setSources({ [source]: { data: null, error: { status } }, [other]: { data: source === "activity" ? securityData("ok-host") : activityData() } })
    markup = renderReport(query)
    assert.match(markup, new RegExp(`Failed to load ${source} report\\.`))
    assert.match(markup, source === "activity" ? /ok-host/ : /data-title="Updates"/)
    assert.doesNotMatch(markup, source === "activity" ? /data-title="Updates"/ : /There are no security updates/)
  }
  const updatedAt = fakeNow = Date.UTC(2026, 9, 17, 6, 45)
  for (const source of ["activity", "security"]) {
    const other = source === "activity" ? "security" : "activity"
    setSources({
      [source]: { data: source === "activity" ? activityData(undefined, 7) : securityData("cached-host"), error: { status: 500 }, dataUpdatedAt: updatedAt },
      [other]: { data: source === "activity" ? securityData() : activityData() },
    })
    markup = renderReport(query)
    const timestamp = new Date(updatedAt).toISOString()
    assert.match(markup, new RegExp(`This report is stale[\\s\\S]*<time dateTime="${timestamp}">${timestamp}</time>`))
    assert.match(markup, source === "activity" ? /data-title="Updates"/ : /cached-host/)
    assert.doesNotMatch(markup, /Failed to load/)
  }
})

test("reportDrilldownsUseSupportedRoutesAndParameters", () => {
  setSources({ activity: { data: activityData("2026-10-16", 3) }, security: { data: securityData("host-2", "kernel") } })
  const markup = renderReport("?host=node-1&package=openssl&from=2026-10-12&to=2026-10-16&security=false&install=true&kernel=false&bucket=week")
  const urls = [...markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>/g)]
    .map(([, href]) => new URL(href.replace(/&amp;/g, "&"), "https://reports.test"))
  const allowed = { "/hosts": ["q"], "/activity": ["host", "package", "from", "to", "security", "install", "kernel", "bucket"], "/security": ["host", "package", "window"] }
  const actual = urls.map((url) => `${url.pathname}?${url.searchParams}`).sort()
  assert.deepEqual(actual, [
    "/activity?host=node-1&package=openssl&from=2026-10-12&to=2026-10-16&security=false&install=true&kernel=false&bucket=week",
    "/activity?host=host-2&package=kernel&from=2026-10-12&to=2026-10-16&security=false&install=true&kernel=false&bucket=week",
    "/hosts?q=host-2", "/security?host=host-2&package=kernel&window=168",
  ].sort())
  for (const url of urls) {
    assert.equal(url.origin, "https://reports.test")
    assert.ok(allowed[url.pathname])
    assert.ok([...url.searchParams.keys()].every((key) => allowed[url.pathname].includes(key)))
  }
})

test("reportTextAndLinksAreSafe", () => {
  const values = ['\"><svg onload=alert(1)>', "<img src=x onerror=alert(1)>", "javascript:alert(1)"]
  const escaped = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  for (const value of values) {
    setSources({ activity: { data: activityData(value) }, security: { data: securityData(value, value, value) } })
    const markup = renderReport("?from=2026-10-11&to=2026-10-17&bucket=day")
    assert.ok(markup.includes(`<span>${escaped(value)}</span>`))
    assert.ok(markup.includes(`>${escaped(value)}</a>`))
    assert.ok(markup.includes(`<p>1 → ${escaped(value)}</p>`))
    assert.doesNotMatch([...markup.matchAll(/<[^>]+>/g)].map(([tag]) => tag).join(" "), /<img\b|\son[a-z]+\s*=/i)
    for (const [, raw] of markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>/g)) {
      const href = raw.replace(/&amp;/g, "&"), url = new URL(href, "https://reports.test")
      assert.equal(url.origin, "https://reports.test")
      assert.ok(["/activity", "/hosts", "/security"].includes(url.pathname))
      assert.doesNotMatch(href, /^javascript:/i)
    }
  }
})

test("reportsDoNotPoll", async () => {
  const { QueryClient, QueryObserver, useQuery } = require("@tanstack/react-query")
  const apiCalls = { activity: 0, security: 0 }
  const queryOptions = []
  const apiHooksModule = { exports: {} }
  const instrumentedApiClient = {
    getActivity: async () => { apiCalls.activity += 1; return activityData() },
    getSecurityFeed: async () => { apiCalls.security += 1; return securityData() },
  }
  const queryHooksSource = typescript.transpileModule(readFileSync(hooksPath, "utf8"), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS },
  }).outputText
  runInNewContext(queryHooksSource, {
    exports: apiHooksModule.exports,
    require: (name) => {
      if (name === "@tanstack/react-query") return {
        ...require("@tanstack/react-query"),
        useQuery: (options) => {
          queryOptions.push(options)
          return useQuery(options)
        },
      }
      if (name === "../telemetry/api-client") return {
        instrumentedApiClient, ApiError: class ApiError extends Error {},
      }
      if (name === "sonner") return { toast: { error: noop } }
      throw new Error(`Unexpected query hook dependency: ${name}`)
    },
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const originalDate = globalThis.Date
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  const originalSetImmediate = globalThis.setImmediate
  const originalFakeNow = fakeNow
  const timerStart = fakeNow = Date.UTC(2026, 9, 17, 6, 50)
  const timers = new Map()
  let timerClock = 0
  let nextTimerId = 0
  globalThis.Date = class extends originalDate {
    constructor(...args) { super(...(args.length ? args : [fakeNow])) }
    static now() { return fakeNow }
  }
  globalThis.setTimeout = (callback, delay, ...args) => {
    const id = ++nextTimerId
    const timeout = Number.isFinite(Number(delay)) ? Number(delay) : 0
    timers.set(id, { callback: () => callback(...args), delay: timeout, nextAt: timerClock + timeout, interval: false })
    return id
  }
  globalThis.clearTimeout = (id) => timers.delete(id)
  globalThis.setInterval = (callback, delay, ...args) => {
    const id = ++nextTimerId
    const timeout = Number.isFinite(Number(delay)) ? Number(delay) : 0
    timers.set(id, { callback: () => callback(...args), delay: timeout, nextAt: timerClock + timeout, interval: true })
    return id
  }
  globalThis.clearInterval = (id) => timers.delete(id)
  const advanceTimers = async (milliseconds) => {
    const end = timerClock + milliseconds
    let callbacksRun = 0
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.nextAt <= end)
        .sort(([, a], [, b]) => a.nextAt - b.nextAt)[0]
      if (!due) break
      const [id, timer] = due
      timerClock = timer.nextAt
      fakeNow = timerStart + timerClock
      if (timer.interval) timer.nextAt += Math.max(timer.delay, 1)
      else timers.delete(id)
      timer.callback()
      await Promise.resolve()
      await new Promise((resolve) => originalSetImmediate(resolve))
      callbacksRun += 1
      assert.ok(callbacksRun < 10000, "fake clock must not enter an unbounded timer loop")
    }
    timerClock = end
    fakeNow = timerStart + timerClock
  }
  const subscriptions = []
  try {
    renderReport("?from=2026-10-11&to=2026-10-17&bucket=day", {
      client: queryClient,
      queryHooks: apiHooksModule.exports,
    })
    assert.deepEqual(queryOptions.map(({ queryKey }) => queryKey[0]), ["activity", "security"])
    assert.deepEqual(apiCalls, { activity: 0, security: 0 })
    await Promise.all(queryOptions.map((options) => queryClient.fetchQuery(options)))
    assert.deepEqual(apiCalls, { activity: 1, security: 1 })
    for (const options of queryOptions) {
      const observer = new QueryObserver(queryClient, options)
      subscriptions.push(observer.subscribe(() => {}))
    }
    await advanceTimers(60 * 60 * 1000)
    assert.deepEqual(apiCalls, { activity: 1, security: 1 }, "idle reports must not issue periodic requests")
    assert.equal(buttonActions.length, 1)
    await buttonActions[0]()
    assert.deepEqual(apiCalls, { activity: 2, security: 2 }, "refresh must issue one request per active source")
  } finally {
    subscriptions.forEach((unsubscribe) => unsubscribe())
    queryClient.clear()
    globalThis.Date = originalDate
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
    fakeNow = originalFakeNow
  }
})
