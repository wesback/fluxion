import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parseAllowedHosts, buildHostScopeUpdate } from "../lib/host-scope.mjs"

test("parsesAndValidatesHostScopeInput", () => {
  assert.deepEqual(parseAllowedHosts("Node1.example.test\nnode2.example.test, node1.example.test"), { hosts: ["node1.example.test", "node2.example.test"], error: null })
  assert.deepEqual(parseAllowedHosts("  \n "), { hosts: [], error: null })
  assert.deepEqual(parseAllowedHosts("bad host"), { hosts: [], error: "Invalid hostname: bad host" })
  assert.deepEqual(buildHostScopeUpdate("all", "node1.example.test"), { body: { host_scope: "all" } })
  assert.deepEqual(buildHostScopeUpdate("listed", "node1.example.test"), { body: { host_scope: "listed", allowed_hosts: ["node1.example.test"] } })
  assert.deepEqual(buildHostScopeUpdate("listed", ""), { error: "Add at least one hostname or choose All hosts" })
  assert.deepEqual(buildHostScopeUpdate("listed", "*.example.test"), { error: "Invalid hostname: *.example.test" })
})

test("patchProxyForwardsHostScopeUpdate", () => {
  const source = readFileSync(new URL("../app/api/admin/api-keys/[keyId]/route.ts", import.meta.url), "utf8")
  assert.match(source, /export async function PATCH/)
  assert.match(source, /axios\.patch/)
  assert.match(source, /X-API-Key/) 
  assert.match(source, /Server configuration error/)
  assert.match(source, /response\?\.data\?\.detail|detail/) 
})

test("apiKeysPageEditsHostScope", () => {
  const source = readFileSync(new URL("../app/admin/api-keys/page.tsx", import.meta.url), "utf8")
  assert.match(source, /<TableHead>Hosts<\/TableHead>/)
  assert.match(source, /Edit hosts for API key/)
  assert.match(source, /Only these hosts/) 
  const helperSource = readFileSync(new URL("../lib/host-scope.mjs", import.meta.url), "utf8")
  assert.match(helperSource, /Add at least one hostname or choose All hosts/)
})
