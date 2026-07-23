import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

interface FilterBarProps {
  children: ReactNode
  onClear?: () => void
  clearLabel?: string
}

export function FilterBar({ children, onClear, clearLabel = "Clear filters" }: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      {onClear && (
        <Button type="button" variant="ghost" onClick={onClear} className="self-start sm:self-end">
          {clearLabel}
        </Button>
      )}
    </div>
  )
}
