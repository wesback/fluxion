"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { usePackageSearch } from "@/lib/hooks/use-api"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/error-boundary"

function PackagesContent() {
  const [packageName, setPackageName] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  const { data, isLoading, error } = usePackageSearch(searchQuery)

  const hosts = data?.items || []

  const handleSearch = () => {
    if (packageName.trim()) {
      setSearchQuery(packageName.trim())
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Package Search</h1>
        <p className="text-muted-foreground">
          Search for packages across all hosts
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search for a Package</CardTitle>
          <p className="text-sm text-muted-foreground">
            Partial matches supported - search for &quot;lib&quot; to find all packages containing &quot;lib&quot;
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); handleSearch() }} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Enter package name or partial match (e.g., nginx, lib, python)"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                className="pl-10"
                aria-label="Search packages"
              />
            </div>
            <Button type="submit" disabled={isLoading || !packageName.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  Searching
                </>
              ) : (
                "Search"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {searchQuery && (
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-4">
            Hosts with &quot;{searchQuery}&quot;
          </h2>
          {isLoading ? (
            <TableSkeleton rows={3} />
          ) : error ? (
            <Card className="p-8">
              <p className="text-destructive text-center">Failed to search for package. Please try again.</p>
            </Card>
          ) : hosts.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No hosts found with this package
            </Card>
          ) : (
            <Card>
              <Table>
                <TableCaption className="sr-only">Package search results table</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Package Name</TableHead>
                    <TableHead className="hidden md:table-cell">Current Version</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hosts.map((host, idx) => (
                    <TableRow key={`${host.hostname}-${host.package_name}-${idx}`}>
                      <TableCell className="font-medium">{host.hostname}</TableCell>
                      <TableCell className="font-mono text-sm text-primary">
                        {host.package_name}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm">
                        {host.current_version}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <time dateTime={new Date(host.last_updated).toISOString()}>
                          {formatDistanceToNow(new Date(host.last_updated), {
                            addSuffix: true,
                          })}
                        </time>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

export default function PackagesPage() {
  return (
    <ErrorBoundary>
      <PackagesContent />
    </ErrorBoundary>
  )
}
