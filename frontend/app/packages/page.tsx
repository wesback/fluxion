"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
        <h1 className="text-3xl font-bold tracking-tight">Package Search</h1>
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
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter package name or partial match (e.g., nginx, lib, python)"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={isLoading || !packageName.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching
                </>
              ) : (
                "Search"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {searchQuery && (
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-4">
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Package Name</TableHead>
                    <TableHead>Current Version</TableHead>
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
                      <TableCell className="font-mono text-sm">
                        {host.current_version}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(host.last_updated), {
                          addSuffix: true,
                        })}
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
