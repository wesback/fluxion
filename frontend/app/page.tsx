"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { StatsCard } from "@/components/stats-card"
import { UpdatesTable } from "@/components/updates-table"
import { Activity, Server, Clock, Calendar, RefreshCw, AlertTriangle } from "lucide-react"
import { useStats, useRecentUpdates, useHosts } from "@/lib/hooks/use-api"
import { TableSkeleton, ChartSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/error-boundary"
import { Button } from "@/components/ui/button"
import { ReportingHealthBadge } from "@/components/host-health-badge"
import { toast } from "sonner"
import { useRefreshTracking } from "@/lib/telemetry"
import { formatMetricValue, getReportingHealthState } from "@/lib/host-health"

const BarChart = dynamic(
  () => import("@/components/charts/bar-chart").then(mod => ({ default: mod.BarChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

function DashboardContent() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStats()
  const { data: recentUpdatesData, isLoading: updatesLoading, error: updatesError, refetch: refetchUpdates } = useRecentUpdates(24, 20)
  const {
    data: hostsData,
    isLoading: hostsLoading,
    error: hostsError,
    dataUpdatedAt: hostsUpdatedAt,
    refetch: refetchHosts,
  } = useHosts()
  const [now, setNow] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const trackRefresh = useRefreshTracking()

  const recentUpdates = recentUpdatesData?.items || []
  const reportingHealth = getReportingHealthState({
    data: hostsData,
    isLoading: hostsLoading,
    hasError: Boolean(hostsError),
    dataUpdatedAt: hostsUpdatedAt,
    now: now ? new Date(now) : undefined,
  })
  const hostHealthValue = reportingHealth.staleCount === null || reportingHealth.missingCount === null
    ? "—"
    : `${formatMetricValue(reportingHealth.staleCount)} stale · ${formatMetricValue(reportingHealth.missingCount)} missing`

  // Prepare chart data
  const topPackagesData = stats?.most_updated_packages?.map(pkg => ({
    name: pkg.package,
    value: pkg.count
  })) || []

  const topHostsData = stats?.most_active_hosts?.map(host => ({
    name: host.hostname,
    value: host.count
  })) || []

  const handleRefresh = async () => {
    try {
      await toast.promise(
        Promise.all([refetchStats(), refetchUpdates(), refetchHosts()]),
        {
          loading: 'Refreshing data...',
          success: 'Data refreshed successfully',
          error: 'Failed to refresh data',
        }
      )
      trackRefresh('dashboard', true)
    } catch {
      trackRefresh('dashboard', false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of package updates across all hosts
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <section aria-label="Overview metrics" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total Hosts" value={formatMetricValue(stats?.total_hosts)} icon={Server} />
        <StatsCard title="Total Updates" value={formatMetricValue(stats?.total_updates)} icon={Activity} />
        <StatsCard title="Updates in Last 24 Hours" value={formatMetricValue(stats?.updates_last_24h)} icon={Clock} />
        <StatsCard title="Updates in Last 7 Days" value={formatMetricValue(stats?.updates_last_7d)} icon={Calendar} />
      </section>

      <section aria-label="Key performance indicators" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total Hosts" value={formatMetricValue(stats?.total_hosts)} icon={Server} />
        <StatsCard title="Recent Updates" value={formatMetricValue(stats?.updates_last_24h)} icon={Clock} />
        <StatsCard title="Weekly Updates" value={formatMetricValue(stats?.updates_last_7d)} icon={Calendar} />
        <StatsCard
          title="Host Health"
          value={hostHealthValue}
          icon={AlertTriangle}
          description={reportingHealth.staleCount === null
            ? "Stale and missing counts unavailable"
            : "Stale and missing hosts"}
        />
      </section>

      <section aria-label="Reporting health" className="glass-surface flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-semibold">Reporting health</h2>
          <ReportingHealthBadge state={reportingHealth} />
          <p className="text-sm text-muted-foreground">{reportingHealth.description}</p>
          {reportingHealth.staleCount !== null && reportingHealth.missingCount !== null && (
            <p className="text-sm text-muted-foreground">
              {formatMetricValue(reportingHealth.staleCount)} stale · {formatMetricValue(reportingHealth.missingCount)} missing
            </p>
          )}
          {reportingHealth.lastSuccessAt && (
            <p className="text-sm text-muted-foreground">
              Last successful response: {reportingHealth.lastSuccessAt}
            </p>
          )}
        </div>
        {reportingHealth.retry && (
          <Button variant="outline" onClick={() => refetchHosts()}>
            Retry host health
          </Button>
        )}
      </section>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {statsLoading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : statsError ? (
          <div className="col-span-2 p-4 rounded-lg border glass-surface border-status-error text-status-error">
            Failed to load charts
          </div>
        ) : (
          <>
            <BarChart
              title="Top 5 Most Updated Packages"
              data={topPackagesData.slice(0, 5)}
            />
            <BarChart
              title="Most Active Hosts"
              data={topHostsData.slice(0, 5)}
            />
          </>
        )}
      </div>

      {/* Recent Updates */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-4">
          Recent Updates
          <span className="text-sm font-normal text-muted-foreground ml-2">
            (Auto-refreshes every 30 seconds)
          </span>
        </h2>
        {updatesLoading ? (
          <TableSkeleton rows={5} />
        ) : updatesError ? (
          <div className="p-4 rounded-lg border glass-surface border-status-error text-status-error">
            Failed to load recent updates
          </div>
        ) : (
          <UpdatesTable updates={recentUpdates} showHostname={true} />
        )}
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  )
}
