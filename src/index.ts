import {
  displayedDeveloperCost,
  formatDeveloperCost,
  parseDeveloperCostConfig,
  recordDeveloperPrompt,
  refreshIntervalMs,
  settleDeveloperCostState,
  type DeveloperCostConfig,
  type DeveloperCostState,
} from "./billing.js"
import { loadDeveloperCostConfig, loadDeveloperCostConfigFromFiles } from "./config-loader.js"
import { DEVELOPER_COST_STATE_ENTRY, loadPersistedDeveloperCostState } from "./session-state.js"
import { isTopLevelSession } from "./session-classification.js"

export { loadDeveloperCostConfigFromFiles }

const STATUS_KEY = "developer-cost-status"
const DEFAULT_REFRESH_INTERVAL_MS = refreshIntervalMs(parseDeveloperCostConfig())

type RefreshTimer = NodeJS.Timeout

type RuntimeState = {
  activeContext?: ExtensionContext
  activeSessionId?: string
  refreshTimer?: RefreshTimer
}

type SessionHeaderLike = {
  parentSession?: unknown
}

type SessionEntryLike = {
  type?: unknown
  customType?: unknown
  data?: unknown
}

type SessionManagerLike = {
  getSessionId(): string
  getHeader(): SessionHeaderLike | null
  getBranch(): SessionEntryLike[]
  getEntries(): SessionEntryLike[]
}

type ThemeLike = {
  fg(color: string, text: string): string
}

type UiLike = {
  notify(message: string, type?: "info" | "warning" | "error"): void
  setStatus(key: string, text: string | undefined): void
  theme: ThemeLike
}

type ExtensionContext = {
  cwd: string
  ui: UiLike
  sessionManager: SessionManagerLike
}

type CommandHandler = (args: string, ctx: ExtensionContext) => Promise<void>

type BeforeAgentStartHandler = (
  event: { prompt: string },
  ctx: ExtensionContext,
) => Promise<void>

type SessionHandler = (
  event: { reason?: string },
  ctx: ExtensionContext,
) => Promise<void>

type TurnEndHandler = (
  event: { type: "turn_end" },
  ctx: ExtensionContext,
) => Promise<void>

export type ExtensionApi = {
  registerCommand(
    name: string,
    options: {
      description?: string
      handler: CommandHandler
    },
  ): void
  on(event: "session_start", handler: SessionHandler): void
  on(event: "session_switch", handler: SessionHandler): void
  on(event: "before_agent_start", handler: BeforeAgentStartHandler): void
  on(event: "turn_end", handler: TurnEndHandler): void
  on(event: "session_shutdown", handler: SessionHandler): void
  appendEntry(customType: string, data?: unknown): void
}

type ConfigLoader = (cwd: string) => Promise<DeveloperCostConfig>

type ExtensionOptions = {
  loadConfig?: ConfigLoader
}

export default function developerCostStatusExtension(pi: ExtensionApi, options: ExtensionOptions = {}) {
  const runtimeState: RuntimeState = {}
  const sessionStates = new Map<string, DeveloperCostState>()
  const loadConfig = options.loadConfig ?? loadDeveloperCostConfig

  scheduleNextRefresh(pi, sessionStates, runtimeState, loadConfig)

  pi.registerCommand("developer-cost-status", {
    description: "Show the developer cost meter for the current session",
    handler: async (_args, ctx) => {
      if (!isTopLevelSession(ctx.sessionManager)) {
        ctx.ui.notify("Developer cost status is only tracked for top-level sessions.", "info")
        return
      }

      const config = await loadConfigForStatus(loadConfig, ctx)
      if (config === undefined) return
      const state = stateForSession(sessionStates, ctx, ctx.sessionManager.getSessionId())
      const settledState = settleDeveloperCostState(state, Date.now(), config)

      ctx.ui.notify(statusText(settledState, config), "info")
    },
  })

  pi.on("session_start", async (_event, ctx) => {
    await activateSession(sessionStates, runtimeState, loadConfig, ctx)
  })

  pi.on("session_switch", async (_event, ctx) => {
    await activateSession(sessionStates, runtimeState, loadConfig, ctx)
  })

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!isTopLevelSession(ctx.sessionManager)) {
      clearActiveStatus(runtimeState, ctx)
      return
    }

    const config = await loadConfigForStatus(loadConfig, ctx)
    if (config === undefined) {
      clearActiveStatus(runtimeState, ctx)
      return
    }
    const sessionId = ctx.sessionManager.getSessionId()
    const currentState = stateForSession(sessionStates, ctx, sessionId)
    const promptAtMs = Date.now()
    const nextState = recordDeveloperPrompt(currentState, promptAtMs, config)

    sessionStates.set(sessionId, nextState)
    runtimeState.activeContext = ctx
    runtimeState.activeSessionId = sessionId

    pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, nextState)
    updateStatus(ctx, settleDeveloperCostState(nextState, promptAtMs, config), config)
  })

  pi.on("turn_end", async (_event, ctx) => {
    if (!isTopLevelSession(ctx.sessionManager)) return

    const config = await loadConfigForStatus(loadConfig, ctx)
    if (config === undefined) {
      clearActiveStatus(runtimeState, ctx)
      return
    }
    const sessionId = ctx.sessionManager.getSessionId()
    const currentState = stateForSession(sessionStates, ctx, sessionId)
    const settledState = settleDeveloperCostState(currentState, Date.now(), config)

    sessionStates.set(sessionId, settledState)
    pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, settledState)
    rememberActiveSession(runtimeState, ctx, sessionId, settledState)
    updateStatus(ctx, settledState, config)
  })

  pi.on("session_shutdown", async (_event, ctx) => {
    if (runtimeState.activeSessionId !== ctx.sessionManager.getSessionId()) return

    clearActiveStatus(runtimeState, ctx)
  })
}

