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
