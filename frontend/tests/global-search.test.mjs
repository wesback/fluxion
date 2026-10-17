import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = readFileSync(join(root, "lib/search-routing.ts"), "utf8")
const typescript = require("typescript")
const compiled = typescript.transpileModule(source, {
  compilerOptions: { module: typescript.ModuleKind.CommonJS },
}).outputText
const searchRouting = { exports: {} }
runInNewContext(compiled, { exports: searchRouting.exports })

test("globalSearchTargetsExistingHostAndPackageSearchRoutes", () => {
  const { getGlobalSearchHref } = searchRouting.exports
  assert.equal(getGlobalSearchHref("packages", " openssl "), "/packages?q=openssl")
  assert.equal(getGlobalSearchHref("hosts", "node 01"), "/hosts?q=node%2001")
  assert.equal(getGlobalSearchHref("packages", "lib&ssl"), "/packages?q=lib%26ssl")
  assert.equal(getGlobalSearchHref("hosts", "   "), null)
})
