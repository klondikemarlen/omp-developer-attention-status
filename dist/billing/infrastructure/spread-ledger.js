import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { lock } from "../../vendor/proper-lockfile.js";
import { parseStoredDeveloperCostConfig } from "../../billing/config/parser.js";
import {
  parseDeveloperCostState,
  serializeDeveloperCostState,
} from "../../billing/state/parser.js";
import { updateSpreadDeveloperCostStates } from "../../billing/operations/settle-shared-state.js";

export class SpreadBillingLedger {
  filePath;

  constructor(filePath) {
    this.filePath =
      filePath ??
      path.join(homedir(), ".omp", "project-time", "spread-billing.json");
  }

  async recordPrompt(sessionId, state, promptAtMs, config) {
    return this.update(sessionId, state, promptAtMs, config, "prompt");
  }

  async settle(sessionId, state, nowMs, config) {
    return this.update(sessionId, state, nowMs, config, "settle");
  }

  async update(sessionId, state, nowMs, config, updateKind) {
    return this.withLock(async () => {
      const ledger = await this.readLedger();
      const update = updateSpreadDeveloperCostStates(
        [...ledger.sessions].map(([id, entry]) => ({
          sessionId: id,
          state: entry.state,
          config: entry.config,
        })),
        ledger.settledThroughMs,
        sessionId,
        state,
        nowMs,
        config,
        updateKind === "prompt",
      );
      ledger.sessions = new Map(
        update.sessions.map((session) => [
          session.sessionId,
          { state: session.state, config: session.config },
        ]),
      );
      ledger.settledThroughMs = update.settledThroughMs;
      // ponytail: ledger grows with historical sessions; add persisted acknowledgements before pruning.
      await this.writeLedger(ledger);
      return update.state;
    });
  }

  async withLock(operation) {
    const parentPath = path.dirname(this.filePath);
    await mkdir(parentPath, { recursive: true });
    const release = await lock(this.filePath, {
      realpath: false,
      stale: 5_000,
      update: 2_500,
      retries: {
        retries: 10,
        factor: 1.5,
        minTimeout: 100,
        maxTimeout: 1_000,
      },
    });
    let operationFailed = false;
    try {
      return await operation();
    } catch (error) {
      operationFailed = true;
      throw error;
    } finally {
      try {
        await release();
      } catch (error) {
        if (!operationFailed) throw error;
      }
    }
  }

  async readLedger() {
    let content;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return {
          sessions: new Map(),
          settledThroughMs: 0,
        };
      }
      throw error;
    }
    let value;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error("Project Time shared billing state is unreadable.");
    }
    if (
      typeof value !== "object" ||
      value === null ||
      !("sessions" in value) ||
      typeof value.sessions !== "object" ||
      value.sessions === null ||
      Array.isArray(value.sessions)
    ) {
      throw new Error("Project Time shared billing state is invalid.");
    }
    const rawSettledThroughMs =
      "settledThroughMs" in value ? value.settledThroughMs : 0;
    if (
      typeof rawSettledThroughMs !== "number" ||
      !Number.isFinite(rawSettledThroughMs)
    ) {
      throw new Error("Project Time shared billing state is invalid.");
    }
    const sessions = new Map();
    for (const [sessionId, entry] of Object.entries(value.sessions)) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("state" in entry) ||
        !("config" in entry)
      ) {
        throw new Error("Project Time shared billing state is invalid.");
      }
      const config = parseStoredDeveloperCostConfig(entry.config);
      const state = parseDeveloperCostState(entry.state);
      if (config === undefined || state === undefined) {
        throw new Error("Project Time shared billing state is invalid.");
      }
      sessions.set(sessionId, { state, config });
    }
    return {
      sessions,
      settledThroughMs: rawSettledThroughMs,
    };
  }

  async writeLedger(ledger) {
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const sessions = Object.fromEntries(
      [...ledger.sessions].map(([sessionId, entry]) => [
        sessionId,
        { ...entry, state: serializeDeveloperCostState(entry.state) },
      ]),
    );
    const content = JSON.stringify({
      settledThroughMs: ledger.settledThroughMs,
      sessions,
    });
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, this.filePath);
  }
}
