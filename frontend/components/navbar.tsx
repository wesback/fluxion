"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { Activity, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useClickTracking } from "@/lib/telemetry"

const navigation = [
  { name: "Dashboard", href: "/" },
  { name: "Hosts", href: "/hosts" },
  { name: "Packages", href: "/packages" },
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
    <nav className="border-b bg-background" aria-label="Main navigation">
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
            <div className="hidden md:flex gap-6">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => handleNavClick(item.name, item.href)}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-primary",
                    pathname === item.href
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              className="inline-flex items-center justify-center rounded-md p-2 md:hidden hover:bg-accent hover:text-accent-foreground min-h-11 min-w-11"
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
        <div id="mobile-menu" className="border-t md:hidden">
          <div className="container mx-auto px-4 py-2 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item.name, item.href)}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-3 text-base font-medium transition-colors hover:bg-accent hover:text-accent-foreground min-h-11",
                  pathname === item.href
                    ? "text-foreground bg-accent"
                    : "text-muted-foreground"
                )}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
