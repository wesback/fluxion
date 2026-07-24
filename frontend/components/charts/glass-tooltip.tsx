"use client"

import type { TooltipContentProps } from "recharts"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"

type GlassTooltipProps = TooltipContentProps<ValueType, NameType>

export function GlassTooltip({ active, payload, label }: GlassTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="glass-surface text-chart-tooltip-foreground rounded-md px-3 py-2 text-sm">
      {label && <p className="font-medium mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-xs">
          {entry.name ? `${entry.name}: ` : ""}{entry.value}
        </p>
      ))}
    </div>
  )
}
