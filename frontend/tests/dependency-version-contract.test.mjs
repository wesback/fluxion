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
  "@types/node": "24.19.2",
  "@types/react": "19.3.0",
  "@types/react-dom": "19.3.0",
  eslint: "9.39.5",
  "eslint-config-next": "16.4.2",
  tailwindcss: "4.3.3",
  typescript: "5.9.3",
}

// Checked-in release metadata; null means the package publishes no engines.node field.
const developmentReleaseEvidence = {
  "@tailwindcss/postcss": {
    selected: { version: "4.3.3", enginesNode: null, enginesNodePublished: false, supportsNode24: null },
    highestCompatibleStableVersion: "4.3.3",
    higherStableReleasesConsidered: [],
  },
  "@tanstack/react-query-devtools": {
    selected: { version: "5.104.3", enginesNode: null, enginesNodePublished: false, supportsNode24: null },
    highestCompatibleStableVersion: "5.104.3",
    higherStableReleasesConsidered: [],
  },
  "@types/node": {
    selected: { version: "24.19.2", enginesNode: null, enginesNodePublished: false, supportsNode24: null },
    highestCompatibleStableVersion: "24.19.2",
    higherStableReleasesConsidered: [
      {
        version: "26.6.5",
        enginesNode: null,
        excludedReason: "@types/node major must match the frontend Node 24 runtime.",
      },
    ],
  },
  "@types/react": {
    selected: { version: "19.3.0", enginesNode: null, enginesNodePublished: false, supportsNode24: null },
    highestCompatibleStableVersion: "19.3.0",
    higherStableReleasesConsidered: [],
  },
  "@types/react-dom": {
    selected: { version: "19.3.0", enginesNode: null, enginesNodePublished: false, supportsNode24: null },
    highestCompatibleStableVersion: "19.3.0",
    higherStableReleasesConsidered: [],
  },
  eslint: {
    selected: {
      version: "9.39.5",
      enginesNode: "^18.18.0 || ^20.9.0 || >=21.1.0",
      enginesNodePublished: true,
      supportsNode24: true,
    },
    highestCompatibleStableVersion: "9.39.5",
    higherStableReleasesConsidered: [
      {
        version: "10.13.0",
        enginesNode: "^20.19.0 || ^22.13.0 || >=24",
        excludedPeerRange: {
          packageName: "eslint-plugin-import",
          range: "^2 || ^3 || ^4 || ^5 || ^6 || ^7.2.0 || ^8 || ^9",
        },
        excludedReason: "eslint-plugin-import, eslint-plugin-jsx-a11y, and eslint-plugin-react in eslint-config-next exclude ESLint 10.",
      },
    ],
  },
  "eslint-config-next": {
    selected: { version: "16.4.2", enginesNode: null, enginesNodePublished: false, supportsNode24: null },
    highestCompatibleStableVersion: "16.4.2",
    higherStableReleasesConsidered: [],
  },
  tailwindcss: {
    selected: { version: "4.3.3", enginesNode: null, enginesNodePublished: false, supportsNode24: null },
    highestCompatibleStableVersion: "4.3.3",
    higherStableReleasesConsidered: [],
  },
  typescript: {
    selected: { version: "5.9.3", enginesNode: ">=14.17", enginesNodePublished: true, supportsNode24: true },
    highestCompatibleStableVersion: "5.9.3",
    higherStableReleasesConsidered: [
      {
        version: "6.0.3",
        enginesNode: ">=14.17",
        excludedReason: "TypeScript 6 changes module interop behavior used by the existing test harness.",
      },
      {
        version: "7.0.2",
        enginesNode: ">=16.20.0",
        excludedPeerRange: { packageName: "typescript-eslint", range: ">=4.8.4 <6.1.0" },
        excludedReason: "typescript-eslint 8.71.2 requires TypeScript >=4.8.4 <6.1.0; TypeScript 7 removes test tooling APIs.",
      },
    ],
  },
}

