"use client"

import { useCallback } from "react"
import { useEffect, useState } from "react"

export function useQueryState(key: string, defaultValue = "") {
  const [value, setState] = useState(defaultValue)

  useEffect(() => {
    const readValue = () => {
      const nextValue = new URLSearchParams(window.location.search).get(key) ?? defaultValue
      setState(nextValue)
    }
    readValue()
    window.addEventListener("popstate", readValue)
    return () => window.removeEventListener("popstate", readValue)
  }, [defaultValue, key])

  const setValue = useCallback((nextValue: string) => {
    const params = new URLSearchParams(window.location.search)
    if (nextValue) params.set(key, nextValue)
    else params.delete(key)
    const query = params.toString()
    window.history.replaceState({}, "", query ? `${window.location.pathname}?${query}` : window.location.pathname)
    setState(nextValue)
  }, [key])

  return [value, setValue] as const
}
