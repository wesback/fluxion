"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Search, X } from "lucide-react"
import { useHosts, usePackageSearch } from "@/lib/hooks/use-api"
import { approvedSearchPages, createPackageSearchHref, isSafeSearchDestination } from "@/lib/safe-navigation.mjs"

export function GlobalSearch() {
  const [open, setOpen] = useState(false), [term, setTerm] = useState(""), [submittedPackage, setSubmittedPackage] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null), inputRef = useRef<HTMLInputElement>(null), dialogRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false), hostsQuery = useHosts({ enabled: open }), packageQuery = usePackageSearch(submittedPackage, { enabled: !!submittedPackage })
  const hostnames = hostsQuery.data?.items.map(({ hostname }) => hostname) ?? []
  const query = term.trim().toLowerCase()
  const pages = approvedSearchPages.filter(({ name, href }) => `${name} ${href}`.toLowerCase().includes(query))
  const hosts = (hostsQuery.data?.items ?? []).filter(({ hostname }) => hostname.toLowerCase().includes(query)), packages = packageQuery.data?.items ?? []
  const hasResults = pages.length > 0 || hosts.length > 0 || packages.length > 0, failed = !!hostsQuery.error || !!packageQuery.error
  const loading = hostsQuery.isLoading || packageQuery.isLoading
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", onShortcut)
    return () => document.removeEventListener("keydown", onShortcut)
  }, [])
  useEffect(() => {
    if (open) inputRef.current?.focus()
    else if (wasOpen.current) triggerRef.current?.focus()
    wasOpen.current = open
  }, [open])
  const close = () => setOpen(false)
  const destination = (href: string) => isSafeSearchDestination(href, hostnames) ? href : undefined
  const submitPackage = (event: React.FormEvent) => { event.preventDefault(); const value = term.trim(); if (value) setSubmittedPackage(value) }
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input-border px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span>Search</span><kbd className="text-xs text-muted-foreground">Ctrl / Cmd K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-search-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") { event.preventDefault(); close() }
              if (event.key === "Tab") {
                const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('input,button,a[href]') ?? [])]
                  .filter((item) => !item.hasAttribute("disabled"))
                const first = items[0]
                const last = items[items.length - 1]
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
              }
            }}
            className="w-full max-w-2xl rounded-lg border bg-card p-4 shadow-xl sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="global-search-title" className="text-lg font-semibold">Search Fluxion</h2>
              <button type="button" onClick={close} aria-label="Close search" className="min-h-11 min-w-11 rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="mx-auto h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={submitPackage} className="flex gap-2">
              <input
                ref={inputRef}
                value={term}
                onChange={(event) => { setTerm(event.target.value); setSubmittedPackage("") }}
                aria-label="Search pages, hosts, or packages"
                placeholder="Search pages and hosts; submit to look up a package"
                className="h-11 min-w-0 flex-1 rounded-md border border-input-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="submit" disabled={!term.trim()} className="min-h-11 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
                {packageQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Searching" /> : "Package"}
              </button>
            </form>
            <div className="mt-4 max-h-[55vh] space-y-4 overflow-y-auto" aria-live="polite">
              {pages.map(({ name, href }) => {
                const safeHref = destination(href)
                return safeHref && <a key={href} href={safeHref} className="flex items-center justify-between rounded-md p-2 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0 break-all">{name}</span><span className="text-xs text-muted-foreground">Page</span></a>
              })}
              {hostsQuery.isLoading && <p role="status">Loading hosts...</p>}
              {hostsQuery.error && <p role="alert">Search failed. Please try again.</p>}
              {hosts.map(({ hostname }) => {
                const href = destination(`/hosts/${encodeURIComponent(hostname)}`)
                return href && <a key={hostname} href={href} className="flex items-center justify-between rounded-md p-2 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0 break-all">{hostname}</span><span className="text-xs text-muted-foreground">Host</span></a>
              })}
              {submittedPackage && packageQuery.isLoading && <p role="status">Loading package results...</p>}
              {submittedPackage && packageQuery.error && <p role="alert">Package search failed. Please try again.</p>}
              {packages.map(({ hostname, package_name }) => {
                const href = destination(createPackageSearchHref(submittedPackage))
                return href && <a key={`${hostname}-${package_name}`} href={href} className="flex items-center justify-between rounded-md p-2 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0 break-all">{package_name} on {hostname}</span><span className="text-xs text-muted-foreground">Package</span></a>
              })}
              {open && !loading && !failed && !hasResults && query && <p role="status">No results found.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
