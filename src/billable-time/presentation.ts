import Big from "@/vendor/big.js"
import type { BillableSummary } from "@/billable-time/summary.js"

export function formatBillableAmount(amount: string, currency: string): string {
  const fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency })
    .resolvedOptions()
    .maximumFractionDigits

  return Big(amount).toFixed(fractionDigits)
}

export function billableSummaryText(summaries: readonly BillableSummary[]): string {
  if (summaries.length === 0) return "No billable time recorded."

  return summaries.map((summary) => {
    const amount = formatBillableAmount(summary.amount, summary.currency)
    return `${summary.clientLabel}: ${summary.sourceKind} ${summary.count} units, ${summary.durationMs}ms @ ${summary.ratePerHour} ${summary.currency}/h = ${amount} ${summary.currency}`
  }).join("\n")
}
