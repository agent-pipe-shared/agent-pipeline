#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDeferredBacklog, dueState, extractRevisitCondition } from "./check-deferred-backlog.mjs";

function fixture(items) {
  const root = mkdtempSync(join(tmpdir(), "check-deferred-backlog-"));
  mkdirSync(join(root, "backlog", "items"), { recursive: true });
  for (const [name, metadata, body] of items) {
    const frontmatter = Object.entries({ schema: "pipeline.backlog-item.v1", ...metadata })
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
    writeFileSync(join(root, "backlog", "items", name), `---\n${frontmatter}\n---\n\n${body}\n`);
  }
  return root;
}

const metadata = (id, overrides = {}) => ({
  id: `pipeline.${id}`, type: "defect", owner: "pipeline", status: "deferred",
  created: "2026-08-01", source: "fixture", sprint: "nova-b", ...overrides,
});

test("extractRevisitCondition recognizes wrapped triage prose and a review trigger", () => {
  assert.equal(extractRevisitCondition("## Triage\n\n- **Rationale:** parked. Condition to\n  revisit: the next Nova session.\n- **Assignment:** Nova"), "the next Nova session.");
  assert.equal(extractRevisitCondition('review trigger = "before the next push", no calendar expiry.'), "before the next push");
  assert.equal(extractRevisitCondition("No scheduling condition."), null);
});

test("dueState distinguishes expired, current, future, and absent dates", () => {
  assert.equal(dueState("2026-08-31", "2026-09-01"), "overdue");
  assert.equal(dueState("2026-09-01", "2026-09-01"), "due-today");
  assert.equal(dueState("2026-09-02", "2026-09-01"), "scheduled");
  assert.equal(dueState(null, "2026-09-01"), "unscheduled");
});

test("checkDeferredBacklog reports only deferred defects without blocking on reported risk", () => {
  const root = fixture([
    ["2026-08-01-expired.md", metadata("expired", { due: "2026-08-20" }), "## Triage\n\nCondition to revisit: when Nova begins."],
    ["2026-08-01-current.md", metadata("current", { due: "2026-09-01" }), "## Triage\n\nCondition to revisit: today."],
    ["2026-08-01-unscheduled.md", metadata("unscheduled"), "## Triage\n\nNo condition."],
    ["2026-08-01-open.md", metadata("open", { status: "open" }), "Condition to revisit: ignored."],
    ["2026-08-01-workflow.md", metadata("workflow", { type: "workflow-improvement" }), "Condition to revisit: ignored."],
  ]);
  const result = checkDeferredBacklog(root, { asOf: "2026-09-01" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.count, 3);
  assert.deepEqual(result.summary, { overdue: 1, dueToday: 1, scheduled: 0, unscheduled: 1, missingRevisitCondition: 1 });
  assert.deepEqual(result.items.map((item) => item.id), ["pipeline.current", "pipeline.expired", "pipeline.unscheduled"]);
  assert.equal(result.items.find((item) => item.id === "pipeline.expired").ageDays, 31);
  assert.equal(result.items.find((item) => item.id === "pipeline.expired").path, "backlog/items/2026-08-01-expired.md");
});

test("checkDeferredBacklog fails only for an invalid date or malformed item input", () => {
  const root = fixture([["2026-08-01-valid.md", metadata("valid"), "Condition to revisit: later."]]);
  assert.equal(checkDeferredBacklog(root, { asOf: "not-a-date" }).ok, false);
  writeFileSync(join(root, "backlog", "items", "2026-08-02-broken.md"), "not frontmatter\n");
  const malformed = checkDeferredBacklog(root, { asOf: "2026-09-01" });
  assert.equal(malformed.ok, false);
  assert.match(malformed.errors.join("\n"), /item must begin with YAML frontmatter/u);
});
