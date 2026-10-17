"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { Activity, AlertTriangle, BarChart3, Cpu, Menu, Package, RefreshCw, Server, Settings, ShieldCheck, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useClickTracking } from "@/lib/telemetry"

const navigation = [
  { name: "Dashboard", href: "/", icon: Activity },
  { name: "Hosts", href: "/hosts", icon: Server },
  { name: "Packages", href: "/packages", icon: Package },
  { name: "Updates", href: "/activity", icon: RefreshCw },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Alerts", href: "/alerts", icon: AlertTriangle },
  { name: "Settings", href: "/admin", icon: Settings },
  { name: "Kernels", href: "/kernels", icon: Cpu },
  { name: "Security", href: "/security", icon: ShieldCheck },
]

function activeNavigationHref(pathname: string): string | undefined {
  if (pathname === "/") return "/"
  if (pathname === "/hosts" || pathname.startsWith("/hosts/")) return "/hosts"
  if (pathname === "/packages") return "/packages"
  if (pathname === "/activity") return "/activity"
  if (pathname === "/reports") return "/reports"
  if (pathname === "/alerts") return "/alerts"
  if (pathname === "/security") return "/security"
  if (pathname === "/kernels") return "/kernels"
  if (["/admin", "/admin/api-keys", "/admin/webhooks", "/admin/diagnostics"].includes(pathname)) return "/admin"
  return undefined
}

export function Navbar() {
  const pathname = usePathname()
  const trackClick = useClickTracking()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const activeHref = activeNavigationHref(pathname)

  const handleNavClick = (name: string, href: string) => {
    trackClick(`nav_${name.toLowerCase()}`, 'link', {
      destination: href,
      current_page: pathname
    })
    setMobileMenuOpen(false)
  }

  return (
    <>
    <header className="navbar-frosted">
      <div className="container mx-auto px-4">
        <div className="flex h-[64px] items-center justify-between">
          <div className="flex items-center">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-lg"
              onClick={() => handleNavClick('Logo', '/')}
            >
              <Activity className="h-6 w-6" aria-hidden="true" />
              <span>Fluxion</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              className="inline-flex items-center justify-center rounded-md p-2 lg:hidden hover:bg-accent hover:text-accent-foreground min-h-11 min-w-11"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
      {mobileMenuOpen && (
        <nav id="mobile-menu" aria-label="Mobile navigation" className="border-t lg:hidden">
          <div className="container mx-auto px-4 py-2 space-y-1">
            {navigation.map((item) => {
              const isActive = item.href === activeHref
              const Icon = item.icon
              return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.name, item.href)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-3 text-base font-medium min-h-11 navbar-link",
                  isActive ? "navbar-link-active" : "text-muted-foreground"
                )}
              >
                <Icon className="mr-2 inline h-4 w-4" aria-hidden="true" />
                {item.name}
              </Link>
              )
            })}
          </div>
        </nav>
      )}
    </header>
      <nav aria-label="Primary navigation" className="hidden lg:flex gap-6 lg:mt-16 min-[1280px]:fixed min-[1280px]:left-0 min-[1280px]:top-16 min-[1280px]:bottom-0 min-[1280px]:z-40 min-[1280px]:mt-0 min-[1280px]:w-[240px] min-[1280px]:flex-col min-[1280px]:gap-2 min-[1280px]:border-r min-[1280px]:border-border min-[1280px]:bg-[var(--background)] min-[1280px]:p-4">
        {navigation.map((item) => {
          const isActive = item.href === activeHref
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => handleNavClick(item.name, item.href)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "text-sm font-medium navbar-link min-[1280px]:flex min-[1280px]:min-h-11 min-[1280px]:items-center min-[1280px]:rounded-md min-[1280px]:px-3",
                isActive ? "navbar-link-active" : "text-muted-foreground"
              )}
            >
              <Icon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
