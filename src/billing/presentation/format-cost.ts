import Big from "@/vendor/big.js"

let cadFormatter: { locale: string; value: Intl.NumberFormat } | undefined

export function formatCadAmount(value: Big | string, locale: string): string {
  if (cadFormatter?.locale !== locale) {
    cadFormatter = {
      locale,
      value: new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "CAD",
        currencyDisplay: "code",
      }),
    }
  }

  return cadFormatter.value.format(Number(Big(value).toFixed(2)))
}

export function formatDeveloperCost(value: Big, locale: string): string {
  return formatCadAmount(value, locale)
}

export default formatDeveloperCost
