import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const typescript = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const healthSource = readFileSync(join(root, "lib/host-health.ts"), "utf8")
const healthModule = { exports: {} }
runInNewContext(typescript.transpileModule(healthSource, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS },
}).outputText, { exports: healthModule.exports })
const { formatMetricValue, getHostHealthStatus, getReportingHealthState } = healthModule.exports

let fixture
const icon = () => React.createElement("svg", { "aria-hidden": "true" })
const card = ({ title, value, description }) => React.createElement("article", { "data-metric": title },
  React.createElement("h3", null, title),
  React.createElement("strong", null, value),
  description ? React.createElement("p", null, description) : null
)
const passthrough = ({ children }) => React.createElement(React.Fragment, null, children)
const pageSource = readFileSync(join(root, "app/page.tsx"), "utf8")
const pageModule = { exports: {} }
runInNewContext(typescript.transpileModule(pageSource, {
  compilerOptions: {
    jsx: typescript.JsxEmit.ReactJSX,
    module: typescript.ModuleKind.CommonJS,
  },
}).outputText, {
  exports: pageModule.exports,
  require: (name) => {
    if (name === "react") return React
    if (name === "react/jsx-runtime") return require("react/jsx-runtime")
    if (name === "next/dynamic") return { __esModule: true, default: () => () => null }
    if (name === "@/components/stats-card") return { StatsCard: card }
    if (name === "@/components/updates-table") return { UpdatesTable: () => null }
    if (name === "lucide-react") return Object.fromEntries(
      ["Activity", "Server", "Clock", "Calendar", "RefreshCw", "AlertTriangle"].map((name) => [name, icon])
    )
    if (name === "@/lib/hooks/use-api") return {
      useStats: () => ({ data: fixture.stats, isLoading: fixture.statsLoading, error: fixture.statsError, refetch: async () => {} }),
      useRecentUpdates: () => ({ data: { items: [] }, isLoading: false, error: null, refetch: async () => {} }),
      useHosts: () => ({
        data: fixture.hostsData,
        isLoading: fixture.hostsLoading,
        error: fixture.hostsError,
        dataUpdatedAt: fixture.hostsUpdatedAt ?? 0,
        refetch: async () => {},
      }),
    }
    if (name === "@/components/ui/skeleton") return {
      StatsCardSkeleton: () => null,
      TableSkeleton: () => null,
      ChartSkeleton: () => null,
    }
    if (name === "@/components/error-boundary") return { ErrorBoundary: passthrough }
    if (name === "@/components/ui/button") return {
      Button: ({ children, ...props }) => React.createElement("button", props, children),
    }
    if (name === "@/components/host-health-badge") return {
      ReportingHealthBadge: ({ state }) => React.createElement("span", { role: "status" }, state.status),
    }
    if (name === "sonner") return { toast: { promise: (promise) => promise } }
    if (name === "@/lib/telemetry") return { useRefreshTracking: () => () => {} }
    if (name === "@/lib/host-health") return healthModule.exports
    throw new Error(`Unexpected dashboard dependency: ${name}`)
  },
})

function renderDashboard(nextFixture) {
  fixture = nextFixture
  return renderToStaticMarkup(React.createElement(pageModule.exports.default))
}

function section(html, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = html.match(new RegExp(`<section\\b[^>]*aria-label="${escapedLabel}"[^>]*>([\\s\\S]*?)<\\/section>`))
  assert.ok(match, `missing ${label} section`)
  return match[1]
}

function metrics(markup) {
  return [...markup.matchAll(/<article data-metric="([^"]+)"><h3>[\s\S]*?<\/h3><strong>([\s\S]*?)<\/strong>/g)]
    .map(([, label, value]) => [label, value])
}

const completeStats = {
  total_hosts: 1234,
  total_updates: 0,
  updates_last_24h: 57,
  updates_last_7d: 1234567,
  most_updated_packages: [],
  most_active_hosts: [],
}

test("heroUsesOnlySupportedMetricValues", () => {
  const html = renderDashboard({
    stats: completeStats,
    hostsData: { items: [] },
    hostsLoading: false,
    hostsError: null,
  })
  const hero = section(html, "Overview metrics")
  assert.deepEqual(metrics(hero), [
    ["Total Hosts", "1,234"],
    ["Total Updates", "0"],
    ["Updates in Last 24 Hours", "57"],
    ["Updates in Last 7 Days", "1,234,567"],
  ])
  assert.doesNotMatch(hero, /uptime|latency|trend|sample/i)
})

test("kpiRowUsesDefinedFieldsAndCounts", () => {
  const now = Date.now()
  const html = renderDashboard({
    stats: completeStats,
    hostsData: { items: [
      { last_seen: new Date(now).toISOString() },
      { last_seen: new Date(now - 31 * 86400000).toISOString() },
      { last_seen: null },
      { last_seen: "invalid" },
    ] },
    hostsLoading: false,
    hostsError: null,
  })
  assert.deepEqual(metrics(section(html, "Key performance indicators")), [
    ["Total Hosts", "1,234"],
    ["Recent Updates", "57"],
    ["Weekly Updates", "1,234,567"],
    ["Host Health", "1 stale · 2 missing"],
  ])

  const unavailable = renderDashboard({
    stats: undefined,
    statsLoading: false,
    statsError: new Error("stats unavailable"),
    hostsData: undefined,
    hostsLoading: true,
    hostsError: null,
  })
  assert.deepEqual(metrics(section(unavailable, "Key performance indicators")), [
    ["Total Hosts", "—"],
    ["Recent Updates", "—"],
    ["Weekly Updates", "—"],
    ["Host Health", "—"],
  ])
  assert.doesNotMatch(section(unavailable, "Key performance indicators"), /0 stale|0 missing/)

  const failed = renderDashboard({
    stats: undefined,
    statsLoading: false,
    statsError: new Error("stats unavailable"),
    hostsData: undefined,
    hostsLoading: false,
    hostsError: new Error("hosts unavailable"),
  })
  assert.deepEqual(metrics(section(failed, "Key performance indicators")).slice(0, 3), [
    ["Total Hosts", "—"],
    ["Recent Updates", "—"],
    ["Weekly Updates", "—"],
  ])
  assert.equal(metrics(section(failed, "Key performance indicators"))[3][1], "—")
  assert.match(failed, /Reporting health unavailable/)
  assert.match(failed, /Retry host health/)
  assert.doesNotMatch(failed, /Healthy|0 stale|0 missing/)
})

