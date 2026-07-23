import { ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function SecurityBadge() {
  return (
    <Badge variant="secondary" className="gap-1 border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      Security
    </Badge>
  )
}
