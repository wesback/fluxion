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

function loadTsModule(path, dependencies) {
  const source = readFileSync(join(root, path), "utf8")
  const compiled = typescript.transpileModule(source, {
    compilerOptions: {
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.CommonJS,
    },
  }).outputText
  const module = { exports: {} }
  runInNewContext(compiled, {
    exports: module.exports,
    require: (name) => {
      if (name === "react") return React
      if (name === "react/jsx-runtime") return require("react/jsx-runtime")
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      throw new Error(`Unexpected dependency ${name} in ${path}`)
    },
  })
  return module.exports
}

const element = (tag) => ({ children, ...props }) => React.createElement(tag, props, children)
const [Card, CardHeader, CardTitle, CardContent, Table, TableCaption, TableHeader, TableBody, TableHead, TableRow, TableCell] =
  ["article", "header", "h2", "div", "table", "caption", "thead", "tbody", "th", "tr", "td"].map(element)
const Badge = ({ children, ...props }) => React.createElement("span", { ...props, "data-security-badge": "" }, children)
const Icon = () => React.createElement("span", { "aria-hidden": "true" })
const chartPrimitives = {
  Bar: ({ children }) => React.createElement("div", null, children),
  BarChart: element("div"), CartesianGrid: () => null, Cell: () => null,
  ResponsiveContainer: element("div"), Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}
const glassTooltipModule = loadTsModule("components/charts/glass-tooltip.tsx", {})
const barChartModule = loadTsModule("components/charts/bar-chart.tsx", {
  "recharts": chartPrimitives,
  "@/components/ui/card": { Card, CardContent, CardHeader, CardTitle },
  "@/components/charts/glass-tooltip": glassTooltipModule,
})
const securityBadgeModule = loadTsModule("components/security-badge.tsx", {
  "lucide-react": { ShieldCheck: Icon },
  "@/components/ui/badge": { Badge },
})
const updatesTableModule = loadTsModule("components/updates-table.tsx", {
  "date-fns": { formatDistanceToNow: () => "recently" },
  "@/components/ui/table": {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  },
  "@/components/ui/card": { Card },
  "@/components/security-badge": securityBadgeModule,
})

let statsResult
let updatesResult
let hostsResult
const noop = () => {}
const statsData = (packages = [], hosts = []) => ({
  most_updated_packages: packages.map(([packageName, count]) => ({ package: packageName, count })),
  most_active_hosts: hosts.map(([hostname, count]) => ({ hostname, count })),
})

const dashboardModule = loadTsModule("app/page.tsx", {
  "next/dynamic": { default: () => barChartModule.BarChart },
  "@/components/stats-card": {
    StatsCard: ({ title, value }) => React.createElement("article", { "data-stats-card": title }, title, value),
  },
  "@/components/updates-table": updatesTableModule,
  "lucide-react": {
    Activity: Icon,
    AlertTriangle: Icon,
    Calendar: Icon,
    Clock: Icon,
    RefreshCw: Icon,
    Server: Icon,
  },
  "@/lib/hooks/use-api": {
    useStats: () => statsResult,
    useRecentUpdates: (...args) => {
      assert.deepEqual(args, [24, 20])
      return updatesResult
    },
    useHosts: () => hostsResult,
  },
  "@/components/ui/skeleton": {
    TableSkeleton: () => React.createElement("div", { "data-state": "table-loading" }, "Updates loading"),
    ChartSkeleton: () => React.createElement("div", { "data-state": "chart-loading" }, "Chart loading"),
  },
  "@/components/error-boundary": { ErrorBoundary: ({ children }) => children },
  "@/components/ui/button": { Button: element("button") },
  "sonner": { toast: { promise: (promise) => promise } },
  "@/lib/telemetry": { useRefreshTracking: () => noop },
  "@/lib/host-health": {
    formatHostHealthCounts: () => "",
    getReportingHealthState: () => ({ counts: null, status: "Loading", message: null, canRetry: false }),
  },
})

function renderDashboard(stats = { data: statsData(), isLoading: false, error: null },
  updates = { data: { items: [] }, isLoading: false, error: null }) {
  statsResult = stats
  updatesResult = { refetch: noop, ...updates }
  hostsResult = { data: { items: [] }, isLoading: false, error: null, dataUpdatedAt: 0, refetch: noop }
  return renderToStaticMarkup(React.createElement(dashboardModule.default))
}

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

function plainText(markup) {
  return decodeHtml(markup.replace(/<[^>]*>/g, ""))
}

