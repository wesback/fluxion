"use client"

import { formatDistanceToNow } from "date-fns"
import { Cpu, RefreshCw } from "lucide-react"
import { useKernels } from "@/lib/hooks/use-api"
import { useQueryState } from "@/lib/hooks/use-query-state"
import { FilterBar } from "@/components/filter-bar"
import { ExportControls } from "@/components/export-controls"
import { SecurityBadge } from "@/components/security-badge"
import { TableSkeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/error-boundary"
import { toast } from "sonner"

function KernelsContent() {
  const [host, setHost] = useQueryState("host")
  const [os, setOs] = useQueryState("os")
  const [fromDate, setFromDate] = useQueryState("from")
  const [toDate, setToDate] = useQueryState("to")
  const { data, isLoading, error, refetch } = useKernels()
  const items = (data?.items || []).filter((item) => {
    const hostMatches = !host || item.hostname.toLowerCase().includes(host.toLowerCase())
    const osMatches = !os || item.os_info.toLowerCase().includes(os.toLowerCase())
    const timestamp = item.last_updated ? new Date(item.last_updated).getTime() : null
    const fromMatches = !fromDate || (timestamp !== null && timestamp >= new Date(`${fromDate}T00:00:00Z`).getTime())
    const toMatches = !toDate || (timestamp !== null && timestamp <= new Date(`${toDate}T23:59:59Z`).getTime())
    return hostMatches && osMatches && fromMatches && toMatches
  })

  const clearFilters = () => {
    setHost("")
    setOs("")
    setFromDate("")
    setToDate("")
  }

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: "Refreshing kernel fleet...",
      success: "Kernel fleet refreshed",
      error: "Failed to refresh kernel fleet",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Kernel fleet</h1>
          </div>
          <p className="text-muted-foreground">Latest kernel package reported by each host.</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <FilterBar onClear={clearFilters}>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Host</span>
          <Input value={host} onChange={(event) => setHost(event.target.value)} placeholder="Filter hostnames" aria-label="Filter kernels by host" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Operating system</span>
          <Input value={os} onChange={(event) => setOs(event.target.value)} placeholder="Filter OS" aria-label="Filter kernels by operating system" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Updated after</span>
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Kernel update start date" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Updated before</span>
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Kernel update end date" />
        </label>
      </FilterBar>

      <div className="flex justify-end">
        <ExportControls
          rows={items}
          filename="fluxion-kernel-fleet"
          columns={[
            { key: "hostname", label: "Hostname" },
            { key: "os_info", label: "Operating system" },
            { key: "kernel_package", label: "Kernel package" },
            { key: "kernel_version", label: "Version" },
            { key: "last_updated", label: "Last updated" },
            { key: "is_security", label: "Security" },
          ]}
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : error ? (
        <Card className="p-8" role="alert">
          <p className="text-destructive">Failed to load the kernel fleet. Please try again.</p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center">
          <Cpu className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-3 text-muted-foreground">No kernel packages match the selected filters.</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableCaption className="sr-only">Latest kernel package by host</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Host</TableHead>
                <TableHead className="hidden md:table-cell">Operating system</TableHead>
                <TableHead>Kernel package</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Security</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.hostname}>
                  <TableCell className="font-medium">{item.hostname}</TableCell>
                  <TableCell className="hidden md:table-cell">{item.os_info}</TableCell>
                  <TableCell className="font-mono text-sm">{item.kernel_package || "No kernel report"}</TableCell>
                  <TableCell className="font-mono text-sm">{item.kernel_version || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.last_updated ? (
                      <time dateTime={new Date(item.last_updated).toISOString()}>
                        {formatDistanceToNow(new Date(item.last_updated), { addSuffix: true })}
                      </time>
                    ) : "Never"}
                  </TableCell>
                  <TableCell>{item.is_security && <SecurityBadge />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

export default function KernelsPage() {
  return (
    <ErrorBoundary>
      <KernelsContent />
    </ErrorBoundary>
  )
}