test("healthBoundariesAndInvalidTimestamps", () => {
  const now = new Date("2026-10-17T12:00:00.000Z")
  const day = 86400000
  const cases = [
    [new Date(now.getTime() - 30 * day).toISOString(), "healthy"],
    [new Date(now.getTime() - 30 * day - 1).toISOString(), "stale"],
    [new Date(now.getTime() - 365 * day).toISOString(), "stale"],
    [new Date(now.getTime() - 365 * day - 1).toISOString(), "missing"],
    [null, "missing"],
    [undefined, "missing"],
    ["", "missing"],
    ["not a date", "missing"],
    [new Date(now.getTime() + 1).toISOString(), "healthy"],
  ]
  for (const [timestamp, expected] of cases) {
    assert.equal(getHostHealthStatus(timestamp, now), expected, String(timestamp))
  }
  assert.equal(formatMetricValue(1234567), "1,234,567")
  assert.equal(formatMetricValue(0), "0")
})

test("healthAndFailureStatesMatchTruthTable", async () => {
  const { QueryClient } = require("@tanstack/react-query")
  const now = new Date("2026-10-17T12:00:00.000Z")
  const lastSuccess = Date.parse("2026-10-16T10:20:30.000Z")
  const recent = { last_seen: now.toISOString() }
  const stale = { last_seen: new Date(now.getTime() - 31 * 86400000).toISOString() }
  const missing = { last_seen: null }

  async function fromRequest({ response, failure, cached }) {
    const cache = new QueryClient()
    if (cached) cache.setQueryData(["hosts"], cached, { updatedAt: lastSuccess })
    const request = async () => {
      if (failure) throw failure
      return response
    }
    try {
      cache.setQueryData(["hosts"], await request())
    } catch {}
    const query = cache.getQueryState(["hosts"])
    const state = getReportingHealthState({
      data: query?.data,
      isLoading: false,
      hasError: Boolean(failure),
      dataUpdatedAt: query?.dataUpdatedAt ?? 0,
      now,
    })
    cache.clear()
    return state
  }

  const cases = [
    ["healthy", await fromRequest({ response: { items: [recent] } }), "Healthy", "Package reports are current", 0, 0, false],
    ["missing takes precedence", await fromRequest({ response: { items: [stale, missing] } }), "Attention needed", "1 host is missing", 1, 1, false],
    ["stale only", await fromRequest({ response: { items: [stale] } }), "Reports stale", "1 host has stale reports", 1, 0, false],
    ["empty", await fromRequest({ response: { items: [] } }), "No hosts reporting", "No hosts are registered to report", 0, 0, false],
  ]
  for (const [name, state, status, description, staleCount, missingCount, retry] of cases) {
    assert.deepEqual(
      [state.status, state.description, state.staleCount, state.missingCount, state.retry],
      [status, description, staleCount, missingCount, retry],
      name
    )
  }

  const loading = getReportingHealthState({ data: undefined, isLoading: true, hasError: false, dataUpdatedAt: 0, now })
  const unknown = getReportingHealthState({ data: undefined, isLoading: false, hasError: false, dataUpdatedAt: 0, now })
  assert.deepEqual(
    [loading.status, loading.description, loading.staleCount, loading.missingCount, loading.retry],
    ["Loading", "Loading host reporting health", null, null, false]
  )
  assert.deepEqual(
    [unknown.status, unknown.description, unknown.staleCount, unknown.missingCount, unknown.retry],
    ["Unknown", "No successful host response", null, null, false]
  )

  const cachedFailure = await fromRequest({
    response: undefined,
    failure: Object.assign(new Error("refresh failed"), { status: 500 }),
    cached: { items: [recent] },
  })
  assert.deepEqual(
    [cachedFailure.status, cachedFailure.description, cachedFailure.staleCount, cachedFailure.missingCount, cachedFailure.lastSuccessAt, cachedFailure.retry],
    ["Healthy (stale data)", "Last known: Package reports are current", 0, 0, new Date(lastSuccess).toISOString(), true]
  )

  const unavailable = [
    await fromRequest({ failure: Object.assign(new Error("denied"), { status: 401 }) }),
    await fromRequest({ failure: Object.assign(new Error("denied"), { status: 403 }) }),
    await fromRequest({ response: {} }),
    await fromRequest({ response: { items: "invalid" } }),
  ]
  for (const state of unavailable) {
    assert.equal(state.status, "Reporting health unavailable")
    assert.equal(state.description, "Host reporting health could not be loaded")
    assert.equal(state.staleCount, null)
    assert.equal(state.missingCount, null)
    assert.equal(state.retry, true)
    assert.notEqual(state.status, "Healthy")
  }

  const deniedWithCache = await fromRequest({
    failure: Object.assign(new Error("denied"), { status: 403 }),
    cached: { items: [missing] },
  })
  assert.equal(deniedWithCache.status, "Attention needed (stale data)")
  assert.equal(deniedWithCache.missingCount, 1)
  assert.equal(deniedWithCache.lastSuccessAt, new Date(lastSuccess).toISOString())
})