function rankedValues(markup, title) {
  const list = markup.match(new RegExp(`<ol aria-label="${title} ranked values"[^>]*>([\\s\\S]*?)<\\/ol>`))
  assert.ok(list, `missing text summary for ${title}`)
  return [...list[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(([, row]) => {
    const fields = [...row.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)]
      .map(([, text]) => plainText(text))
    return {
      rank: fields[0],
      label: fields[1],
      value: fields[2],
    }
  })
}

test("rankedChartsPreserveSourceValues", () => {
  const packageValues = [
    ["alpha", 9], ["beta", 7], ["gamma", 5], ["delta", 3], ["epsilon", 1], ["zeta", 0],
  ]
  const hostValues = [
    ["host-a", 8], ["host-b", 6], ["host-c", 4], ["host-d", 2], ["host-e", 1], ["host-f", 0],
  ]
  const markup = renderDashboard({ data: statsData(packageValues, hostValues), isLoading: false, error: null })

  assert.match(markup, /Top 5 Most Updated Packages/)
  assert.match(markup, /Most Active Hosts/)
  assert.deepEqual(rankedValues(markup, "Top 5 Most Updated Packages"), [
    { rank: "Rank 1", label: "alpha", value: "9 updates" },
    { rank: "Rank 2", label: "beta", value: "7 updates" },
    { rank: "Rank 3", label: "gamma", value: "5 updates" },
    { rank: "Rank 4", label: "delta", value: "3 updates" },
    { rank: "Rank 5", label: "epsilon", value: "1 update" },
  ])
  assert.deepEqual(rankedValues(markup, "Most Active Hosts"), [
    { rank: "Rank 1", label: "host-a", value: "8 updates" },
    { rank: "Rank 2", label: "host-b", value: "6 updates" },
    { rank: "Rank 3", label: "host-c", value: "4 updates" },
    { rank: "Rank 4", label: "host-d", value: "2 updates" },
    { rank: "Rank 5", label: "host-e", value: "1 update" },
  ])
})

test("recentRowsPreserveFieldsAndRenderText", () => {
  const updates = [
    {
      hostname: '"><svg onload=alert(1)>',
      package_name: "<img src=x onerror=alert(1)>",
      old_version: "1.0",
      new_version: "2.0",
      update_timestamp: "2026-10-17T12:00:00Z",
      is_security: true,
    },
    { hostname: "host-b", package_name: "pkg-b", old_version: null, new_version: "3.0", is_security: false },
    {
      hostname: "javascript:alert(1)",
      package_name: "pkg-c",
      old_version: "4.0",
      new_version: "5.0",
      update_timestamp: "2026-10-17T13:00:00Z",
      is_security: false,
    },
  ]
  const markup = renderToStaticMarkup(React.createElement(updatesTableModule.UpdatesTable, { updates }))
  const rows = [...markup.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1)
  const cells = rows.map(([, row]) =>
    [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) => plainText(cell))
  )

  assert.deepEqual(cells, [
    ['"><svg onload=alert(1)>', "<img src=x onerror=alert(1)>Security", "1.0", "2.0", "recently"],
    ["host-b", "pkg-b", "N/A", "3.0", "N/A"],
    ["javascript:alert(1)", "pkg-c", "4.0", "5.0", "recently"],
  ])
  assert.match(markup, /<time dateTime="2026-10-17T12:00:00Z">/)
  assert.match(markup, /<time dateTime="2026-10-17T13:00:00Z">/)
  assert.equal((markup.match(/data-security-badge/g) || []).length, 1)
  assert.match(rows[0][1], /data-security-badge="">[\s\S]*Security/)
  assert.doesNotMatch(rows[1][1], /data-security-badge|Security/)
  assert.doesNotMatch(rows[2][1], /data-security-badge|Security/)
  assert.doesNotMatch(markup, /<(?:svg|img)\b/i)
  assert.doesNotMatch(markup, /<[a-z][^>]*\son[a-z]+\s*=/i)
  assert.doesNotMatch(markup, /<a\b[^>]*href=["']javascript:/i)
  assert.doesNotMatch(rows[2][1], /<a\b/i)
})

test("chartAndTableSourceStatesStayDistinct", () => {
  const chartLoading = renderDashboard({ data: undefined, isLoading: true, error: null })
  assert.equal((chartLoading.match(/data-state="chart-loading"/g) || []).length, 2)
  assert.doesNotMatch(chartLoading, /Top 5 Most Updated Packages|Most Active Hosts/)

  const chartEmpty = renderDashboard({ data: statsData(), isLoading: false, error: null })
  assert.deepEqual(rankedValues(chartEmpty, "Top 5 Most Updated Packages"), [])
  assert.deepEqual(rankedValues(chartEmpty, "Most Active Hosts"), [])

  const chartFailed = renderDashboard({ data: undefined, isLoading: false, error: new Error("stats failed") })
  assert.match(chartFailed, /Failed to load charts/)
  assert.doesNotMatch(chartFailed, /data-state="chart-loading"|Top 5 Most Updated Packages/)

  const tableLoading = renderDashboard(undefined, { data: undefined, isLoading: true, error: null })
  assert.match(tableLoading, /data-state="table-loading"/)
  assert.doesNotMatch(tableLoading, /No updates found|Failed to load recent updates/)

  const tableEmpty = renderDashboard(undefined, { data: { items: [] }, isLoading: false, error: null })
  assert.match(tableEmpty, /No updates found/)
  assert.doesNotMatch(tableEmpty, /Failed to load recent updates/)

  const tableFailed = renderDashboard(undefined, { data: undefined, isLoading: false, error: new Error("updates failed") })
  assert.match(tableFailed, /Failed to load recent updates/)
  assert.doesNotMatch(tableFailed, /No updates found/)

  const cachedFailure = renderDashboard(undefined, {
    data: { items: [{ hostname: "cached-host", package_name: "cached-package", old_version: "1", new_version: "2" }] },
    isLoading: false,
    error: new Error("refresh failed"),
  })
  assert.match(cachedFailure, /Failed to load recent updates/)
  assert.doesNotMatch(cachedFailure, /No updates found|cached-package/)
})
