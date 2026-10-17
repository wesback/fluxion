import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"

const require = createRequire(import.meta.url)
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const typescript = require("typescript")
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const page = readFileSync(join(root, "app/page.tsx"), "utf8")
const hostHealthSource = readFileSync(join(root, "lib/host-health.ts"), "utf8")
const fixedTime = Date.parse("2026-01-01T00:00:00.000Z")
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedTime])) }
  static now() { return fixedTime }
}
const hostHealthModule = { exports: {} }
runInNewContext(typescript.transpileModule(hostHealthSource, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS },
}).outputText, { exports: hostHealthModule.exports, Date: FixedDate })
const transpiledPage = typescript.transpileModule(page, {
  compilerOptions: {
    jsx: typescript.JsxEmit.ReactJSX,
    module: typescript.ModuleKind.CommonJS,
  },
}).outputText
const pageModule = { exports: {} }
const icon = () => React.createElement("svg", { "aria-hidden": "true" })
let statsResult
const noop = () => {}
let hostsResult = {
  data: { items: [] },
  isLoading: false,
  error: null,
  dataUpdatedAt: fixedTime,
  refetch: noop,
}
let retryActions = []

const StatsCard = ({ title, value, description }) => React.createElement(
  "article",
  { "data-title": title },
  React.createElement("h3", null, title),
  React.createElement("output", null, value),
  description && React.createElement("p", null, description)
)
const passthrough = ({ children }) => children

runInNewContext(transpiledPage, {
  exports: pageModule.exports,
  require: (name) => {
    if (name === "react") return React
    if (name === "react/jsx-runtime") return require("react/jsx-runtime")
    if (name === "next/dynamic") return { default: () => () => null }
    if (name === "@/components/stats-card") return { StatsCard }
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) }
    if (name === "@/components/updates-table") return { UpdatesTable: () => null }
    if (name === "lucide-react") {
      return { AlertTriangle: icon, CheckCircle2: icon, Clock: icon, RefreshCw: icon, ShieldAlert: icon }
    }
    if (name === "@/lib/hooks/use-api") {
      return {
        useStats: () => statsResult,
        useRecentUpdates: () => ({ data: { items: [] }, isLoading: false, error: null, refetch: noop }),
        useHosts: () => hostsResult,
      }
    }
    if (name === "@/components/ui/skeleton") return { TableSkeleton: () => null, ChartSkeleton: () => null }
    if (name === "@/components/error-boundary") return { ErrorBoundary: passthrough }
    if (name === "@/components/ui/button") {
      return { Button: ({ children, ...props }) => {
        if (children === "Retry") retryActions.push(props)
        return React.createElement("button", props, children)
      } }
    }
    if (name === "sonner") return { toast: { promise: noop } }
    if (name === "@/lib/telemetry") return { useRefreshTracking: () => noop }
    if (name === "@/lib/host-health") return hostHealthModule.exports
    throw new Error(`Unexpected dashboard dependency: ${name}`)
  },
  Date: FixedDate,
})

function renderDashboard(result = { data: undefined, isLoading: true }, hostResult = hostsResult) {
  statsResult = result
  hostsResult = hostResult
  retryActions = []
  return renderToStaticMarkup(React.createElement(pageModule.exports.default))
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value))
}

const daysAgo = (days) => new FixedDate(fixedTime - days * 86400000).toISOString()

function cardsInSection(markup, label) {
  const section = markup.match(
    new RegExp(`<section aria-label="${label}"[^>]*>([\\s\\S]*?)<\\/section>`)
  )
  assert.ok(section, `missing ${label} section`)
  return [...section[1].matchAll(/<article data-title="([^"]+)">[\s\S]*?<output>([\s\S]*?)<\/output>/g)]
    .map(([, title, value]) => [title, value])
}

function overviewMetrics(markup) {
  const section = markup.match(/<dl aria-label="Update activity metrics"[^>]*>([\s\S]*?)<\/dl>/)
  assert.ok(section, "missing update activity metrics")
  return [...section[1].matchAll(/<dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd>/g)]
    .map(([, title, value]) => [title, value])
}

