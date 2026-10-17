"use client"

import Link from "next/link"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getHostHealthStatus, type HostHealthStatus } from "@/lib/host-health"
import { useHosts } from "@/lib/hooks/use-api"

type Reporter = { hostname: string; last_seen: string | null }
type Signal = Reporter & { status: HostHealthStatus }

function isHostsResponse(value: unknown): value is { items: Reporter[] } {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) return false
  return value.items.every((item) =>
    item !== null &&
    typeof item === "object" &&
    "hostname" in item &&
    typeof item.hostname === "string" &&
    item.hostname.trim().length > 0 &&
    "last_seen" in item &&
    (item.last_seen === null ||
      (typeof item.last_seen === "string" && !Number.isNaN(Date.parse(item.last_seen))))
  )
}

export default function AlertsPage() {
  const { data, isLoading, isFetching, error, dataUpdatedAt, refetch } = useHosts()
  const validResponse = isHostsResponse(data)
  const signals: Signal[] = validResponse
    ? data.items
      .flatMap((host): Signal[] => {
        const status = getHostHealthStatus(host.last_seen)
        return status === "healthy" ? [] : [{ hostname: host.hostname, last_seen: host.last_seen, status }]
      })
      .sort((a, b) =>
        (a.status === b.status ? 0 : a.status === "missing" ? -1 : 1) ||
        a.hostname.localeCompare(b.hostname)
      )
    : []
  const missingCount = signals.filter((signal) => signal.status === "missing").length
  const staleCount = signals.filter((signal) => signal.status === "stale").length
  const timestamp = dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null
  const hasCachedSignals = validResponse && error

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Alerts</h1>
          </div>
          <p className="text-muted-foreground">Read-only reporting signals for registered hosts.</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </Button>
      </header>

      <section aria-labelledby="host-reporter-signals" className="space-y-4">
        <div>
          <h2 id="host-reporter-signals" className="text-xl font-semibold">Host reporter signals</h2>
          <p className="text-sm text-muted-foreground">Source: Package reporters</p>
          {timestamp && (
            <p className="text-sm text-muted-foreground">
              {hasCachedSignals ? "Stale · last successful fetch: " : "Last fetched: "}
              <time dateTime={timestamp}>{timestamp}</time>
            </p>
          )}
        </div>

        {isLoading && <p role="status">Loading package reporter signals…</p>}
        {!isLoading && (!validResponse || error) && (
          <div role="alert" className="rounded-lg border p-4 text-status-error">
            {hasCachedSignals
              ? "Host refresh failed. Showing stale cached reporter signals."
              : error
                ? "Failed to load package reporter signals."
                : "Failed to load package reporter signals: invalid host response."}
          </div>
        )}
        {!isLoading && validResponse && (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <dt className="text-sm text-muted-foreground">Missing hosts</dt>
                <dd className="text-2xl font-semibold">{missingCount}</dd>
              </div>
              <div className="rounded-lg border p-4">
                <dt className="text-sm text-muted-foreground">Stale hosts</dt>
                <dd className="text-2xl font-semibold">{staleCount}</dd>
              </div>
            </dl>
            {signals.length === 0 ? (
              <p>No missing or stale package reporters</p>
            ) : (
              <ul aria-label="Missing and stale package reporters" className="space-y-3">
                {signals.map((signal) => (
                  <li key={`${signal.status}:${signal.hostname}`} className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
                    <span className="font-medium">{signal.status === "missing" ? "Missing" : "Stale"}</span>
                    <Link
                      href={`/hosts?q=${encodeURIComponent(signal.hostname)}&status=${signal.status === "missing" ? "missing" : "stale"}`}
                      className="break-all text-primary underline-offset-4 hover:underline"
                    >
                      {signal.hostname}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        Admin signals are not loaded on this page; host reporter signals remain available.
      </p>
    </div>
  )
}
