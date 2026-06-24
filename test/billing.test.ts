import assert from "node:assert/strict"
import test from "node:test"

import {
  emptyDeveloperCostState,
  formatDeveloperCost,
  parseDeveloperCostConfig,
  recordDeveloperPrompt,
  settleDeveloperCostState,
  windowRate,
} from "../src/billing.js"

const config = parseDeveloperCostConfig()

const windowMs = config.activeWindowMinutes * 60 * 1000

test("parses the default Canadian developer configuration", () => {
  assert.equal(config.annualSalary, 80_000)
  assert.equal(config.hoursPerWeek, 40)
  assert.equal(config.weeksPerYear, 50)
  assert.equal(config.activeWindowMinutes, 5)
  assert.equal(config.currencyCode, "CAD")
  assert.equal(config.label, "dev")
})

test("accepts the legacy annualSalaryUsd option", () => {
  const legacyConfig = parseDeveloperCostConfig({ annualSalaryUsd: 100000 })

  assert.equal(legacyConfig.annualSalary, 100000)
})

test("computes the five minute developer rate", () => {
  assert.equal(windowRate(config).toFixed(2), "3.33")
})

test("bills one window for a single prompt after five minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const prompted = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const settled = settleDeveloperCostState(prompted, start + windowMs, config)

  assert.equal(settled.totalCost.toFixed(2), "3.33")
  assert.equal(settled.activeStartAtMs, undefined)
  assert.equal(settled.activeUntilMs, undefined)
})

test("keeps one billed window when activity stops before ten minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const second = recordDeveloperPrompt(first, start + 4 * 60 * 1000, config)
  const nineMinutesLater = settleDeveloperCostState(second, start + 9 * 60 * 1000, config)
  const tenMinutesLater = settleDeveloperCostState(second, start + 10 * 60 * 1000, config)

  assert.equal(nineMinutesLater.totalCost.toFixed(2), "3.33")
  assert.equal(tenMinutesLater.totalCost.toFixed(2), "3.33")
})

test("bills two windows when prompts keep the session active for ten minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const second = recordDeveloperPrompt(first, start + 4 * 60 * 1000, config)
  const third = recordDeveloperPrompt(second, start + 8 * 60 * 1000, config)
  const settled = settleDeveloperCostState(third, start + 10 * 60 * 1000, config)

  assert.equal(settled.totalCost.toFixed(2), "6.67")
})

test("starts a new spell after more than five idle minutes", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0)
  const first = recordDeveloperPrompt(emptyDeveloperCostState(), start, config)
  const expired = settleDeveloperCostState(first, start + windowMs + 60 * 1000, config)
  const second = recordDeveloperPrompt(expired, start + 12 * 60 * 1000, config)
  const settled = settleDeveloperCostState(second, start + 17 * 60 * 1000, config)

  assert.equal(settled.totalCost.toFixed(2), "6.67")
})

test("formats the accumulated cost as CAD currency by default", () => {
  assert.equal(formatDeveloperCost(4.859086491739553, "CAD"), "$4.86")
})
