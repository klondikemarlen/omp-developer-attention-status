import { mkdir, readFile, rename, rmdir, stat, utimes, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import {
  parseDeveloperCostState,
  recordDeveloperPrompt,
  settleSpreadDeveloperCostStates,
  type DeveloperCostConfig,
  type DeveloperCostState,
} from "./billing/index.js"

type LedgerSession = {
  state: DeveloperCostState
  config: DeveloperCostConfig
}

type LedgerState = {
  sessions: Map<string, LedgerSession>
  settledThroughMs: number
}

type UpdateKind = "prompt" | "settle"

// ponytail: ledger writes are short; use OS advisory locks if they become long-running.
const LOCK_STALE_MS = 60_000
const LOCK_UPDATE_MS = 30_000
const LOCK_RETRY_MIN_MS = 100
const LOCK_RETRY_MAX_MS = 1_000

export class SpreadBillingLedger {
  private readonly filePath: string

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(
      homedir(),
      ".omp",
      "developer-cost-status",
      "spread-billing.json",
    )
  }

  async recordPrompt(
    sessionId: string,
    state: DeveloperCostState,
    promptAtMs: number,
    config: DeveloperCostConfig,
  ): Promise<DeveloperCostState> {
    return this.update(sessionId, state, promptAtMs, config, "prompt")
  }

  async settle(
    sessionId: string,
    state: DeveloperCostState,
    nowMs: number,
    config: DeveloperCostConfig,
  ): Promise<DeveloperCostState> {
    return this.update(sessionId, state, nowMs, config, "settle")
  }

  private async update(
    sessionId: string,
    state: DeveloperCostState,
    nowMs: number,
    config: DeveloperCostConfig,
    updateKind: UpdateKind,
  ): Promise<DeveloperCostState> {
    return this.withLock(async () => {
      const ledger = await this.readLedger()
      const settlementAtMs = Math.max(nowMs, ledger.settledThroughMs)
      const existingSession = ledger.sessions.get(sessionId)
      const currentState = existingSession?.state ?? { ...state }

      if (
        existingSession === undefined &&
        currentState.activeStartAtMs !== undefined &&
        currentState.activeUntilMs !== undefined
      ) {
        const settledFromMs = currentState.lastSettledAtMs ?? currentState.activeStartAtMs
        currentState.lastSettledAtMs = Math.max(settledFromMs, ledger.settledThroughMs)
      }

      ledger.sessions.set(sessionId, {
        state: currentState,
        config,
      })

      const settledSessions = settleSpreadDeveloperCostStates(
        [...ledger.sessions].map(([id, entry]) => ({
          sessionId: id,
          state: entry.state,
          config: entry.config,
        })),
        settlementAtMs,
      )
      ledger.sessions.clear()
      for (const settledSession of settledSessions) {
        ledger.sessions.set(settledSession.sessionId, {
          state: settledSession.state,
          config: settledSession.config,
        })
      }
      ledger.settledThroughMs = settlementAtMs

      const settledSession = ledger.sessions.get(sessionId)
      if (settledSession === undefined) {
        throw new Error(`Developer cost status cannot settle session ${sessionId}.`)
      }

      let nextState = settledSession.state
      if (updateKind === "prompt") {
        nextState = recordDeveloperPrompt(settledSession.state, settlementAtMs, config)
        nextState.lastPromptAtMs = Math.max(
          nowMs,
          settledSession.state.lastPromptAtMs ?? nowMs,
        )
      }
      ledger.sessions.set(sessionId, { state: nextState, config })

      // ponytail: ledger grows with historical sessions; add persisted acknowledgements before pruning.
      await this.writeLedger(ledger)

      return nextState
    })
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const parentPath = path.dirname(this.filePath)
    const lockPath = `${this.filePath}.lock`
    await mkdir(parentPath, { recursive: true })
    const lock = await acquireLock(lockPath)

    let renewal: Promise<void> | undefined
    let renewalError: Error | undefined
    const renewalTimer = setInterval(() => {
      if (renewal !== undefined) return

      renewal = renewLock(lock)
        .catch((error: unknown) => {
          renewalError ??= asError(error)
        })
        .finally(() => {
          renewal = undefined
        })
    }, LOCK_UPDATE_MS)
    renewalTimer.unref()
    let operationFailed = false

    try {
      const result = await operation()
      await renewal
      if (renewalError !== undefined) throw renewalError
      await renewLock(lock)
      return result
    } catch (error) {
      operationFailed = true
      throw error
    } finally {
      clearInterval(renewalTimer)
      await renewal
      try {
        await releaseLock(lock)
      } catch (error) {
        if (!operationFailed) throw error
      }
    }
  }

  private async readLedger(): Promise<LedgerState> {
    let content: string

    try {
      content = await readFile(this.filePath, "utf8")
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {
          sessions: new Map(),
          settledThroughMs: 0,
        }
      }

      throw error
    }

    let value: unknown
    try {
      value = JSON.parse(content)
    } catch {
      throw new Error("Developer cost status spread billing state is unreadable.")
    }

    if (
      typeof value !== "object" ||
      value === null ||
      !("sessions" in value) ||
      typeof value.sessions !== "object" ||
      value.sessions === null ||
      Array.isArray(value.sessions)
    ) {
      throw new Error("Developer cost status spread billing state is invalid.")
    }

    const rawSettledThroughMs = "settledThroughMs" in value ? value.settledThroughMs : 0
    if (typeof rawSettledThroughMs !== "number" || !Number.isFinite(rawSettledThroughMs)) {
      throw new Error("Developer cost status spread billing state is invalid.")
    }

    const sessions = new Map<string, LedgerSession>()
    for (const [sessionId, entry] of Object.entries(value.sessions)) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("state" in entry) ||
        !("config" in entry) ||
        !isStoredConfig(entry.config)
      ) {
        throw new Error("Developer cost status spread billing state is invalid.")
      }

      const state = parseDeveloperCostState(entry.state)
      if (state === undefined) {
        throw new Error("Developer cost status spread billing state is invalid.")
      }

      sessions.set(sessionId, {
        state,
        config: entry.config,
      })
    }

    return {
      sessions,
      settledThroughMs: rawSettledThroughMs,
    }
  }

  private async writeLedger(ledger: LedgerState): Promise<void> {
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    const sessions = Object.fromEntries(ledger.sessions)
    const content = JSON.stringify({
      settledThroughMs: ledger.settledThroughMs,
      sessions,
    })

    await writeFile(temporaryPath, content)
    await rename(temporaryPath, this.filePath)
  }
}

