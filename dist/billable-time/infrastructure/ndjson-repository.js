import { mkdir, open, readFile, truncate } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  parseAiIntervalRecord,
  parseAttentionTokenRecord,
} from "../../billable-time/domain/record.js";
import { parseBillableDescription } from "../../billable-time/domain/description.js";
import { lock } from "../../vendor/proper-lockfile.js";

const LOCK_OPTIONS = {
  realpath: false,
  stale: 5_000,
  update: 2_500,
  retries: { retries: 10, factor: 1.5, minTimeout: 100, maxTimeout: 1_000 },
};
export class BillableTimeRepository {
  attentionPath;

  aiPath;

  descriptionPath;

  constructor(rootPath = path.join(homedir(), ".omp", "project-time")) {
    this.attentionPath = path.join(rootPath, "attention-tokens.ndjson");
    this.aiPath = path.join(rootPath, "ai-intervals.ndjson");
    this.descriptionPath = path.join(rootPath, "session-descriptions.ndjson");
  }

  async appendAttention(record) {
    await this.append(this.attentionPath, record, parseAttentionTokenRecord);
  }

  async appendAiInterval(record) {
    await this.append(this.aiPath, record, parseAiIntervalRecord);
  }

  async appendDescription(description) {
    await this.append(
      this.descriptionPath,
      description,
      parseBillableDescription,
    );
  }

  async records() {
    const [attention, intervals] = await Promise.all([
      this.read(this.attentionPath, parseAttentionTokenRecord),
      this.read(this.aiPath, parseAiIntervalRecord),
    ]);
    return [...attention, ...intervals];
  }

  async descriptions() {
    return this.read(this.descriptionPath, parseBillableDescription);
  }

  async append(filePath, record, parse) {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const release = await lock(filePath, LOCK_OPTIONS);
    try {
      await this.repairIncompleteTail(filePath, parse);
      await this.appendText(filePath, `${JSON.stringify(record)}\n`);
    } finally {
      await release();
    }
  }

  async read(filePath, parse) {
    const content = await this.readFile(filePath);
    const lines = content.split("\n");
    const trailingLine = content.endsWith("\n") ? undefined : lines.pop();
    const completeRecords = lines.flatMap((line, index) =>
      this.parseLine(filePath, line, index + 1, parse),
    );
    const trailingRecord =
      trailingLine === undefined
        ? undefined
        : this.parseTrailingRecord(trailingLine, parse);
    return trailingRecord === undefined
      ? completeRecords
      : [...completeRecords, trailingRecord];
  }

  async readFile(filePath) {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
  }

  async repairIncompleteTail(filePath, parse) {
    const content = await this.readFile(filePath);
    const completeLength = this.completedLength(content);
    if (completeLength === content.length) return;
    const trailingLine = content.slice(completeLength);
    if (this.parseTrailingRecord(trailingLine, parse) !== undefined) {
      await this.appendText(filePath, "\n");
      return;
    }
    const completeBytes = Buffer.byteLength(
      content.slice(0, completeLength),
      "utf8",
    );
    await truncate(filePath, completeBytes);
  }

  async appendText(filePath, content) {
    const file = await open(filePath, "a", 0o600);
    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
  }

  completedLength(content) {
    return content.lastIndexOf("\n") + 1;
  }

  parseTrailingRecord(line, parse) {
    try {
      return parse(JSON.parse(line));
    } catch {
      return undefined;
    }
  }

  parseLine(filePath, line, lineNumber, parse) {
    if (line === "") return [];
    const value = this.parseJson(filePath, lineNumber, line);
    const record = parse(value);
    if (record === undefined)
      throw new Error(`Invalid billable record at ${filePath}:${lineNumber}.`);
    return [record];
  }

  parseJson(filePath, lineNumber, line) {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON at ${filePath}:${lineNumber}.`, {
        cause: error,
      });
    }
  }
}

export default BillableTimeRepository;
