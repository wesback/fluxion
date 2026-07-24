import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-primary text-primary-foreground": variant === 'default',
          "border-transparent bg-secondary text-secondary-foreground": variant === 'secondary',
          "border-transparent bg-status-error-surface text-status-error": variant === 'destructive',
          "bg-status-warning-surface text-status-warning": variant === 'outline',
          "border-transparent bg-status-success-surface text-status-success": variant === 'success',
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
