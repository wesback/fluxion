"use client"

import { useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"
import { Search } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { mockHosts } from "@/lib/mock-data"

export default function HostsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const hosts = mockHosts

  const filteredHosts = hosts.filter(host =>
    host.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    host.os_info.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hosts</h1>
        <p className="text-muted-foreground">
          Manage and monitor all registered hosts
        </p>
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
    </div>
  )
}
