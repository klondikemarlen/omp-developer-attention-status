import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import { mock, test } from "node:test"

import { parseDeveloperCostConfig } from "../src/billing/parse-developer-cost-config.js"
import { emptyDeveloperCostState } from "../src/billing/empty-developer-cost-state.js"
import { parseDeveloperCostState } from "../src/billing/parse-developer-cost-state.js"
import type { DeveloperCostState } from "../src/billing/index.js"
import { SpreadBillingLedger } from "../src/spread-billing-ledger.js"
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

test("bills one top-level session at the full $120 hourly rate", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const runtime = createExtensionRuntime({ loadConfig: loadFullRateConfig })
  const ctx = createContext(runtime, { parentSession: undefined, sessionId: "single" })
  mock.method(Date, "now", () => nowMs)

  try {
    await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)
    nowMs += 60_000
    await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)

    assert.equal(latestState(runtime).totalCost, "2")
    assert.equal(latestState(runtime).activeMilliseconds, 60_000)
  } finally {
    mock.restoreAll()
  }
})

test("splits simultaneous session billing across runtimes sharing one ledger", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const ledgerPath = temporaryLedgerPath()
  const first = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const second = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const firstCtx = createContext(first, { parentSession: undefined, sessionId: "first" })
  const secondCtx = createContext(second, { parentSession: undefined, sessionId: "second" })
  mock.method(Date, "now", () => nowMs)

  try {
    await first.handlers.get("before_agent_start")?.({ prompt: "first" } as never, firstCtx as never)
    await second.handlers.get("before_agent_start")?.({ prompt: "second" } as never, secondCtx as never)
    nowMs += 60_000
    await first.handlers.get("turn_end")?.({ type: "turn_end" } as never, firstCtx as never)
    await second.handlers.get("turn_end")?.({ type: "turn_end" } as never, secondCtx as never)

    assert.equal(latestState(first).totalCost, "1")
    assert.equal(latestState(second).totalCost, "1")
    assert.equal(latestState(first).activeMilliseconds, 60_000)
    assert.equal(latestState(second).activeMilliseconds, 60_000)
  } finally {
    mock.restoreAll()
  }
})

test("splits only the staggered overlap across runtimes sharing one ledger", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const ledgerPath = temporaryLedgerPath()
  const first = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const second = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const firstCtx = createContext(first, { parentSession: undefined, sessionId: "first" })
  const secondCtx = createContext(second, { parentSession: undefined, sessionId: "second" })
  mock.method(Date, "now", () => nowMs)

  try {
    await first.handlers.get("before_agent_start")?.({ prompt: "first" } as never, firstCtx as never)
    nowMs += 60_000
    await second.handlers.get("before_agent_start")?.({ prompt: "second" } as never, secondCtx as never)
    nowMs += 60_000
    await first.handlers.get("turn_end")?.({ type: "turn_end" } as never, firstCtx as never)
    await second.handlers.get("turn_end")?.({ type: "turn_end" } as never, secondCtx as never)

    assert.equal(latestState(first).totalCost, "3")
    assert.equal(latestState(second).totalCost, "1")
    assert.equal(latestState(first).activeMilliseconds, 120_000)
    assert.equal(latestState(second).activeMilliseconds, 60_000)
  } finally {
    mock.restoreAll()
  }
})

test("expires a session after its five-minute active window", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const runtime = createExtensionRuntime({ loadConfig: loadFullRateConfig })
  const ctx = createContext(runtime, { parentSession: undefined, sessionId: "expired" })
  mock.method(Date, "now", () => nowMs)

  try {
    await runtime.handlers.get("before_agent_start")?.({ prompt: "hello" } as never, ctx as never)
    nowMs += 6 * 60_000
    await runtime.handlers.get("turn_end")?.({ type: "turn_end" } as never, ctx as never)

    assert.deepEqual(latestState(runtime), {
      totalCost: "10",
      promptCount: 1,
      activeMilliseconds: 5 * 60_000,
      activeStartAtMs: undefined,
      activeUntilMs: undefined,
      lastSettledAtMs: undefined,
      lastPromptAtMs: start,
    })
  } finally {
    mock.restoreAll()
  }
})

test("resumes stale persisted session state from its settled shared ledger entry", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const ledgerPath = temporaryLedgerPath()
  const first = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const second = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const firstCtx = createContext(first, { parentSession: undefined, sessionId: "first" })
  const secondCtx = createContext(second, { parentSession: undefined, sessionId: "second" })
  mock.method(Date, "now", () => nowMs)

  try {
    await first.handlers.get("before_agent_start")?.({ prompt: "first" } as never, firstCtx as never)
    await second.handlers.get("before_agent_start")?.({ prompt: "second" } as never, secondCtx as never)
    nowMs += 60_000
    await second.handlers.get("turn_end")?.({ type: "turn_end" } as never, secondCtx as never)

    const resumed = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
    const resumedCtx = createContext(resumed, {
      parentSession: undefined,
      sessionId: "first",
      allEntries: first.entries,
    })
    await resumed.handlers.get("session_start")?.({ reason: "resume" } as never, resumedCtx as never)

    assert.equal(latestState(first).totalCost, "0")
    assert.equal(resumed.statusText, "dim:$1.00 (dev)")
  } finally {
    mock.restoreAll()
  }
})