test("dashboardSeparatesApiMetricsFromHostHealthKpis", () => {
  const fixture = {
    total_hosts: 0,
    total_updates: 1234,
    updates_last_24h: 56,
    updates_last_7d: 7890,
    security_updates_last_24h: 3,
    most_updated_packages: [],
    most_active_hosts: [],
  }
  const successful = renderDashboard({ data: fixture, isLoading: false, error: null })

  assert.deepEqual(overviewMetrics(successful), [
    ["Total hosts", "0"],
    ["Total updates", "1,234"],
    ["Last 24 hours", "56"],
    ["Last 7 days", "7,890"],
  ])
  assert.deepEqual(cardsInSection(successful, "Operational KPIs"), [
    ["Current hosts", "0"],
    ["Stale hosts", "0"],
    ["Missing hosts", "0"],
    ["Security updates", "3"],
  ])
  assert.equal(new Set(overviewMetrics(successful).map(([title]) => title)).size, 4)
  assert.doesNotMatch(successful, /uptime|latency|trend(?: percentage)?|sample/i)

  const unavailable = renderDashboard({ data: undefined, isLoading: true, error: null })
  assert.deepEqual(overviewMetrics(unavailable), [
    ["Total hosts", "—"],
    ["Total updates", "—"],
    ["Last 24 hours", "—"],
    ["Last 7 days", "—"],
  ])
  assert.deepEqual(cardsInSection(unavailable, "Operational KPIs"), [
    ["Current hosts", "0"],
    ["Stale hosts", "0"],
    ["Missing hosts", "0"],
    ["Security updates", "—"],
  ])

  const failed = renderDashboard({ data: undefined, isLoading: false, error: new Error("request failed") })
  assert.deepEqual(overviewMetrics(failed), overviewMetrics(unavailable))
  assert.match(failed, /Failed to load statistics/)

  const cachedAfterFailure = renderDashboard({
    data: fixture,
    isLoading: false,
    error: new Error("refresh failed"),
  })
  assert.deepEqual(overviewMetrics(cachedAfterFailure), overviewMetrics(successful))
  assert.deepEqual(cardsInSection(cachedAfterFailure, "Operational KPIs"), [
    ["Current hosts", "0"],
    ["Stale hosts", "0"],
    ["Missing hosts", "0"],
    ["Security updates", "3"],
  ])
  assert.match(cachedAfterFailure, /Failed to refresh statistics; showing cached values/)
  assert.doesNotMatch(cachedAfterFailure, /uptime|latency|trend(?: percentage)?|sample/i)
})

test("hostResponseParserRejectsMalformedItems", async () => {
  let response
  const hookModule = { exports: {} }
  const hookSource = readFileSync(join(root, "lib/hooks/use-api.ts"), "utf8")
  runInNewContext(typescript.transpileModule(hookSource, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS },
  }).outputText, {
    exports: hookModule.exports,
    require: (name) => {
      if (name === "@tanstack/react-query") return { useQuery: (options) => options }
      if (name === "../telemetry/api-client") return {
        ApiError: class ApiError extends Error {},
        instrumentedApiClient: { getHosts: async () => response },
      }
      if (name === "sonner") return { toast: { error: noop } }
      throw new Error(`Unexpected hook dependency: ${name}`)
    },
  })
  const query = hookModule.exports.useHosts()
  let cachedData
  const fetchAndCache = async () => {
    const data = await query.queryFn()
    cachedData = data
    return data
  }

  response = { items: [] }
  assert.deepEqual(normalize(await fetchAndCache()), { items: [] })
  const hosts = [{ hostname: "node-a", last_seen: daysAgo(1) }]
  response = { items: hosts }
  assert.deepEqual(normalize(await fetchAndCache()), { items: hosts })
  const cachedValidData = cachedData

  for (const malformed of [{}, { items: null }, { items: undefined }, { items: {} }, { items: "hosts" }]) {
    response = malformed
    await assert.rejects(fetchAndCache(), {
      name: "TypeError",
      message: "Invalid hosts response: expected an items array",
    })
    assert.strictEqual(cachedData, cachedValidData)
  }
})

test("hostHealthKpiUsesOnlySuccessfulHostData", () => {
  const cases = [
    [{ items: [{ hostname: "current", last_seen: daysAgo(1) }] }, {}, "1", "0", "0", "Healthy"],
    [{ items: [{ hostname: "old", last_seen: daysAgo(31) }] }, {}, "0", "1", "0", "Reports stale"],
    [{ items: [{ hostname: "unknown", last_seen: null }] }, {}, "0", "0", "1", "Attention needed"],
    [undefined, { isLoading: true }, "—", "—", "—", "Loading"],
    [undefined, { error: new Error("failed") }, "—", "—", "—", "Reporting health unavailable"],
    [{ items: [] }, {}, "0", "0", "0", "No hosts reporting"],
  ]
  let retryCount = 0
  for (const [data, options, current, stale, missing, status] of cases) {
    const hostQuery = {
      data, isLoading: false, error: null, dataUpdatedAt: data ? fixedTime : 0,
      refetch: () => { retryCount += 1 }, ...options,
    }
    const markup = renderDashboard(undefined, hostQuery)
    assert.deepEqual(cardsInSection(markup, "Operational KPIs").slice(0, 3), [
      ["Current hosts", current],
      ["Stale hosts", stale],
      ["Missing hosts", missing],
    ])
    assert.ok(markup.includes(status))
    assert.equal(retryActions.length, status === "Reporting health unavailable" ? 1 : 0)
    if (retryActions.length) retryActions[0].onClick()
  }
  assert.equal(retryCount, 1)
})

