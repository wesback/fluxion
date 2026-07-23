"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Activity, Key, Webhook } from "lucide-react"

const adminNav = [
  { name: "API Keys", href: "/admin/api-keys", icon: Key },
  { name: "Webhooks", href: "/admin/webhooks", icon: Webhook },
  { name: "Diagnostics", href: "/admin/diagnostics", icon: Activity },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground">Manage API keys, webhooks, and system configuration</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <nav className="flex md:flex-col gap-1 md:w-48 md:shrink-0" aria-label="Admin navigation">
          {adminNav.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
