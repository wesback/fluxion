import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDistanceToNow } from "date-fns"
import { Server } from "lucide-react"

interface HostCardProps {
  hostname: string
  os_info: string
  last_seen: string
  total_updates: number
}

export function HostCard({ hostname, os_info, last_seen, total_updates }: HostCardProps) {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">{hostname}</CardTitle>
        <Server className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{os_info}</p>
          <p className="text-sm">
            <span className="font-medium">{total_updates}</span> total updates
          </p>
          <p className="text-xs text-muted-foreground">
            Last seen {formatDistanceToNow(new Date(last_seen), { addSuffix: true })}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