const developmentPeerEvidence = {
  reactQueryDevtools: {
    packageName: "@tanstack/react-query-devtools",
    packageVersion: "5.104.3",
    runtimePackageName: "@tanstack/react-query",
    runtimeVersion: "5.104.3",
    peerRange: "^5.104.3",
  },
  nextLint: {
    packageName: "eslint-config-next",
    packageVersion: "16.4.2",
    eslint: {
      version: "9.39.5",
      constraints: [
        ["eslint-config-next", "16.4.2", "node_modules/eslint-config-next", ">=9.0.0"],
        ["eslint-plugin-import", "2.32.0", "node_modules/eslint-config-next/node_modules/eslint-plugin-import", "^2 || ^3 || ^4 || ^5 || ^6 || ^7.2.0 || ^8 || ^9"],
        ["eslint-plugin-jsx-a11y", "6.10.2", "node_modules/eslint-config-next/node_modules/eslint-plugin-jsx-a11y", "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9"],
        ["eslint-plugin-react", "7.37.5", "node_modules/eslint-config-next/node_modules/eslint-plugin-react", "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"],
      ],
    },
    typescript: {
      version: "5.9.3",
      constraints: [
        ["eslint-config-next", "16.4.2", "node_modules/eslint-config-next", ">=3.3.1"],
        ["typescript-eslint", "8.71.2", "node_modules/eslint-config-next/node_modules/typescript-eslint", ">=4.8.4 <6.1.0"],
      ],
    },
  },
}

