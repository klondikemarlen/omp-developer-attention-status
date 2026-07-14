const MAX_COMPACTION_SUMMARIES = 5
const MAX_USER_MESSAGES = 5
const MAX_USER_MESSAGE_LENGTH = 240
const DESCRIPTION_INSTRUCTION = "Generate a concise task description for billable work. Describe the durable goal and deliverable without quoting, exposing, or preserving the user's raw prompt text."

type SessionEntry = {
  type?: unknown
  message?: { role?: unknown; content?: unknown }
  shortSummary?: unknown
  summary?: unknown
}

export function descriptionInputFromSession(entries: readonly SessionEntry[], currentSummary?: unknown): string {
  const originalRequest = firstUserMessage(entries)
  const recentMessages = recentUniqueUserMessages(entries)
  const summaries = recentUniqueSummaries(entries, currentSummary)

  if (originalRequest === "" && recentMessages.length === 0 && summaries.length === 0) return ""

  return [
    DESCRIPTION_INSTRUCTION,
    originalRequest === "" ? undefined : section("Original user request", originalRequest),
    recentMessages.length === 0 ? undefined : section("Recent user context", bullets(recentMessages)),
    summaries.length === 0 ? undefined : section("Compaction history", bullets(summaries)),
  ].filter((section): section is string => section !== undefined).join("\n\n")
}

function firstUserMessage(entries: readonly SessionEntry[]): string {
  for (const entry of entries) {
    const text = userMessageText(entry)
    if (text !== "") return text
  }

  return ""
}

function recentUniqueUserMessages(entries: readonly SessionEntry[]): string[] {
  const messages = entries.map(userMessageText).filter((message) => message !== "")
  return latestUnique(messages.slice(1), MAX_USER_MESSAGES)
}

function recentUniqueSummaries(entries: readonly SessionEntry[], currentSummary: unknown): string[] {
  const summaries = entries
    .filter((entry) => entry.type === "compaction")
    .map(compactionSummary)
    .filter((summary) => summary !== "")
  const current = compactText(firstLine(currentSummary))

  return latestUnique(current === "" ? summaries : [...summaries, current], MAX_COMPACTION_SUMMARIES)
}

function userMessageText(entry: SessionEntry): string {
  if (entry.type !== "message" || entry.message?.role !== "user") return ""

  return compactText(messageText(entry.message.content))
}

function compactionSummary(entry: SessionEntry): string {
  return compactText(firstLine(entry.shortSummary)) || compactText(firstLine(entry.summary))
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""

  return content
    .map((part) => isTextPart(part) ? part.text : "")
    .filter((text) => text !== "")
    .join(" ")
}

function isTextPart(value: unknown): value is { type: "text"; text: string } {
  return typeof value === "object" && value !== null
    && (value as { type?: unknown }).type === "text"
    && typeof (value as { text?: unknown }).text === "string"
}

function latestUnique(values: readonly string[], limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (let index = values.length - 1; index >= 0 && result.length < limit; index -= 1) {
    const value = values[index]
    if (seen.has(value)) continue

    seen.add(value)
    result.unshift(value)
  }

  return result
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_USER_MESSAGE_LENGTH)
}

function firstLine(value: unknown): string {
  if (typeof value !== "string") return ""

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "") ?? ""
}

function section(title: string, body: string): string {
  return `${title}:\n${body}`
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n")
}
