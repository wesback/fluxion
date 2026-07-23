"use client"

import { Activity as ActivityIcon, RefreshCw } from "lucide-react"
import { useActivity } from "@/lib/hooks/use-api"
import { useQueryState } from "@/lib/hooks/use-query-state"
import { FilterBar } from "@/components/filter-bar"
import { ExportControls } from "@/components/export-controls"
import { TableSkeleton, ChartSkeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { LineChart } from "@/components/charts/line-chart"
import { StatsCard } from "@/components/stats-card"
import { ErrorBoundary } from "@/components/error-boundary"
import { toast } from "sonner"

function ActivityContent() {
  const [host, setHost] = useQueryState("host")
  const [packageName, setPackageName] = useQueryState("package")
  const [fromDate, setFromDate] = useQueryState("from")
  const [toDate, setToDate] = useQueryState("to")
  const [securityOnly, setSecurityOnly] = useQueryState("security", "false")
  const [installOnly, setInstallOnly] = useQueryState("install", "false")
  const [kernelOnly, setKernelOnly] = useQueryState("kernel", "false")
  const [bucket, setBucket] = useQueryState("bucket", "day")
  const { data, isLoading, error, refetch } = useActivity({
    hostname: host || undefined,
    package_name: packageName || undefined,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    is_security: securityOnly === "true" ? true : undefined,
    is_install: installOnly === "true" ? true : undefined,
    is_kernel: kernelOnly === "true" ? true : undefined,
    bucket: bucket as "hour" | "day" | "week",
  })

  const series = data?.items || []
  const chartData = series.map((point) => ({
    name: new Date(point.bucket).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: point.updates,
  }))
  const totals = series.reduce(
    (result, point) => ({
      updates: result.updates + point.updates,
      installs: result.installs + point.installs,
      upgrades: result.upgrades + point.upgrades,
      security: result.security + point.security_updates,
      kernels: result.kernels + point.kernel_updates,
    }),
    { updates: 0, installs: 0, upgrades: 0, security: 0, kernels: 0 },
  )

  const clearFilters = () => {
    setHost("")
    setPackageName("")
    setFromDate("")
    setToDate("")
    setSecurityOnly("false")
    setInstallOnly("false")
    setKernelOnly("false")
    setBucket("day")
  }

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: "Refreshing activity...",
      success: "Activity refreshed",
      error: "Failed to refresh activity",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ActivityIcon className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Activity</h1>
          </div>
          <p className="text-muted-foreground">Server-side update volume and event breakdowns.</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <FilterBar onClear={clearFilters}>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Host</span>
          <Input value={host} onChange={(event) => setHost(event.target.value)} placeholder="Filter hostnames" aria-label="Filter activity by host" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Package prefix</span>
          <Input value={packageName} onChange={(event) => setPackageName(event.target.value)} placeholder="e.g. openssl" aria-label="Filter activity by package" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">From</span>
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Activity start date" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">To</span>
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Activity end date" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Bucket</span>
          <Select value={bucket} onChange={(event) => setBucket(event.target.value)} aria-label="Activity time bucket">
            <option value="day">Day</option>
            <option value="hour">Hour</option>
          </Select>
        </label>
        <fieldset className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
          <legend className="sr-only">Activity event filters</legend>
          {[
            ["security", securityOnly, setSecurityOnly, "Security only"],
            ["install", installOnly, setInstallOnly, "Installs only"],
            ["kernel", kernelOnly, setKernelOnly, "Kernels only"],
          ].map(([key, value, setter, label]) => (
            <label key={key as string} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value === "true"}
                onChange={(event) => (setter as (next: string) => void)(event.target.checked ? "true" : "false")}
                className="h-4 w-4 rounded border-input"
              />
              {label as string}
            </label>
          ))}
        </fieldset>
      </FilterBar>

      <div className="flex justify-end">
        <ExportControls
          rows={series}
          filename="fluxion-activity"
          columns={[
            { key: "bucket", label: "Time" },
            { key: "updates", label: "Total" },
            { key: "installs", label: "Installs" },
            { key: "upgrades", label: "Upgrades" },
            { key: "security_updates", label: "Security" },
            { key: "kernel_updates", label: "Kernels" },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartSkeleton />
          <TableSkeleton rows={4} />
        </div>
      ) : error ? (
        <Card className="p-8" role="alert">
          <p className="text-destructive">Failed to load activity. Please try again.</p>
        </Card>
      ) : series.length === 0 ? (
        <Card className="p-8 text-center">
          <ActivityIcon className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-3 text-muted-foreground">No activity matches the selected filters.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatsCard title="Updates" value={totals.updates} icon={ActivityIcon} />
            <StatsCard title="Installs" value={totals.installs} icon={ActivityIcon} />
            <StatsCard title="Upgrades" value={totals.upgrades} icon={ActivityIcon} />
            <StatsCard title="Security" value={totals.security} icon={ActivityIcon} />
            <StatsCard title="Kernels" value={totals.kernels} icon={ActivityIcon} />
          </div>
          <LineChart title="Updates over time" data={chartData} />
        </>
      )}
    </div>
  )
}

export default function ActivityPage() {
  return (
    <ErrorBoundary>
      <ActivityContent />
    </ErrorBoundary>
  )
}
