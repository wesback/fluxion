"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { StatsCard } from "@/components/stats-card"
import { UpdatesTable } from "@/components/updates-table"
import { Activity, Server, Clock, Calendar, RefreshCw, AlertTriangle } from "lucide-react"
import { useStats, useRecentUpdates, useHosts } from "@/lib/hooks/use-api"
import { StatsCardSkeleton, TableSkeleton, ChartSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/error-boundary"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useRefreshTracking } from "@/lib/telemetry"
import { getHostHealthStatus } from "@/lib/host-health"

const BarChart = dynamic(
  () => import("@/components/charts/bar-chart").then(mod => ({ default: mod.BarChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

function DashboardContent() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStats()
  const { data: recentUpdatesData, isLoading: updatesLoading, error: updatesError, refetch: refetchUpdates } = useRecentUpdates(24, 20)
  const { data: hostsData, isLoading: hostsLoading, refetch: refetchHosts } = useHosts()
  const [now, setNow] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0)
    return () => window.clearTimeout(timer)
  }, [])
  const trackRefresh = useRefreshTracking()

  const recentUpdates = recentUpdatesData?.items || []
  const hostHealth = (hostsData?.items || []).reduce(
    (counts, host) => {
      const status = getHostHealthStatus(host.last_seen, now ? new Date(now) : undefined)
      if (status === "missing") counts.missing += 1
      else if (status === "stale") counts.stale += 1
      return counts
    },
    { stale: 0, missing: 0 }
  )

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

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {statsLoading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : statsError ? (
          <div className="col-span-full p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
            Failed to load statistics
          </div>
        ) : stats ? (
          <>
            <StatsCard
              title="Total Hosts"
              value={stats.total_hosts}
              icon={Server}
              description="Registered hosts"
            />
            <StatsCard
              title="Total Updates"
              value={stats.total_updates.toLocaleString()}
              icon={Activity}
              description="All time"
            />
            <StatsCard
              title="Last 24 Hours"
              value={stats.updates_last_24h}
              icon={Clock}
              description="Recent updates"
            />
            <StatsCard
              title="Last 7 Days"
              value={stats.updates_last_7d}
              icon={Calendar}
              description="This week"
            />
            <StatsCard
              title="Host Health"
              value={hostsLoading ? "…" : `${hostHealth.stale} stale · ${hostHealth.missing} missing`}
              icon={AlertTriangle}
              description="Based on package-report activity"
              className={hostHealth.stale + hostHealth.missing > 0 ? "border-amber-300 dark:border-amber-700" : undefined}
            />
          </>
        ) : null}
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {statsLoading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : statsError ? (
          <div className="col-span-2 p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
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
          <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
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
