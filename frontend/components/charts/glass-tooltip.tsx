"use client"

import type { TooltipContentProps } from "recharts"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"

// Design-time contrast (4.5:1 threshold):
//   Light — glass-surface ≈ L 0.96; muted-foreground 6.0:1 ✓; foreground 19:1 ✓
//           No opaque tint needed in light mode; glass-surface-alpha 0.62 is sufficient.
//   Dark  — glass-surface ≈ L 0.024 against page background, but the tooltip floats
//           directly over chart data (series at L 0.58–0.77 in dark mode). A 5% white
//           overlay cannot guarantee 4.5:1 there. glass-surface-tooltip applies
//           hsl(var(--card)/0.82) giving muted-foreground ≥7:1 over any chart color.
// Both modes exceed 4.5:1. Light: no opaque tint; Dark: glass-surface-tooltip modifier.

type GlassTooltipProps = Partial<TooltipContentProps<ValueType, NameType>>

export function GlassTooltip({ active, payload, label }: GlassTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="glass-surface glass-surface-tooltip rounded-md px-3 py-2 text-sm">
      {label && (
        <p className="text-muted-foreground font-medium mb-1">{label}</p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="text-xs flex gap-1">
          {entry.name && (
            <span className="text-muted-foreground">{entry.name}:</span>
          )}
          <span className="text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}
