import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

type PackageJson = {
  name?: string
  dependencies?: Record<string, string>
  files?: string[]
  omp?: {
    extensions?: string[]
  }
}

test("package ships the OMP entrypoint and canonical spec", async () => {
  const packageJsonUrl = new URL("../package.json", import.meta.url)
  const rawPackageJson = await readFile(packageJsonUrl, "utf8")
  const packageJson = JSON.parse(rawPackageJson) as PackageJson

  assert.equal(packageJson.name, "omp-developer-attention-status")

  assert.deepEqual(packageJson.omp?.extensions, ["./src/index.ts"])
  assert.ok(packageJson.files?.includes("spec"), "expected spec/ in package files")
  assert.equal(
    packageJson.dependencies?.["proper-lockfile"],
    undefined,
    "OMP's Bun validator cannot resolve the CJS dependency chain reached through proper-lockfile",
  )

  const ledgerSource = await readFile(new URL("../src/spread-billing-ledger.ts", import.meta.url), "utf8")
  assert.doesNotMatch(
    ledgerSource,
    /\bproper-lockfile\b/,
    "the published entrypoint must not reach proper-lockfile during OMP validation",
  )

  const canonicalSpecUrl = new URL("../spec/developer-attention-status.yml", import.meta.url)
  const canonicalSpec = await readFile(canonicalSpecUrl, "utf8")
  assert.match(canonicalSpec, /^feature: developer-attention-status$/m)
})
