"use client"

import { StatsCard } from "@/components/stats-card"
import { UpdatesTable } from "@/components/updates-table"
import { BarChart } from "@/components/charts/bar-chart"
import { Activity, Server, Clock, Calendar } from "lucide-react"
import { mockStats, mockRecentUpdates } from "@/lib/mock-data"

export default function Home() {
  // Use mock data for now
  const stats = mockStats
  const recentUpdates = mockRecentUpdates

  // Prepare chart data
  const topPackagesData = stats.most_updated_packages.map(pkg => ({
    name: pkg.package,
    value: pkg.count
  }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of package updates across all hosts
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <BarChart
          title="Top 5 Most Updated Packages"
          data={topPackagesData.slice(0, 5)}
        />
        <BarChart
          title="Most Active Hosts"
          data={stats.most_active_hosts.slice(0, 5).map(host => ({
            name: host.hostname,
            value: host.count
          }))}
        />
      </div>

      {/* Recent Updates */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Recent Updates</h2>
        <UpdatesTable updates={recentUpdates} showHostname={true} />
      </div>
    </div>
  )
}
