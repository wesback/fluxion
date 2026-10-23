import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { parseAllowedHosts, buildHostScopeUpdate } from "../lib/host-scope.mjs"

const require = createRequire(import.meta.url)
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const root = join(dirname(fileURLToPath(import.meta.url)), "..")

test("parsesAndValidatesHostScopeInput", () => {
  assert.deepEqual(parseAllowedHosts("Node1.example.test\nnode2.example.test, node1.example.test"), { hosts: ["node1.example.test", "node2.example.test"], error: null })
  assert.deepEqual(parseAllowedHosts("  \n "), { hosts: [], error: null })
  assert.deepEqual(parseAllowedHosts("bad host"), { hosts: [], error: "Invalid hostname: bad host" })
  assert.deepEqual(buildHostScopeUpdate("all", "node1.example.test"), { body: { host_scope: "all" } })
  assert.deepEqual(buildHostScopeUpdate("all", "*.example.test"), { body: { host_scope: "all" } })
  assert.deepEqual(buildHostScopeUpdate("listed", "node1.example.test"), { body: { host_scope: "listed", allowed_hosts: ["node1.example.test"] } })
  assert.deepEqual(buildHostScopeUpdate("listed", ""), { error: "Add at least one hostname or choose All hosts" })
  assert.deepEqual(buildHostScopeUpdate("listed", "*.example.test"), { error: "Invalid hostname: *.example.test" })
})

function loadRoute(axios, apiKey) {
  if (apiKey === undefined) delete process.env.FLUXION_API_KEY
  else process.env.FLUXION_API_KEY = apiKey
  const mod = { exports: {} }
  const source = readFileSync(join(root, "app/api/admin/api-keys/[keyId]/route.ts"), "utf8")
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const NextResponse = { json: (body, init = {}) => ({ status: init.status ?? 200, body }) }
  const axiosModule = { __esModule: true, default: axios }
  axiosModule.default.isAxiosError = axios.isAxiosError
  runInNewContext(output, { exports: mod.exports, module: mod, require: (name) => name === "axios" ? axiosModule : name === "next/server" ? { NextResponse } : null, process, console, URL })
  return mod.exports
}

test("patchProxyForwardsHostScopeUpdate", async () => {
  let calls = []
  const axios = { patch: async (url, body, config) => { calls.push({ url, body, config }); return { data: { id: 7, host_scope: "listed", allowed_hosts: ["node1.example.test"] } } }, isAxiosError: () => false }
  let route = loadRoute(axios, "secret")
  const patchBody = { host_scope: "listed", allowed_hosts: ["node1.example.test"] }
  let response = await route.PATCH({ json: async () => patchBody, headers: { get: (name) => name === "sec-fetch-site" ? "same-origin" : name === "origin" ? "http://localhost" : name === "x-requested-with" ? "XMLHttpRequest" : null }, url: "http://localhost/api/admin/api-keys/7" }, { params: Promise.resolve({ keyId: "7" }) })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { id: 7, host_scope: "listed", allowed_hosts: ["node1.example.test"] })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url.endsWith("/api/v1/admin/api-keys/7"), true)
  assert.equal(calls[0].config.headers["X-API-Key"], "secret")
  assert.deepEqual(calls[0].body, patchBody)

  calls = []
  axios.isAxiosError = () => true
  axios.patch = async (url, body, config) => { calls.push({ url, body, config }); throw { response: { status: 422, data: { detail: "Invalid hostname" } } } }
  route = loadRoute(axios, "secret")
  response = await route.PATCH({ json: async () => ({ host_scope: "listed" }), headers: { get: (name) => name === "sec-fetch-site" ? "same-origin" : name === "origin" ? "http://localhost" : name === "x-requested-with" ? "XMLHttpRequest" : null }, url: "http://localhost/api/admin/api-keys/7" }, { params: Promise.resolve({ keyId: "7" }) })
  assert.equal(response.status, 422)
  assert.equal(JSON.stringify(response.body), JSON.stringify({ error: "Invalid hostname" }))

  calls = []
  route = loadRoute(axios, undefined)
  response = await route.PATCH({ json: async () => ({}), headers: { get: () => null }, url: "http://localhost/api/admin/api-keys/7" }, { params: Promise.resolve({ keyId: "7" }) })
  assert.equal(response.status, 500)
  assert.equal(JSON.stringify(response.body), JSON.stringify({ error: "Server configuration error" }))
  assert.equal(calls.length, 0)

  calls = []
  route = loadRoute(axios, "secret")
  response = await route.PATCH({ json: async () => patchBody, headers: { get: () => null }, url: "http://localhost/api/admin/api-keys/7" }, { params: Promise.resolve({ keyId: "7" }) })
  assert.equal(response.status, 422)
  assert.equal(JSON.stringify(response.body), JSON.stringify({ error: "Invalid hostname" }))
  assert.equal(calls.length, 1)
})