function satisfiesVersionRange(version, range) {
  const parse = (value, partial = false) => {
    if (typeof value !== "string" || !(partial ? /^\d+(?:\.\d+){0,2}$/ : /^\d+\.\d+\.\d+$/).test(value)) {
      throw new TypeError(`Invalid version: ${value}`)
    }
    return value.split(".").map(Number).concat([0, 0]).slice(0, 3)
  }
  const target = parse(version)
  if (typeof range !== "string" || !range.trim()) {
    throw new TypeError(`Invalid version range: ${range}`)
  }
  const alternatives = range.split(/\s+\|\|\s+/).map((part) => part.trim().split(/\s+/))
  if (alternatives.flat().some((part) => !/^(>=|<|\^)?\d+(?:\.\d+){0,2}$/.test(part))) {
    throw new TypeError(`Invalid version range: ${range}`)
  }
  const compare = (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
  return alternatives.some((alternative) => {
    return alternative.every((constraint) => {
      const [, operator = "=", rawBoundary] = /^(>=|<|\^)?(\d+(?:\.\d+){0,2})$/.exec(constraint)
      const boundary = parse(rawBoundary, true)
      const comparison = compare(target, boundary)
      if (operator === ">=") return comparison >= 0
      if (operator === "<") return comparison < 0
      if (operator === "=") return comparison === 0
      return comparison >= 0 && compare(target, [boundary[0] + 1, 0, 0]) < 0
    })
  })
}

function assertDevelopmentReleaseEvidence(evidenceFixture, metadataProvider) {
  assert.equal(typeof metadataProvider, "function", "a metadata provider is injected but never called")
  assert.deepEqual(Object.keys(evidenceFixture).sort(), [...developmentPackageNames].sort())

  for (const name of developmentPackageNames) {
    const evidence = evidenceFixture[name]
    assert.equal(evidence.selected.version, expectedDevelopmentVersions[name])
    assert.equal(evidence.highestCompatibleStableVersion, expectedDevelopmentVersions[name])
    assert.ok(evidence.selected.enginesNode === null || typeof evidence.selected.enginesNode === "string")
    assert.equal(evidence.selected.enginesNodePublished, evidence.selected.enginesNode !== null)
    if (evidence.selected.enginesNode === null) {
      assert.equal(evidence.selected.supportsNode24, null, `${name} has no published Node engine range`)
    } else {
      assert.equal(
        evidence.selected.supportsNode24,
        satisfiesVersionRange("24.0.0", evidence.selected.enginesNode),
        `${name} Node engine range evidence must be evaluated against Node 24.0.0`,
      )
    }
  }

  for (const evidence of Object.values(evidenceFixture)) {
    for (const release of evidence.higherStableReleasesConsidered) {
      assert.match(release.version, /^\d+\.\d+\.\d+$/)
      assert.ok(release.enginesNode === null || typeof release.enginesNode === "string")
      assert.ok(typeof release.excludedReason === "string" && release.excludedReason.length > 0)
    }
  }
  assert.equal(evidenceFixture["@types/node"].higherStableReleasesConsidered[0].version, "26.6.5")
  assert.equal(evidenceFixture.eslint.higherStableReleasesConsidered[0].version, "10.13.0")
  assert.equal(
    evidenceFixture.typescript.higherStableReleasesConsidered.find(({ excludedPeerRange }) => excludedPeerRange)?.version,
    "7.0.2",
  )
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

  assert.deepEqual(
    Object.keys(manifestDependencies ?? {}).sort(),
    [...developmentPackageNames].sort(),
    "manifest must contain exactly the expected development dependencies",
  )
  assert.deepEqual(
    Object.keys(rootDependencies ?? {}).sort(),
    [...developmentPackageNames].sort(),
    "lockfile root must contain exactly the expected development dependencies",
  )
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

function assertDevelopmentPeerContractsMatchRuntimeAndNextToolchain(manifestFixture, lockfileFixture, evidenceFixture) {
  const devtoolsEvidence = evidenceFixture.reactQueryDevtools
  const devtoolsPackage = lockfileFixture.packages?.[`node_modules/${devtoolsEvidence.packageName}`]
  const runtimeVersion = manifestFixture.dependencies?.[devtoolsEvidence.runtimePackageName]
  assert.equal(devtoolsEvidence.packageVersion, expectedDevelopmentVersions[devtoolsEvidence.packageName])
  assert.equal(manifestFixture.devDependencies?.[devtoolsEvidence.packageName], devtoolsEvidence.packageVersion)
  assert.equal(devtoolsPackage?.version, devtoolsEvidence.packageVersion)
  assert.equal(devtoolsEvidence.runtimeVersion, runtimeVersion)
  assert.equal(
    lockfileFixture.packages?.[`node_modules/${devtoolsEvidence.runtimePackageName}`]?.version,
    runtimeVersion,
  )
  assert.equal(
    devtoolsPackage?.peerDependencies?.[devtoolsEvidence.runtimePackageName],
    devtoolsEvidence.peerRange,
  )
  assert.ok(
    satisfiesVersionRange(runtimeVersion, devtoolsEvidence.peerRange),
    `peer range excludes ${devtoolsEvidence.runtimePackageName}@${runtimeVersion}`,
  )

  const nextLint = evidenceFixture.nextLint
  const nextConfig = lockfileFixture.packages?.[`node_modules/${nextLint.packageName}`]
  assert.equal(nextLint.packageVersion, expectedDevelopmentVersions[nextLint.packageName])
  assert.equal(manifestFixture.devDependencies?.[nextLint.packageName], nextLint.packageVersion)
  assert.equal(nextConfig?.version, nextLint.packageVersion)

  for (const dependencyName of ["eslint", "typescript"]) {
    const dependencyEvidence = nextLint[dependencyName]
    assert.equal(dependencyEvidence.version, expectedDevelopmentVersions[dependencyName])
    assert.equal(manifestFixture.devDependencies?.[dependencyName], dependencyEvidence.version)
    for (const [packageName, packageVersion, lockfilePath, peerRange] of dependencyEvidence.constraints) {
      const constraintPackage = lockfileFixture.packages?.[lockfilePath]
      assert.ok(constraintPackage, `Next.js lint peer package is missing: ${packageName}`)
      assert.equal(constraintPackage.version, packageVersion)
      assert.equal(
        constraintPackage.peerDependencies?.[dependencyName],
        peerRange,
        `${packageName} peer range evidence differs for ${dependencyName}`,
      )
      assert.ok(
        satisfiesVersionRange(dependencyEvidence.version, peerRange),
        `${dependencyName}@${dependencyEvidence.version} is outside ${packageName}'s peer range`,
      )
    }
  }

  const eslintHigher = developmentReleaseEvidence.eslint.higherStableReleasesConsidered[0]
  const [, , , eslintPeerRange] = nextLint.eslint.constraints.find(
    ([packageName]) => packageName === eslintHigher.excludedPeerRange.packageName,
  )
  assert.equal(eslintPeerRange, eslintHigher.excludedPeerRange.range)
  assert.equal(satisfiesVersionRange(eslintHigher.version, eslintPeerRange), false)

  const typescriptHigher = developmentReleaseEvidence.typescript.higherStableReleasesConsidered.find(
    ({ excludedPeerRange }) => excludedPeerRange,
  )
  const [, , , typescriptPeerRange] = nextLint.typescript.constraints.find(
    ([packageName]) => packageName === typescriptHigher.excludedPeerRange.packageName,
  )
  assert.equal(typescriptPeerRange, typescriptHigher.excludedPeerRange.range)
  assert.equal(satisfiesVersionRange(typescriptHigher.version, typescriptPeerRange), false)
}

test("test_development_targets_match_expected_stable_versions", () => {
  assertDevelopmentReleaseEvidence(developmentReleaseEvidence, () => assert.fail("release metadata must stay local"))
  assert.doesNotThrow(() =>
    assertDevelopmentTargetsMatchExpectedVersions(manifest, expectedDevelopmentVersions),
  )
  assert.equal(Number.parseInt(manifest.devDependencies["@types/node"].split(".")[0], 10), 24)
  for (const [range, expected] of [
    [">=24", true],
    ["^24.0.0", true],
    ["^18.18.0 || ^20.9.0 || >=21.1.0", true],
    ["<24", false],
    ["^20.0.0 || ^22.0.0", false],
  ]) {
    assert.equal(satisfiesVersionRange("24.0.0", range), expected, `${range} Node 24 result`)
  }
  assert.throws(() => satisfiesVersionRange("24.0.0", "invalid range"), /Invalid version range/)
  assert.throws(() => satisfiesVersionRange("24.0.0", ">=24 || invalid"), /Invalid version range/)

  const nodeTypesFromAnotherMajor = {
    devDependencies: { ...expectedDevelopmentVersions, "@types/node": "26.6.5" },
  }
  assert.throws(
    () => assertDevelopmentTargetsMatchExpectedVersions(nodeTypesFromAnotherMajor, expectedDevelopmentVersions),
    /@types\/node must use its expected exact version/,
  )

  const falseNode24Claim = structuredClone(developmentReleaseEvidence)
  falseNode24Claim.eslint.selected.enginesNode = "<24"
  assert.throws(
    () => assertDevelopmentReleaseEvidence(falseNode24Claim, () => {}),
    /Node engine range evidence must be evaluated against Node 24\.0\.0/,
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

test("test_development_release_evidence_uses_only_local_metadata", () => {
  let metadataProviderCalls = 0
  const countingMetadataProvider = () => {
    metadataProviderCalls += 1
    throw new Error("release metadata must come from checked-in evidence")
  }

  assert.doesNotThrow(() =>
    assertDevelopmentReleaseEvidence(developmentReleaseEvidence, countingMetadataProvider),
  )
  assert.equal(metadataProviderCalls, 0)
})

test("test_development_peer_contracts_match_runtime_and_next_toolchain", () => {
  assert.doesNotThrow(() => assertDevelopmentPeerContractsMatchRuntimeAndNextToolchain(manifest, lockfile, developmentPeerEvidence))

  const incompatibleDevtoolsLock = structuredClone(lockfile)
  const incompatibleDevtoolsEvidence = structuredClone(developmentPeerEvidence)
  incompatibleDevtoolsLock.packages["node_modules/@tanstack/react-query-devtools"].peerDependencies[
    "@tanstack/react-query"
  ] = "^5.105.0"
  incompatibleDevtoolsEvidence.reactQueryDevtools.peerRange = "^5.105.0"
  assert.throws(
    () =>
      assertDevelopmentPeerContractsMatchRuntimeAndNextToolchain(
        manifest,
        incompatibleDevtoolsLock,
        incompatibleDevtoolsEvidence,
      ),
    /peer range excludes @tanstack\/react-query@5\.104\.3/,
  )
})

test("test_development_manifest_versions_match_lockfile", () => {
  assert.doesNotThrow(() => assertDevelopmentManifestLockfileMatches(manifest, lockfile))

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

  fixtures = createDevelopmentFixtures()
  fixtures.manifest.devDependencies.extra = "1.0.0"
  assert.throws(
    () => assertDevelopmentManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /manifest must contain exactly the expected development dependencies/,
  )

  fixtures = createDevelopmentFixtures()
  fixtures.lockfile.packages[""].devDependencies.extra = "1.0.0"
  assert.throws(
    () => assertDevelopmentManifestLockfileMatches(fixtures.manifest, fixtures.lockfile),
    /lockfile root must contain exactly the expected development dependencies/,
  )
})

test("test_frontend_runtime_and_node_types_target_node24", () => {
  assert.equal(manifest.engines?.node, ">=24 <25")
  assert.equal(lockfile.packages?.[""]?.engines?.node, manifest.engines.node)
  assert.match(manifest.devDependencies?.["@types/node"] ?? "", /^24\./)
  const dockerStages = [
    ...readFileSync(join(root, "Dockerfile"), "utf8").matchAll(/^FROM node:24-alpine AS (builder|runner)$/gm),
  ].map(([, stage]) => stage)
  assert.deepEqual(dockerStages, ["builder", "runner"])
  assert.match(
    readFileSync(join(root, "..", "docs", "frontend-github-actions.md"), "utf8"),
    /node-version: ['"]24['"]/,
  )
  assert.match(
    readFileSync(join(root, "..", "docs", "frontend-github-actions.md"), "utf8"),
    /matches what's used locally \(24\.x\)/,
  )
  assert.match(readFileSync(join(root, "README.md"), "utf8"), /Node\.js 24 LTS/)
})
