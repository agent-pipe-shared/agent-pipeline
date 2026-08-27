#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-backlog-sprint-assignment.test.mjs -- covers checkBacklogSprintAssignment() against
 * synthetic item fixtures (a valid declaration, an unrecognized value, an absent declaration)
 * plus the real repository, which must exit ok today (NVA-SPRINTFIELD-1 DoD).
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkBacklogSprintAssignment, DEFAULT_ROOT } from "./check-backlog-sprint-assignment.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

/** A minimal `backlog/items/` fixture -- no ledger, no Git repository, no schemas: the checker under test reads only item frontmatter. */
function fixture(items) {
  const base = mkdtempSync(join(tmpdir(), "check-backlog-sprint-assignment-"));
  mkdirSync(join(base, "backlog", "items"), { recursive: true });
  for (const item of items) {
    const meta = { schema: "pipeline.backlog-item.v1", ...item.metadata };
    const lines = Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
    writeFileSync(join(base, "backlog", "items", item.name), `---\n${lines.join("\n")}\n---\n\n# ${meta.id}\n\nFixture body.\n`);
  }
  return base;
}

const ITEM = (id, extra = {}) => ({
  name: `2026-08-27-${id}.md`,
  metadata: { id: `pipeline.${id}`, type: "defect", owner: "pipeline", status: "open", created: "2026-08-27", source: "fixture", ...extra },
});

test("checkBacklogSprintAssignment: DEFAULT_ROOT resolves to the repository root", () => {
  assert.equal(DEFAULT_ROOT, REPO_ROOT);
});

test("checkBacklogSprintAssignment: a valid declared sprint is counted and ok", () => {
  const root = fixture([ITEM("valid-sprint-item", { sprint: "nova" })]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.counts.nova, 1);
  assert.equal(result.undeclared, 0);
  assert.equal(result.total, 1);
});

test("checkBacklogSprintAssignment: an unrecognized sprint value is a finding and fails", () => {
  const root = fixture([ITEM("bogus-sprint-item", { sprint: "cyborg" })]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0], /sprint "cyborg" is not in the closed set/);
  // Cyborg is deliberately excluded from BACKLOG_SPRINTS (see backlog-state.mjs) even though it
  // is a real, completed Sprint: ADR-0043 never gives it a formal slug the way every other
  // planning window gets one, so it must never silently count.
  assert.equal(result.undeclared, 0);
});

test("checkBacklogSprintAssignment: an item with no sprint field is reported, not a failure, and exit stays ok", () => {
  const root = fixture([ITEM("no-sprint-item")]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.undeclared, 1);
  assert.deepEqual(result.undeclaredItems, ["backlog/items/2026-08-27-no-sprint-item.md"]);
});

test("checkBacklogSprintAssignment: a mix of declared/undeclared/invalid items counts each bucket independently", () => {
  const root = fixture([
    ITEM("mix-a", { sprint: "alfred" }),
    ITEM("mix-b", { sprint: "alfred" }),
    ITEM("mix-c"),
    ITEM("mix-d", { sprint: "not-a-real-sprint" }),
  ]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, false, "one invalid value in the batch still fails the whole run");
  assert.equal(result.counts.alfred, 2);
  assert.equal(result.undeclared, 1);
  assert.equal(result.findings.length, 1);
  assert.equal(result.total, 4);
});

test("checkBacklogSprintAssignment: the real repository exits ok today", () => {
  const result = checkBacklogSprintAssignment(REPO_ROOT);
  assert.equal(result.ok, true, `expected the real backlog to carry no out-of-set sprint value; findings: ${JSON.stringify(result.findings)}`);
  assert.deepEqual(result.findings, []);
  assert.ok(result.total > 0, "the real backlog/items directory must not enumerate as empty");
});
