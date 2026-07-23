"use client"

import { Activity, AlertTriangle, CheckCircle2, RefreshCw, type LucideIcon } from "lucide-react"
import { useIngestDiagnostics, useWebhookCoverage } from "@/lib/hooks/use-admin"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableSkeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/error-boundary"
import { toast } from "sonner"

function DiagnosticsContent() {
  const ingest = useIngestDiagnostics()
  const coverage = useWebhookCoverage()
  const isLoading = ingest.isLoading || coverage.isLoading
  const hasError = ingest.error || coverage.error

  const handleRefresh = () => {
    toast.promise(Promise.all([ingest.refetch(), coverage.refetch()]), {
      loading: "Refreshing diagnostics...",
      success: "Diagnostics refreshed",
      error: "Failed to refresh diagnostics",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Ingest diagnostics</h2>
          <p className="text-sm text-muted-foreground">Monitor report delivery and webhook event coverage.</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {hasError ? (
        <Card className="p-6" role="alert">
          <p className="text-destructive">Diagnostics are unavailable. Check the admin API contract and try again.</p>
        </Card>
      ) : isLoading ? (
        <TableSkeleton rows={4} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard title="Requests" value={ingest.data?.requests ?? 0} icon={Activity} />
            <MetricCard title="Packages rejected" value={ingest.data?.packages_rejected ?? 0} icon={AlertTriangle} />
            <MetricCard title="Configured webhooks" value={(coverage.data?.items || []).reduce((sum, item) => sum + item.configured, 0)} icon={CheckCircle2} />
          </div>

          <Card>
            <CardHeader><CardTitle>Ingest outcomes</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(ingest.data?.by_outcome || {}).length === 0 && Object.keys(ingest.data?.by_package_manager || {}).length === 0 ? (
                <p className="text-sm text-muted-foreground">No ingest diagnostics reported.</p>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  <Table>
                    <TableCaption className="sr-only">Ingest outcomes</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Requests</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(ingest.data?.by_outcome || {}).map(([outcome, count]) => (
                        <TableRow key={outcome}>
                          <TableCell className="font-medium">{outcome}</TableCell>
                          <TableCell>{count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Table>
                    <TableCaption className="sr-only">Ingest requests by package manager</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Package manager</TableHead>
                        <TableHead>Requests</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(ingest.data?.by_package_manager || {}).map(([manager, count]) => (
                        <TableRow key={manager}>
                          <TableCell className="font-medium">{manager}</TableCell>
                          <TableCell>{count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Webhook event coverage</CardTitle></CardHeader>
            <CardContent>
              {(coverage.data?.items || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No webhook coverage data reported.</p>
              ) : (
                <Table>
                  <TableCaption className="sr-only">Webhook event coverage</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Configured</TableHead>
                      <TableHead>Attempted</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Failed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coverage.data?.items.map((item) => (
                      <TableRow key={item.event_type}>
                        <TableCell className="font-mono text-sm">{item.event_type}</TableCell>
                        <TableCell><Badge variant={item.configured > 0 ? "success" : "secondary"}>{item.configured}</Badge></TableCell>
                        <TableCell>{item.attempted}</TableCell>
                        <TableCell>{item.delivered}</TableCell>
                        <TableCell className={item.failed > 0 ? "text-destructive" : undefined}>{item.failed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </>
      )}
    </div>
  )
}

function MetricCard({ title, value, icon: Icon }: { title: string; value: number; icon: LucideIcon }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
        </div>
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </CardContent>
    </Card>
  )
}

export default function DiagnosticsPage() {
  return (
    <ErrorBoundary>
      <DiagnosticsContent />
    </ErrorBoundary>
  )
}
