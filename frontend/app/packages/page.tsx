"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { mockPackageHosts } from "@/lib/mock-data"

export default function PackagesPage() {
  const [packageName, setPackageName] = useState("nginx")
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = () => {
    setHasSearched(true)
    // In a real app, this would trigger an API call
  }

  const hosts = hasSearched ? mockPackageHosts : []

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
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter package name (e.g., nginx, postgresql)"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch}>Search</Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {hasSearched && (
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-4">
            Hosts with &quot;{packageName}&quot;
          </h2>
          {hosts.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No hosts found with this package
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Current Version</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hosts.map((host) => (
                    <TableRow key={host.hostname}>
                      <TableCell className="font-medium">{host.hostname}</TableCell>
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
