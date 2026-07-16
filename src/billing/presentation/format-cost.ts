import type Big from "@/vendor/big.js"

export function formatDeveloperCost(value: Big): string {
  return `CA$${value.toFixed(2)}`
}

export default formatDeveloperCost
