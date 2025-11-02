"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { useThemeTracking } from "@/lib/telemetry"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const trackThemeChange = useThemeTracking()

  // useEffect only runs on the client, so now we can safely show the UI
  if (typeof window !== 'undefined' && !mounted) {
    setMounted(true)
  }

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon">
        <Sun className="h-5 w-5" />
      </Button>
    )
  }

  const handleThemeToggle = () => {
    const previousTheme = theme
    const newTheme = theme === "dark" ? "light" : "dark"
    setTheme(newTheme)
    trackThemeChange(newTheme, previousTheme)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleThemeToggle}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
