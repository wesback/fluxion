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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="Search hosts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          aria-label="Search hosts"
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
                    <TableCell className="text-muted-foreground">
                      <time dateTime={new Date(host.last_seen).toISOString()}>
                        {formatDistanceToNow(new Date(host.last_seen), { addSuffix: true })}
                      </time>
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
