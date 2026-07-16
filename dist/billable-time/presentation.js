import Big from "../vendor/big.js";

export function formatBillableAmount(amount) {
  return `CA$${Big(amount).toFixed(2)}`;
}

export function billableSummaryText(summaries) {
  if (summaries.length === 0) return "No billable time recorded.";
  return summaries
    .map((summary) => {
      const amount = formatBillableAmount(summary.amount);
      const category =
        summary.categoryLabel === undefined
          ? ""
          : ` / ${summary.categoryLabel}`;
      return `${summary.clientLabel}${category}: ${summary.sourceKind} ${summary.count} units, ${summary.durationMs}ms @ CA$${summary.ratePerHour}/h = ${amount}`;
    })
    .join("\n");
}

export function billableWorkEntryPreview(entries) {
  return JSON.stringify(entries.map(workEntryPreview), null, 2);
}

function workEntryPreview(entry) {
  const shared = {
    client_id: entry.clientId,
    client_label: entry.clientLabel,
    project_id: entry.projectId,
    project_name: entry.projectName,
    source_kind: entry.sourceKind,
    duration_ms: entry.durationMs,
    rate_per_hour: entry.ratePerHour,
    description: entry.description,
    ...(entry.categoryId === undefined || entry.categoryLabel === undefined
      ? {}
      : { category_id: entry.categoryId, category_label: entry.categoryLabel }),
  };
  if (entry.sourceKind === "attention") {
    return { ...shared, emitted_at_ms: entry.emittedAtMs };
  }
  return {
    ...shared,
    started_at_ms: entry.startedAtMs,
    ended_at_ms: entry.endedAtMs,
  };
}
