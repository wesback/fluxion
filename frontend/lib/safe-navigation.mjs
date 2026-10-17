export const approvedSearchPages = [
  { name: "Dashboard", href: "/" },
  { name: "Hosts", href: "/hosts" },
  { name: "Packages", href: "/packages" },
  { name: "Activity", href: "/activity" },
  { name: "Security", href: "/security" },
  { name: "Kernels", href: "/kernels" },
  { name: "Admin", href: "/admin" },
]
const approvedPageHrefs = new Set(approvedSearchPages.map(({ href }) => href))
const searchOrigin = "https://same-origin.invalid"
export const createPackageSearchHref = (packageName) => `/packages?${new URLSearchParams({ q: packageName })}`
export function isSafeSearchDestination(destination, hostnames = []) {
  if (typeof destination !== "string" || !destination.startsWith("/") || destination.startsWith("//")) return false
  try {
    const url = new URL(destination, searchOrigin)
    if (url.origin !== searchOrigin || url.hash) return false
    if (approvedPageHrefs.has(destination)) return true
    if (url.pathname === "/packages" && url.searchParams.size === 1 && url.searchParams.has("q")) {
      return destination === createPackageSearchHref(url.searchParams.get("q"))
    }
    return !url.search && hostnames.some((hostname) => destination === `/hosts/${encodeURIComponent(hostname)}`)
  } catch {
    return false
  }
}
