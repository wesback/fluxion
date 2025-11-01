"use client"

import { StatsCard } from "@/components/stats-card"
import { UpdatesTable } from "@/components/updates-table"
import { BarChart } from "@/components/charts/bar-chart"
import { Activity, Server, Clock, Calendar, RefreshCw } from "lucide-react"
import { useStats, useRecentUpdates } from "@/lib/hooks/use-api"
import { StatsCardSkeleton, TableSkeleton, ChartSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/error-boundary"
import { toast } from "sonner"

function DashboardContent() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useStats()
  const { data: recentUpdatesData, isLoading: updatesLoading, error: updatesError, refetch: refetchUpdates } = useRecentUpdates(24, 20)

  const recentUpdates = recentUpdatesData?.items || []

  // Prepare chart data
  const topPackagesData = stats?.most_updated_packages.map(pkg => ({
    name: pkg.package,
    value: pkg.count
  })) || []

  const topHostsData = stats?.most_active_hosts.map(host => ({
    name: host.hostname,
    value: host.count
  })) || []

  const handleRefresh = () => {
    toast.promise(
      Promise.all([refetchStats(), refetchUpdates()]),
      {
        loading: 'Refreshing data...',
        success: 'Data refreshed successfully',
        error: 'Failed to refresh data',
      }
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of package updates across all hosts
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : statsError ? (
          <div className="col-span-4 p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
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
        <h2 className="text-2xl font-bold tracking-tight mb-4">
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
