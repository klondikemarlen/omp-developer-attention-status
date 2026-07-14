import { z } from "../../vendor/zod.js";

const iso4217Currencies = new Set(Intl.supportedValuesOf("currency"));
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be a three-letter currency code")
  .refine(
    (currency) => iso4217Currencies.has(currency),
    "must be an ISO 4217 currency code",
  );
export const currencyInputSchema = z
  .string()
  .trim()
  .transform((currency) => currency.toUpperCase())
  .pipe(currencySchema);
