import Big from "../../vendor/big.js"

import type { DeveloperCostState } from "../state/model.js"

export function displayedDeveloperCost(state: DeveloperCostState): Big {
  return Big(state.totalCost)
}
