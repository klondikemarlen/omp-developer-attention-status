import Big from "../../vendor/big.js";
import { z } from "../../vendor/zod.js";

export const positiveRateSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/, "must be a decimal string")
  .refine((rate) => Big(rate).gt(0), "must be positive");
const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;
export function amountForDuration(ratePerHour, durationMs) {
  return Big(ratePerHour)
    .times(durationMs)
    .div(MILLISECONDS_PER_HOUR)
    .toString();
}
