"use client"

import { useSyncExternalStore } from "react"
import { ChevronDown } from "lucide-react"
import { useTheme } from "next-themes"
import { useThemeTracking } from "@/lib/telemetry"

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false
const THEME_LABELS = {
  system: "System",
  light: "Light",
  dark: "Dark",
} as const

type ThemePreference = keyof typeof THEME_LABELS

function isThemePreference(theme: string | undefined): theme is ThemePreference {
  return theme === "system" || theme === "light" || theme === "dark"
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const trackThemeChange = useThemeTracking()
  const selectedTheme = mounted && isThemePreference(theme) ? theme : "system"

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Theme preference</span>
      <select
        aria-label={`Theme: ${THEME_LABELS[selectedTheme]}`}
        className="h-11 w-[7.5rem] appearance-none rounded-md border border-transparent bg-transparent px-3 pr-8 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        value={selectedTheme}
        disabled={!mounted}
        onChange={(event) => {
          const newTheme = event.currentTarget.value
          if (!isThemePreference(newTheme)) return

          setTheme(newTheme)
          trackThemeChange(newTheme, selectedTheme)
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 opacity-50" aria-hidden="true" />
    </label>
  )
}
