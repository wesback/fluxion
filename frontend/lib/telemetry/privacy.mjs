const restrictedAttributes = new Set([
  'search.query',
  'api.param.hostname',
  'api.param.package_name',
  'export.rows',
  'export.content',
  'file.contents',
])

const routeAttributes = new Set(['api.endpoint', 'http.request.url', 'http.url'])
const pageAttributes = new Set(['page.path', 'page.from', 'page.to'])

function sanitizeRoute(value, attributeName) {
  const withoutQueryOrFragment = value.split(/[?#]/, 1)[0]
  const originMatch = withoutQueryOrFragment.match(/^([a-z][a-z\d+.-]*:\/\/[^/]+)(\/.*)$/i)
  const origin = originMatch?.[1] ?? ''
  let path = originMatch?.[2] ?? withoutQueryOrFragment

  if (routeAttributes.has(attributeName)) {
    path = path
      .replace(/^\/api\/v1\/hosts\/[^/]+\/updates$/, '/api/v1/hosts/:hostname/updates')
      .replace(/^\/api\/hosts\/[^/]+\/updates$/, '/api/hosts/:hostname/updates')
      .replace(/^\/api\/v1\/packages\/[^/]+\/hosts$/, '/api/v1/packages/:package_name/hosts')
      .replace(/^\/api\/packages\/[^/]+\/hosts$/, '/api/packages/:package_name/hosts')
  } else if (pageAttributes.has(attributeName)) {
    path = path.replace(/^\/hosts\/[^/]+$/, '/hosts/:hostname')
  }

  return `${origin}${path}`
}

function sanitizeAttributes(attributes) {
  const sanitized = {}

  for (const [name, value] of Object.entries(attributes)) {
    if (restrictedAttributes.has(name) || value === null || typeof value === 'object') {
      continue
    }

    sanitized[name] = (routeAttributes.has(name) || pageAttributes.has(name)) && typeof value === 'string'
      ? sanitizeRoute(value, name)
      : value
  }

  return sanitized
}

function sanitizePayload(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizePayload)
  }
  if (value === null || typeof value !== 'object') {
    return value
  }

  const sanitized = {}
  for (const [name, child] of Object.entries(value)) {
    if (name === 'attributes' && child !== null && typeof child === 'object' && !Array.isArray(child)) {
      sanitized[name] = sanitizeAttributes(child)
    } else {
      sanitized[name] = sanitizePayload(child)
    }
  }
  return sanitized
}

export function createPrivacyFilteredExporter(exporter) {
  return {
    export(spans, resultCallback) {
      exporter.export(sanitizePayload(spans), resultCallback)
    },
    shutdown() {
      return exporter.shutdown()
    },
  }
}
