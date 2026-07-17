import { normalizeRepositoryIdentity } from "../infrastructure/repository-identity.js";
import { parseNonEmptyString } from "../utils/parse-non-empty-string.js";
import { parsePositiveNumber } from "../utils/parse-positive-number.js";
import {
  DEFAULT_ACTIVE_WINDOW_MINUTES,
  DEFAULT_LABEL,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
} from "../config/defaults.js";

const LEGACY_SETTING_NAMES = {
  activeWindowMinutes: "Active Window Minutes",
  refreshIntervalSeconds: "Refresh Interval Seconds",
  label: "Status Label",
  repositoryBilling: "Repository Attribution",
};
export function parseProjectTimeConfig(options) {
  const legacySetting = Object.entries(LEGACY_SETTING_NAMES).find(
    ([settingName]) => settingName in (options ?? {}),
  );
  if (legacySetting !== undefined) {
    throw new Error(
      `Project Time settings changed in v5. Replace \`${legacySetting[0]}\` with \`${legacySetting[1]}\`.`,
    );
  }
  const activeWindowMinutes =
    parsePositiveNumber(options?.["Active Window Minutes"]) ??
    DEFAULT_ACTIVE_WINDOW_MINUTES;
  const refreshIntervalSeconds =
    parsePositiveNumber(options?.["Refresh Interval Seconds"]) ??
    DEFAULT_REFRESH_INTERVAL_SECONDS;
  const label =
    parseNonEmptyString(options?.["Status Label"])?.toLowerCase() ??
    DEFAULT_LABEL;
  const repositoryAttribution = parseRepositoryAttribution(
    options?.["Repository Attribution"],
  );
  return {
    activeWindowMinutes,
    refreshIntervalSeconds,
    label,
    repositoryAttribution,
  };
}

function parseRepositoryAttribution(value) {
  const parsed = parseRepositoryAttributionJson(value);
  if (parsed === undefined) return new Map();
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Repository attribution must be an object.");
  }
  const { repositories } = parsed;
  if (
    typeof repositories !== "object" ||
    repositories === null ||
    Array.isArray(repositories)
  ) {
    throw new Error(
      "Repository attribution must contain a repositories object.",
    );
  }
  const result = new Map();
  for (const [repository, rawAttribution] of Object.entries(repositories)) {
    if (
      typeof rawAttribution !== "object" ||
      rawAttribution === null ||
      Array.isArray(rawAttribution)
    ) {
      throw new Error(`Invalid repository attribution for ${repository}.`);
    }
    const { project, category, task } = rawAttribution;
    const parsedProject = parseIdLabel(project);
    const parsedCategory = parseIdLabel(category);
    if (parsedProject === undefined || parsedCategory === undefined) {
      throw new Error(`Invalid repository attribution for ${repository}.`);
    }
    result.set(normalizeRepositoryIdentity(repository), {
      project: parsedProject,
      category: parsedCategory,
      ...(parseOptionalString(task) === undefined
        ? {}
        : { task: parseOptionalString(task) }),
    });
  }
  return result;
}

function parseRepositoryAttributionJson(value) {
  if (value === undefined || value === "" || value === "{}") return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("Repository attribution must be valid JSON.");
    }
  }
  return value;
}

function parseIdLabel(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const { id, label } = value;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof label !== "string" ||
    label.length === 0
  ) {
    return undefined;
  }
  return { id, label };
}

function parseOptionalString(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value;
}

export default parseProjectTimeConfig;
