import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const lockfile = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))
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
const runtimePackageNames = [
  "@tanstack/react-query",
  "axios",
  "clsx",
  "date-fns",
  "lucide-react",
  "next",
  "next-themes",
  "react",
  "react-dom",
  "recharts",
  "sonner",
  "tailwind-merge",
  "web-vitals",
]
const expectedRuntimeVersions = {
  "@tanstack/react-query": "5.104.3",
  axios: "1.20.0",
  clsx: "2.1.1",
  "date-fns": "4.4.0",
  "lucide-react": "1.59.0",
  next: "16.4.2",
  "next-themes": "0.4.6",
  react: "19.3.1",
  "react-dom": "19.3.1",
  recharts: "3.10.1",
  sonner: "2.0.8",
  "tailwind-merge": "3.7.0",
  "web-vitals": "6.2.3",
}

function assertRuntimeTargetsMatchExpectedVersions(manifestFixture) {
  assert.deepEqual(Object.keys(expectedRuntimeVersions).sort(), [...runtimePackageNames].sort())

  for (const name of runtimePackageNames) {
    const version = manifestFixture.dependencies?.[name]
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must not use a range or prerelease`)
    assert.equal(version, expectedRuntimeVersions[name], `${name} must use its expected exact version`)
  }
}

function assertRuntimeManifestLockfileMatches(manifestFixture, lockfileFixture) {
  const manifestDependencies = manifestFixture.dependencies
  const rootDependencies = lockfileFixture.packages?.[""]?.dependencies

  for (const name of runtimePackageNames) {
    assert.ok(Object.hasOwn(manifestDependencies ?? {}, name), `manifest dependency is missing: ${name}`)
    assert.ok(Object.hasOwn(rootDependencies ?? {}, name), `lockfile root dependency is missing: ${name}`)
    assert.equal(rootDependencies[name], manifestDependencies[name], `lockfile root declaration differs: ${name}`)

    const resolvedPackage = lockfileFixture.packages?.[`node_modules/${name}`]
    assert.ok(resolvedPackage, `resolved lockfile package is missing: ${name}`)
    assert.equal(resolvedPackage.version, manifestDependencies[name], `resolved package version differs: ${name}`)
  }
}

function createRuntimeFixtures() {
  return {
    manifest: {
      dependencies: { ...expectedRuntimeVersions },
    },
    lockfile: {
      packages: {
        "": { dependencies: { ...expectedRuntimeVersions } },
        ...Object.fromEntries(
          runtimePackageNames.map((name) => [`node_modules/${name}`, { version: expectedRuntimeVersions[name] }]),
        ),
      },
    },
  }
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

test("test_runtime_targets_match_expected_stable_versions", () => {
  assert.doesNotThrow(() => assertRuntimeTargetsMatchExpectedVersions(manifest))

  const mismatchedVersion = {
    dependencies: { ...expectedRuntimeVersions, "@tanstack/react-query": "5.104.2" },
  }
  assert.throws(
    () => assertRuntimeTargetsMatchExpectedVersions(mismatchedVersion),
    /@tanstack\/react-query must use its expected exact version/,
  )

  for (const version of ["^5.104.3", "5.104.3-beta.1"]) {
    const manifestFixture = {
      dependencies: { ...expectedRuntimeVersions, "@tanstack/react-query": version },
    }
    assert.throws(
      () => assertRuntimeTargetsMatchExpectedVersions(manifestFixture),
      /@tanstack\/react-query must not use a range or prerelease/,
    )
  }
})

test("test_runtime_manifest_versions_match_lockfile", () => {
  assert.doesNotThrow(() => assertRuntimeManifestLockfileMatches(manifest, lockfile))

  let fixtures = createRuntimeFixtures()
  assert.doesNotThrow(() => assertRuntimeManifestLockfileMatches(fixtures.manifest, fixtures.lockfile))

  fixtures = createRuntimeFixtures()
  delete fixtures.manifest.dependencies["@tanstack/react-query"]
  assert.throws(
    () => assertRuntimeManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /manifest dependency is missing: @tanstack\/react-query/,
  )

  fixtures = createRuntimeFixtures()
  delete fixtures.lockfile.packages[""].dependencies["@tanstack/react-query"]
  assert.throws(
    () => assertRuntimeManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /lockfile root dependency is missing: @tanstack\/react-query/,
  )

  fixtures = createRuntimeFixtures()
  delete fixtures.lockfile.packages["node_modules/@tanstack/react-query"]
  assert.throws(
    () => assertRuntimeManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /resolved lockfile package is missing: @tanstack\/react-query/,
  )

  fixtures = createRuntimeFixtures()
  fixtures.lockfile.packages[""].dependencies["@tanstack/react-query"] = "5.104.2"
  assert.throws(
    () => assertRuntimeManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /lockfile root declaration differs: @tanstack\/react-query/,
  )

  fixtures = createRuntimeFixtures()
  fixtures.lockfile.packages["node_modules/@tanstack/react-query"].version = "5.104.2"
  assert.throws(
    () => assertRuntimeManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /resolved package version differs: @tanstack\/react-query/,
  )
})

const developmentPackageNames = [
  "@tailwindcss/postcss",
  "@tanstack/react-query-devtools",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "eslint",
  "eslint-config-next",
  "tailwindcss",
  "typescript",
]
const expectedDevelopmentVersions = {
  "@tailwindcss/postcss": "4.3.3",
  "@tanstack/react-query-devtools": "5.104.3",
  "@types/node": "26.6.5",
  "@types/react": "19.3.0",
  "@types/react-dom": "19.3.0",
  eslint: "10.13.0",
  "eslint-config-next": "16.4.2",
  tailwindcss: "4.3.3",
  typescript: "7.0.2",
}

const developmentReleaseEvidence = {
  "@tailwindcss/postcss": { selected: ["4.3.3", "not published"], higherStableReleasesConsidered: [] },
  "@tanstack/react-query-devtools": { selected: ["5.104.3", "not published"], higherStableReleasesConsidered: [] },
  "@types/node": { selected: ["26.6.5", "not published"], higherStableReleasesConsidered: [] },
  "@types/react": { selected: ["19.3.0", "not published"], higherStableReleasesConsidered: [] },
  "@types/react-dom": { selected: ["19.3.0", "not published"], higherStableReleasesConsidered: [] },
  eslint: {
    selected: ["10.13.0", "^20.19.0 || ^22.13.0 || >=24"],
    higherStableReleasesConsidered: [],
  },
  "eslint-config-next": { selected: ["16.4.2", "not published"], higherStableReleasesConsidered: [] },
  tailwindcss: { selected: ["4.3.3", "not published"], higherStableReleasesConsidered: [] },
  typescript: { selected: ["7.0.2", ">=16.20.0"], higherStableReleasesConsidered: [] },
}

function assertDevelopmentTargetsMatchExpectedVersions(manifestFixture, expectedVersions) {
  assert.deepEqual(Object.keys(expectedVersions).sort(), [...developmentPackageNames].sort())

  for (const name of developmentPackageNames) {
    const version = manifestFixture.devDependencies?.[name]
    assert.ok(Object.hasOwn(manifestFixture.devDependencies ?? {}, name), `manifest devDependency is missing: ${name}`)
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must not use a range or prerelease`)
    assert.equal(version, expectedVersions[name], `${name} must use its expected exact version`)
  }
}

