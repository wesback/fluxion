"use client"

import { use } from "react"
import { HostCard } from "@/components/host-card"
import { UpdatesTable } from "@/components/updates-table"
import { LineChart } from "@/components/charts/line-chart"
import { mockHosts, mockHostUpdates } from "@/lib/mock-data"
import { Card } from "@/components/ui/card"

export default function HostDetailPage({ params }: { params: Promise<{ hostname: string }> }) {
  const { hostname } = use(params)
  
  // Find the host in mock data
  const host = mockHosts.find(h => h.hostname === decodeURIComponent(hostname))
  
  if (!host) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Host Not Found</h1>
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            The host &quot;{decodeURIComponent(hostname)}&quot; was not found.
          </p>
        </Card>
      </div>
    )
  }

  // Mock chart data - updates over last 7 days
  const updatesOverTime = [
    { name: "7 days ago", value: 5 },
    { name: "6 days ago", value: 3 },
    { name: "5 days ago", value: 8 },
    { name: "4 days ago", value: 2 },
    { name: "3 days ago", value: 6 },
    { name: "2 days ago", value: 4 },
    { name: "Yesterday", value: 7 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{host.hostname}</h1>
        <p className="text-muted-foreground">
          Detailed information and update history
        </p>
      </div>

      {/* Host Info Card */}
      <HostCard {...host} />

      {/* Chart */}
      <LineChart
        title="Updates Over Time (Last 7 Days)"
        data={updatesOverTime}
      />

      {/* Update History */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Update History</h2>
        <UpdatesTable updates={mockHostUpdates} showHostname={false} />
      </div>
    </div>
  )
}
