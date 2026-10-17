"use client"

import { Activity as ActivityIcon, RefreshCw } from "lucide-react"
import { useActivity } from "@/lib/hooks/use-api"
import type { ActivityPoint } from "@/lib/api"
import { useQueryState, useQueryStateReady } from "@/lib/hooks/use-query-state"
import { FilterBar } from "@/components/filter-bar"
import { ChartSkeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { LineChart } from "@/components/charts/line-chart"
import { StatsCard } from "@/components/stats-card"
import { ErrorBoundary } from "@/components/error-boundary"
import { toast } from "sonner"

type ReportFilters = {
  host: string; packageName: string; fromDate: string; toDate: string
  security?: boolean; install?: boolean; kernel?: boolean
  bucket: "hour" | "day" | "week"
}

const allowedKeys = new Set(["host", "package", "from", "to", "security", "install", "kernel", "bucket"])
export function defaultReportDates(now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end); start.setDate(start.getDate() - 6)
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  return { fromDate: format(start), toDate: format(end) }
}
function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}
export function parseReportFilters(search: string, now = new Date()): ReportFilters | null {
  const params = new URLSearchParams(search)
  let invalidKey = false
  params.forEach((_value, key) => { if (!allowedKeys.has(key) || params.getAll(key).length !== 1 || params.get(key) === "") invalidKey = true })
  if (invalidKey) return null
  const defaults = defaultReportDates(now)
  const fromDate = params.get("from") ?? defaults.fromDate
  const toDate = params.get("to") ?? defaults.toDate
  const bucket = params.get("bucket") ?? "day"
  if (!isDate(fromDate) || !isDate(toDate) || fromDate > toDate || !["hour", "day", "week"].includes(bucket)) return null
  const flag = (key: string) => params.has(key) ? params.get(key) === "true" : undefined
  if (["security", "install", "kernel"].some((key) => params.has(key) && !["true", "false"].includes(params.get(key)!))) return null
  return {
    host: params.get("host") ?? "", packageName: params.get("package") ?? "",
    fromDate, toDate, security: flag("security"), install: flag("install"), kernel: flag("kernel"),
    bucket: bucket as ReportFilters["bucket"],
  }
}
export function activityOptionsForReport(filters: ReportFilters) {
  return {
    ...(filters.host && { hostname: filters.host }), ...(filters.packageName && { package_name: filters.packageName }),
    from_date: filters.fromDate, to_date: filters.toDate,
    ...(filters.security !== undefined && { is_security: filters.security }),
    ...(filters.install !== undefined && { is_install: filters.install }),
    ...(filters.kernel !== undefined && { is_kernel: filters.kernel }), bucket: filters.bucket,
  }
}
export function sumActivityBuckets(items: ActivityPoint[]) {
  return items.reduce((totals, item) => ({
    updates: totals.updates + item.updates,
    installs: totals.installs + item.installs,
    upgrades: totals.upgrades + item.upgrades,
    security: totals.security + item.security_updates,
    kernels: totals.kernels + item.kernel_updates,
  }), { updates: 0, installs: 0, upgrades: 0, security: 0, kernels: 0 })
}
function ReportsContent() {
  const defaults = defaultReportDates()
  const [host, setHost] = useQueryState("host")
  const [packageName, setPackageName] = useQueryState("package")
  const [fromDate, setFromDate] = useQueryState("from", defaults.fromDate)
  const [toDate, setToDate] = useQueryState("to", defaults.toDate)
  const [security, setSecurity] = useQueryState("security")
  const [install, setInstall] = useQueryState("install")
  const [kernel, setKernel] = useQueryState("kernel")
  const [bucket, setBucket] = useQueryState("bucket", "day")
  const queryReady = useQueryStateReady()
  const filters = typeof window === "undefined" ? null : parseReportFilters(window.location.search)
  const enabled = queryReady && filters !== null
  const { data, isLoading, error, refetch } = useActivity(
    filters ? activityOptionsForReport(filters) : {},
    { enabled },
  )
  const series = data?.items ?? []
  const totals = sumActivityBuckets(series)
  const chartData = series.map((point) => ({
    name: new Date(point.bucket).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: point.updates,
  }))

  const clearFilters = () => {
    setHost("")
    setPackageName("")
    setFromDate(defaults.fromDate)
    setToDate(defaults.toDate)
    setSecurity("")
    setInstall("")
    setKernel("")
    setBucket("day")
    window.history.replaceState({}, "", window.location.pathname)
  }

  const refresh = () => toast.promise(refetch(), {
    loading: "Refreshing reports...",
    success: "Reports refreshed",
    error: "Failed to refresh reports",
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ActivityIcon className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reports</h1>
          </div>
          <p className="text-muted-foreground">Bounded activity totals and update volume.</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={isLoading || !enabled}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <FilterBar onClear={clearFilters}>
        <label><span className="mb-1 block text-xs font-medium text-muted-foreground">Host</span>
          <Input value={host} onChange={(event) => setHost(event.target.value)} aria-label="Filter reports by host" />
        </label>
        <label><span className="mb-1 block text-xs font-medium text-muted-foreground">Package</span>
          <Input value={packageName} onChange={(event) => setPackageName(event.target.value)} aria-label="Filter reports by package" />
        </label>
        <label><span className="mb-1 block text-xs font-medium text-muted-foreground">From</span>
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Report start date" />
        </label>
        <label><span className="mb-1 block text-xs font-medium text-muted-foreground">To</span>
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Report end date" />
        </label>
        <label><span className="mb-1 block text-xs font-medium text-muted-foreground">Bucket</span>
          <Select value={bucket} onChange={(event) => setBucket(event.target.value)} aria-label="Report time bucket">
            <option value="hour">Hour</option><option value="day">Day</option><option value="week">Week</option>
          </Select>
        </label>
        <fieldset className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
          <legend className="sr-only">Report event filters</legend>
          {[
            ["security", security, setSecurity, "Security updates"],
            ["install", install, setInstall, "Installs"],
            ["kernel", kernel, setKernel, "Kernel updates"],
          ].map(([key, value, setter, label]) => (
            <label key={key as string} className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={value === "true"}
                onChange={(event) => (setter as (next: string) => void)(event.target.checked ? "true" : "false")}
                className="h-4 w-4 rounded border-input" />
              {label as string}
            </label>
          ))}
        </fieldset>
      </FilterBar>

      {isLoading || !queryReady ? <ChartSkeleton /> : error ? (
        <Card className="p-8" role="alert"><p className="text-destructive">Failed to load reports. Please try again.</p></Card>
      ) : filters === null ? (
        <Card className="p-8" role="alert"><p className="text-destructive">Report filters are invalid. Clear filters to continue.</p></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatsCard title="Updates" value={totals.updates} icon={ActivityIcon} />
            <StatsCard title="Installs" value={totals.installs} icon={ActivityIcon} />
            <StatsCard title="Upgrades" value={totals.upgrades} icon={ActivityIcon} />
            <StatsCard title="Security Updates" value={totals.security} icon={ActivityIcon} />
            <StatsCard title="Kernel Updates" value={totals.kernels} icon={ActivityIcon} />
          </div>
          <LineChart title="Updates over time" data={chartData} />
        </>
      )}
    </div>
  )
}

export default function ReportsPage() {
  return <ErrorBoundary><ReportsContent /></ErrorBoundary>
}
