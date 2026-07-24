"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { Activity, Menu, X, Shield, ShieldCheck, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"
import { useClickTracking } from "@/lib/telemetry"

const navigation = [
  { name: "Dashboard", href: "/" },
  { name: "Hosts", href: "/hosts" },
  { name: "Kernels", href: "/kernels" },
  { name: "Activity", href: "/activity" },
  { name: "Packages", href: "/packages" },
  { name: "Security", href: "/security" },
  { name: "Admin", href: "/admin" },
]

export function Navbar() {
  const pathname = usePathname()
  const trackClick = useClickTracking()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleNavClick = (name: string, href: string) => {
    trackClick(`nav_${name.toLowerCase()}`, 'link', {
      destination: href,
      current_page: pathname
    })
    setMobileMenuOpen(false)
  }

  return (
    <nav className="navbar-frosted" aria-label="Main navigation">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-lg"
              onClick={() => handleNavClick('Logo', '/')}
            >
              <Activity className="h-6 w-6" aria-hidden="true" />
              <span>Fluxion</span>
            </Link>
            <div className="hidden lg:flex gap-6">
              {navigation.map((item) => {
                const isActive = item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
                return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => handleNavClick(item.name, item.href)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "text-sm font-medium navbar-link",
                    isActive ? "navbar-link-active" : "text-muted-foreground"
                  )}
                >
                  {item.name === "Admin" && <Shield className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                  {item.name === "Security" && <ShieldCheck className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                  {item.name === "Kernels" && <Cpu className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                  {item.name}
                </Link>
                )
              })}
            </div>
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
        <div id="mobile-menu" className="border-t lg:hidden">
          <div className="container mx-auto px-4 py-2 space-y-1">
            {navigation.map((item) => {
              const isActive = item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
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
                {item.name === "Admin" && <Shield className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                {item.name === "Security" && <ShieldCheck className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                {item.name === "Kernels" && <Cpu className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" />}
                {item.name}
              </Link>
              )
            })}
          </div>
        </div>
      )}
    </nav>
  )
}