function assertDevelopmentManifestLockfileMatches(manifestFixture, lockfileFixture) {
  const manifestDependencies = manifestFixture.devDependencies
  const rootDependencies = lockfileFixture.packages?.[""]?.devDependencies

  for (const name of developmentPackageNames) {
    assert.ok(Object.hasOwn(manifestDependencies ?? {}, name), `manifest devDependency is missing: ${name}`)
    assert.ok(Object.hasOwn(rootDependencies ?? {}, name), `lockfile root devDependency is missing: ${name}`)
    assert.equal(rootDependencies[name], manifestDependencies[name], `lockfile root declaration differs: ${name}`)

    const resolvedPackage = lockfileFixture.packages?.[`node_modules/${name}`]
    assert.ok(resolvedPackage, `resolved lockfile package is missing: ${name}`)
    assert.equal(resolvedPackage.version, manifestDependencies[name], `resolved package version differs: ${name}`)
  }
}

function createDevelopmentFixtures() {
  return {
    manifest: {
      devDependencies: { ...expectedDevelopmentVersions },
    },
    lockfile: {
      packages: {
        "": { devDependencies: { ...expectedDevelopmentVersions } },
        ...Object.fromEntries(
          developmentPackageNames.map((name) => [
            `node_modules/${name}`,
            { version: expectedDevelopmentVersions[name] },
          ]),
        ),
      },
    },
  }
}

