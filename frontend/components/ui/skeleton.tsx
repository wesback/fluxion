import { cn } from "@/lib/utils"

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export function StatsCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6" role="status" aria-busy="true">
      <span className="sr-only">Loading statistics...</span>
      <div className="flex items-center justify-between space-x-4">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Loading table data...</span>
      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-3 w-64" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ChartSkeleton() {
  // Pre-defined widths to avoid impure Math.random during render
  const widths = ['60%', '75%', '50%', '85%', '70%']

  return (
    <div className="rounded-lg border bg-card p-6" role="status" aria-busy="true">
      <span className="sr-only">Loading chart...</span>
      <Skeleton className="h-6 w-48 mb-4" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" style={{ width: widths[i] }} />
          </div>
        ))}
      </div>
    </div>
  )
}
