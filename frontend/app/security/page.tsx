"use client"

import { useEffect, useMemo, useState } from "react"
import { ShieldCheck, Package, Server, Clock, RefreshCw } from "lucide-react"
import { useSecurityFeed } from "@/lib/hooks/use-api"
import { useQueryState } from "@/lib/hooks/use-query-state"
import { SecurityBadge } from "@/components/security-badge"
import { UpdatesTable } from "@/components/updates-table"
import { StatsCard } from "@/components/stats-card"
import { TableSkeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { FilterBar } from "@/components/filter-bar"
import { ExportControls } from "@/components/export-controls"
import { ErrorBoundary } from "@/components/error-boundary"
import { toast } from "sonner"
import { EXPORT_ROW_LIMIT } from "@/components/export-controls"

function SecurityContent() {
  const [windowFilter, setWindowFilter] = useQueryState("window", "168")
  const [packageFilter, setPackageFilter] = useQueryState("package")
  const [hostFilter, setHostFilter] = useQueryState("host")
  const hours = windowFilter === "24" ? 24 : 168
  const [now, setNow] = useState(0)
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const dateFilters = useMemo(() => {
    if (!now) return {}
    const toDate = new Date(now)
    return {
      from_date: new Date(now - hours * 60 * 60 * 1000).toISOString(),
      to_date: toDate.toISOString(),
    }
  }, [hours, now])
  const securityFilters = useMemo(() => ({
    limit: EXPORT_ROW_LIMIT,
    hostname: hostFilter.trim() || undefined,
    package_name: packageFilter.trim() || undefined,
    ...dateFilters,
  }), [dateFilters, hostFilter, packageFilter])
  const { data, isLoading, error, refetch } = useSecurityFeed(securityFilters, { enabled: now > 0 })

  const filteredUpdates = data?.items || []
  const packageCount = new Set(filteredUpdates.map((update) => update.package_name)).size
  const hostCount = new Set(filteredUpdates.map((update) => update.hostname)).size
  const topPackages = getTopCounts(filteredUpdates.map((update) => update.package_name))
  const topHosts = getTopCounts(filteredUpdates.map((update) => update.hostname))

  const clearFilters = () => {
    setWindowFilter("168")
    setPackageFilter("")
    setHostFilter("")
  }

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: "Refreshing security updates...",
      success: "Security updates refreshed",
      error: "Failed to refresh security updates",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-amber-600" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Security updates</h1>
          </div>
          <p className="text-muted-foreground">Track package changes flagged by the host security channel.</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <div className="h-28 animate-pulse rounded-lg bg-muted" />
            <div className="h-28 animate-pulse rounded-lg bg-muted" />
            <div className="h-28 animate-pulse rounded-lg bg-muted" />
            <div className="h-28 animate-pulse rounded-lg bg-muted" />
          </>
        ) : (
          <>
            <StatsCard title="Security updates (24h)" value={data?.security_updates_last_24h ?? 0} icon={Clock} />
            <StatsCard title="Security updates (7d)" value={data?.security_updates_last_7d ?? 0} icon={ShieldCheck} />
            <StatsCard title="Security packages" value={packageCount} icon={Package} description="In selected window" />
            <StatsCard title="Affected hosts" value={hostCount} icon={Server} description="In selected window" />
          </>
        )}
      </div>

      <FilterBar onClear={clearFilters}>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Package</span>
          <Input value={packageFilter} onChange={(event) => setPackageFilter(event.target.value)} placeholder="Filter package names" aria-label="Filter security updates by package" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Host</span>
          <Input value={hostFilter} onChange={(event) => setHostFilter(event.target.value)} placeholder="Filter hostnames" aria-label="Filter security updates by host" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Time window</span>
          <Select value={windowFilter} onChange={(event) => setWindowFilter(event.target.value)} aria-label="Security update time window">
            <option value="24">Last 24 hours</option>
            <option value="168">Last 7 days</option>
          </Select>
        </label>
      </FilterBar>

      <div className="flex justify-end">
        <ExportControls
          rows={[]}
          filename="fluxion-security-updates"
          serverExport={{ url: "/api/security/export", params: securityFilters, rowCount: data?.total }}
          columns={[
            { key: "hostname", label: "Hostname" },
            { key: "package_name", label: "Package" },
            { key: "old_version", label: "Old version" },
            { key: "new_version", label: "New version" },
            { key: "update_timestamp", label: "Time" },
            { key: "is_security", label: "Security" },
          ]}
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : error ? (
        <Card className="p-8" role="alert">
          <p className="text-destructive">Failed to load security updates. Please try again.</p>
        </Card>
      ) : filteredUpdates.length === 0 ? (
        <Card className="p-8 text-center">
          <SecurityBadge />
          <p className="mt-3 text-muted-foreground">
            {(data?.total || 0) === 0 ? "No security updates were reported in this window." : "No security updates match the selected filters."}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <UpdatesTable updates={filteredUpdates} showHostname />
          <div className="grid gap-4 md:grid-cols-2">
            <RankedList title="Top security packages" items={topPackages} />
            <RankedList title="Hosts with most security patches" items={topHosts} />
          </div>
        </div>
      )}
    </div>
  )
}

function getTopCounts(values: string[]) {
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
  return Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 10)
}

function RankedList({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data available.</p>
        ) : (
          <ol className="space-y-2">
            {items.map((item) => (
              <li key={item.label} className="flex items-center justify-between text-sm">
                <span className="truncate font-mono">{item.label}</span>
                <span className="ml-4 font-semibold">{item.count}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export default function SecurityPage() {
  return (
    <ErrorBoundary>
      <SecurityContent />
    </ErrorBoundary>
  )
}
