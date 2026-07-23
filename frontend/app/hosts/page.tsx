"use client"

import { useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Search, RefreshCw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useHosts } from "@/lib/hooks/use-api"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/error-boundary"
import { toast } from "sonner"
import { Select } from "@/components/ui/select"
import { FilterBar } from "@/components/filter-bar"
import { ExportControls } from "@/components/export-controls"
import { HostHealthBadge } from "@/components/host-health-badge"
import { getHostHealthStatus } from "@/lib/host-health"
import { useQueryState } from "@/lib/hooks/use-query-state"

function HostsContent() {
  const [searchQuery, setSearchQuery] = useQueryState("q")
  const [statusFilter, setStatusFilter] = useQueryState("status", "all")
  const [sortOrder, setSortOrder] = useQueryState("sort", "last_seen")
  const [searchInput, setSearchInput] = useState(searchQuery)
  const { data, isLoading, error, refetch } = useHosts()

  const hosts = data?.items || []

  const filteredHosts = hosts
    .filter(host =>
      host.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      host.os_info.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter(host => statusFilter === "all" || getHostHealthStatus(host.last_seen) === statusFilter)
    .sort((a, b) => {
      if (sortOrder === "hostname") return a.hostname.localeCompare(b.hostname)
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
    })

  const clearFilters = () => {
    setSearchInput("")
    setSearchQuery("")
    setStatusFilter("all")
    setSortOrder("last_seen")
  }

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: 'Refreshing hosts...',
      success: 'Hosts refreshed successfully',
      error: 'Failed to refresh hosts',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Hosts</h1>
          <p className="text-muted-foreground">
            Manage and monitor all registered hosts
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <FilterBar onClear={clearFilters}>
        <label className="relative block">
          <span className="sr-only">Search hosts</span>
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search hosts..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearchQuery(searchInput.trim())
            }}
            onBlur={() => setSearchQuery(searchInput.trim())}
            className="pl-10"
            aria-label="Search hosts"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Health status</span>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by health status">
            <option value="all">All statuses</option>
            <option value="healthy">Healthy</option>
            <option value="stale">Stale</option>
            <option value="missing">Missing</option>
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Sort</span>
          <Select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} aria-label="Sort hosts">
            <option value="last_seen">Last seen</option>
            <option value="hostname">Hostname</option>
          </Select>
        </label>
      </FilterBar>
      <div className="flex justify-end">
        <ExportControls
          rows={filteredHosts}
          filename="fluxion-hosts"
          columns={[
            { key: "hostname", label: "Hostname" },
            { key: "os_info", label: "Operating system" },
            { key: "last_seen", label: "Last seen" },
            { key: "total_updates", label: "Total updates" },
          ]}
        />
      </div>

      {/* Hosts Table */}
      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : error ? (
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
          Failed to load hosts. Please try again.
        </div>
      ) : (
        <Card>
          <Table>
            <TableCaption className="sr-only">Registered hosts table</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Hostname</TableHead>
                <TableHead className="hidden md:table-cell">Operating System</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Total Updates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHosts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {hosts.length === 0 ? "No hosts have reported yet." : "No hosts match the selected filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredHosts.map((host) => (
                  <TableRow key={host.hostname}>
                    <TableCell>
                      <Link
                        href={`/hosts/${host.hostname}`}
                        className="font-medium hover:underline"
                      >
                        {host.hostname}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{host.os_info}</TableCell>
                    <TableCell><HostHealthBadge lastSeen={host.last_seen} /></TableCell>
                    <TableCell className="text-muted-foreground">
                      {host.last_seen ? (
                        <time dateTime={new Date(host.last_seen).toISOString()}>
                          {formatDistanceToNow(new Date(host.last_seen), { addSuffix: true })}
                        </time>
                      ) : "Never"}
                    </TableCell>
                    <TableCell>{host.total_updates}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

export default function HostsPage() {
  return (
    <ErrorBoundary>
      <HostsContent />
    </ErrorBoundary>
  )
}
