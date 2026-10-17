export type SearchScope = "hosts" | "packages"

export function getGlobalSearchHref(scope: SearchScope, query: string): string | null {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return null
  return `/${scope}?q=${encodeURIComponent(normalizedQuery)}`
}
