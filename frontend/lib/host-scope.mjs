export function parseAllowedHosts(text) {
  const hosts = []
  const seen = new Set()
  for (const entry of String(text ?? "").split(/[\n,]/)) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const normalized = trimmed.toLowerCase()
    if (/[^A-Za-z0-9._-]/.test(trimmed)) {
      return { hosts: [], error: `Invalid hostname: ${trimmed}` }
    }
    if (!seen.has(normalized)) {
      seen.add(normalized)
      hosts.push(normalized)
    }
  }
  return { hosts, error: null }
}

export function buildHostScopeUpdate(scope, text) {
  const parsed = parseAllowedHosts(text)
  if (parsed.error) return { error: parsed.error }
  if (scope === "all") return { body: { host_scope: "all" } }
  if (!parsed.hosts.length) return { error: "Add at least one hostname or choose All hosts" }
  return { body: { host_scope: "listed", allowed_hosts: parsed.hosts } }
}