async function activateSession(
  sessionStates: Map<string, DeveloperCostState>,
  runtimeState: RuntimeState,
  loadConfig: ConfigLoader,
  ctx: ExtensionContext,
): Promise<void> {
  if (!isTopLevelSession(ctx.sessionManager)) {
    clearActiveStatus(runtimeState, ctx)
    return
  }

  const config = await loadConfigForStatus(loadConfig, ctx)
  if (config === undefined) {
    clearActiveStatus(runtimeState, ctx)
    return
  }
  const sessionId = ctx.sessionManager.getSessionId()
  const state = loadPersistedDeveloperCostState(ctx.sessionManager.getEntries())
  const settledState = settleDeveloperCostState(state, Date.now(), config)

  sessionStates.set(sessionId, settledState)
  rememberActiveSession(runtimeState, ctx, sessionId, settledState)
  if (settledState.activeUntilMs === undefined) {
    clearActiveStatus(runtimeState, ctx)
    return
  }
  updateStatus(ctx, settledState, config)
}

async function refreshActiveStatus(
  pi: ExtensionApi,
  sessionStates: Map<string, DeveloperCostState>,
  runtimeState: RuntimeState,
  loadConfig: ConfigLoader,
): Promise<number> {
  if (
    runtimeState.activeContext === undefined ||
    runtimeState.activeSessionId === undefined
  ) {
    return DEFAULT_REFRESH_INTERVAL_MS
  }

  const activeContext = runtimeState.activeContext
  const activeSessionId = runtimeState.activeSessionId
  const config = await loadConfigForStatus(loadConfig, activeContext)
  if (config === undefined) {
    clearActiveStatus(runtimeState, activeContext)
    return DEFAULT_REFRESH_INTERVAL_MS
  }
  const currentState = stateForSession(
    sessionStates,
    activeContext,
    activeSessionId,
  )
  const settledState = settleDeveloperCostState(currentState, Date.now(), config)

  sessionStates.set(activeSessionId, settledState)
  pi.appendEntry(DEVELOPER_COST_STATE_ENTRY, settledState)
  rememberActiveSession(runtimeState, activeContext, activeSessionId, settledState)
  updateStatus(activeContext, settledState, config)

  return refreshIntervalMs(config)
}

function scheduleNextRefresh(
  pi: ExtensionApi,
  sessionStates: Map<string, DeveloperCostState>,
  runtimeState: RuntimeState,
  loadConfig: ConfigLoader,
  waitMs = DEFAULT_REFRESH_INTERVAL_MS,
): void {
  if (runtimeState.refreshTimer !== undefined) {
    clearTimeout(runtimeState.refreshTimer)
  }

  const timer = setTimeout(async () => {
    runtimeState.refreshTimer = undefined
    try {
      const nextWaitMs = await refreshActiveStatus(pi, sessionStates, runtimeState, loadConfig)
      scheduleNextRefresh(pi, sessionStates, runtimeState, loadConfig, nextWaitMs)
    } catch (error) {
      reportUnexpectedRefreshError(runtimeState, error)
      scheduleNextRefresh(pi, sessionStates, runtimeState, loadConfig)
    }
  }, waitMs)

  timer.unref?.()
  runtimeState.refreshTimer = timer
}

function reportUnexpectedRefreshError(runtimeState: RuntimeState, error: unknown): void {
  const activeContext = runtimeState.activeContext
  if (activeContext === undefined) return

  activeContext.ui.notify(
    `Developer cost status refresh error: ${configErrorMessage(error)}`,
    "error",
  )
  clearActiveStatus(runtimeState, activeContext)
}

async function loadConfigForStatus(
  loadConfig: ConfigLoader,
  ctx: ExtensionContext,
): Promise<DeveloperCostConfig | undefined> {
  try {
    return await loadConfig(ctx.cwd)
  } catch (error) {
    ctx.ui.notify(`Developer cost status config error: ${configErrorMessage(error)}`, "error")
    return undefined
  }
}

function configErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message

  return String(error)
}

function rememberActiveSession(
  runtimeState: RuntimeState,
  ctx: ExtensionContext,
  sessionId: string,
  state: DeveloperCostState,
): void {
  if (state.activeUntilMs === undefined) {
    runtimeState.activeContext = undefined
    runtimeState.activeSessionId = undefined
    return
  }

  runtimeState.activeContext = ctx
  runtimeState.activeSessionId = sessionId
}

function clearActiveStatus(runtimeState: RuntimeState, ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_KEY, undefined)
  runtimeState.activeContext = undefined
  runtimeState.activeSessionId = undefined
}

function stateForSession(
  sessionStates: Map<string, DeveloperCostState>,
  ctx: ExtensionContext,
  sessionId: string,
): DeveloperCostState {
  return (
    sessionStates.get(sessionId) ??
    loadPersistedDeveloperCostState(ctx.sessionManager.getEntries())
  )
}

function updateStatus(
  ctx: ExtensionContext,
  state: DeveloperCostState,
  config: DeveloperCostConfig,
): void {
  ctx.ui.setStatus(
    STATUS_KEY,
    ctx.ui.theme.fg("dim", statusText(state, config)),
  )
}

function statusText(state: DeveloperCostState, config: DeveloperCostConfig): string {
  const text = formatDeveloperCost(displayedDeveloperCost(state))

  return `${text} (${config.label})`
}
