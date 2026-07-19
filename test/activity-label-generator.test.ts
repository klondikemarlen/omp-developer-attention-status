import assert from "node:assert/strict"
import test from "node:test"

import type { generateSessionTitle } from "@oh-my-pi/pi-coding-agent/utils/title-generator"

import { generateActivityLabel } from "../src/extension/activity-label-generator.js"
import type { ExtensionApi, ExtensionContext } from "../src/extension/types.js"

test("adapts OMP title generation for activity labels", async () => {
  const modelRegistry = {} as NonNullable<ExtensionContext["modelRegistry"]>
  const settings = {} as NonNullable<NonNullable<ExtensionApi["pi"]>["settings"]>
  const context: ExtensionContext = {
    cwd: "/project",
    ui: {
      notify() {},
      setStatus() {},
      theme: { fg(_color, text) { return text } },
    },
    sessionManager: {
      getSessionId: () => "session",
      getHeader: () => null,
      getEntries: () => [],
    },
    modelRegistry,
  }
  const pi: Pick<ExtensionApi, "pi"> = { pi: { settings } }
  let titleArguments: Parameters<typeof generateSessionTitle> | undefined
  const titleGenerator: typeof generateSessionTitle = async (...arguments_) => {
    titleArguments = arguments_
    return "Pull Request Review: Code Quality"
  }

  const label = await generateActivityLabel(
    "Review the pull request",
    context,
    pi,
    titleGenerator,
  )

  assert.equal(label, "Pull Request Review: Code Quality")
  assert.equal(titleArguments?.[0], "Review the pull request")
  assert.equal(titleArguments?.[1], modelRegistry)
  assert.equal(titleArguments?.[2], settings)
  assert.equal(titleArguments?.[3], "session")
  assert.match(titleArguments?.[6] ?? "", /1 to 48 Unicode letters or numbers/)
})
