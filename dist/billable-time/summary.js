import { amountForDuration } from "../billable-time/domain/rate.js";

export function summarizeBillableRecords(records) {
  const summaries = new Map();
  for (const record of records) {
    const key = [
      record.clientId,
      record.currency,
      record.ratePerHour,
      record.sourceKind,
    ].join("\u0000");
    const existing = summaries.get(key);
    if (existing === undefined) {
      summaries.set(key, {
        clientId: record.clientId,
        clientLabel: record.clientLabel,
        currency: record.currency,
        ratePerHour: record.ratePerHour,
        sourceKind: record.sourceKind,
        count: 1,
        durationMs: record.durationMs,
        amount: amountForDuration(record.ratePerHour, record.durationMs),
      });
      continue;
    }
    const durationMs = existing.durationMs + record.durationMs;
    summaries.set(key, {
      ...existing,
      count: existing.count + 1,
      durationMs,
      amount: amountForDuration(existing.ratePerHour, durationMs),
    });
  }
  return [...summaries.values()];
}

export default summarizeBillableRecords;
