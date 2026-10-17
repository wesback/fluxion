"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Cpu, Menu, Package, RefreshCw, Server, Settings, ShieldCheck, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useClickTracking } from "@/lib/telemetry"
import { GlobalSearch } from "@/components/global-search"
import { useHosts } from "@/lib/hooks/use-api"
import { getReportingHealthState } from "@/lib/host-health"

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
  const hostsQuery = useHosts()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileMenuRef = useRef<HTMLElement>(null)
  const wasMobileMenuOpen = useRef(false)
  const activeHref = activeNavigationHref(pathname)
  const reportingHealth = getReportingHealthState(hostsQuery)
  const reportsAreHealthy = reportingHealth.status === "Healthy"

  useEffect(() => {
    if (mobileMenuOpen) {
      mobileMenuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus()
    } else if (wasMobileMenuOpen.current) {
      menuButtonRef.current?.focus()
    }
    wasMobileMenuOpen.current = mobileMenuOpen
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [mobileMenuOpen])

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
      <div className="shell-header">
        <Link
          href="/"
          className="shell-brand"
          onClick={() => handleNavClick("Logo", "/")}
        >
          <Activity className="h-6 w-6 shrink-0" aria-hidden="true" />
          <span>Fluxion</span>
        </Link>
        <div className="shell-search">
          <GlobalSearch />
        </div>
        <div className="shell-controls">
          <ThemeToggle />
          <button
            ref={menuButtonRef}
            className="mobile-menu-trigger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <nav
        id="mobile-menu"
        ref={mobileMenuRef}
        aria-label="Mobile navigation"
        aria-hidden={!mobileMenuOpen}
        hidden={!mobileMenuOpen}
        className="mobile-menu-panel"
      >
        <div className="mobile-menu-links">
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
                  "mobile-nav-link navbar-link focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
    </header>
      <nav aria-label="Primary navigation" className="primary-navigation">
        <div className="primary-navigation-links">
          {navigation.map((item) => {
            const isActive = item.href === activeHref
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.name, item.href)}
                aria-current={isActive ? "page" : undefined}
                title={item.name}
                className={cn(
                  "primary-nav-link navbar-link",
                  isActive ? "navbar-link-active" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </div>
        <div
          className={cn("sidebar-health", reportsAreHealthy ? "is-healthy" : "is-attention")}
          aria-live="polite"
          aria-label={`Host reporting status: ${reportingHealth.status}`}
          title={reportingHealth.message ?? reportingHealth.status}
        >
          {reportsAreHealthy
            ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            : <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="sidebar-health-copy">
            <span className="sidebar-health-label">Host reporting</span>
            <span className="sidebar-health-status">{reportingHealth.status}</span>
          </span>
        </div>
      </nav>
    </>
  )
}
