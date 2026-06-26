import Big from "big.js"

import { activeWindowMs } from "./active-window-ms.js"
import { costForActiveMs } from "./cost-for-active-ms.js"
import type {
  DeveloperCostConfig,
  DeveloperCostOptions,
} from "./developer-cost-config.js"
import type { DeveloperCostState } from "./developer-cost-state.js"
import { displayedDeveloperCost } from "./displayed-developer-cost.js"
import { emptyDeveloperCostState } from "./empty-developer-cost-state.js"
import { formatDeveloperCost } from "./format-developer-cost.js"
import { parseDeveloperCostConfig } from "./parse-developer-cost-config.js"
import { parseDeveloperCostState } from "./parse-developer-cost-state.js"
import { recordDeveloperPrompt } from "./record-developer-prompt.js"
import { refreshIntervalMs } from "./refresh-interval-ms.js"
import { settleDeveloperCostState } from "./settle-developer-cost-state.js"
import { windowRate } from "./window-rate.js"

export class Billing {
  static readonly instance = new Billing()

  private constructor() {}

  parseConfig(options?: DeveloperCostOptions): DeveloperCostConfig {
    return parseDeveloperCostConfig(options)
  }

  emptyState(): DeveloperCostState {
    return emptyDeveloperCostState()
  }

  parseState(value: unknown): DeveloperCostState | undefined {
    return parseDeveloperCostState(value)
  }

  recordPrompt(
    state: DeveloperCostState,
    promptAtMs: number,
    config: DeveloperCostConfig,
  ): DeveloperCostState {
    return recordDeveloperPrompt(state, promptAtMs, config)
  }

  settleState(
    state: DeveloperCostState,
    nowMs: number,
    config: DeveloperCostConfig,
  ): DeveloperCostState {
    return settleDeveloperCostState(state, nowMs, config)
  }

  displayedCost(state: DeveloperCostState): Big {
    return displayedDeveloperCost(state)
  }

  formatCost(value: Big): string {
    return formatDeveloperCost(value)
  }

  activeWindowMs(config: DeveloperCostConfig): number {
    return activeWindowMs(config)
  }

  refreshIntervalMs(config: DeveloperCostConfig): number {
    return refreshIntervalMs(config)
  }

  windowRate(config: DeveloperCostConfig): Big {
    return windowRate(config)
  }

  costForActiveMs(config: DeveloperCostConfig, activeMs: number): Big {
    return costForActiveMs(config, activeMs)
  }
}
