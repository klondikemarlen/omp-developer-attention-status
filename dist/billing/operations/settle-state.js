import { costForActiveMs } from "../../billing/calculation/cost-for-active-time.js";

export function settleDeveloperCostState(
  state,
  nowMs,
  config,
  activeWindows = activeWindowsFor(state),
) {
  const nextState = { ...state };
  if (
    nextState.activeStartAtMs === undefined ||
    nextState.activeUntilMs === undefined
  ) {
    return nextState;
  }
  const settleFromMs = nextState.lastSettledAtMs ?? nextState.activeStartAtMs;
  const settleUntilMs = Math.min(nowMs, nextState.activeUntilMs);
  const splitPoints = activeWindows
    .flatMap(({ startAtMs, untilMs }) => [startAtMs, untilMs])
    .filter((pointMs) => pointMs > settleFromMs && pointMs < settleUntilMs)
    .sort((left, right) => left - right);
  const boundaries = [...new Set([...splitPoints, settleUntilMs])];
  let segmentStartMs = settleFromMs;
  for (const segmentUntilMs of boundaries) {
    const elapsedMs = segmentUntilMs - segmentStartMs;
    const activeSessionCount = activeWindows.filter(
      ({ startAtMs, untilMs }) =>
        startAtMs <= segmentStartMs && segmentStartMs < untilMs,
    ).length;
    if (elapsedMs > 0 && activeSessionCount > 0) {
      nextState.totalCost = nextState.totalCost.plus(
        costForActiveMs(config, elapsedMs).div(activeSessionCount),
      );
      nextState.activeMilliseconds += elapsedMs;
    }
    segmentStartMs = segmentUntilMs;
  }
  if (settleUntilMs > settleFromMs) {
    nextState.lastSettledAtMs = settleUntilMs;
  }
  if (nowMs < nextState.activeUntilMs) return nextState;
  delete nextState.activeStartAtMs;
  delete nextState.activeUntilMs;
  delete nextState.lastSettledAtMs;
  return nextState;
}

function activeWindowsFor(state) {
  if (state.activeStartAtMs === undefined || state.activeUntilMs === undefined)
    return [];
  return [{ startAtMs: state.activeStartAtMs, untilMs: state.activeUntilMs }];
}

export default settleDeveloperCostState;
