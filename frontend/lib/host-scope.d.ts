export interface HostScopeUpdateBody {
  host_scope: "all" | "listed"
  allowed_hosts?: string[]
}
export interface ParseAllowedHostsResult {
  hosts: string[]
  error: string | null
}
export function parseAllowedHosts(text: string): ParseAllowedHostsResult
export function buildHostScopeUpdate(
  scope: "all" | "listed",
  text: string
): { body: HostScopeUpdateBody } | { error: string }
