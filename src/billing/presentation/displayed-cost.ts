import type { DeveloperCostState } from "@/billing/state/model.js"

export function displayedDeveloperCost(state: DeveloperCostState): DeveloperCostState["totalCost"] {
  return state.totalCost
}