function elementType(value) { return typeof value === "function" ? value.name : String(value) }

test("useUpdateAPIKeyInvalidatesAPIKeyList", async () => {
  const source = readFileSync(join(root, "lib/hooks/use-admin.ts"), "utf8")
  let mutationOptions
  let invalidations = []
  let updateCalls = []
  const mod = { exports: {} }
  const mocks = {
    "@tanstack/react-query": {
      useQuery: () => ({}),
      useQueryClient: () => ({ invalidateQueries: (options) => invalidations.push(options) }),
      useMutation: (options) => { mutationOptions = options; return { mutateAsync: () => {} } },
    },
    "../telemetry/api-client": {
      instrumentedApiClient: {
        updateAPIKey: async (keyId, data) => { updateCalls.push({ keyId, data }); return { id: keyId, ...data } },
      },
      ApiError: class ApiError extends Error {},
    },
    "sonner": { toast: { error: () => {}, success: () => {} } },
  }
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  runInNewContext(output, {
    exports: mod.exports,
    module: mod,
    require: (name) => { if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`); return mocks[name] },
    console,
    process,
  })

  mod.exports.useUpdateAPIKey()
  assert.ok(mutationOptions)
  const result = await mutationOptions.mutationFn({ keyId: 7, data: { host_scope: "listed", allowed_hosts: ["node1.example.test"] } })
  assert.deepEqual(result, { id: 7, host_scope: "listed", allowed_hosts: ["node1.example.test"] })
  assert.deepEqual(updateCalls, [{ keyId: 7, data: { host_scope: "listed", allowed_hosts: ["node1.example.test"] } }])

  mutationOptions.onSuccess()
  assert.equal(JSON.stringify(invalidations), JSON.stringify([{ queryKey: ["admin", "api-keys"] }]))
})

test("apiKeysPageEditsHostScope", async () => {
  const source = readFileSync(join(root, "app/admin/api-keys/page.tsx"), "utf8")
  assert.match(source, /<TableHead>Hosts<\/TableHead>/)
  assert.match(source, /Edit hosts for API key/)
  assert.match(source, /Only these hosts/) 
  assert.match(source, /buildHostScopeUpdate/)

  let updateCalls = []
  let createCalls = []
  let slots = []
  let index = 0
  const reactStub = {
    useState(value) { const i = index++; if (!(i in slots)) slots[i] = value; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next }] },
  }
  const passthrough = (props) => React.createElement("div", props, props.children)
  const mocks = {
    react: reactStub,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/components/ui/card": { Card: passthrough, CardContent: passthrough, CardHeader: passthrough, CardTitle: passthrough },
    "@/components/ui/table": { Table: passthrough, TableBody: passthrough, TableCaption: passthrough, TableCell: passthrough, TableHead: passthrough, TableHeader: passthrough, TableRow: passthrough },
    "@/components/ui/button": { Button: (props) => React.createElement("button", props, props.children) },
    "@/components/ui/input": { Input: (props) => React.createElement("input", props) },
    "@/components/ui/label": { Label: (props) => React.createElement("label", props, props.children) },
    "@/components/ui/textarea": { Textarea: (props) => React.createElement("textarea", { ...props, children: undefined }) },
    "@/components/ui/badge": { Badge: (props) => React.createElement("span", props, props.children) },
    "@/components/ui/select": { Select: (props) => React.createElement("select", props, props.children) },
    "@/components/ui/dialog": { Dialog: (props) => props.open ? React.createElement("div", { role: "dialog" }, props.children) : null, DialogContent: passthrough, DialogDescription: passthrough, DialogFooter: passthrough, DialogHeader: passthrough, DialogTitle: passthrough },
    "@/components/ui/skeleton": { TableSkeleton: passthrough },
    "@/components/error-boundary": { ErrorBoundary: passthrough },
    "@/lib/hooks/use-admin": {
      useAPIKeys: () => ({ data: { items: [{ id: 7, name: "shared", role: "user", host_scope: "listed", allowed_hosts: ["node1.example.test", "node2.example.test"], is_active: true, created_at: "2026-01-01T00:00:00Z", last_used: null }], total: 1 }, isLoading: false, error: null, refetch: () => {} }),
      useCreateAPIKey: () => ({ mutateAsync: async (body) => { createCalls.push(body); return { api_key: "new-key" } }, isPending: false }),
      useUpdateAPIKey: () => ({ mutateAsync: async (body) => { updateCalls.push(body); return { id: 7 } }, isPending: false }),
      useDeleteAPIKey: () => ({ mutateAsync: async () => {}, isPending: false }),
    },
    "@/lib/host-scope.mjs": { buildHostScopeUpdate },
    "date-fns": { formatDistanceToNow: () => "recently" },
    "lucide-react": { Plus: () => null, Trash2: () => null, Copy: () => null, RefreshCw: () => null, Key: () => null, AlertTriangle: () => null, Pencil: () => null },
    "sonner": { toast: { success: () => {}, error: () => {}, promise: () => {} } },
  }
  const mod = { exports: {} }
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  runInNewContext(output, { exports: mod.exports, module: mod, require: (name) => { if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`); return mocks[name] }, console, process, Date, navigator: { clipboard: { writeText: async () => {} } } })
  index = 0
  let tree = mod.exports.APIKeysContent()
  const markup = renderToStaticMarkup(tree)
  assert.match(markup, /Hosts<\/.*?>/)
  assert.match(markup, /2 hosts/) 
  assert.match(markup, /title="node1\.example\.test\nnode2\.example\.test"/) 

  function walk(node, visit) {
    if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
    if (React.isValidElement(node)) { visit(node); walk(node.props.children, visit) }
  }
  function find(predicate) { let found; walk(tree, (node) => { if (!found && predicate(node)) found = node }); return found }
  function render() { index = 0; tree = mod.exports.APIKeysContent(); return tree }

  const editButton = find((node) => node.props["aria-label"] === "Edit hosts for API key shared")
  assert.ok(editButton)
  editButton.props.onClick()
  render()
  assert.match(renderToStaticMarkup(tree), /Edit host scope/) 
  let hostsTextarea = find((node) => node.props.id === "edit-key-hosts")
  assert.ok(hostsTextarea)
  assert.equal(hostsTextarea.props.value, "node1.example.test\nnode2.example.test")
  const scopeSelect = find((node) => node.props.id === "edit-key-host-scope")
  assert.ok(scopeSelect)
  scopeSelect.props.onChange({ target: { value: "listed" } })
  render()
  hostsTextarea = find((node) => node.props.id === "edit-key-hosts")
  hostsTextarea.props.onChange({ target: { value: "" } })
  render()
  let saveButton = find((node) => node.props.children === "Save Changes")
  assert.ok(saveButton)
  saveButton.props.onClick()
  render()
  assert.equal(renderToStaticMarkup(tree).includes("Add at least one hostname or choose All hosts"), true)
  assert.equal(updateCalls.length, 0)

  hostsTextarea = find((node) => node.props.id === "edit-key-hosts")
  hostsTextarea.props.onChange({ target: { value: "Node1.example.test\nnode1.example.test, NODE2.EXAMPLE.TEST" } })
  render()
  saveButton = find((node) => node.props.children === "Save Changes")
  await saveButton.props.onClick()
  assert.equal(JSON.stringify(updateCalls), JSON.stringify([{ keyId: 7, data: { host_scope: "listed", allowed_hosts: ["node1.example.test", "node2.example.test"] } }]))

  const createButton = find((node) => node.props.children?.[0]?.props?.children === undefined && node.props.children === undefined)
  const createActions = []
  walk(tree, (node) => { if (node.props.onClick && typeof node.props.children === "string" && node.props.children === "Create Key") createActions.push(node) })
  assert.ok(createActions.length > 0)
  createActions[0].props.onClick()
  render()
  const createName = find((node) => node.props.id === "key-name")
  assert.ok(createName)
  createName.props.onChange({ target: { value: "scoped-key" } })
  render()
  const createScope = find((node) => node.props.id === "new-key-host-scope")
  assert.ok(createScope)
  createScope.props.onChange({ target: { value: "listed" } })
  render()
  const createHosts = find((node) => node.props.id === "new-key-hosts")
  assert.ok(createHosts)
  createHosts.props.onChange({ target: { value: "Node1.example.test,node1.example.test\nNODE2.EXAMPLE.TEST" } })
  render()
  const createSubmit = find((node) => node.props.children === "Create Key")
  assert.ok(createSubmit)
  await createSubmit.props.onClick()
  assert.equal(JSON.stringify(createCalls), JSON.stringify([{ name: "scoped-key", role: "user", host_scope: "listed", allowed_hosts: ["node1.example.test", "node2.example.test"] }]))
})