function isStoredConfig(value: unknown): value is DeveloperCostConfig {
  if (typeof value !== "object" || value === null) return false

  if (
    !("monthlySalary" in value) ||
    !("hoursPerWeek" in value) ||
    !("weeksPerYear" in value) ||
    !("activeWindowMinutes" in value) ||
    !("refreshIntervalSeconds" in value) ||
    !("label" in value)
  ) {
    return false
  }

  const monthlySalary = value.monthlySalary
  const hoursPerWeek = value.hoursPerWeek
  const weeksPerYear = value.weeksPerYear
  const activeWindowMinutes = value.activeWindowMinutes
  const refreshIntervalSeconds = value.refreshIntervalSeconds
  const label = value.label

  return (
    typeof monthlySalary === "number" &&
    Number.isFinite(monthlySalary) &&
    monthlySalary > 0 &&
    typeof hoursPerWeek === "number" &&
    Number.isFinite(hoursPerWeek) &&
    hoursPerWeek > 0 &&
    typeof weeksPerYear === "number" &&
    Number.isFinite(weeksPerYear) &&
    weeksPerYear > 0 &&
    typeof activeWindowMinutes === "number" &&
    Number.isFinite(activeWindowMinutes) &&
    activeWindowMinutes > 0 &&
    typeof refreshIntervalSeconds === "number" &&
    Number.isFinite(refreshIntervalSeconds) &&
    refreshIntervalSeconds > 0 &&
    typeof label === "string" &&
    label.length > 0
  )
}

type LedgerLock = {
  path: string
  updatedAtMs: number
}

async function acquireLock(lockPath: string): Promise<LedgerLock> {
  let retryDelayMs = LOCK_RETRY_MIN_MS

  while (true) {
    try {
      await mkdir(lockPath)
      return updateLockTimestamp(lockPath)
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error
    }

    let lockModifiedAtMs: number
    try {
      const lockStats = await stat(lockPath)
      lockModifiedAtMs = lockStats.mtimeMs
    } catch (error) {
      if (errorCode(error) === "ENOENT") continue
      throw error
    }

    if (Date.now() - lockModifiedAtMs >= LOCK_STALE_MS) {
      try {
        await rmdir(lockPath)
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error
      }
      continue
    }

    await delay(retryDelayMs)
    retryDelayMs = Math.min(retryDelayMs * 1.5, LOCK_RETRY_MAX_MS)
  }
}

async function renewLock(lock: LedgerLock): Promise<void> {
  await assertLockOwner(lock)
  const updatedLock = await updateLockTimestamp(lock.path)
  lock.updatedAtMs = updatedLock.updatedAtMs
}

async function releaseLock(lock: LedgerLock): Promise<void> {
  await assertLockOwner(lock)
  await rmdir(lock.path)
}

async function assertLockOwner(lock: LedgerLock): Promise<void> {
  const lockStats = await stat(lock.path)
  if (lockStats.mtimeMs !== lock.updatedAtMs) {
    throw new Error("Developer cost status spread billing lock is no longer owned.")
  }
}

async function updateLockTimestamp(lockPath: string): Promise<LedgerLock> {
  const now = new Date()
  await utimes(lockPath, now, now)
  const lockStats = await stat(lockPath)

  return {
    path: lockPath,
    updatedAtMs: lockStats.mtimeMs,
  }
}


function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined

  const { code } = error
  return typeof code === "string" ? code : undefined
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
