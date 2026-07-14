import { amountForDuration } from "@/billable-time/domain/rate.js"
import type { BillableRecord } from "@/billable-time/domain/record.js"

export type BillableSummary = {
  clientId: string
  clientLabel: string
  categoryId?: string
  categoryLabel?: string
  currency: string
  ratePerHour: string
  sourceKind: BillableRecord["sourceKind"]
  count: number
  durationMs: number
  amount: string
}

export function summarizeBillableRecords(records: readonly BillableRecord[]): BillableSummary[] {
  const summaries = new Map<string, BillableSummary>()

  for (const record of records) {
    const key = [
      record.clientId,
      record.currency,
      record.ratePerHour,
      record.sourceKind,
      record.categoryId ?? "",
      record.categoryLabel ?? "",
    ].join("\u0000")
    const existing = summaries.get(key)
    if (existing === undefined) {
      summaries.set(key, {
        clientId: record.clientId,
        clientLabel: record.clientLabel,
        ...(
          record.categoryId === undefined || record.categoryLabel === undefined
            ? {}
            : { categoryId: record.categoryId, categoryLabel: record.categoryLabel }
        ),
        currency: record.currency,
        ratePerHour: record.ratePerHour,
        sourceKind: record.sourceKind,
        count: 1,
        durationMs: record.durationMs,
        amount: amountForDuration(record.ratePerHour, record.durationMs),
      })
      continue
    }

    const durationMs = existing.durationMs + record.durationMs
    summaries.set(key, {
      ...existing,
      count: existing.count + 1,
      durationMs,
      amount: amountForDuration(existing.ratePerHour, durationMs),
    })
  }

  return [...summaries.values()]
}


export default summarizeBillableRecords
