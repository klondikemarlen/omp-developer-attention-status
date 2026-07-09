import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import path from "node:path"
import { mock, test } from "node:test"

import { parseDeveloperCostConfig } from "../src/billing/parse-developer-cost-config.js"
import type { ConfigLoader } from "../src/extension-types.js"
import developerCostStatusExtension, { type ExtensionApi } from "../src/index.js"
import { DEVELOPER_COST_STATE_ENTRY } from "../src/session-state.js"

type RegisteredHandler = (event: never, ctx: never) => Promise<void>
type RegisteredCommand = { handler: (args: string, ctx: never) => Promise<void> }
type Runtime = {
  commands: Map<string, RegisteredCommand>
  entries: Array<{ type: "custom"; customType: string; data?: unknown }>
  handlers: Map<string, RegisteredHandler>
  notifications: Array<{ message: string; type?: "info" | "warning" | "error" }>
  statusText?: string
}

test("persists one attention count for a top-level prompt", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const runtime = createExtensionRuntime()
  const ctx = createContext(runtime, { parentSession: undefined })
  mock.method(Date, "now", () => start)

  try {
    await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)

    assert.deepEqual(runtime.entries, [
      {
        type: "custom",
        customType: DEVELOPER_COST_STATE_ENTRY,
        data: {
          totalCost: "0",
          promptCount: 1,
          activeMilliseconds: 0,
          activeStartAtMs: start,
          activeUntilMs: start + 5 * 60 * 1000,
          lastSettledAtMs: start,
          lastPromptAtMs: start,
        },
      },
    ])
    assert.equal(runtime.statusText, "dim:$0.00 (dev)")
  } finally {
    mock.restoreAll()
  }
})

test("feature scenario tracks visible developer cost across prompts and idle time", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const runtime = createExtensionRuntime({
    loadConfig: async () =>
      parseDeveloperCostConfig({
        monthlySalary: 100_000 / 12,
        hoursPerWeek: 35,
        weeksPerYear: 52,
        activeWindowMinutes: 5,
        refreshIntervalSeconds: 60,
      }),
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  mock.method(Date, "now", () => nowMs)
  const setNow = (nextNowMs: number) => {
    nowMs = nextNowMs
  }

  try {
    setNow(start)
    await runtime.handlers.get("before_agent_start")?.({ prompt: "first prompt" } as never, ctx as never)
    assert.equal(runtime.statusText, "dim:$0.00 (dev)")

    setNow(start + 2 * 60 * 1000)
    await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)
    assert.equal(runtime.statusText, "dim:$1.83 (dev)")

    setNow(start + 4 * 60 * 1000)
    await runtime.handlers.get("before_agent_start")?.({ prompt: "follow-up prompt" } as never, ctx as never)
    assert.equal(runtime.statusText, "dim:$3.66 (dev)")

    setNow(start + 9 * 60 * 1000)
    await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)
    assert.equal(runtime.statusText, "dim:$8.24 (dev)")

    setNow(start + 10 * 60 * 1000)
    await runtime.commands.get("developer-cost-status")?.handler("", ctx as never)
    assert.deepEqual(runtime.notifications.at(-1), {
      message: "$8.24 (dev)",
      type: "info",
    })
  } finally {
    mock.restoreAll()
  }
})

