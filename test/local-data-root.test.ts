import assert from "node:assert/strict"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { migrateProjectTimeDataRoot, prepareProjectTimeDataRoot } from "../src/extension/local-data-root.js"
import { ProjectTimeRuntime } from "../src/extension/runtime.js"

test("moves existing project time records on first session startup exactly once", async () => {
  const root = path.join(tmpdir(), `project-time-migration-${Date.now()}`)
  const oldRoot = path.join(root, "developer-attention-status")
  const newRoot = path.join(root, "project-time")
  const oldSpreadLedgerPath = path.join(root, "developer-cost-status", "spread-billing.json")
  const records = {
    attention: '{"type":"attention"}\n',
    ai: '{"type":"ai"}\n',
    descriptions: '{"description":"Project work"}\n',
    spread: '{"sessions":{}}',
  }

  try {
    await mkdir(oldRoot, { recursive: true, mode: 0o700 })
    await mkdir(path.dirname(oldSpreadLedgerPath), { recursive: true, mode: 0o700 })
    await Promise.all([
      writeFile(path.join(oldRoot, "attention-tokens.ndjson"), records.attention, { mode: 0o600 }),
      writeFile(path.join(oldRoot, "ai-intervals.ndjson"), records.ai, { mode: 0o600 }),
      writeFile(path.join(oldRoot, "session-descriptions.ndjson"), records.descriptions, { mode: 0o600 }),
      writeFile(oldSpreadLedgerPath, records.spread, { mode: 0o600 }),
    ])

    let migrationCalls = 0
    const handlers = new Map<string, (event: never, context: never) => Promise<void>>()
    const runtime = new ProjectTimeRuntime({
      appendEntry() {},
      on(event: string, handler: unknown) {
        handlers.set(event, handler as never)
      },
      registerCommand() {},
    } as never, {
      billableTimePath: newRoot,
      ledgerPath: path.join(newRoot, "spread-billing.json"),
      localDataMigration: async () => {
        migrationCalls += 1
        await migrateProjectTimeDataRoot(oldRoot, newRoot, oldSpreadLedgerPath)
        await prepareProjectTimeDataRoot(newRoot)
      },
      timeLogPath: path.join(newRoot, "time-log.json"),
    })
    runtime.register()

    const sessionStart = handlers.get("session_start")
    if (sessionStart === undefined) throw new Error("Missing session_start handler.")

    const context = {
      cwd: root,
      sessionManager: {
        getEntries: () => [],
        getHeader: () => null,
        getSessionId: () => "session",
      },
      ui: {
        notify() {},
        setStatus() {},
      },
    }
    await sessionStart({} as never, context as never)
    await sessionStart({} as never, context as never)

    assert.equal(migrationCalls, 1)

    const [attention, ai, descriptions, spread] = await Promise.all([
      readFile(path.join(newRoot, "attention-tokens.ndjson"), "utf8"),
      readFile(path.join(newRoot, "ai-intervals.ndjson"), "utf8"),
      readFile(path.join(newRoot, "session-descriptions.ndjson"), "utf8"),
      readFile(path.join(newRoot, "spread-billing.json"), "utf8"),
    ])
    assert.deepEqual([attention, ai, descriptions], [records.attention, records.ai, records.descriptions])
    assert.match(spread, /"session"/)
    assert.equal((await stat(newRoot)).mode & 0o777, 0o700)
    assert.equal((await stat(path.join(newRoot, "attention-tokens.ndjson"))).mode & 0o777, 0o600)
    await assert.rejects(readFile(path.join(oldRoot, "attention-tokens.ndjson")))
    await assert.rejects(readFile(oldSpreadLedgerPath))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("rejects data roots that would require a merge", async () => {
  const root = path.join(tmpdir(), `project-time-migration-conflict-${Date.now()}`)
  const oldRoot = path.join(root, "developer-attention-status")
  const newRoot = path.join(root, "project-time")

  try {
    await Promise.all([
      mkdir(oldRoot, { recursive: true, mode: 0o700 }),
      mkdir(newRoot, { recursive: true, mode: 0o700 }),
    ])

    await assert.rejects(
      migrateProjectTimeDataRoot(oldRoot, newRoot),
      /both .*developer-attention-status.*project-time exist/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
