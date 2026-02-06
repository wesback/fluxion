"use client"

import { use } from "react"
import dynamic from "next/dynamic"
import { HostCard } from "@/components/host-card"
import { UpdatesTable } from "@/components/updates-table"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useHosts, useHostDetail } from "@/lib/hooks/use-api"
import { StatsCardSkeleton, TableSkeleton, ChartSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/error-boundary"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

const LineChart = dynamic(
  () => import("@/components/charts/line-chart").then(mod => ({ default: mod.LineChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

function HostDetailContent({ hostname }: { hostname: string }) {
  const decodedHostname = decodeURIComponent(hostname)

  const { data: hostsData, isLoading: hostsLoading, error: hostsError } = useHosts()
  const { data: updatesData, isLoading: updatesLoading, error: updatesError, refetch } = useHostDetail(decodedHostname, { limit: 50 })

  const host = hostsData?.items.find(h => h.hostname === decodedHostname)
  const updates = updatesData?.items || []

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: 'Refreshing updates...',
      success: 'Updates refreshed successfully',
      error: 'Failed to refresh updates',
    })
  }

  if (hostsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{decodedHostname}</h1>
          <p className="text-muted-foreground">
            Detailed information and update history
          </p>
        </div>
        <StatsCardSkeleton />
        <ChartSkeleton />
        <TableSkeleton />
      </div>
    )
  }

  if (hostsError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Error</h1>
        <Card className="p-8">
          <p className="text-destructive">Failed to load host information. Please try again.</p>
        </Card>
      </div>
    )
  }

  if (!host) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Host Not Found</h1>
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            The host &quot;{decodedHostname}&quot; was not found.
          </p>
        </Card>
      </div>
    )
  }

  // Generate chart data from recent updates (last 7 days)
  const generateChartData = () => {
    const days = 7
    const now = new Date()
    const data = []

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)

      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)

      const count = updates.filter(update => {
        const updateDate = new Date(update.update_timestamp)
        return updateDate >= date && updateDate < nextDate
      }).length

      const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : `${i} days ago`
      data.push({ name: label, value: count })
    }

    return data
  }

  const updatesOverTime = generateChartData()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{host.hostname}</h1>
          <p className="text-muted-foreground">
            Detailed information and update history
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={updatesLoading}
        >
          <RefreshCw className={`w-4 h-4 ${updatesLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* Host Info Card */}
      <HostCard {...host} />

      {/* Chart */}
      {updatesLoading ? (
        <ChartSkeleton />
      ) : updatesError ? (
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
          Failed to load chart data
        </div>
      ) : (
        <LineChart
          title="Updates Over Time (Last 7 Days)"
          data={updatesOverTime}
        />
      )}

      {/* Update History */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-4">
          Update History
          {updatesData && <span className="text-sm font-normal text-muted-foreground ml-2">
            (Showing {updates.length} of {updatesData.total} updates)
          </span>}
        </h2>
        {updatesLoading ? (
          <TableSkeleton />
        ) : updatesError ? (
          <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
            Failed to load update history
          </div>
        ) : (
          <UpdatesTable updates={updates} showHostname={false} />
        )}
      </div>
    </div>
  )
}

export default function HostDetailPage({ params }: { params: Promise<{ hostname: string }> }) {
  const { hostname } = use(params)

  return (
    <ErrorBoundary>
      <HostDetailContent hostname={hostname} />
    </ErrorBoundary>
  )
}
