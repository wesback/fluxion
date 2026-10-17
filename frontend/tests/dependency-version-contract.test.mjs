import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const expectedVersions = {
  "@opentelemetry/api": "1.9.1",
  "@opentelemetry/context-zone": "2.12.0",
  "@opentelemetry/exporter-trace-otlp-http": "0.223.0",
  "@opentelemetry/instrumentation": "0.223.0",
  "@opentelemetry/instrumentation-fetch": "0.223.0",
  "@opentelemetry/instrumentation-xml-http-request": "0.223.0",
  "@opentelemetry/resources": "2.12.0",
  "@opentelemetry/sdk-trace-web": "2.12.0",
  "@opentelemetry/semantic-conventions": "1.43.0",
  "@tailwindcss/postcss": "4.3.3",
  "@tanstack/react-query": "5.104.3",
  "@tanstack/react-query-devtools": "5.104.3",
  "@types/node": "26.6.5",
  "@types/react": "19.3.0",
  "@types/react-dom": "19.3.0",
  axios: "1.20.0",
  clsx: "2.1.1",
  "date-fns": "4.4.0",
  // 10.13.0 is outside the peer ranges of eslint-plugin-import, eslint-plugin-jsx-a11y, and eslint-plugin-react.
  eslint: "9.39.5",
  "eslint-config-next": "16.4.2",
  "lucide-react": "1.58.0",
  next: "16.4.2",
  "next-themes": "0.4.6",
  react: "19.3.1",
  "react-dom": "19.3.1",
  recharts: "3.10.1",
  sonner: "2.0.8",
  tailwindcss: "4.3.3",
  "tailwind-merge": "3.7.0",
  // TS 6.0.3 changes transpileModule interop and breaks UI tests; TS 7.0.2 removes JsxEmit and fails lint.
  typescript: "5.9.3",
  "web-vitals": "6.2.3",
}

function assertManifestMatchesLockfile(manifest, lockfile) {
  const lockRoot = lockfile.packages?.[""]
  assert.ok(lockRoot, "lockfile must contain its root package entry")

  for (const section of ["dependencies", "devDependencies"]) {
    const declarations = manifest[section] ?? {}
    assert.deepEqual(
      lockRoot[section] ?? {},
      declarations,
      `lockfile root ${section} must match package.json`,
    )

    for (const [name, declaration] of Object.entries(declarations)) {
      const entry = lockfile.packages[`node_modules/${name}`]
      assert.ok(entry, `lockfile is missing package entry for ${name}`)
      assert.equal(
        entry.version,
        declaration,
        `${name} resolves to ${entry.version}, not ${declaration}`,
      )
    }
  }
}

test("test_dependency_targets_match_expected_stable_versions", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const directDependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  }

  assert.deepEqual(
    Object.keys(directDependencies).sort(),
    Object.keys(expectedVersions).sort(),
    "expected versions must cover every direct runtime and development dependency",
  )
  for (const [name, expectedVersion] of Object.entries(expectedVersions)) {
    assert.equal(directDependencies[name], expectedVersion, `${name} must be pinned to ${expectedVersion}`)
    assert.match(expectedVersion, /^\d+\.\d+\.\d+$/, `${name} must not use a prerelease version`)
  }
})

test("test_manifest_versions_match_lockfile", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const lockfile = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))
  assertManifestMatchesLockfile(manifest, lockfile)

  const fixtureManifest = {
    dependencies: { "fixture-package": "1.2.3" },
    devDependencies: {},
  }
  const makeFixtureLockfile = () => ({
    packages: {
      "": {
        dependencies: { "fixture-package": "1.2.3" },
        devDependencies: {},
      },
      "node_modules/fixture-package": { version: "1.2.3" },
    },
  })

  const missingEntry = makeFixtureLockfile()
  delete missingEntry.packages["node_modules/fixture-package"]
  assert.throws(
    () => assertManifestMatchesLockfile(fixtureManifest, missingEntry),
    /lockfile is missing package entry for fixture-package/,
  )

  const mismatchedRootDeclaration = makeFixtureLockfile()
  mismatchedRootDeclaration.packages[""].dependencies["fixture-package"] = "1.2.4"
  assert.throws(
    () => assertManifestMatchesLockfile(fixtureManifest, mismatchedRootDeclaration),
    /lockfile root dependencies must match package\.json/,
  )

  const staleResolvedVersion = makeFixtureLockfile()
  staleResolvedVersion.packages["node_modules/fixture-package"].version = "1.2.2"
  assert.throws(
    () => assertManifestMatchesLockfile(fixtureManifest, staleResolvedVersion),
    /fixture-package resolves to 1\.2\.2, not 1\.2\.3/,
  )
})
