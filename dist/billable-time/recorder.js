import {
  closeAiInterval,
  createAttentionToken,
  startAiInterval,
} from "../billable-time/domain/record.js";
import { normalizeBillableRepository } from "../billable-time/domain/repository.js";
import { BillableTimeRepository } from "../billable-time/infrastructure/ndjson-repository.js";
import { summarizeBillableRecords } from "../billable-time/summary.js";
import { resolveGitRepository } from "../time-log/infrastructure/git-repository.js";

export class BillableTimeRecorder {
  repository;

  pendingIntervals = new Map();

  closingIntervals = new Map();

  constructor(rootPath) {
    this.repository = new BillableTimeRepository(rootPath);
  }

  async recordPrompt(sessionId, cwd, nowMs, config) {
    await this.closePendingInterval(sessionId, nowMs, "superseded");
    const mappedClient = await this.resolveClient(cwd, config);
    if (mappedClient === undefined) return;
    const attribution = this.attributionFor(
      sessionId,
      mappedClient.repository,
      mappedClient.client,
    );
    const attention = createAttentionToken(
      attribution,
      nowMs,
      mappedClient.client.attentionRatePerHour,
    );
    const interval = startAiInterval(
      attribution,
      nowMs,
      mappedClient.client.aiRatePerHour,
    );
    await this.repository.appendAttention(attention);
    this.pendingIntervals.set(sessionId, interval);
  }

  async recordTurnEnd(sessionId, nowMs) {
    await this.closePendingInterval(sessionId, nowMs, "turn_end");
  }

  async recordShutdown(sessionId, nowMs) {
    await this.closePendingInterval(sessionId, nowMs, "shutdown");
  }

  async summaries() {
    return summarizeBillableRecords(await this.repository.records());
  }

  async closePendingInterval(sessionId, nowMs, terminalReason) {
    const existingClose = this.closingIntervals.get(sessionId);
    if (existingClose !== undefined) return existingClose;
    const pending = this.pendingIntervals.get(sessionId);
    if (pending === undefined) return;
    const interval = closeAiInterval(pending, nowMs, terminalReason);
    const close = this.repository.appendAiInterval(interval).then(() => {
      this.pendingIntervals.delete(sessionId);
    });
    this.closingIntervals.set(sessionId, close);
    try {
      await close;
    } finally {
      this.closingIntervals.delete(sessionId);
    }
  }

  async resolveClient(cwd, config) {
    const gitRepository = await resolveGitRepository(cwd);
    const identity = gitRepository?.identity;
    if (identity === undefined) return undefined;
    const repository = normalizeBillableRepository(identity);
    const client = config.clientsByRepository.get(repository);
    return client === undefined ? undefined : { repository, client };
  }

  attributionFor(sessionId, repository, client) {
    return {
      sessionId,
      clientId: client.id,
      clientLabel: client.label,
      repository,
      currency: client.currency,
    };
  }
}

export default BillableTimeRecorder;
