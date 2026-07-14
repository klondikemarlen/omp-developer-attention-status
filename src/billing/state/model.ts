import type Big from "@/vendor/big.js"

export type DeveloperCostState = {
  totalCost: Big
  promptCount: number
  activeMilliseconds: number
  activeStartAtMs?: number
  activeUntilMs?: number
  lastSettledAtMs?: number
  lastPromptAtMs?: number
}
