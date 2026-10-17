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

export type ReportingHealthState = {
  status: string
  description: string
  tone: "success" | "warning" | "danger" | "neutral"
  staleCount: number | null
  missingCount: number | null
  lastSuccessAt: string | null
  retry: boolean
}

type ReportingHealthInput = {
  data: unknown
  isLoading: boolean
  hasError: boolean
  dataUpdatedAt: number
  now?: Date
}

export function formatMetricValue(value: unknown): string {
  return typeof value === "number" && Number.isInteger(value)
    ? new Intl.NumberFormat("en-US").format(value)
    : "—"
}

function getHostItems(data: unknown): unknown[] | null {
  if (typeof data !== "object" || data === null || !("items" in data)) return null
  const items = data.items
  return Array.isArray(items) ? items : null
}

function countHostHealth(items: unknown[], now: Date) {
  return items.reduce<{ stale: number; missing: number }>(
    (counts, host) => {
      const lastSeen = typeof host === "object" && host !== null && "last_seen" in host
        ? host.last_seen
        : undefined
      const status = getHostHealthStatus(
        typeof lastSeen === "string" || lastSeen === null ? lastSeen : undefined,
        now
      )
      if (status === "missing") counts.missing += 1
      else if (status === "stale") counts.stale += 1
      return counts
    },
    { stale: 0, missing: 0 }
  )
}

function unavailableHealth(status: "Loading" | "Unknown" | "Reporting health unavailable", description: string, retry = false): ReportingHealthState {
  return {
    status,
    description,
    tone: "neutral",
    staleCount: null,
    missingCount: null,
    lastSuccessAt: null,
    retry,
  }
}

export function getReportingHealthState({
  data,
  isLoading,
  hasError,
  dataUpdatedAt,
  now = new Date(),
}: ReportingHealthInput): ReportingHealthState {
  const items = getHostItems(data)
  if (!items) {
    if (hasError || data !== undefined && data !== null) {
      return unavailableHealth("Reporting health unavailable", "Host reporting health could not be loaded", true)
    }
    if (isLoading) return unavailableHealth("Loading", "Loading host reporting health")
    return unavailableHealth("Unknown", "No successful host response")
  }

  const counts = countHostHealth(items, now)
  let status: string
  let description: string
  let tone: ReportingHealthState["tone"]

  if (items.length === 0) {
    status = "No hosts reporting"
    description = "No hosts are registered to report"
    tone = "neutral"
  } else if (counts.missing > 0) {
    status = "Attention needed"
    description = `${counts.missing} ${counts.missing === 1 ? "host is" : "hosts are"} missing`
    tone = "danger"
  } else if (counts.stale > 0) {
    status = "Reports stale"
    description = `${counts.stale} ${counts.stale === 1 ? "host has" : "hosts have"} stale reports`
    tone = "warning"
  } else {
    status = "Healthy"
    description = "Package reports are current"
    tone = "success"
  }

  if (hasError) {
    return {
      status: `${status} (stale data)`,
      description: `Last known: ${description}`,
      tone: "warning",
      staleCount: counts.stale,
      missingCount: counts.missing,
      lastSuccessAt: Number.isFinite(dataUpdatedAt) && dataUpdatedAt > 0
        ? new Date(dataUpdatedAt).toISOString()
        : null,
      retry: true,
    }
  }

  return {
    status,
    description,
    tone,
    staleCount: counts.stale,
    missingCount: counts.missing,
    lastSuccessAt: null,
    retry: false,
  }
}
