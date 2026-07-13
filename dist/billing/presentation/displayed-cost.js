import Big from "../../vendor/big.js";

export function displayedDeveloperCost(state) {
  return Big(state.totalCost);
}