test("does not bill a child runtime against a shared ledger", async () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  let nowMs = start
  const ledgerPath = temporaryLedgerPath()
  const parent = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const child = createExtensionRuntime({ ledgerPath, loadConfig: loadFullRateConfig })
  const parentCtx = createContext(parent, { parentSession: undefined, sessionId: "parent" })
  const childCtx = createContext(child, {
    parentSession: "/tmp/parent.jsonl",
    sessionId: "child",
  })
  mock.method(Date, "now", () => nowMs)

  try {
    await parent.handlers.get("before_agent_start")?.({ prompt: "parent" } as never, parentCtx as never)
    await child.handlers.get("before_agent_start")?.({ prompt: "child" } as never, childCtx as never)
    nowMs += 60_000
    await parent.handlers.get("turn_end")?.({ type: "turn_end" } as never, parentCtx as never)

    assert.equal(latestState(parent).totalCost, "2")
    assert.equal(child.entries.length, 0)
    assert.equal(child.statusText, undefined)
  } finally {
    mock.restoreAll()
  }
})


test("starts a late prompt at the shared ledger settlement frontier", async () => {
  const ledger = new SpreadBillingLedger(temporaryLedgerPath())
  const config = await loadFullRateConfig()
  const first = await ledger.recordPrompt("first", emptyDeveloperCostState(), 0, config)

  await ledger.settle("first", first, 101, config)
  const late = await ledger.recordPrompt("late", emptyDeveloperCostState(), 100, config)
  const settledLate = await ledger.settle("late", late, 102, config)

  assert.equal(late.activeStartAtMs, 101)
  assert.equal(late.lastSettledAtMs, 101)
  assert.equal(late.lastPromptAtMs, 100)
  assert.equal(late.activeMilliseconds, 0)
  assert.equal(settledLate.activeMilliseconds, 1)
  assert.equal(settledLate.totalCost, "0.00001666666666666667")
})

test("does not bill restored active state before the ledger settlement frontier", async () => {
  const ledger = new SpreadBillingLedger(temporaryLedgerPath())
  const config = await loadFullRateConfig()
  const first = await ledger.recordPrompt("first", emptyDeveloperCostState(), 0, config)
  const settledFirst = await ledger.settle("first", first, 60_000, config)
  const restored = parseDeveloperCostState({
    totalCost: "0",
    promptCount: 1,
    activeMilliseconds: 0,
    activeStartAtMs: 0,
    activeUntilMs: 5 * 60_000,
    lastSettledAtMs: 0,
    lastPromptAtMs: 0,
  })
  assert.ok(restored)

  const settledRestored = await ledger.settle("restored", restored, 60_000, config)

  assert.equal(settledFirst.totalCost, "2")
  assert.equal(settledRestored.totalCost, "0")
  assert.equal(settledRestored.activeMilliseconds, 0)
  assert.equal(Number(settledFirst.totalCost) + Number(settledRestored.totalCost), 2)
})

test("preserves concurrent sessions in the shared ledger", async () => {
  const ledgerPath = temporaryLedgerPath()
  const firstLedger = new SpreadBillingLedger(ledgerPath)
  const secondLedger = new SpreadBillingLedger(ledgerPath)
  const config = await loadFullRateConfig()
  const [firstPrompt, secondPrompt] = await Promise.all([
    firstLedger.recordPrompt("first", emptyDeveloperCostState(), 0, config),
    secondLedger.recordPrompt("second", emptyDeveloperCostState(), 0, config),
  ])

  const [first, second] = await Promise.all([
    firstLedger.settle("first", firstPrompt, 60_000, config),
    secondLedger.settle("second", secondPrompt, 60_000, config),
  ])

  assert.equal(first.totalCost, "1")
  assert.equal(second.totalCost, "1")
})

test("keeps delayed same-session prompt timestamps monotonic in the shared ledger", async () => {
  const ledgerPath = temporaryLedgerPath()
  const firstLedger = new SpreadBillingLedger(ledgerPath)
  const delayedLedger = new SpreadBillingLedger(ledgerPath)
  const config = await loadFullRateConfig()

  await firstLedger.recordPrompt("session", emptyDeveloperCostState(), 100, config)
  const delayed = await delayedLedger.recordPrompt("session", emptyDeveloperCostState(), 0, config)

  assert.equal(delayed.lastPromptAtMs, 100)
})

type RuntimeOptions = {
  ledgerPath?: string
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
    ledgerPath: options.ledgerPath ?? temporaryLedgerPath(),
    loadConfig: options.loadConfig ?? (async () => parseDeveloperCostConfig()),
  })

  return runtime
}

function temporaryLedgerPath(): string {
  return path.join(tmpdir(), `developer-cost-extension-test-${randomUUID()}.json`)
}

async function loadFullRateConfig() {
  return parseDeveloperCostConfig({
    monthlySalary: 20_800,
    hoursPerWeek: 40,
    weeksPerYear: 52,
    activeWindowMinutes: 5,
    refreshIntervalSeconds: 60,
  })
}

function latestState(runtime: Runtime): DeveloperCostState {
  const entry = runtime.entries.at(-1)
  assert.ok(entry)
  assert.equal(entry.customType, DEVELOPER_COST_STATE_ENTRY)
  const state = parseDeveloperCostState(entry.data)
  assert.ok(state)
  return state
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
