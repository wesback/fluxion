"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import Link from "next/link"
import { StatsCard } from "@/components/stats-card"
import { UpdatesTable } from "@/components/updates-table"
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, ShieldAlert } from "lucide-react"
import { useStats, useRecentUpdates, useHosts } from "@/lib/hooks/use-api"
import { TableSkeleton, ChartSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/error-boundary"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useRefreshTracking } from "@/lib/telemetry"
import { getReportingHealthState } from "@/lib/host-health"

const BarChart = dynamic(
  () => import("@/components/charts/bar-chart").then(mod => ({ default: mod.BarChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

const formatNumber = (value?: number) => value?.toLocaleString("en-US") ?? "—"

function DashboardContent() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStats()
  const { data: recentUpdatesData, isLoading: updatesLoading, error: updatesError, refetch: refetchUpdates } = useRecentUpdates(24, 5)
  const {
    data: hostsData,
    isLoading: hostsLoading,
    error: hostsError,
    dataUpdatedAt: hostsDataUpdatedAt,
    refetch: refetchHosts,
  } = useHosts()
  const [now, setNow] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const trackRefresh = useRefreshTracking()

  const recentUpdates = recentUpdatesData?.items || []
  const reportingHealth = getReportingHealthState(
    { data: hostsData, isLoading: hostsLoading, error: hostsError, dataUpdatedAt: hostsDataUpdatedAt },
    now ? new Date(now) : undefined,
  )
  const currentHostCount = hostsData?.items && reportingHealth.counts
    ? hostsData.items.length - reportingHealth.counts.stale - reportingHealth.counts.missing
    : undefined
  const healthStatus = reportingHealth.status === "Healthy"
    ? "healthy"
    : reportingHealth.counts?.stale || reportingHealth.counts?.missing
      ? "attention"
      : "unknown"

  // Prepare chart data
  const topPackagesData = stats?.most_updated_packages.map(pkg => ({
    name: pkg.package,
    value: pkg.count
  })) || []

  const topHostsData = stats?.most_active_hosts.map(host => ({
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
    <div className="space-y-5 md:space-y-6">
      <div className="dashboard-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Package activity and reporting health across your hosts</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} className="shrink-0">
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <section aria-label="Fluxion health overview" className="overview-panel">
        <header className="overview-header">
          <div>
            <h2>Fluxion Health Overview</h2>
            <p>{reportingHealth.message ?? "Host package-report status and recent update activity"}</p>
          </div>
          <div className="flex items-center gap-2">
            {reportingHealth.canRetry && (
              <Button variant="outline" onClick={() => refetchHosts()} className="min-h-8 px-2.5 text-xs">
                Retry
              </Button>
            )}
            <span className="reporting-status" data-status={healthStatus} aria-live="polite">
              <span className="reporting-status-dot" aria-hidden="true" />
              {reportingHealth.status}
            </span>
          </div>
        </header>
        <dl aria-label="Update activity metrics" className="overview-metrics">
          <div className="overview-metric">
            <dt>Total hosts</dt>
            <dd>{formatNumber(stats?.total_hosts)}</dd>
          </div>
          <div className="overview-metric">
            <dt>Total updates</dt>
            <dd>{formatNumber(stats?.total_updates)}</dd>
          </div>
          <div className="overview-metric">
            <dt>Last 24 hours</dt>
            <dd>{formatNumber(stats?.updates_last_24h)}</dd>
          </div>
          <div className="overview-metric">
            <dt>Last 7 days</dt>
            <dd>{formatNumber(stats?.updates_last_7d)}</dd>
          </div>
        </dl>
      </section>

      <section aria-label="Operational KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Current hosts"
          value={formatNumber(currentHostCount)}
          icon={CheckCircle2}
          description="Reports received within 30 days"
        />
        <StatsCard
          title="Stale hosts"
          value={formatNumber(reportingHealth.counts?.stale)}
          icon={Clock}
          description="Last report was over 30 days ago"
          className={reportingHealth.counts?.stale ? "dashboard-stat-warning" : undefined}
        />
        <StatsCard
          title="Missing hosts"
          value={formatNumber(reportingHealth.counts?.missing)}
          icon={AlertTriangle}
          description="No date or last report over a year ago"
          className={reportingHealth.counts?.missing ? "dashboard-stat-warning" : undefined}
        />
        <StatsCard
          title="Security updates"
          value={formatNumber(stats?.security_updates_last_24h)}
          icon={ShieldAlert}
          description="Last 24 hours"
        />
      </section>

      {statsError && (
        <div role="alert" className="dashboard-error glass-surface rounded-xl border border-status-error p-3 text-sm text-status-error">
          {stats
            ? "Failed to refresh statistics; showing cached values"
            : "Failed to load statistics"}
        </div>
      )}

      <section aria-label="Update activity charts" className="grid gap-3 lg:grid-cols-2">
        {statsLoading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : statsError ? (
          <div role="alert" className="dashboard-error glass-surface rounded-xl border border-status-error p-3 text-sm text-status-error lg:col-span-2">
            Failed to load charts
          </div>
        ) : (
          <>
            <BarChart
              title="Top 5 Most Updated Packages"
              valueUnit="update"
              data={topPackagesData.slice(0, 5)}
            />
            <BarChart
              title="Most Active Hosts"
              valueUnit="update"
              data={topHostsData.slice(0, 5)}
            />
          </>
        )}
      </section>

      <section aria-label="Recent updates">
        <div className="dashboard-section-heading">
          <div>
            <h2 className="section-heading">Recent updates</h2>
            <p>Latest package changes reported by your hosts</p>
          </div>
          <Link href="/activity" className="dashboard-section-link">View all</Link>
        </div>
        {updatesLoading ? (
          <TableSkeleton rows={5} />
        ) : updatesError ? (
          <div role="alert" className="dashboard-error glass-surface rounded-xl border border-status-error p-3 text-sm text-status-error">
            Failed to load recent updates
          </div>
        ) : (
          <UpdatesTable updates={recentUpdates} showHostname={true} />
        )}
      </section>
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
