export type DeveloperCostConfig = {
  annualSalary: number
  hoursPerWeek: number
  weeksPerYear: number
  activeWindowMinutes: number
  currencyCode: string
  label: string
}

export type DeveloperCostState = {
  totalUsd: number
  activeStartAtMs?: number
  activeUntilMs?: number
  billedWindows: number
  lastPromptAtMs?: number
}

export type DeveloperCostOptions = {
  annualSalary?: unknown
  annualSalaryUsd?: unknown
  hoursPerWeek?: unknown
  weeksPerYear?: unknown
  activeWindowMinutes?: unknown
  currencyCode?: unknown
  label?: unknown
}

export type ParsedDeveloperCostConfig =
  | { ok: true; config: DeveloperCostConfig }
  | { ok: false; error: string }

const DEFAULT_ANNUAL_SALARY = 80_000
const DEFAULT_HOURS_PER_WEEK = 40
const DEFAULT_WEEKS_PER_YEAR = 50
const DEFAULT_ACTIVE_WINDOW_MINUTES = 5
const DEFAULT_CURRENCY_CODE = "CAD"
const DEFAULT_LABEL = "dev"

export function parseDeveloperCostConfig(options: DeveloperCostOptions | undefined): ParsedDeveloperCostConfig {
  const annualSalary =
    parsePositiveNumber(options?.annualSalary) ??
    parsePositiveNumber(options?.annualSalaryUsd) ??
    DEFAULT_ANNUAL_SALARY
  const hoursPerWeek = parsePositiveNumber(options?.hoursPerWeek) ?? DEFAULT_HOURS_PER_WEEK
  const weeksPerYear = parsePositiveNumber(options?.weeksPerYear) ?? DEFAULT_WEEKS_PER_YEAR
  const activeWindowMinutes =
    parsePositiveNumber(options?.activeWindowMinutes) ?? DEFAULT_ACTIVE_WINDOW_MINUTES
  const currencyCode = parseNonEmptyString(options?.currencyCode) ?? DEFAULT_CURRENCY_CODE
  const label = parseNonEmptyString(options?.label)?.toLowerCase() ?? DEFAULT_LABEL

  return {
    ok: true,
    config: {
      annualSalary,
      hoursPerWeek,
      weeksPerYear,
      activeWindowMinutes,
      currencyCode,
      label,
    },
  }
}

export function emptyDeveloperCostState(): DeveloperCostState {
  return {
    totalUsd: 0,
    billedWindows: 0,
  }
}

export function isDeveloperCostState(value: unknown): value is DeveloperCostState {
  if (typeof value !== "object" || value === null) return false

  const candidate = value as Record<string, unknown>
  if (typeof candidate.totalUsd !== "number" || !Number.isFinite(candidate.totalUsd)) return false
  if (typeof candidate.billedWindows !== "number" || !Number.isFinite(candidate.billedWindows)) return false

  return true
}

export function windowRateUsd(config: DeveloperCostConfig): number {
  const annualMinutes = config.hoursPerWeek * config.weeksPerYear * 60

  return (config.annualSalary / annualMinutes) * config.activeWindowMinutes
}

export function settleDeveloperCostState(
  state: DeveloperCostState,
  nowMs: number,
  config: DeveloperCostConfig,
): DeveloperCostState {
  const next = { ...state }

  if (next.activeStartAtMs === undefined || next.activeUntilMs === undefined) {
    return next
  }

  const effectiveEndMs = Math.min(nowMs, next.activeUntilMs)
  const elapsedMs = Math.max(0, effectiveEndMs - next.activeStartAtMs)
  const windowCount = Math.floor(elapsedMs / activeWindowMs(config))
  const newWindows = Math.max(0, windowCount - next.billedWindows)

  if (newWindows > 0) {
    next.totalUsd += newWindows * windowRateUsd(config)
    next.billedWindows += newWindows
  }

  if (nowMs >= next.activeUntilMs) {
    delete next.activeStartAtMs
    delete next.activeUntilMs
    next.billedWindows = 0
  }

  return next
}

export function recordDeveloperPrompt(
  state: DeveloperCostState,
  promptAtMs: number,
  config: DeveloperCostConfig,
): DeveloperCostState {
  const next = settleDeveloperCostState(state, promptAtMs, config)
  const windowMs = activeWindowMs(config)

  if (next.activeStartAtMs === undefined || next.activeUntilMs === undefined || promptAtMs > next.activeUntilMs) {
    next.activeStartAtMs = promptAtMs
    next.activeUntilMs = promptAtMs + windowMs
    next.billedWindows = 0
  } else {
    next.activeUntilMs = Math.max(next.activeUntilMs, promptAtMs + windowMs)
  }

  next.lastPromptAtMs = promptAtMs

  return next
}

export function isActive(state: DeveloperCostState, nowMs: number): boolean {
  return state.activeUntilMs !== undefined && nowMs < state.activeUntilMs
}

export function formatDeveloperCost(valueUsd: number, currencyCode: string): string {
  return new Intl.NumberFormat(localeForCurrency(currencyCode), {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(valueUsd)
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined

  return value
}

function parseNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  return trimmed
}

function activeWindowMs(config: DeveloperCostConfig): number {
  return config.activeWindowMinutes * 60 * 1000
}

function localeForCurrency(currencyCode: string): string {
  if (currencyCode === "CAD") return "en-CA"

  return "en-US"
}