test("reportingHealthStateMatchesTruthTable", () => {
  const isoTime = new Date(fixedTime).toISOString()
  const fixedNow = new FixedDate(fixedTime)
  const current = { items: [{ hostname: "current", last_seen: isoTime }] }
  const stale = { items: [{ hostname: "stale", last_seen: daysAgo(31) }] }
  const missing = { items: [{ hostname: "missing", last_seen: null }] }
  const mixed = { items: [...stale.items, ...missing.items] }
  const cached = { items: [...stale.items, ...missing.items] }
  const rows = [
    [{ data: current }, "Healthy", "Package reports are current", "0 stale · 0 missing", null, false],
    [{ data: missing }, "Attention needed", "1 hosts missing", "0 stale · 1 missing", null, false],
    [{ data: mixed }, "Attention needed", "1 hosts missing", "1 stale · 1 missing", null, false],
    [{ data: stale }, "Reports stale", "1 hosts stale", "1 stale · 0 missing", null, false],
    [{ data: { items: [] } }, "No hosts reporting", null, "0 stale · 0 missing", null, false],
    [{ isLoading: true }, "Loading", null, null, null, false],
    [{ error: new Error("failed") }, "Reporting health unavailable", null, null, null, true],
    [{ data: { nope: [] } }, "Reporting health unavailable", null, null, null, true],
    [{ error: Object.assign(new Error("denied"), { status: 401 }) }, "Reporting health unavailable", null, null, null, true],
    [{ data: cached, error: Object.assign(new Error("denied"), { status: 403 }), dataUpdatedAt: fixedTime }, "Reporting data may be stale", `Last successful host check: ${isoTime}`, "1 stale · 1 missing", isoTime, false],
    [{ data: cached, error: new Error("failed"), dataUpdatedAt: fixedTime }, "Reporting data may be stale", `Last successful host check: ${isoTime}`, "1 stale · 1 missing", isoTime, false],
    [{ data: cached, error: new TypeError("Invalid hosts response"), dataUpdatedAt: fixedTime }, "Reporting data may be stale", `Last successful host check: ${isoTime}`, "1 stale · 1 missing", isoTime, false],
  ]

  for (const [query, status, message, counts, lastSuccessfulCheck, canRetry] of rows) {
    const state = hostHealthModule.exports.getReportingHealthState(query, fixedNow)
    assert.deepEqual(normalize(state), { status, message, counts: counts ? {
      stale: Number(counts.match(/(\d+) stale/)[1]), missing: Number(counts.match(/(\d+) missing/)[1]),
    } : null, lastSuccessfulCheck, canRetry })
    if (state.counts) assert.equal(hostHealthModule.exports.formatHostHealthCounts(state.counts), counts)
    const hostQuery = {
      data: query.data, isLoading: false, error: null, dataUpdatedAt: 0, refetch: noop, ...query,
    }
    const markup = renderDashboard(undefined, hostQuery)
    const currentCount = state.counts && Array.isArray(query.data?.items)
      ? String(query.data.items.length - state.counts.stale - state.counts.missing)
      : "—"
    assert.deepEqual(cardsInSection(markup, "Operational KPIs").slice(0, 3), [
      ["Current hosts", currentCount],
      ["Stale hosts", state.counts ? String(state.counts.stale) : "—"],
      ["Missing hosts", state.counts ? String(state.counts.missing) : "—"],
    ])
    assert.ok(markup.includes(status))
    if (message) assert.ok(markup.includes(message))
    if (!state.counts) assert.doesNotMatch(markup, /Healthy|[0-9]+ stale · [0-9]+ missing/)
    if (canRetry) assert.equal(retryActions.length, 1)
    else assert.equal(retryActions.length, 0)
  }

  const boundaryCases = [
    [daysAgo(30), "healthy"],
    [new Date(fixedTime - 30 * 86400000 - 1).toISOString(), "stale"],
    [daysAgo(365), "stale"],
    [new Date(fixedTime - 365 * 86400000 - 1).toISOString(), "missing"],
    [new Date(fixedTime + 1).toISOString(), "healthy"],
  ]
  for (const [lastSeen, expected] of boundaryCases) assert.equal(hostHealthModule.exports.getHostHealthStatus(lastSeen, fixedNow), expected)
  for (const lastSeen of [null, undefined, "", "not-a-date"]) assert.equal(hostHealthModule.exports.getHostHealthStatus(lastSeen, fixedNow), "missing")
})
