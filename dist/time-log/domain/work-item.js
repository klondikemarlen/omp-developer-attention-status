const workItemPattern =
  /\b(?:(issue)\s*#\s*|(pull\s*request|pr)\s*#\s*)(\d+)\b|github\.com\/([^/\s]+\/[^/\s]+)\/(issues|pull)\/(\d+)\b/giu;
function workItemMatches(prompt) {
  return [...prompt.matchAll(workItemPattern)].map((match) => ({
    kind:
      match[1]?.toLowerCase() === "issue" ||
      match[5]?.toLowerCase() === "issues"
        ? "issue"
        : "pull_request",
    number: Number(match[3] ?? match[6]),
    ...(match[4] === undefined
      ? {}
      : { repository: `github.com/${match[4].toLowerCase()}` }),
  }));
}

export function extractWorkItem(prompt) {
  const matches = workItemMatches(prompt);
  const unique = matches
    .filter(
      (match) =>
        match.repository !== undefined ||
        !matches.some(
          (candidate) =>
            candidate.kind === match.kind &&
            candidate.number === match.number &&
            candidate.repository !== undefined,
        ),
    )
    .filter(
      (match, index, candidates) =>
        candidates.findIndex(
          (candidate) =>
            candidate.kind === match.kind &&
            candidate.number === match.number &&
            candidate.repository === match.repository,
        ) === index,
    );
  if (
    unique.length !== 1 ||
    !Number.isSafeInteger(unique[0]?.number) ||
    unique[0].number <= 0
  )
    return undefined;
  return { ...unique[0], source: "user_provided" };
}

export function parseWorkItem(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value;
  if (
    (candidate.kind !== "issue" && candidate.kind !== "pull_request") ||
    typeof candidate.number !== "number" ||
    !Number.isSafeInteger(candidate.number) ||
    candidate.number <= 0 ||
    candidate.source !== "user_provided" ||
    (candidate.repository !== undefined &&
      (typeof candidate.repository !== "string" ||
        !/^github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(
          candidate.repository,
        )))
  )
    return undefined;
  return {
    kind: candidate.kind,
    number: candidate.number,
    ...(candidate.repository === undefined
      ? {}
      : { repository: candidate.repository.toLowerCase() }),
    source: candidate.source,
  };
}
