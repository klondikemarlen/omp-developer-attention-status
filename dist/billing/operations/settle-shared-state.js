import { recordDeveloperPrompt } from "../../billing/operations/record-prompt.js";
import { settleDeveloperCostState } from "../../billing/operations/settle-state.js";

export function settleSpreadDeveloperCostStates(sessions, nowMs) {
  const activeWindows = sessions.flatMap(({ state }) =>
    activeWindowsFor(state),
  );
  return sessions.map((session) => ({
    ...session,
    state: settleDeveloperCostState(
      session.state,
      nowMs,
      session.config,
      activeWindows,
    ),
  }));
}

export function updateSpreadDeveloperCostStates(
  sessions,
  settledThroughMs,
  sessionId,
  state,
  nowMs,
  config,
  recordPrompt,
) {
  const settlementAtMs = Math.max(nowMs, settledThroughMs);
  const existingSession = sessions.find(
    (session) => session.sessionId === sessionId,
  );
  const currentState = existingSession?.state ?? { ...state };
  if (existingSession === undefined) {
    reconcileActiveState(currentState, settledThroughMs);
  }
  const settledSessions = settleSpreadDeveloperCostStates(
    [
      ...sessions.filter((session) => session.sessionId !== sessionId),
      { sessionId, state: currentState, config },
    ],
    settlementAtMs,
  );
  const settledSession = settledSessions.find(
    (session) => session.sessionId === sessionId,
  );
  if (settledSession === undefined) {
    throw new Error(`Project Time cannot settle session ${sessionId}.`);
  }
  const nextState = recordPrompt
    ? recordDeveloperPrompt(settledSession.state, settlementAtMs, config)
    : settledSession.state;
  if (recordPrompt) {
    nextState.lastPromptAtMs = Math.max(
      nowMs,
      settledSession.state.lastPromptAtMs ?? nowMs,
    );
  }
  return {
    sessions: settledSessions.map((session) =>
      session.sessionId === sessionId
        ? { ...session, state: nextState, config }
        : session,
    ),
    settledThroughMs: settlementAtMs,
    state: nextState,
  };
}

function activeWindowsFor(state) {
  if (state.activeStartAtMs === undefined || state.activeUntilMs === undefined)
    return [];
  return [{ startAtMs: state.activeStartAtMs, untilMs: state.activeUntilMs }];
}

function reconcileActiveState(state, settledThroughMs) {
  if (state.activeStartAtMs === undefined || state.activeUntilMs === undefined)
    return;
  const settledFromMs = state.lastSettledAtMs ?? state.activeStartAtMs;
  state.lastSettledAtMs = Math.max(settledFromMs, settledThroughMs);
}

export default settleSpreadDeveloperCostStates;
