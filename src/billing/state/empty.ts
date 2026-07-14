import Big from "@/vendor/big.js"
import type { DeveloperCostState } from "@/billing/state/model.js"

export function emptyDeveloperCostState(): DeveloperCostState {
  return {
    totalCost: Big(0),
    promptCount: 0,
    activeMilliseconds: 0,
  }
}

export default emptyDeveloperCostState
