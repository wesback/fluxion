"use client"

import { useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Search, RefreshCw } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useHosts } from "@/lib/hooks/use-api"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/error-boundary"
import { toast } from "sonner"

function HostsContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const { data, isLoading, error, refetch } = useHosts()
  
  const hosts = data?.items || []

  const filteredHosts = hosts.filter(host =>
    host.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    host.os_info.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
          <h1 className="text-3xl font-bold tracking-tight">Hosts</h1>
          <p className="text-muted-foreground">
            Manage and monitor all registered hosts
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search hosts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
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
            <TableHeader>
              <TableRow>
                <TableHead>Hostname</TableHead>
                <TableHead>Operating System</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Total Updates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHosts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No hosts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredHosts.map((host) => (
                  <TableRow key={host.hostname} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/hosts/${host.hostname}`}
                        className="font-medium hover:underline"
                      >
                        {host.hostname}
                      </Link>
                    </TableCell>
                    <TableCell>{host.os_info}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(host.last_seen), { addSuffix: true })}
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
