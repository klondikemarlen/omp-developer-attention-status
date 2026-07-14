import Big from "../../vendor/big.js";

export function emptyDeveloperCostState() {
  return {
    totalCost: Big(0),
    promptCount: 0,
    activeMilliseconds: 0,
  };
}

export default emptyDeveloperCostState;
