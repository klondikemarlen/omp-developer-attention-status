import { recordDeveloperPrompt } from "@/billing/operations/record-prompt.js"
import {
  settleDeveloperCostState,
  type ActiveDeveloperCostWindow,
} from "@/billing/operations/settle-state.js"
import type { DeveloperCostConfig } from "@/billing/config/model.js"
import type { DeveloperCostState } from "@/billing/state/model.js"

export type SpreadDeveloperCostSession = {
  sessionId: string
  state: DeveloperCostState
  config: DeveloperCostConfig
}

export type SpreadDeveloperCostUpdate = {
  sessions: SpreadDeveloperCostSession[]
  settledThroughMs: number
  state: DeveloperCostState
}

export function settleSpreadDeveloperCostStates(
  sessions: readonly SpreadDeveloperCostSession[],
  nowMs: number,
): SpreadDeveloperCostSession[] {
  const activeWindows = sessions.flatMap(({ state }) => activeWindowsFor(state))

  return sessions.map((session) => ({
    ...session,
    state: settleDeveloperCostState(session.state, nowMs, session.config, activeWindows),
  }))
}

export function updateSpreadDeveloperCostStates(
  sessions: readonly SpreadDeveloperCostSession[],
  settledThroughMs: number,
  sessionId: string,
  state: DeveloperCostState,
  nowMs: number,
  config: DeveloperCostConfig,
  recordPrompt: boolean,
): SpreadDeveloperCostUpdate {
  const settlementAtMs = Math.max(nowMs, settledThroughMs)
  const existingSession = sessions.find((session) => session.sessionId === sessionId)
  const currentState = existingSession?.state ?? { ...state }

  if (existingSession === undefined) {
    reconcileActiveState(currentState, settledThroughMs)
  }

  const settledSessions = settleSpreadDeveloperCostStates([
    ...sessions.filter((session) => session.sessionId !== sessionId),
    { sessionId, state: currentState, config },
  ], settlementAtMs)
  const settledSession = settledSessions.find((session) => session.sessionId === sessionId)
  if (settledSession === undefined) {
    throw new Error(`Project Time cannot settle session ${sessionId}.`)
  }

  const nextState = recordPrompt
    ? recordDeveloperPrompt(settledSession.state, settlementAtMs, config)
    : settledSession.state
  if (recordPrompt) {
    nextState.lastPromptAtMs = Math.max(nowMs, settledSession.state.lastPromptAtMs ?? nowMs)
  }

  return {
    sessions: settledSessions.map((session) => (
      session.sessionId === sessionId
        ? { ...session, state: nextState, config }
        : session
    )),
    settledThroughMs: settlementAtMs,
    state: nextState,
  }
}

function activeWindowsFor(state: DeveloperCostState): ActiveDeveloperCostWindow[] {
  if (state.activeStartAtMs === undefined || state.activeUntilMs === undefined) return []

  return [{ startAtMs: state.activeStartAtMs, untilMs: state.activeUntilMs }]
}

function reconcileActiveState(state: DeveloperCostState, settledThroughMs: number): void {
  if (state.activeStartAtMs === undefined || state.activeUntilMs === undefined) return

  const settledFromMs = state.lastSettledAtMs ?? state.activeStartAtMs
  state.lastSettledAtMs = Math.max(settledFromMs, settledThroughMs)
}

export default settleSpreadDeveloperCostStates
