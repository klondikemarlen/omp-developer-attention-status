import { formatCadAmount } from "@/billing/presentation/format-cost.js"
import type { BillableSummary } from "@/billable-time/summary.js"
import type { BillableWorkEntry } from "@/billable-time/domain/work-entry.js"

export function formatBillableAmount(amount: string, locale: string): string {
  return formatCadAmount(amount, locale)
}

export function billableSummaryText(
  summaries: readonly BillableSummary[],
  locale: string,
): string {
  if (summaries.length === 0) return "No billable time recorded."

  return summaries.map((summary) => {
    const amount = formatBillableAmount(summary.amount, locale)
    const rate = formatBillableAmount(summary.ratePerHour, locale)
    const category = summary.categoryLabel === undefined ? "" : ` / ${summary.categoryLabel}`
    return `${summary.clientLabel}${category}: ${summary.sourceKind} ${summary.count} units, ${summary.durationMs}ms @ ${rate}/h = ${amount}`
  }).join("\n")
}

export function billableWorkEntryPreview(
  entries: readonly BillableWorkEntry[],
  locale: string,
): string {
  return JSON.stringify(entries.map((entry) => workEntryPreview(entry, locale)), null, 2)
}

function workEntryPreview(entry: BillableWorkEntry, locale: string): Record<string, string | number> {
  const shared = {
    client_id: entry.clientId,
    client_label: entry.clientLabel,
    project_id: entry.projectId,
    project_name: entry.projectName,
    source_kind: entry.sourceKind,
    duration_ms: entry.durationMs,
    rate_per_hour: formatBillableAmount(entry.ratePerHour, locale),
    description: entry.description,
    ...(
      entry.categoryId === undefined || entry.categoryLabel === undefined
        ? {}
        : { category_id: entry.categoryId, category_label: entry.categoryLabel }
    ),
  }

  if (entry.sourceKind === "attention") {
    return { ...shared, emitted_at_ms: entry.emittedAtMs }
  }

  return {
    ...shared,
    started_at_ms: entry.startedAtMs,
    ended_at_ms: entry.endedAtMs,
  }
}
