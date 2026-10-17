import test from "node:test"
import assert from "node:assert/strict"
import { createPrivacyFilteredExporter } from "../lib/telemetry/privacy.mjs"

const span = (name, attributes, extra = {}) => ({ name, attributes, ...extra })

function capture(spans) {
  const exported = []
  const exporter = createPrivacyFilteredExporter({
    export(batch, callback) { exported.push(...batch); callback({ code: 0 }) },
    async shutdown() {},
  })
  exporter.export(spans, () => {})
  return exported
}

const attributeNames = (item) => Object.keys(item.attributes).sort()

test("restrictedValuesNeverReachTelemetry", () => {
  const search = "SEARCH_SENTINEL_11", hostname = "HOST_SENTINEL_22"
  const packageName = "PACKAGE_SENTINEL_33", csv = "CSV_SENTINEL_44"
  const routes = [
    ["api.endpoint", `/api/v1/hosts/${hostname}/updates?search=${search}#section`, "/api/v1/hosts/:hostname/updates"],
    ["api.endpoint", `/api/hosts/${hostname}/updates`, "/api/hosts/:hostname/updates"],
    ["api.endpoint", `/api/v1/packages/${packageName}/hosts`, "/api/v1/packages/:package_name/hosts"],
    ["api.endpoint", `/api/packages/${packageName}/hosts`, "/api/packages/:package_name/hosts"],
    ["http.request.url", `https://api.example/api/v1/hosts/${hostname}/updates?token=${search}`, "https://api.example/api/v1/hosts/:hostname/updates"],
    ["http.url", `https://api.example/api/packages/${packageName}/hosts?filter=${search}#top`, "https://api.example/api/packages/:package_name/hosts"],
    ["page.path", `/hosts/${hostname}?q=${search}#results`, "/hosts/:hostname"],
    ["page.from", `/hosts/${hostname}#details`, "/hosts/:hostname"],
    ["page.to", `/hosts/${hostname}?tab=updates`, "/hosts/:hostname"],
    ["api.endpoint", "/api/v1/stats?period=day#chart", "/api/v1/stats"],
  ]
  const exported = capture([
    span("api.lookup", {
      "search.query": search,
      "api.param.hostname": hostname,
      "api.param.package_name": packageName,
      "export.rows": [{ hostname, package_name: packageName }],
      "export.content": csv,
      "file.contents": csv,
      "custom.payload": { rows: [{ contents: csv }] },
    }),
    ...routes.map(([name, value], index) => span(`route-${index}`, { [name]: value })),
  ])

  const serialized = JSON.stringify(exported)
  for (const sentinel of [search, hostname, packageName, csv]) {
    assert.equal(serialized.includes(sentinel), false, `${sentinel} must not be exported`)
  }
  for (const name of [
    "search.query", "api.param.hostname", "api.param.package_name",
    "export.rows", "export.content", "file.contents", "custom.payload",
  ]) {
    assert.equal(Object.hasOwn(exported[0].attributes, name), false, `${name} must be omitted`)
  }
  assert.deepEqual(routes.map(([name], index) => exported[index + 1].attributes[name]), routes.map(([, , expected]) => expected))
})

test("approvedInstrumentationRemains", () => {
  const pageSpans = [
    span("page.view", {
      "event.name": "page.view", "session.id": "session-1", "page.path": "/",
      "page.title": "Dashboard", "page.referrer": "direct",
    }),
    span("page.navigation", {
      "event.name": "page.navigation", "session.id": "session-1",
      "page.from": "/", "page.to": "/hosts", "page.title": "Hosts",
    }),
    span("user.theme_toggle", {
      "event.name": "user.theme_toggle", "session.id": "session-1",
      "theme.new": "dark", "theme.previous": "light",
    }),
    span("user.data_refresh", {
      "event.name": "user.data_refresh", "session.id": "session-1",
      "refresh.data_type": "hosts", "refresh.success": true,
    }),
  ]
  const apiSpans = [
    span("api.call.getStats", {
      "api.method": "GET", "http.response.status_code": 200,
      "api.duration_ms": 12.5, "api.response.count": 4,
    }),
    span("api.call.denied", {
      "api.method": "GET", "http.response.status_code": 403, "api.duration_ms": 8,
    }),
  ]
  const exported = capture([...pageSpans, ...apiSpans])

  assert.deepEqual(exported.slice(0, 4).map(({ name }) => name), [
    "page.view", "page.navigation", "user.theme_toggle", "user.data_refresh",
  ])
  assert.deepEqual(exported.slice(0, 4).map(attributeNames), [
    ["event.name", "page.path", "page.referrer", "page.title", "session.id"],
    ["event.name", "page.from", "page.title", "page.to", "session.id"],
    ["event.name", "session.id", "theme.new", "theme.previous"],
    ["event.name", "refresh.data_type", "refresh.success", "session.id"],
  ])
  assert.deepEqual(attributeNames(exported[4]), [
    "api.duration_ms", "api.method", "api.response.count", "http.response.status_code",
  ])
  assert.deepEqual(attributeNames(exported[5]), [
    "api.duration_ms", "api.method", "http.response.status_code",
  ])
  assert.equal(exported[4].attributes["http.response.status_code"], 200)
  assert.equal(exported[5].attributes["http.response.status_code"], 403)
  assert.equal(Object.hasOwn(exported[5].attributes, "api.response.count"), false)
})

test("privacyFilterUsesNamedPropertiesAndRouteShapes", () => {
  const routes = [
    ["api.endpoint", "/api/v1/hosts/node/updates", "/api/v1/hosts/:hostname/updates"],
    ["api.endpoint", "/api/hosts/node/updates", "/api/hosts/:hostname/updates"],
    ["api.endpoint", "/api/v1/packages/agent/hosts", "/api/v1/packages/:package_name/hosts"],
    ["api.endpoint", "/api/packages/agent/hosts", "/api/packages/:package_name/hosts"],
    ["page.path", "/hosts/node?view=summary#top", "/hosts/:hostname"],
    ["http.url", "/api/v1/hosts/node/updates/archive?view=all#top", "/api/v1/hosts/node/updates/archive"],
  ]
  const exported = capture([
    span("privacy.contract", {
      "custom.host_label": "host value", "custom.package_label": "package value",
      "search.query_hint": "search term", "search.query": "restricted",
      "api.param.hostname": "restricted-host", "api.param.package_name": "restricted-package",
      "export.rows": ["restricted"], "export.content": "restricted", "file.contents": "restricted",
    }),
    ...routes.map(([name, value], index) => span(`shape-${index}`, { [name]: value })),
  ])
  const attributes = exported[0].attributes

  assert.equal(attributes["custom.host_label"], "host value")
  assert.equal(attributes["custom.package_label"], "package value")
  assert.equal(attributes["search.query_hint"], "search term")
  for (const name of [
    "search.query", "api.param.hostname", "api.param.package_name",
    "export.rows", "export.content", "file.contents",
  ]) {
    assert.equal(Object.hasOwn(attributes, name), false, `${name} must be removed by name`)
  }
  assert.deepEqual(routes.map(([name], index) => exported[index + 1].attributes[name]), routes.map(([, , expected]) => expected))
})
