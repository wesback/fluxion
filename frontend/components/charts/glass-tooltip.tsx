"use client"

import type { TooltipContentProps } from "recharts"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"

// Design-time contrast (nominal page background):
//   Light — glass-surface ≈ L 0.96; muted-foreground 6.0:1 ✓; foreground 19:1 ✓
//   Dark  — glass-surface ≈ L 0.024; muted-foreground 5.6:1 ✓; foreground 13.6:1 ✓
// Both modes exceed 4.5:1 — no opaque tint class required.

type GlassTooltipProps = Partial<TooltipContentProps<ValueType, NameType>>

export function GlassTooltip({ active, payload, label }: GlassTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="glass-surface rounded-md px-3 py-2 text-sm">
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
