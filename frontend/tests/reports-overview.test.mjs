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
assert.equal(existsSync(pagePath), true, "/reports page must exist")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const typescript = require("typescript")
const compiled = typescript.transpileModule(readFileSync(pagePath, "utf8"), { compilerOptions: {
  jsx: typescript.JsxEmit.ReactJSX, module: typescript.ModuleKind.CommonJS,
} }).outputText
let search = ""
let activity = { items: [] }
const requests = []
const noop = () => {}
const Icon = () => React.createElement("svg", { "aria-hidden": "true" })
const StatsCard = ({ title, value }) => React.createElement("article", { "data-title": title }, React.createElement("h3", null, title), React.createElement("output", null, value))
const LineChart = ({ title, data }) => React.createElement("div", { role: "img", "aria-label": title }, data.map((point) => React.createElement("span", { key: point.name }, `${point.name}: ${point.value}`)))
const plain = (value) => JSON.parse(JSON.stringify(value))
function loadPage() {
  const pageModule = { exports: {} }
  runInNewContext(compiled, {
    exports: pageModule.exports,
    URLSearchParams,
    window: { get location() { return { search, pathname: "/reports" } }, history: { replaceState: noop } },
    require: (name) => {
      if (name === "react/jsx-runtime") return require("react/jsx-runtime")
      if (name === "lucide-react") return { Activity: Icon, RefreshCw: Icon }
      if (name === "@/lib/hooks/use-api") return { useActivity: (options, queryOptions) => {
        if (queryOptions.enabled) requests.push(options)
        return { data: activity, isLoading: false, error: null, refetch: noop }
      } }
      if (name === "@/lib/hooks/use-query-state") return {
        useQueryState: (key, fallback = "") => [new URLSearchParams(search).get(key) ?? fallback, noop], useQueryStateReady: () => true,
      }
      if (name === "@/components/filter-bar") return { FilterBar: ({ children }) => children }
      if (name === "@/components/ui/skeleton") return { ChartSkeleton: () => null }
      if (name === "@/components/ui/card") return { Card: ({ children }) => children }
      if (name === "@/components/ui/input") return { Input: (props) => React.createElement("input", props) }
      if (name === "@/components/ui/select") return { Select: (props) => React.createElement("select", props) }
      if (name === "@/components/ui/button") return { Button: ({ children, ...props }) => React.createElement("button", props, children) }
      if (name === "@/components/charts/line-chart") return { LineChart }
      if (name === "@/components/stats-card") return { StatsCard }
      if (name === "@/components/error-boundary") return { ErrorBoundary: ({ children }) => children }
      if (name === "sonner") return { toast: { promise: noop } }
      throw new Error(`Unexpected reports dependency: ${name}`)
    },
  })
  return pageModule.exports
}
function renderReport(query) {
  search = query
  return renderToStaticMarkup(React.createElement(loadPage().default))
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
  requests.length = 0
  for (const invalid of ["?tenant=outside", "?role=admin", "?bucket=month", "?security=yes", "?from=2026-10-18&to=2026-10-17"]) {
    assert.equal(parseReportFilters(invalid, now), null, invalid)
    renderReport(invalid)
  }
  assert.equal(requests.length, 0, "invalid URLs must not request activity")
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
