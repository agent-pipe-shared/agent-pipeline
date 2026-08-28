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

test("checkBacklogSprintAssignment: a non-open item with no sprint field is reported, not a failure, and exit stays ok", () => {
  const root = fixture([ITEM("no-sprint-item", { status: "deferred" })]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.undeclared, 1);
  assert.deepEqual(result.undeclaredItems, ["backlog/items/2026-08-27-no-sprint-item.md"]);
  assert.equal(result.openUndeclared, 0);
  assert.deepEqual(result.openUndeclaredItems, []);
});

// NVA-SPRINTGATE-1: the sprint declaration is now mandatory, mechanically, for `open` items.
test("checkBacklogSprintAssignment: an open item with no sprint field is a finding and fails", () => {
  const root = fixture([ITEM("open-no-sprint-item")]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0], /status is open but declares no sprint/);
  assert.equal(result.undeclared, 1);
  assert.deepEqual(result.undeclaredItems, ["backlog/items/2026-08-27-open-no-sprint-item.md"]);
  assert.equal(result.openUndeclared, 1);
  assert.deepEqual(result.openUndeclaredItems, ["backlog/items/2026-08-27-open-no-sprint-item.md"]);
});

test("checkBacklogSprintAssignment: an open item with a valid declared sprint produces no finding", () => {
  const root = fixture([ITEM("open-valid-sprint-item", { sprint: "batman" })]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.openUndeclared, 0);
  assert.deepEqual(result.openUndeclaredItems, []);
});

// PO decision 2026-08-27: `none` is an admissible declaration meaning "belongs to no planning
// window". These three tests pin the distinction the whole change exists for -- `none` satisfies
// the mandatory-declaration rule, an absent field still does not, and the two never merge.
test("checkBacklogSprintAssignment: an open item declaring sprint none is ok and is not a failure", () => {
  const root = fixture([ITEM("open-none-sprint-item", { sprint: "none" })]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.none, 1);
  assert.deepEqual(result.noneItems, ["backlog/items/2026-08-27-open-none-sprint-item.md"]);
  assert.equal(result.openUndeclared, 0, "an explicit none is a declaration, so the open-item rule is satisfied");
  assert.equal(result.undeclared, 0, "an explicit none is never counted as a missing declaration");
});

test("checkBacklogSprintAssignment: sprint none is counted apart from every planning window", () => {
  const root = fixture([ITEM("none-vs-window", { sprint: "none" }), ITEM("real-window", { sprint: "nova" })]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, true);
  assert.equal(result.counts.nova, 1);
  assert.equal(result.none, 1);
  // The regression this guards: adding `none` as a sixth BACKLOG_SPRINTS entry would make it
  // appear in `counts` and read as a planning window in every consumer of that constant.
  assert.equal(Object.hasOwn(result.counts, "none"), false, "none must never appear as a sprint bucket");
});

test("checkBacklogSprintAssignment: a closed item declaring sprint none is ok", () => {
  const root = fixture([ITEM("closed-none-sprint-item", { status: "closed", sprint: "none" })]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.none, 1);
});

test("checkBacklogSprintAssignment: a mix of declared/undeclared/invalid items counts each bucket independently", () => {
  const root = fixture([
    ITEM("mix-a", { sprint: "alfred" }),
    ITEM("mix-b", { sprint: "alfred" }),
    ITEM("mix-c", { status: "in_progress" }),
    ITEM("mix-d", { sprint: "not-a-real-sprint" }),
  ]);
  const result = checkBacklogSprintAssignment(root);
  assert.equal(result.ok, false, "one invalid value in the batch still fails the whole run");
  assert.equal(result.counts.alfred, 2);
  assert.equal(result.undeclared, 1);
  assert.equal(result.findings.length, 1);
  assert.equal(result.total, 4);
  assert.equal(result.openUndeclared, 0, "mix-c is non-open, so it must not count as an open-undeclared finding");
});

test("checkBacklogSprintAssignment: the real repository exits ok today", () => {
  const result = checkBacklogSprintAssignment(REPO_ROOT);
  assert.equal(result.ok, true, `expected the real backlog to carry no out-of-set sprint value; findings: ${JSON.stringify(result.findings)}`);
  assert.deepEqual(result.findings, []);
  assert.ok(result.total > 0, "the real backlog/items directory must not enumerate as empty");
});
