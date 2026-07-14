import type { BillableClient, BillableTimeConfig } from "@/billable-time/config.js"
import {
  closeAiInterval,
  createAttentionToken,
  startAiInterval,
  type AiIntervalRecord,
  type BillableAttribution,
  type PendingAiInterval,
} from "@/billable-time/domain/record.js"
import { normalizeBillableRepository } from "@/billable-time/domain/repository.js"
import { BillableTimeRepository } from "@/billable-time/infrastructure/ndjson-repository.js"
import { summarizeBillableRecords, type BillableSummary } from "@/billable-time/summary.js"
import { resolveGitRepository } from "@/time-log/infrastructure/git-repository.js"

export class BillableTimeRecorder {
  private readonly repository: BillableTimeRepository
  private readonly pendingIntervals = new Map<string, PendingAiInterval>()
  private readonly closingIntervals = new Map<string, Promise<void>>()

  constructor(rootPath?: string) {
    this.repository = new BillableTimeRepository(rootPath)
  }

  async recordPrompt(sessionId: string, cwd: string, nowMs: number, config: BillableTimeConfig): Promise<void> {
    await this.closePendingInterval(sessionId, nowMs, "superseded")
    const mappedClient = await this.resolveClient(cwd, config)
    if (mappedClient === undefined) return

    const attribution = this.attributionFor(sessionId, mappedClient.repository, mappedClient.client)
    const attention = createAttentionToken(attribution, nowMs, mappedClient.client.attentionRatePerHour)
    const interval = startAiInterval(attribution, nowMs, mappedClient.client.aiRatePerHour)

    await this.repository.appendAttention(attention)
    this.pendingIntervals.set(sessionId, interval)
  }

  async recordTurnEnd(sessionId: string, nowMs: number): Promise<void> {
    await this.closePendingInterval(sessionId, nowMs, "turn_end")
  }

  async recordShutdown(sessionId: string, nowMs: number): Promise<void> {
    await this.closePendingInterval(sessionId, nowMs, "shutdown")
  }

  async summaries(): Promise<BillableSummary[]> {
    return summarizeBillableRecords(await this.repository.records())
  }

  private async closePendingInterval(sessionId: string, nowMs: number, terminalReason: AiIntervalRecord["terminalReason"]): Promise<void> {
    const existingClose = this.closingIntervals.get(sessionId)
    if (existingClose !== undefined) return existingClose

    const pending = this.pendingIntervals.get(sessionId)
    if (pending === undefined) return

    const interval = closeAiInterval(pending, nowMs, terminalReason)
    const close = this.repository.appendAiInterval(interval).then(() => {
      this.pendingIntervals.delete(sessionId)
    })
    this.closingIntervals.set(sessionId, close)
    try {
      await close
    } finally {
      this.closingIntervals.delete(sessionId)
    }
  }

  private async resolveClient(cwd: string, config: BillableTimeConfig) {
    const gitRepository = await resolveGitRepository(cwd)
    const identity = gitRepository?.identity
    if (identity === undefined) return undefined

    const repository = normalizeBillableRepository(identity)
    const client = config.clientsByRepository.get(repository)
    return client === undefined ? undefined : { repository, client }
  }

  private attributionFor(sessionId: string, repository: string, client: BillableClient): BillableAttribution {
    return {
      sessionId,
      clientId: client.id,
      clientLabel: client.label,
      repository,
      currency: client.currency,
    }
  }
}

export default BillableTimeRecorder
