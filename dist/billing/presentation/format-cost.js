import Big from "../../vendor/big.js";

let cadFormatter;
export function formatCadAmount(value, locale) {
  if (cadFormatter?.locale !== locale) {
    cadFormatter = {
      locale,
      value: new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "CAD",
        currencyDisplay: "code",
      }),
    };
  }
  return cadFormatter.value.format(Number(Big(value).toFixed(2)));
}

export function formatDeveloperCost(value, locale) {
  return formatCadAmount(value, locale);
}

export default formatDeveloperCost;
