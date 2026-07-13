import Big from "@/vendor/big.js"

import type { DeveloperCostState } from "@/billing/state/model.js"

export function displayedDeveloperCost(state: DeveloperCostState): Big {
  return Big(state.totalCost)
}
