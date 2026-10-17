"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

const THEME_PREFERENCES = ["system", "light", "dark"] as const

const themePreferenceBootstrap = `
  try {
    const storageKey = document.currentScript?.dataset.themeStorageKey ?? "theme"
    const preference = localStorage.getItem(storageKey)
    if (preference !== null && !${JSON.stringify(THEME_PREFERENCES)}.includes(preference)) {
      localStorage.setItem(storageKey, "system")
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "SecurityError")) throw error
  }
`

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const storageKey = props.storageKey ?? "theme"

  return (
    <>
      <script
        data-theme-storage-key={storageKey}
        dangerouslySetInnerHTML={{ __html: themePreferenceBootstrap }}
      />
      <NextThemesProvider
        {...props}
        storageKey={storageKey}
        defaultTheme="system"
        enableSystem
        themes={[...THEME_PREFERENCES]}
      >
        {children}
      </NextThemesProvider>
    </>
  )
}
