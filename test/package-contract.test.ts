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
  assert.equal(packageJson.dependencies?.["proper-lockfile"], "^4.1.2")
  assert.equal(packageJson.dependencies?.["graceful-fs"], "^4.2.4")
  assert.equal(packageJson.dependencies?.retry, "^0.12.0")
  assert.equal(packageJson.dependencies?.["signal-exit"], "^3.0.2")

  const canonicalSpecUrl = new URL("../spec/developer-attention-status.yml", import.meta.url)
  const canonicalSpec = await readFile(canonicalSpecUrl, "utf8")
  assert.match(canonicalSpec, /^feature: developer-attention-status$/m)
})
