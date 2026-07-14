import Big from "../vendor/big.js";

export function formatBillableAmount(amount, currency) {
  const fractionDigits = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return Big(amount).toFixed(fractionDigits);
}

export function billableSummaryText(summaries) {
  if (summaries.length === 0) return "No billable time recorded.";
  return summaries
    .map((summary) => {
      const amount = formatBillableAmount(summary.amount, summary.currency);
      return `${summary.clientLabel}: ${summary.sourceKind} ${summary.count} units, ${summary.durationMs}ms @ ${summary.ratePerHour} ${summary.currency}/h = ${amount} ${summary.currency}`;
    })
    .join("\n");
}
