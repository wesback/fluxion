export type HostHealthStatus = "healthy" | "stale" | "missing"

const STALE_AFTER_DAYS = 30
const MISSING_AFTER_DAYS = 365

export function getHostHealthStatus(lastSeen: string | null | undefined, now = new Date()): HostHealthStatus {
  if (!lastSeen) return "missing"

  const lastSeenDate = new Date(lastSeen)
  if (Number.isNaN(lastSeenDate.getTime())) return "missing"

  const ageInDays = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24)
  if (ageInDays > MISSING_AFTER_DAYS) return "missing"
  if (ageInDays > STALE_AFTER_DAYS) return "stale"
  return "healthy"
}

export const HOST_HEALTH_LABELS: Record<HostHealthStatus, string> = {
  healthy: "Healthy",
  stale: "Stale",
  missing: "Missing",
}

export interface ReportingHealthQuery {
  data?: unknown
  isLoading?: boolean
  error?: unknown
  dataUpdatedAt?: number
}

export interface ReportingHealthState {
  status: string
  message: string | null
  counts: { stale: number; missing: number } | null
  lastSuccessfulCheck: string | null
  canRetry: boolean
}

function isHostsResponse(data: unknown): data is { items: Array<{ last_seen?: string | null }> } {
  return data !== null &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray(data.items)
}

export function formatHostHealthCounts(counts: { stale: number; missing: number }): string {
  return `${counts.stale} stale · ${counts.missing} missing`
}

const reportingState = (
  status: string,
  message: string | null,
  counts: { stale: number; missing: number } | null = null,
  lastSuccessfulCheck: string | null = null,
  canRetry = false,
): ReportingHealthState => ({ status, message, counts, lastSuccessfulCheck, canRetry })

export function getReportingHealthState(
  query: ReportingHealthQuery,
  now = new Date(),
): ReportingHealthState {
  if (!isHostsResponse(query.data)) {
    if (query.isLoading && !query.error && query.data === undefined) {
      return reportingState("Loading", null)
    }
    return reportingState("Reporting health unavailable", null, null, null, true)
  }

  const counts = query.data.items.reduce(
    (result, host) => {
      const status = getHostHealthStatus(host?.last_seen, now)
      if (status === "stale") result.stale += 1
      else if (status === "missing") result.missing += 1
      return result
    },
    { stale: 0, missing: 0 },
  )

  if (query.error) {
    const updatedAt = query.dataUpdatedAt
    const lastSuccessfulCheck = updatedAt && Number.isFinite(updatedAt)
      ? new Date(updatedAt).toISOString()
      : null
    return reportingState(
      "Reporting data may be stale",
      lastSuccessfulCheck ? `Last successful host check: ${lastSuccessfulCheck}` : null,
      counts,
      lastSuccessfulCheck,
    )
  }

  if (query.data.items.length === 0) {
    return reportingState("No hosts reporting", null, counts)
  }
  if (counts.missing > 0) {
    return reportingState("Attention needed", `${counts.missing} hosts missing`, counts)
  }
  if (counts.stale > 0) {
    return reportingState("Reports stale", `${counts.stale} hosts stale`, counts)
  }
  return reportingState("Healthy", "Package reports are current", counts)
}
