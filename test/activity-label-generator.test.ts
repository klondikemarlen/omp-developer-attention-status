import assert from "node:assert/strict"
import test from "node:test"

import { generateActivity } from "../src/extension/activity-label-generator.js"
import type { ExtensionContext } from "../src/extension/types.js"

test("generates a status label and sanitized worklog narrative", async () => {
  const modelRegistry = {} as NonNullable<ExtensionContext["modelRegistry"]>
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

  const labelPrompts: string[] = []
  const titleGenerator = async (prompt: string) => {
    labelPrompts.push(prompt)
    return "Code Review"
  }

  const activity = await generateActivity(
    "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.",
    context,
    titleGenerator,
    async () => ({
      text: "Review PR #84, Capture activity narratives for downstream worklogs: verify typed persistence, legacy-log compatibility, and interval-duration access.",
      source: "generated",
    }),
  )

  assert.deepEqual(activity, {
    activity: "Code Review",
    narrative: {
      text: "Review PR #84, Capture activity narratives for downstream worklogs: verify typed persistence, legacy-log compatibility, and interval-duration access.",
      source: "generated",
    },
  })
  assert.equal(labelPrompts.length, 1)
  assert.equal(labelPrompts[0], "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.")
})