test("reports a detailed attention summary without changing the compact status", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const runtime = createExtensionRuntime({
    loadConfig: async () =>
      parseDeveloperCostConfig({
        monthlySalary: 100_000 / 12,
        hoursPerWeek: 35,
        weeksPerYear: 52,
        activeWindowMinutes: 5,
        refreshIntervalSeconds: 60,
      }),
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  mock.method(Date, "now", () => nowMs)

  try {
    await runtime.handlers.get("before_agent_start")?.({ prompt: "first prompt" } as never, ctx as never)

    nowMs = start + 2 * 60 * 1000
    await runtime.commands.get("developer-cost-status")?.handler("summary", ctx as never)

    assert.deepEqual(runtime.notifications, [
      {
        message:
          "Developer cost summary\nSession: session-1\nCost: $1.83 (dev)\nActive time: 2m 0s\nPrompt count: 1\nLast prompt: 2m 0s ago (2026-01-01T12:00:00.000Z)",
        type: "info",
      },
    ])
    assert.equal(runtime.statusText, "dim:$0.00 (dev)")
  } finally {
    mock.restoreAll()
  }
})

test("reports an unavailable last prompt for an unrenderable persisted timestamp", async () => {
  const runtime = createExtensionRuntime()
  const ctx = createContext(runtime, {
    parentSession: undefined,
    allEntries: [
      {
        type: "custom",
        customType: DEVELOPER_COST_STATE_ENTRY,
        data: {
          totalCost: "12.34",
          promptCount: 1,
          activeMilliseconds: 60_000,
          lastSettledAtMs: Date.UTC(2026, 0, 1, 12, 0, 0),
          lastPromptAtMs: 9e15,
        },
      },
    ],
  })

  await assert.doesNotReject(
    runtime.commands.get("developer-cost-status")!.handler("summary", ctx as never),
  )
  assert.deepEqual(runtime.notifications, [
    {
      message:
        "Developer cost summary\nSession: session-1\nCost: $12.34 (dev)\nActive time: 1m 0s\nPrompt count: 1\nLast prompt: unavailable",
      type: "info",
    },
  ])
})

test("passes context cwd to the config loader", async () => {
  const loadedCwds: string[] = []
  const loadConfig: ConfigLoader = async (cwd) => {
    loadedCwds.push(cwd)

    return parseDeveloperCostConfig()
  }
  const runtime = createExtensionRuntime({ loadConfig })
  const ctx = createContext(runtime, { parentSession: undefined })

  await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)

  assert.deepEqual(loadedCwds, [ctx.cwd])
})

test("restores persisted state from full session history", async () => {
  const runtime = createExtensionRuntime()
  const ctx = createContext(runtime, {
    parentSession: undefined,
    branchEntries: [],
    allEntries: [
      {
        type: "custom",
        customType: DEVELOPER_COST_STATE_ENTRY,
        data: { totalCost: "12.34" },
      },
    ],
  })

  await runtime.commands.get("developer-cost-status")?.handler("", ctx as never)

  assert.deepEqual(runtime.notifications, [
    {
      message: "$12.34 (dev)",
      type: "info",
    },
  ])
})

test("activates persisted state from full session history", async () => {
  const runtime = createExtensionRuntime()
  const now = Date.now()
  const ctx = createContext(runtime, {
    parentSession: undefined,
    branchEntries: [],
    allEntries: [
      {
        type: "custom",
        customType: DEVELOPER_COST_STATE_ENTRY,
        data: {
          totalCost: "12.34",
          activeStartAtMs: now,
          activeUntilMs: now + 60_000,
          lastSettledAtMs: now,
        },
      },
    ],
  })

  await runtime.handlers.get("session_start")?.({ reason: "start" } as never, ctx as never)

  assert.equal(runtime.statusText, "dim:$12.34 (dev)")
})

test("skips billing for child sessions without clearing parent prompt status", async () => {
  const runtime = createExtensionRuntime()
  const parentCtx = createContext(runtime, {
    parentSession: undefined,
    sessionId: "parent-session",
  })
  const childCtx = createContext(runtime, {
    parentSession: "/tmp/parent.jsonl",
    sessionId: "child-session",
  })

  await runtime.handlers.get("before_agent_start")?.(
    { prompt: "parent prompt" } as never,
    parentCtx as never,
  )
  await runtime.handlers.get("before_agent_start")?.(
    { prompt: "child prompt" } as never,
    childCtx as never,
  )

  assert.equal(runtime.entries.length, 1)
  assert.equal(runtime.statusText, "dim:$0.00 (dev)")
})

test("skips child session activation without clearing parent status", async () => {
  const runtime = createExtensionRuntime()
  const parentCtx = createContext(runtime, {
    parentSession: undefined,
    sessionId: "parent-session",
  })
  const childCtx = createContext(runtime, {
    parentSession: "/tmp/parent.jsonl",
    sessionId: "child-session",
  })

  await runtime.handlers.get("before_agent_start")?.(
    { prompt: "parent prompt" } as never,
    parentCtx as never,
  )
  await runtime.handlers.get("session_start")?.({ reason: "start" } as never, childCtx as never)

  assert.equal(runtime.entries.length, 1)
  assert.equal(runtime.statusText, "dim:$0.00 (dev)")
})

