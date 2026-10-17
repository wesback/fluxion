"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  Bell,
  Cpu,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"
import { useClickTracking } from "@/lib/telemetry"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Hosts", href: "/hosts", icon: Server },
  { name: "Packages", href: "/packages", icon: Package },
  { name: "Updates", href: "/activity", icon: RefreshCw },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Alerts", href: "/alerts", icon: Bell },
  { name: "Settings", href: "/admin", icon: Settings },
  { name: "Kernels", href: "/kernels", icon: Cpu },
  { name: "Security", href: "/security", icon: ShieldCheck },
] as const

function isNavigationActive(itemHref: string, pathname: string) {
  if (itemHref === "/") return pathname === "/"
  if (itemHref === "/hosts") return pathname === "/hosts" || pathname.startsWith("/hosts/")
  if (itemHref === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/")
  return pathname === itemHref
}

export function Navbar() {
  const pathname = usePathname()
  const trackClick = useClickTracking()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mobileMenuOpen) return

    const drawer = drawerRef.current
    const menuButton = menuButtonRef.current
    drawer?.querySelector<HTMLElement>("a[href]")?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setMobileMenuOpen(false)
        return
      }

      if (event.key !== "Tab" || !drawer) return
      const focusable = [...drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
      const first = focusable[0]
      const last = focusable.at(-1)

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      menuButton?.focus()
    }
  }, [mobileMenuOpen])

  const handleNavClick = (name: string, href: string) => {
    trackClick(`nav_${name.toLowerCase()}`, "link", {
      destination: href,
      current_page: pathname,
    })
    setMobileMenuOpen(false)
  }

  const renderLinks = (drawer = false) =>
    navigation.map((item) => {
      const Icon = item.icon
      const isActive = isNavigationActive(item.href, pathname)
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => handleNavClick(item.name, item.href)}
          aria-current={isActive && (drawer ? mobileMenuOpen : !mobileMenuOpen) ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium navbar-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            drawer
              ? "w-full justify-start"
              : "justify-center min-[1280px]:justify-start",
            isActive && "navbar-link-active"
          )}
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className={drawer ? "" : "sr-only min-[1280px]:not-sr-only"}>{item.name}</span>
        </Link>
      )
    })

  return (
    <>
      <header className="navbar-frosted fixed inset-x-0 top-0 z-50 h-16">
        <div className="flex h-16 items-center justify-between px-4">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2 rounded-md font-semibold text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => handleNavClick("Brand", "/")}
          >
            <Activity className="h-6 w-6" aria-hidden="true" />
            <span>Fluxion</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              ref={menuButtonRef}
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 lg:hidden hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      <nav
        className="hidden lg:flex gap-6 flex-col fixed left-0 top-16 z-40 w-[72px] overflow-y-auto border-r border-border bg-card/90 p-2 min-[1024px]:flex min-[1280px]:w-[240px] min-[1280px]:p-4"
        aria-label="Primary navigation"
      >
        {renderLinks()}
      </nav>

      <div
        ref={drawerRef}
        id="mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
        hidden={!mobileMenuOpen}
        className="fixed inset-0 z-[60] lg:hidden"
      >
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
        <div                 className="absolute bottom-0 left-0 top-16 w-[min(20rem,85vw)] overflow-y-auto border-r border-border bg-card px-4 pb-6 pt-4 shadow-xl border-t lg:hidden">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-semibold">Navigation</span>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <nav className="space-y-1" aria-label="Primary navigation">
            {renderLinks(true)}
          </nav>
        </div>
      </div>
    </>
  )
}
