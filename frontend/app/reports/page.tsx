"use client"

import { Activity as ActivityIcon, RefreshCw } from "lucide-react"
import { useActivity, useSecurityFeed } from "@/lib/hooks/use-api"
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
export function securityOptionsForReport(filters: ReportFilters) {
  return {
    ...(filters.host && { hostname: filters.host }), ...(filters.packageName && { package_name: filters.packageName }),
    from_date: `${filters.fromDate}T00:00:00.000Z`, to_date: `${filters.toDate}T23:59:59.999Z`,
  }
}
function hostsHref(hostname: string) {
  return `/hosts?${new URLSearchParams({ q: hostname }).toString()}`
}
function activityHref(filters: ReportFilters) {
  const params = new URLSearchParams()
  if (filters.host) params.set("host", filters.host)
  if (filters.packageName) params.set("package", filters.packageName)
  params.set("from", filters.fromDate)
  params.set("to", filters.toDate)
  if (filters.security !== undefined) params.set("security", String(filters.security))
  if (filters.install !== undefined) params.set("install", String(filters.install))
  if (filters.kernel !== undefined) params.set("kernel", String(filters.kernel))
  params.set("bucket", filters.bucket)
  return `/activity?${params.toString()}`
}
function securityHref(hostname: string, packageName: string, window: string) {
  const params = new URLSearchParams({ host: hostname, package: packageName, window })
  return `/security?${params.toString()}`
}
function reportWindow(fromDate: string, toDate: string) { return Date.parse(toDate) - Date.parse(fromDate) < 86_400_000 ? "24" : "168" }
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
  const { data, isLoading, isFetching, error, dataUpdatedAt, refetch } = useActivity(
    filters ? activityOptionsForReport(filters) : {},
    { enabled },
  )
  const securityQuery = useSecurityFeed(
    filters ? securityOptionsForReport(filters) : {},
    { enabled },
  )
  const series = data?.items ?? []
  const totals = sumActivityBuckets(series)
  const chartData = series.map((point) => ({
    name: new Date(/^\d{4}-\d{2}-\d{2}$/.test(point.bucket)
      ? `${point.bucket}T00:00:00`
      : point.bucket).toLocaleString(undefined, filters?.bucket === "hour"
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" }),
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

  const refresh = () => toast.promise(Promise.all([
    refetch({ throwOnError: true }),
    securityQuery.refetch({ throwOnError: true }),
  ]), {
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
        <Button variant="outline" onClick={refresh} disabled={isFetching || securityQuery.isFetching || !enabled}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching || securityQuery.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
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

      {filters === null && queryReady ? (
        <Card className="p-8" role="alert"><p className="text-destructive">Report filters are invalid. Clear filters to continue.</p></Card>
      ) : (
        <>
          <section aria-labelledby="activity-report-heading" className="space-y-4">
            <h2 id="activity-report-heading" className="text-xl font-semibold">Activity</h2>
            <ReportSourceStatus title="Activity" isLoading={!queryReady || isLoading} error={error} data={data} updatedAt={dataUpdatedAt} />
            {data && (
              <>
                {series.length === 0 ? <ReportEmpty>There is no activity for this report.</ReportEmpty> : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                      <StatsCard title="Updates" value={totals.updates} icon={ActivityIcon} />
                      <StatsCard title="Installs" value={totals.installs} icon={ActivityIcon} />
                      <StatsCard title="Upgrades" value={totals.upgrades} icon={ActivityIcon} />
                      <StatsCard title="Security Updates" value={totals.security} icon={ActivityIcon} />
                      <StatsCard title="Kernel Updates" value={totals.kernels} icon={ActivityIcon} />
                    </div>
                    <LineChart title="Updates over time" data={chartData} />
                    <ul aria-label="Activity buckets" className="space-y-2">
                      {series.map((point, index) => (
                        <li key={`${point.bucket}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
                          <span>{point.bucket}</span><span>{point.updates} updates</span>
                          {filters && <a className="text-primary underline-offset-4 hover:underline" href={activityHref(filters)}>View activity</a>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
          <section aria-labelledby="security-report-heading" className="space-y-4">
            <h2 id="security-report-heading" className="text-xl font-semibold">Security</h2>
            <ReportSourceStatus title="Security" isLoading={!queryReady || securityQuery.isLoading} error={securityQuery.error} data={securityQuery.data} updatedAt={securityQuery.dataUpdatedAt} />
            {securityQuery.data && (
              securityQuery.data.items.length === 0 ? <ReportEmpty>There are no security updates for this report.</ReportEmpty> : (
                <div className="space-y-3">
                  {securityQuery.data.items.map((item, index) => (
                    <Card key={`${item.hostname}-${item.package_name}-${index}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p>{item.old_version ?? "New install"} → {item.new_version}</p>
                        <p>
                          <a className="text-primary underline-offset-4 hover:underline" href={hostsHref(item.hostname)}>{item.hostname}</a>
                          {" · "}
                          <a className="text-primary underline-offset-4 hover:underline" href={securityHref(item.hostname, item.package_name, reportWindow(filters?.fromDate ?? defaults.fromDate, filters?.toDate ?? defaults.toDate))}>{item.package_name}</a>
                        </p>
                      </div>
                      {filters && (
                        <a className="text-primary underline-offset-4 hover:underline"
                          href={activityHref({ ...filters, host: item.hostname, packageName: item.package_name })}>
                          View related activity
                        </a>
                      )}
                    </Card>
                  ))}
                </div>
              )
            )}
          </section>
        </>
      )}
    </div>
  )
}

function errorStatus(error: unknown) {
  return error !== null && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined
}
function ReportSourceStatus({ title, isLoading, error, data, updatedAt }: {
  title: string; isLoading: boolean; error: unknown; data: unknown; updatedAt: number
}) {
  if (!data) {
    if (isLoading || !error) return <ChartSkeleton />
    const denied = errorStatus(error) === 401 || errorStatus(error) === 403
    return <Card className="p-6" role="alert"><p className="text-destructive">
      {denied ? `Access denied to ${title.toLowerCase()} report.` : `Failed to load ${title.toLowerCase()} report. Please try again.`}
    </p></Card>
  }
  if (!error) return null
  const timestamp = updatedAt > 0 ? new Date(updatedAt).toISOString() : ""
  return <p role="status">This report is stale. Last successful response:{" "}
    {timestamp ? <time dateTime={timestamp}>{timestamp}</time> : "time unavailable"}
  </p>
}
function ReportEmpty({ children }: { children: React.ReactNode }) {
  return <Card className="p-6 text-muted-foreground">{children}</Card>
}

export default function ReportsPage() {
  return <ErrorBoundary><ReportsContent /></ErrorBoundary>
}
