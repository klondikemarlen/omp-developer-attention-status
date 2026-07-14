const MAX_COMPACTION_SUMMARIES = 5;
const MAX_USER_MESSAGES = 5;
const MAX_USER_MESSAGE_LENGTH = 240;
const DESCRIPTION_INSTRUCTION =
  "Generate a concise task description for billable work. Describe the durable goal and deliverable without quoting, exposing, or preserving the user's raw prompt text.";
export function descriptionInputFromSession(entries, currentSummary) {
  const originalRequest = firstUserMessage(entries);
  const recentMessages = recentUniqueUserMessages(entries);
  const summaries = recentUniqueSummaries(entries, currentSummary);
  if (
    originalRequest === "" &&
    recentMessages.length === 0 &&
    summaries.length === 0
  )
    return "";
  return [
    DESCRIPTION_INSTRUCTION,
    originalRequest === ""
      ? undefined
      : section("Original user request", originalRequest),
    recentMessages.length === 0
      ? undefined
      : section("Recent user context", bullets(recentMessages)),
    summaries.length === 0
      ? undefined
      : section("Compaction history", bullets(summaries)),
  ]
    .filter((section) => section !== undefined)
    .join("\n\n");
}

function firstUserMessage(entries) {
  for (const entry of entries) {
    const text = userMessageText(entry);
    if (text !== "") return text;
  }
  return "";
}

function recentUniqueUserMessages(entries) {
  const messages = entries
    .map(userMessageText)
    .filter((message) => message !== "");
  return latestUnique(messages.slice(1), MAX_USER_MESSAGES);
}

function recentUniqueSummaries(entries, currentSummary) {
  const summaries = entries
    .filter((entry) => entry.type === "compaction")
    .map(compactionSummary)
    .filter((summary) => summary !== "");
  const current = compactText(firstLine(currentSummary));
  return latestUnique(
    current === "" ? summaries : [...summaries, current],
    MAX_COMPACTION_SUMMARIES,
  );
}

function userMessageText(entry) {
  if (entry.type !== "message" || entry.message?.role !== "user") return "";
  return compactText(messageText(entry.message.content));
}

function compactionSummary(entry) {
  return (
    compactText(firstLine(entry.shortSummary)) ||
    compactText(firstLine(entry.summary))
  );
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (isTextPart(part) ? part.text : ""))
    .filter((text) => text !== "")
    .join(" ");
}

function isTextPart(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    value.type === "text" &&
    typeof value.text === "string"
  );
}

function latestUnique(values, limit) {
  const seen = new Set();
  const result = [];
  for (
    let index = values.length - 1;
    index >= 0 && result.length < limit;
    index -= 1
  ) {
    const value = values[index];
    if (seen.has(value)) continue;
    seen.add(value);
    result.unshift(value);
  }
  return result;
}

function compactText(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_USER_MESSAGE_LENGTH);
}

function firstLine(value) {
  if (typeof value !== "string") return "";
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

function section(title, body) {
  return `${title}:\n${body}`;
}

function bullets(items) {
  return items.map((item) => `- ${item}`).join("\n");
}
