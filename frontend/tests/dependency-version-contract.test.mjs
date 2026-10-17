import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const packageNames = [
  "@opentelemetry/api",
  "@opentelemetry/context-zone",
  "@opentelemetry/exporter-trace-otlp-http",
  "@opentelemetry/instrumentation",
  "@opentelemetry/instrumentation-fetch",
  "@opentelemetry/instrumentation-xml-http-request",
  "@opentelemetry/resources",
  "@opentelemetry/sdk-trace-web",
  "@opentelemetry/semantic-conventions",
]
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
}

function assertOpenTelemetryManifestLockfileMatches(manifestFixture, lockfileFixture) {
  const manifestDependencies = manifestFixture.dependencies
  const rootDependencies = lockfileFixture.packages?.[""]?.dependencies

  for (const name of packageNames) {
    assert.ok(Object.hasOwn(manifestDependencies ?? {}, name), `manifest dependency is missing: ${name}`)
    assert.ok(Object.hasOwn(rootDependencies ?? {}, name), `lockfile root dependency is missing: ${name}`)
    assert.equal(rootDependencies[name], manifestDependencies[name], `lockfile root declaration differs: ${name}`)

    const resolvedPackage = lockfileFixture.packages?.[`node_modules/${name}`]
    assert.ok(resolvedPackage, `resolved lockfile package is missing: ${name}`)
    assert.equal(resolvedPackage.version, manifestDependencies[name], `resolved package version differs: ${name}`)
  }
}

function createFixtures() {
  return {
    manifest: {
      dependencies: { ...expectedVersions },
    },
    lockfile: {
      packages: {
        "": { dependencies: { ...expectedVersions } },
        ...Object.fromEntries(
          packageNames.map((name) => [`node_modules/${name}`, { version: expectedVersions[name] }]),
        ),
      },
    },
  }
}

test("test_opentelemetry_targets_match_expected_stable_versions", () => {
  assert.deepEqual(Object.keys(expectedVersions).sort(), [...packageNames].sort())

  for (const name of packageNames) {
    const version = manifest.dependencies[name]
    assert.equal(version, expectedVersions[name], `${name} must use its expected exact version`)
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must not use a range or prerelease`)
  }
})

test("test_opentelemetry_manifest_versions_match_lockfile", () => {
  let fixtures = createFixtures()
  assert.doesNotThrow(() => assertOpenTelemetryManifestLockfileMatches(fixtures.manifest, fixtures.lockfile))

  fixtures = createFixtures()
  delete fixtures.manifest.dependencies["@opentelemetry/api"]
  assert.throws(
    () => assertOpenTelemetryManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /manifest dependency is missing: @opentelemetry\/api/,
  )

  fixtures = createFixtures()
  delete fixtures.lockfile.packages[""].dependencies["@opentelemetry/api"]
  assert.throws(
    () => assertOpenTelemetryManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /lockfile root dependency is missing: @opentelemetry\/api/,
  )

  fixtures = createFixtures()
  delete fixtures.lockfile.packages["node_modules/@opentelemetry/api"]
  assert.throws(
    () => assertOpenTelemetryManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /resolved lockfile package is missing: @opentelemetry\/api/,
  )

  fixtures = createFixtures()
  fixtures.lockfile.packages[""].dependencies["@opentelemetry/api"] = "1.9.0"
  assert.throws(
    () => assertOpenTelemetryManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /lockfile root declaration differs: @opentelemetry\/api/,
  )

  fixtures = createFixtures()
  fixtures.lockfile.packages["node_modules/@opentelemetry/api"].version = "1.9.0"
  assert.throws(
    () => assertOpenTelemetryManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /resolved package version differs: @opentelemetry\/api/,
  )
})
