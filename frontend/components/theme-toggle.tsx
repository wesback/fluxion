"use client"

import { useSyncExternalStore } from "react"
import { ChevronDown, Sun } from "lucide-react"
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
      <Sun className="theme-toggle-icon" aria-hidden="true" />
      <select
        aria-label={`Theme: ${THEME_LABELS[selectedTheme]}`}
        className="theme-toggle-select"
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
      <ChevronDown className="theme-toggle-chevron" aria-hidden="true" />
    </label>
  )
}