test("reports child sessions from the status command", async () => {
  const runtime = createExtensionRuntime()
  const ctx = createContext(runtime, { parentSession: "/tmp/parent.jsonl" })

  await runtime.commands.get("developer-cost-status")?.handler("", ctx as never)

  assert.deepEqual(runtime.notifications, [
    {
      message: "Developer cost status is only tracked for top-level sessions.",
      type: "info",
    },
  ])
})

test("reports config errors from the status command", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })

  await runtime.commands.get("developer-cost-status")?.handler("", ctx as never)

  assert.deepEqual(runtime.notifications, [
    {
      message: "Developer cost status config error: broken config",
      type: "error",
    },
  ])
})

test("clears status and skips billing when prompt config load fails", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  runtime.statusText = "dim:$1.23 (dev)"

  await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)

  assert.equal(runtime.entries.length, 0)
  assert.equal(runtime.statusText, undefined)
  assert.deepEqual(runtime.notifications, [
    {
      message: "Developer cost status config error: broken config",
      type: "error",
    },
  ])
})

test("clears status and skips turn-end persistence when config load fails", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  runtime.statusText = "dim:$1.23 (dev)"

  await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)

  assert.equal(runtime.entries.length, 0)
  assert.equal(runtime.statusText, undefined)
  assert.deepEqual(runtime.notifications, [
    {
      message: "Developer cost status config error: broken config",
      type: "error",
    },
  ])
})

test("clears status when session activation config load fails", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  runtime.statusText = "dim:$1.23 (dev)"

  await runtime.handlers.get("session_start")?.({ reason: "start" } as never, ctx as never)

  assert.equal(runtime.entries.length, 0)
  assert.equal(runtime.statusText, undefined)
  assert.deepEqual(runtime.notifications, [
    {
      message: "Developer cost status config error: broken config",
      type: "error",
    },
  ])
})

test("clears status when session switch config load fails", async () => {
  const runtime = createExtensionRuntime({
    loadConfig: async () => {
      throw new Error("broken config")
    },
  })
  const ctx = createContext(runtime, { parentSession: undefined })
  runtime.statusText = "dim:$1.23 (dev)"

  await runtime.handlers.get("session_switch")?.({ reason: "switch" } as never, ctx as never)

  assert.equal(runtime.entries.length, 0)
  assert.equal(runtime.statusText, undefined)
  assert.deepEqual(runtime.notifications, [
    {
      message: "Developer cost status config error: broken config",
      type: "error",
    },
  ])
})

type RuntimeOptions = {
  loadConfig?: ConfigLoader
}

function createExtensionRuntime(options: RuntimeOptions = {}): Runtime {
  const runtime: Runtime = {
    commands: new Map(),
    entries: [],
    handlers: new Map(),
    notifications: [],
  }
  const pi: ExtensionApi = {
    registerCommand(name, options) {
      runtime.commands.set(name, { handler: options.handler as RegisteredCommand["handler"] })
    },
    on(event, handler) {
      runtime.handlers.set(event, handler as RegisteredHandler)
    },
    appendEntry(customType, data) {
      runtime.entries.push({ type: "custom", customType, data })
    },
  }

  developerCostStatusExtension(pi, {
    loadConfig: options.loadConfig ?? (async () => parseDeveloperCostConfig()),
  })

  return runtime
}

function createContext(
  runtime: Runtime,
  options: {
    parentSession?: string
    branchEntries?: Runtime["entries"]
    allEntries?: Runtime["entries"]
    sessionId?: string
  },
) {
  return {
    cwd: path.join(tmpdir(), "developer-cost-extension-test"),
    sessionManager: {
      getSessionId() {
        return options.sessionId ?? "session-1"
      },
      getHeader() {
        return {
          parentSession: options.parentSession,
        }
      },
      getBranch() {
        return options.branchEntries ?? runtime.entries
      },
      getEntries() {
        return options.allEntries ?? runtime.entries
      },
    },
    ui: {
      notify(message: string, type?: "info" | "warning" | "error") {
        runtime.notifications.push({ message, type })
      },
      setStatus(_key: string, text: string | undefined) {
        runtime.statusText = text
      },
      theme: {
        fg(color: string, text: string) {
          return `${color}:${text}`
        },
      },
    },
  }
}
