/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { createEffect, createMemo, createSignal } from "solid-js"

import {
  emptyDeveloperCostState,
  formatDeveloperCost,
  parseDeveloperCostConfig,
  parseDeveloperCostState,
  type DeveloperCostConfig,
  type DeveloperCostOptions,
  type DeveloperCostState,
  recordDeveloperPrompt,
  settleDeveloperCostState,
} from "./billing.js"
const STORAGE_KEY_PREFIX = "developer-cost:session:"

const SETTLE_INTERVAL_MS = 15_000

type StatusTheme = Pick<TuiThemeCurrent, "textMuted">

function StatusChip(props: {
  config: DeveloperCostConfig
  sessionId: string
  stateFor: (sessionId: string) => DeveloperCostState | undefined
  ensureSessionLoaded: (sessionId: string) => Promise<void>
  revision: () => number
  now: () => number
  theme: () => StatusTheme
}) {
  createEffect(() => {
    void props.ensureSessionLoaded(props.sessionId)
  })

  const settled = createMemo(() => {
    props.revision()

    const state = props.stateFor(props.sessionId) ?? emptyDeveloperCostState()

    return settleDeveloperCostState(state, props.now(), props.config)
  })
  const text = createMemo(() => {
    return `${formatDeveloperCost(settled().totalCost, props.config.currencyCode)} (${props.config.label})`
  })

  return <text fg={props.theme().textMuted} wrapMode="none">{text()}</text>
}

const tui: TuiPlugin = async (api, options) => {
  const config = parseDeveloperCostConfig(options as DeveloperCostOptions | undefined)
  const sessionStates = new Map<string, DeveloperCostState>()
  const loadingSessions = new Map<string, Promise<void>>()
  const [revision, setRevision] = createSignal(0)
  const [nowMs, setNowMs] = createSignal(Date.now())

  const bump = () => setRevision((value) => value + 1)

  async function persistSessionState(sessionId: string, state: DeveloperCostState) {
    api.kv.set(`${STORAGE_KEY_PREFIX}${sessionId}`, state)
    sessionStates.set(sessionId, state)
    bump()
  }

  async function ensureSessionLoaded(sessionId: string) {
    if (sessionStates.has(sessionId)) return

    const existing = loadingSessions.get(sessionId)
    if (existing) return existing

    const task = Promise.resolve().then(() => {
      const stored = api.kv.get(`${STORAGE_KEY_PREFIX}${sessionId}`)
      sessionStates.set(sessionId, parseDeveloperCostState(stored) ?? emptyDeveloperCostState())
      bump()
    }).finally(() => {
      loadingSessions.delete(sessionId)
    })

    loadingSessions.set(sessionId, task)
    return task
  }


  async function settleAll(now: number) {
    let changed = false

    for (const [sessionId, state] of sessionStates) {
      const nextState = settleDeveloperCostState(state, now, config)
      if (JSON.stringify(nextState) === JSON.stringify(state)) continue

      api.kv.set(`${STORAGE_KEY_PREFIX}${sessionId}`, nextState)
      sessionStates.set(sessionId, nextState)
      changed = true
    }

    setNowMs(now)

    if (changed) {
      bump()
    }
  }

  const timer = setInterval(() => {
    void settleAll(Date.now())
  }, SETTLE_INTERVAL_MS)

  timer.unref?.()

  api.lifecycle.onDispose(() => {
    clearInterval(timer)
  })

  api.lifecycle.onDispose(
    api.event.on("message.updated", (event) => {
      const info = event.properties.info
      if (info.role !== "user") return

      const session = api.state.session.get(info.sessionID)
      if (session?.parentID) return

      void ensureSessionLoaded(info.sessionID).then(() => {
        const currentState = sessionStates.get(info.sessionID) ?? emptyDeveloperCostState()
        const promptAtMs = info.time?.created ?? Date.now()
        const nextState = recordDeveloperPrompt(currentState, promptAtMs, config)

        setNowMs(promptAtMs)
        void persistSessionState(info.sessionID, nextState)
      })
    }),
  )

  api.slots.register({
    order: 100,
    slots: {
      session_prompt_right(ctx, props) {
        const theme = () => ctx.theme.current

        return (
          <StatusChip
            config={config}
            sessionId={props.session_id}
            stateFor={(sessionId) => sessionStates.get(sessionId)}
            ensureSessionLoaded={ensureSessionLoaded}
            revision={revision}
            now={nowMs}
            theme={theme}
          />
        )
      },
    },
  })
}

const plugin: TuiPluginModule = {
  id: "developer-cost-status",
  tui,
}

export default plugin
