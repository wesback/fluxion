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
const transpiledPage = typescript.transpileModule(page, {
  compilerOptions: {
    jsx: typescript.JsxEmit.ReactJSX,
    module: typescript.ModuleKind.CommonJS,
  },
}).outputText
const pageModule = { exports: {} }
const icon = () => React.createElement("svg", { "aria-hidden": "true" })
let statsResult

const StatsCard = ({ title, value, description }) => React.createElement(
  "article",
  { "data-title": title },
  React.createElement("h3", null, title),
  React.createElement("output", null, value),
  description && React.createElement("p", null, description)
)
const passthrough = ({ children }) => children
const noop = () => {}

runInNewContext(transpiledPage, {
  exports: pageModule.exports,
  require: (name) => {
    if (name === "react") return React
    if (name === "react/jsx-runtime") return require("react/jsx-runtime")
    if (name === "next/dynamic") return { default: () => () => null }
    if (name === "@/components/stats-card") return { StatsCard }
    if (name === "@/components/updates-table") return { UpdatesTable: () => null }
    if (name === "lucide-react") {
      return { Activity: icon, AlertTriangle: icon, Calendar: icon, Clock: icon, RefreshCw: icon, Server: icon }
    }
    if (name === "@/lib/hooks/use-api") {
      return {
        useStats: () => statsResult,
        useRecentUpdates: () => ({ data: { items: [] }, isLoading: false, error: null, refetch: noop }),
        useHosts: () => ({ data: { items: [] }, isLoading: false, refetch: noop }),
      }
    }
    if (name === "@/components/ui/skeleton") return { TableSkeleton: () => null, ChartSkeleton: () => null }
    if (name === "@/components/error-boundary") return { ErrorBoundary: passthrough }
    if (name === "@/components/ui/button") {
      return { Button: ({ children, ...props }) => React.createElement("button", props, children) }
    }
    if (name === "sonner") return { toast: { promise: noop } }
    if (name === "@/lib/telemetry") return { useRefreshTracking: () => noop }
    if (name === "@/lib/host-health") return { getHostHealthStatus: () => "healthy" }
    throw new Error(`Unexpected dashboard dependency: ${name}`)
  },
})

function renderDashboard(result) {
  statsResult = result
  return renderToStaticMarkup(React.createElement(pageModule.exports.default))
}

function cardsInSection(markup, label) {
  const section = markup.match(
    new RegExp(`<section aria-label="${label}"[^>]*>([\\s\\S]*?)<\\/section>`)
  )
  assert.ok(section, `missing ${label} section`)
  return [...section[1].matchAll(/<article data-title="([^"]+)">[\s\S]*?<output>([\s\S]*?)<\/output>/g)]
    .map(([, title, value]) => [title, value])
}

test("heroAndNumericKpisUseSupportedStats", () => {
  const fixture = {
    total_hosts: 0,
    total_updates: 1234,
    updates_last_24h: 56,
    updates_last_7d: 7890,
    most_updated_packages: [],
    most_active_hosts: [],
  }
  const successful = renderDashboard({ data: fixture, isLoading: false, error: null })

  assert.deepEqual(cardsInSection(successful, "Hero metrics"), [
    ["Total Hosts", "0"],
    ["Total Updates", "1,234"],
    ["Updates in Last 24 Hours", "56"],
    ["Updates in Last 7 Days", "7,890"],
  ])
  assert.deepEqual(cardsInSection(successful, "Numeric KPIs"), [
    ["Total Hosts", "0"],
    ["Recent Updates", "56"],
    ["Weekly Updates", "7,890"],
  ])
  assert.doesNotMatch(successful, /uptime|latency|trend(?: percentage)?|sample/i)

  const unavailable = renderDashboard({ data: undefined, isLoading: true, error: null })
  assert.deepEqual(cardsInSection(unavailable, "Hero metrics"), [
    ["Total Hosts", "—"],
    ["Total Updates", "—"],
    ["Updates in Last 24 Hours", "—"],
    ["Updates in Last 7 Days", "—"],
  ])
  assert.deepEqual(cardsInSection(unavailable, "Numeric KPIs"), [
    ["Total Hosts", "—"],
    ["Recent Updates", "—"],
    ["Weekly Updates", "—"],
  ])

  const failed = renderDashboard({ data: undefined, isLoading: false, error: new Error("request failed") })
  assert.deepEqual(cardsInSection(failed, "Numeric KPIs"), [
    ["Total Hosts", "—"],
    ["Recent Updates", "—"],
    ["Weekly Updates", "—"],
  ])
  assert.match(failed, /Failed to load statistics/)

  const cachedAfterFailure = renderDashboard({
    data: fixture,
    isLoading: false,
    error: new Error("refresh failed"),
  })
  assert.deepEqual(cardsInSection(cachedAfterFailure, "Hero metrics"), [
    ["Total Hosts", "0"],
    ["Total Updates", "1,234"],
    ["Updates in Last 24 Hours", "56"],
    ["Updates in Last 7 Days", "7,890"],
  ])
  assert.deepEqual(cardsInSection(cachedAfterFailure, "Numeric KPIs"), [
    ["Total Hosts", "0"],
    ["Recent Updates", "56"],
    ["Weekly Updates", "7,890"],
  ])
  assert.match(cachedAfterFailure, /Failed to refresh statistics; showing cached values/)
  assert.doesNotMatch(cachedAfterFailure, /uptime|latency|trend(?: percentage)?|sample/i)
})
