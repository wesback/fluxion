"use client"

import { useEffect } from "react"

export function DeviceMemoryGuard() {
  useEffect(() => {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
    if (typeof mem === "number" && mem < 2) {
      document.documentElement.setAttribute("data-low-memory", "true")
    }
  }, [])

  return null
}
