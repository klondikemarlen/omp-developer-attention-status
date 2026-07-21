import assert from "node:assert/strict"
import test from "node:test"

import {
  generateActivityNarrative,
  type ActivityNarrativeCompletion,
} from "../src/extension/activity-narrative-generator.js"
import type { ExtensionContext } from "../src/extension/types.js"

test("preserves detailed completion text for a source-grounded narrative", async () => {
  const requests: Parameters<ActivityNarrativeCompletion>[] = []
  const complete: ActivityNarrativeCompletion = async (...arguments_) => {
    requests.push(arguments_)
    return {
      stopReason: "stop",
      content: [{ type: "text", text: "Review PR #84: capture activity narratives.\nVerify typed persistence, legacy-log compatibility, and interval-duration access." }],
    }
  }
  const context = {
    cwd: "/project",
    ui: {
      notify() {},
      setStatus() {},
      theme: { fg(_color: string, text: string) { return text } },
    },
    sessionManager: {
      getSessionId: () => "session",
      getHeader: () => null,
      getEntries: () => [],
    },
    model: {} as NonNullable<ExtensionContext["model"]>,
    modelRegistry: {
      getApiKey: async () => "key",
      resolver: () => () => "key",
    },
  } as unknown as ExtensionContext

  const narrative = await generateActivityNarrative(
    "Review PR #84: Capture activity narratives for downstream worklogs, including typed persistence, legacy-log compatibility, and interval-duration access.",
    context,
    complete,
  )

  assert.deepEqual(narrative, {
    text: "Review PR #84: capture activity narratives.\nVerify typed persistence, legacy-log compatibility, and interval-duration access.",
    source: "generated",
  })
  assert.equal(requests.length, 1)
  assert.match(requests[0]?.[1].systemPrompt?.[0] ?? "", /up to 2,000 characters/)
  assert.equal(requests[0]?.[2].maxTokens, 1_500)
})

test("uses the current session model when the event model is absent", async () => {
  const model = {} as NonNullable<ExtensionContext["model"]>
  const context = {
    cwd: "/project",
    ui: {
      notify() {},
      setStatus() {},
      theme: { fg(_color: string, text: string) { return text } },
    },
    sessionManager: {
      getSessionId: () => "session",
      getHeader: () => null,
      getEntries: () => [],
    },
    models: { current: () => model },
    modelRegistry: {
      getApiKey: async (candidate: unknown) => {
        assert.equal(candidate, model)
        return "key"
      },
      resolver: (candidate: unknown) => {
        assert.equal(candidate, model)
        return () => "key"
      },
    },
  } as unknown as ExtensionContext

  const narrative = await generateActivityNarrative(
    "Verify model fallback.",
    context,
    async (candidate) => {
      assert.equal(candidate, model)
      return {
        stopReason: "stop",
        content: [{ type: "text", text: "Verified model fallback." }],
      }
    },
  )

  assert.deepEqual(narrative, {
    text: "Verified model fallback.",
    source: "generated",
  })
})

test("resolves the configured title model when lifecycle context has none", async () => {
  const model = {} as NonNullable<ExtensionContext["model"]>
  const context = {
    cwd: "/project",
    ui: {
      notify() {},
      setStatus() {},
      theme: { fg(_color: string, text: string) { return text } },
    },
    sessionManager: {
      getSessionId: () => "session",
      getHeader: () => null,
      getEntries: () => [],
    },
    models: {
      current: () => undefined,
      resolve: (role: string) => role === "@tiny" ? model : undefined,
    },
    modelRegistry: {
      getApiKey: async () => "key",
      resolver: () => () => "key",
    },
  } as unknown as ExtensionContext

  const narrative = await generateActivityNarrative(
    "Verify configured model resolution.",
    context,
    async (candidate) => {
      assert.equal(candidate, model)
      return {
        stopReason: "stop",
        content: [{ type: "text", text: "Verified configured model resolution." }],
      }
    },
  )

  assert.deepEqual(narrative, {
    text: "Verified configured model resolution.",
    source: "generated",
  })
})
