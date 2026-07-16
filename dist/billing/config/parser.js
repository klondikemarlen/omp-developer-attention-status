import { parseBillableTimeConfig } from "../../billable-time/config.js";
import {
  DEFAULT_ACTIVE_WINDOW_MINUTES,
  DEFAULT_HOURS_PER_WEEK,
  DEFAULT_LABEL,
  DEFAULT_LOCALE,
  DEFAULT_MONTHLY_SALARY,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  DEFAULT_WEEKS_PER_YEAR,
} from "../../billing/config/defaults.js";
import { parseNonEmptyString } from "../../utils/parse-non-empty-string.js";
import { parsePositiveNumber } from "../../utils/parse-positive-number.js";

export function parseDeveloperCostConfig(options) {
  const rawMonthlySalary = options?.monthlySalary ?? DEFAULT_MONTHLY_SALARY;
  const rawHoursPerWeek = options?.hoursPerWeek ?? DEFAULT_HOURS_PER_WEEK;
  const rawWeeksPerYear = options?.weeksPerYear ?? DEFAULT_WEEKS_PER_YEAR;
  const rawActiveWindowMinutes =
    options?.activeWindowMinutes ?? DEFAULT_ACTIVE_WINDOW_MINUTES;
  const rawRefreshIntervalSeconds =
    options?.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
  const rawLabel = options?.label ?? DEFAULT_LABEL;
  const rawLocale = options?.locale ?? DEFAULT_LOCALE;
  const rawBillableTime = options?.billableTime;
  const parsedMonthlySalary = parsePositiveNumber(rawMonthlySalary);
  const monthlySalary = parsedMonthlySalary ?? DEFAULT_MONTHLY_SALARY;
  const parsedHoursPerWeek = parsePositiveNumber(rawHoursPerWeek);
  const hoursPerWeek = parsedHoursPerWeek ?? DEFAULT_HOURS_PER_WEEK;
  const parsedWeeksPerYear = parsePositiveNumber(rawWeeksPerYear);
  const weeksPerYear = parsedWeeksPerYear ?? DEFAULT_WEEKS_PER_YEAR;
  const parsedActiveWindowMinutes = parsePositiveNumber(rawActiveWindowMinutes);
  const activeWindowMinutes =
    parsedActiveWindowMinutes ?? DEFAULT_ACTIVE_WINDOW_MINUTES;
  const parsedRefreshIntervalSeconds = parsePositiveNumber(
    rawRefreshIntervalSeconds,
  );
  const refreshIntervalSeconds =
    parsedRefreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
  const parsedLabel = parseNonEmptyString(rawLabel);
  const label = parsedLabel?.toLowerCase() ?? DEFAULT_LABEL;
  const locale = parseNumberFormatLocale(rawLocale);
  const billableTime = parseBillableTimeConfig(rawBillableTime);
  return {
    monthlySalary,
    hoursPerWeek,
    weeksPerYear,
    activeWindowMinutes,
    refreshIntervalSeconds,
    label,
    locale,
    billableTime,
  };
}

export function parseStoredDeveloperCostConfig(value) {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value;
  const { billableTime: _billableTime, ...scalarOptions } = candidate;
  let config;
  try {
    config = parseDeveloperCostConfig(scalarOptions);
  } catch {
    return undefined;
  }
  if (
    candidate.monthlySalary !== config.monthlySalary ||
    candidate.hoursPerWeek !== config.hoursPerWeek ||
    candidate.weeksPerYear !== config.weeksPerYear ||
    candidate.activeWindowMinutes !== config.activeWindowMinutes ||
    candidate.refreshIntervalSeconds !== config.refreshIntervalSeconds
  ) {
    return undefined;
  }
  const label = parseNonEmptyString(candidate.label)?.toLowerCase();
  return label === config.label &&
    (candidate.locale === undefined || candidate.locale === config.locale)
    ? config
    : undefined;
}

function parseNumberFormatLocale(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      "Project Time locale must be a BCP 47 locale supported by Intl.NumberFormat.",
    );
  }
  try {
    const [locale] = Intl.NumberFormat.supportedLocalesOf([value.trim()]);
    if (locale !== undefined) return locale;
  } catch {}
  throw new Error(
    "Project Time locale must be a BCP 47 locale supported by Intl.NumberFormat.",
  );
}

export default parseDeveloperCostConfig;
