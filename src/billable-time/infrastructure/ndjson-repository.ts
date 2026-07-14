import { mkdir, open, readFile, truncate } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import {
  parseAiIntervalRecord,
  parseAttentionTokenRecord,
  type AiIntervalRecord,
  type AttentionTokenRecord,
  type BillableRecord,
} from "@/billable-time/domain/record.js"
import { lock } from "@/vendor/proper-lockfile.js"

const LOCK_OPTIONS = {
  realpath: false,
  stale: 5_000,
  update: 2_500,
  retries: { retries: 10, factor: 1.5, minTimeout: 100, maxTimeout: 1_000 },
}

export class BillableTimeRepository {
  private readonly attentionPath: string
  private readonly aiPath: string

  constructor(rootPath = path.join(homedir(), ".omp", "developer-attention-status")) {
    this.attentionPath = path.join(rootPath, "attention-tokens.ndjson")
    this.aiPath = path.join(rootPath, "ai-intervals.ndjson")
  }

  async appendAttention(record: AttentionTokenRecord): Promise<void> {
    await this.append(this.attentionPath, record, parseAttentionTokenRecord)
  }

  async appendAiInterval(record: AiIntervalRecord): Promise<void> {
    await this.append(this.aiPath, record, parseAiIntervalRecord)
  }

  async records(): Promise<BillableRecord[]> {
    const [attention, intervals] = await Promise.all([
      this.read(this.attentionPath, parseAttentionTokenRecord),
      this.read(this.aiPath, parseAiIntervalRecord),
    ])
    return [...attention, ...intervals]
  }

  private async append<T extends BillableRecord>(
    filePath: string,
    record: T,
    parse: (value: unknown) => T | undefined,
  ): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const release = await lock(filePath, LOCK_OPTIONS)
    try {
      await this.repairIncompleteTail(filePath, parse)
      await this.appendText(filePath, `${JSON.stringify(record)}\n`)
    } finally {
      await release()
    }
  }

  private async read<T extends BillableRecord>(
    filePath: string,
    parse: (value: unknown) => T | undefined,
  ): Promise<T[]> {
    const content = await this.readFile(filePath)
    const lines = content.split("\n")
    const trailingLine = content.endsWith("\n") ? undefined : lines.pop()
    const completeRecords = lines.flatMap((line, index) => this.parseLine(filePath, line, index + 1, parse))
    const trailingRecord = trailingLine === undefined ? undefined : this.parseTrailingRecord(trailingLine, parse)

    return trailingRecord === undefined ? completeRecords : [...completeRecords, trailingRecord]
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""
      throw error
    }
  }

  private async repairIncompleteTail<T extends BillableRecord>(
    filePath: string,
    parse: (value: unknown) => T | undefined,
  ): Promise<void> {
    const content = await this.readFile(filePath)
    const completeLength = this.completedLength(content)
    if (completeLength === content.length) return

    const trailingLine = content.slice(completeLength)
    if (this.parseTrailingRecord(trailingLine, parse) !== undefined) {
      await this.appendText(filePath, "\n")
      return
    }

    const completeBytes = Buffer.byteLength(content.slice(0, completeLength), "utf8")
    await truncate(filePath, completeBytes)
  }

  private async appendText(filePath: string, content: string): Promise<void> {
    const file = await open(filePath, "a", 0o600)
    try {
      await file.writeFile(content)
      await file.sync()
    } finally {
      await file.close()
    }
  }

  private completedLength(content: string): number {
    return content.lastIndexOf("\n") + 1
  }

  private parseTrailingRecord<T extends BillableRecord>(
    line: string,
    parse: (value: unknown) => T | undefined,
  ): T | undefined {
    try {
      return parse(JSON.parse(line))
    } catch {
      return undefined
    }
  }

  private parseLine<T extends BillableRecord>(
    filePath: string,
    line: string,
    lineNumber: number,
    parse: (value: unknown) => T | undefined,
  ): T[] {
    if (line === "") return []
    const value = this.parseJson(filePath, lineNumber, line)
    const record = parse(value)
    if (record === undefined) throw new Error(`Invalid billable record at ${filePath}:${lineNumber}.`)
    return [record]
  }

  private parseJson(filePath: string, lineNumber: number, line: string): unknown {
    try {
      return JSON.parse(line)
    } catch (error) {
      throw new Error(`Invalid JSON at ${filePath}:${lineNumber}.`, { cause: error })
    }
  }
}

export default BillableTimeRepository