test("test_development_targets_match_expected_stable_versions", () => {
  assert.deepEqual(Object.keys(developmentReleaseEvidence).sort(), [...developmentPackageNames].sort())
  for (const [name, evidence] of Object.entries(developmentReleaseEvidence)) {
    assert.equal(evidence.selected[0], expectedDevelopmentVersions[name])
  }
  assert.doesNotThrow(() =>
    assertDevelopmentTargetsMatchExpectedVersions(manifest, expectedDevelopmentVersions),
  )

  let manifestFixture = { devDependencies: { ...expectedDevelopmentVersions } }
  delete manifestFixture.devDependencies["@tailwindcss/postcss"]
  assert.throws(
    () => assertDevelopmentTargetsMatchExpectedVersions(manifestFixture, expectedDevelopmentVersions),
    /manifest devDependency is missing: @tailwindcss\/postcss/,
  )

  for (const version of ["4.3.2", "^4.3.3", "4.3.3-beta.1"]) {
    manifestFixture = {
      devDependencies: { ...expectedDevelopmentVersions, "@tailwindcss/postcss": version },
    }
    assert.throws(
      () => assertDevelopmentTargetsMatchExpectedVersions(manifestFixture, expectedDevelopmentVersions),
      version.startsWith("^")
        ? /@tailwindcss\/postcss must not use a range or prerelease/
        : version.includes("-")
          ? /@tailwindcss\/postcss must not use a range or prerelease/
          : /@tailwindcss\/postcss must use its expected exact version/,
    )
  }

  assert.throws(
    () =>
      assertDevelopmentTargetsMatchExpectedVersions(manifest, {
        ...expectedDevelopmentVersions,
        extra: "1.0.0",
      }),
    /deep-equal/,
  )
})

test("test_development_manifest_versions_match_lockfile", () => {
  let fixtures = createDevelopmentFixtures()
  assert.doesNotThrow(() => assertDevelopmentManifestLockfileMatches(fixtures.manifest, fixtures.lockfile))

  fixtures = createDevelopmentFixtures()
  delete fixtures.manifest.devDependencies["@tailwindcss/postcss"]
  assert.throws(
    () => assertDevelopmentManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /manifest devDependency is missing: @tailwindcss\/postcss/,
  )

  fixtures = createDevelopmentFixtures()
  delete fixtures.lockfile.packages[""].devDependencies["@tailwindcss/postcss"]
  assert.throws(
    () => assertDevelopmentManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /lockfile root devDependency is missing: @tailwindcss\/postcss/,
  )

  fixtures = createDevelopmentFixtures()
  delete fixtures.lockfile.packages["node_modules/@tailwindcss/postcss"]
  assert.throws(
    () => assertDevelopmentManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /resolved lockfile package is missing: @tailwindcss\/postcss/,
  )

  fixtures = createDevelopmentFixtures()
  fixtures.lockfile.packages[""].devDependencies["@tailwindcss/postcss"] = "4.3.2"
  assert.throws(
    () => assertDevelopmentManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /lockfile root declaration differs: @tailwindcss\/postcss/,
  )

  fixtures = createDevelopmentFixtures()
  fixtures.lockfile.packages["node_modules/@tailwindcss/postcss"].version = "4.3.2"
  assert.throws(
    () => assertDevelopmentManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /resolved package version differs: @tailwindcss\/postcss/,
  )
})
