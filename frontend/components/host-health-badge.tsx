import { AlertTriangle, CircleCheck, CircleX } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  getHostHealthStatus,
  HOST_HEALTH_LABELS,
  type HostHealthStatus,
  type ReportingHealthState,
} from "@/lib/host-health"

const statusVariant: Record<HostHealthStatus, "success" | "secondary" | "destructive"> = {
  healthy: "success",
  stale: "secondary",
  missing: "destructive",
}

const statusIcon = {
  healthy: CircleCheck,
  stale: AlertTriangle,
  missing: CircleX,
}

export function HostHealthBadge({ lastSeen }: { lastSeen: string | null | undefined }) {
  const status = getHostHealthStatus(lastSeen)
  const Icon = statusIcon[status]

  return (
    <Badge variant={statusVariant[status]} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{HOST_HEALTH_LABELS[status]}</span>
    </Badge>
  )
}

export function ReportingHealthBadge({ state }: { state: ReportingHealthState }) {
  const Icon = state.tone === "success"
    ? CircleCheck
    : state.tone === "danger"
      ? CircleX
      : AlertTriangle
  const variant = state.tone === "success"
    ? "success"
    : state.tone === "danger"
      ? "destructive"
      : state.tone === "warning"
        ? "outline"
        : "secondary"

  return (
    <Badge variant={variant} className="gap-1" role="status" aria-live="polite">
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{state.status}</span>
    </Badge>
  )
}
