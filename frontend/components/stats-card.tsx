import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  className?: string
}

export function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  className 
}: StatsCardProps) {
  return (
    <Card data-interactive="true" className={cn("dashboard-stat-card", className)}>
      <CardHeader className="dashboard-stat-header p-0">
        <CardTitle className="dashboard-stat-title">{title}</CardTitle>
        <span className="dashboard-stat-icon">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="dashboard-stat-value">{value}</div>
        {description && (
          <p className="dashboard-stat-description">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}
