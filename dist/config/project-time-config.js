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
};
const REMOVED_SETTING_NAMES = ["repositoryBilling", "Repository Attribution"];
export function parseProjectTimeConfig(options) {
  const legacySetting = Object.entries(LEGACY_SETTING_NAMES).find(
    ([settingName]) => settingName in (options ?? {}),
  );
  if (legacySetting !== undefined) {
    throw new Error(
      `Project Time settings changed in v5. Replace \`${legacySetting[0]}\` with \`${legacySetting[1]}\`.`,
    );
  }
  const removedSettingName = REMOVED_SETTING_NAMES.find(
    (settingName) => settingName in (options ?? {}),
  );
  if (removedSettingName !== undefined) {
    throw new Error(
      `Project Time v6 removed \`${removedSettingName}\`. Remove it from plugin settings.`,
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
  return {
    activeWindowMinutes,
    refreshIntervalSeconds,
    label,
  };
}

export default parseProjectTimeConfig;
