import { formatCadAmount } from "../billing/presentation/format-cost.js";

export function formatBillableAmount(amount, locale) {
  return formatCadAmount(amount, locale);
}

export function billableSummaryText(summaries, locale) {
  if (summaries.length === 0) return "No billable time recorded.";
  return summaries
    .map((summary) => {
      const amount = formatBillableAmount(summary.amount, locale);
      const rate = formatBillableAmount(summary.ratePerHour, locale);
      const category =
        summary.categoryLabel === undefined
          ? ""
          : ` / ${summary.categoryLabel}`;
      return `${summary.clientLabel}${category}: ${summary.sourceKind} ${summary.count} units, ${summary.durationMs}ms @ ${rate}/h = ${amount}`;
    })
    .join("\n");
}

export function billableWorkEntryPreview(entries, locale) {
  return JSON.stringify(
    entries.map((entry) => workEntryPreview(entry, locale)),
    null,
    2,
  );
}

function workEntryPreview(entry, locale) {
  const shared = {
    client_id: entry.clientId,
    client_label: entry.clientLabel,
    project_id: entry.projectId,
    project_name: entry.projectName,
    source_kind: entry.sourceKind,
    duration_ms: entry.durationMs,
    rate_per_hour: formatBillableAmount(entry.ratePerHour, locale),
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
