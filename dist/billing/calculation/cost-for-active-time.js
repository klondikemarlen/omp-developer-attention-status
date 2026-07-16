import Big from "../../vendor/big.js";
import { MS_PER_HOUR } from "../../billing/calculation/time-constants.js";

export function effectivePaidHourlyCost(config) {
  const annualHours = Big(config.workingHoursPerWeek).times(
    config.workingWeeksPerYear,
  );
  return Big(config.annualGrossSalary).div(annualHours);
}

export function costForActiveMs(config, activeMs) {
  return effectivePaidHourlyCost(config).times(activeMs).div(MS_PER_HOUR);
}

export default costForActiveMs;
