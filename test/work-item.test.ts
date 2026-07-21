import assert from "node:assert/strict"
import test from "node:test"
import { extractWorkItem } from "../src/time-log/domain/work-item.js"

test("extracts one explicit stable work item", () => {
  assert.deepEqual(extractWorkItem("Review PR #84"), { kind: "pull_request", number: 84, source: "user_provided" })
  assert.deepEqual(extractWorkItem("https://github.com/acme/app/issues/99"), { kind: "issue", number: 99, repository: "github.com/acme/app", source: "user_provided" })
  assert.deepEqual(
    extractWorkItem("Issue #99 — https://github.com/acme/app/issues/99"),
    { kind: "issue", number: 99, repository: "github.com/acme/app", source: "user_provided" },
  )
  assert.equal(extractWorkItem("Review PR #84 and PR #85"), undefined)
})
