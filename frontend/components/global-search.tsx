"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { getGlobalSearchHref, type SearchScope } from "@/lib/search-routing"

function isSearchScope(value: string): value is SearchScope {
  return value === "hosts" || value === "packages"
}

export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<SearchScope>("packages")

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const href = getGlobalSearchHref(scope, query)
    if (href) router.push(href)
  }

  return (
    <form role="search" className="global-search" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="global-search-scope">Search in</label>
      <select
        id="global-search-scope"
        aria-label="Search in"
        value={scope}
        onChange={(event) => {
          if (isSearchScope(event.currentTarget.value)) setScope(event.currentTarget.value)
        }}
        className="global-search-scope"
      >
        <option value="packages">Packages</option>
        <option value="hosts">Hosts</option>
      </select>
      <label className="sr-only" htmlFor="global-search-query">Search hosts or packages</label>
      <input
        id="global-search-query"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search hosts or packages"
        className="global-search-input"
      />
      <button type="submit" aria-label="Search" disabled={!query.trim()} className="global-search-submit">
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  )
}
