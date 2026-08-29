// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import {
  CRITIC_SKIP_SCHEMA,
  countCriticSkipDecisions,
  evaluateCriticSkipCoverage,
  evaluateCriticSkipCoverageFromRecords,
  hasCriticSkipDecision,
} from "./critic-skip-decision.mjs";

// --- hasCriticSkipDecision ---------------------------------------------------------------

test("hasCriticSkipDecision: true for a well-formed criticSkip object with a reason", () => {
  assert.equal(
    hasCriticSkipDecision({ taskId: "X", criticSkip: { schema: CRITIC_SKIP_SCHEMA, reason: "T5" } }),
    true,
  );
});

test("hasCriticSkipDecision: true even without a reason -- reason is a plus, not required", () => {
  assert.equal(hasCriticSkipDecision({ taskId: "X", criticSkip: { schema: CRITIC_SKIP_SCHEMA } }), true);
});

test("hasCriticSkipDecision: false for an old-shaped record with no criticSkip field at all", () => {
  // Realistic shape: a real dispatch record (mirrors evidence/dispatch-record-NVA-R18-SCANBOOT.json)
  // predating this mechanism.
  const oldShaped = {
    taskId: "NVA-R18-SCANBOOT",
    agentType: "goldfish-deep",
    model: "claude-sonnet-5",
    rulesetSha: "cb16a3df",
    dispatcher: "elephant",
    outcome: "completed",
    commits: [{ sha: "19233eab", changedFiles: ["a.mjs"] }],
    log: [],
    report: "prose",
  };
  assert.equal(hasCriticSkipDecision(oldShaped), false);
});

test("hasCriticSkipDecision: false for criticSkip present but not an object (malformed)", () => {
  assert.equal(hasCriticSkipDecision({ criticSkip: "yes" }), false);
  assert.equal(hasCriticSkipDecision({ criticSkip: null }), false);
  assert.equal(hasCriticSkipDecision({ criticSkip: true }), false);
});

test("hasCriticSkipDecision: false for a non-object record, never throws", () => {
  assert.equal(hasCriticSkipDecision(null), false);
  assert.equal(hasCriticSkipDecision(undefined), false);
  assert.equal(hasCriticSkipDecision("not a record"), false);
  assert.equal(hasCriticSkipDecision(42), false);
});

// --- countCriticSkipDecisions ------------------------------------------------------------

test("countCriticSkipDecisions: counts only records carrying the field", () => {
  const records = [
    { taskId: "A", criticSkip: { schema: CRITIC_SKIP_SCHEMA, reason: "T5" } },
    { taskId: "B" }, // old-shaped
    { taskId: "C", criticSkip: { schema: CRITIC_SKIP_SCHEMA } },
    { taskId: "D", outcome: "completed" }, // old-shaped
  ];
  assert.equal(countCriticSkipDecisions(records), 2);
});

test("countCriticSkipDecisions: zero for an empty or non-array input", () => {
  assert.equal(countCriticSkipDecisions([]), 0);
  assert.equal(countCriticSkipDecisions(null), 0);
  assert.equal(countCriticSkipDecisions(undefined), 0);
});

// --- evaluateCriticSkipCoverage (pure numeric core) ---------------------------------------

test("evaluateCriticSkipCoverage: 0 artifacts + 0 skip records + work in scope -> FINDING", () => {
  const result = evaluateCriticSkipCoverage({ dispatchedWorkCount: 3, criticArtifactCount: 0, skipRecordCount: 0 });
  assert.equal(result.finding, true);
  assert.match(result.reason, /critic evidence expected but missing/u);
  assert.match(result.reason, /3 of 3/u);
});

test("evaluateCriticSkipCoverage: 0 artifacts + N skip records matching N pieces of work -> NOT a finding", () => {
  const result = evaluateCriticSkipCoverage({ dispatchedWorkCount: 3, criticArtifactCount: 0, skipRecordCount: 3 });
  assert.equal(result.finding, false);
  assert.match(result.reason, /legitimately never required/u);
  assert.match(result.reason, /3 skip record\(s\) matching 3/u);
});

test("evaluateCriticSkipCoverage: partial coverage (some work packages uncovered) -> FINDING, names the count", () => {
  const result = evaluateCriticSkipCoverage({ dispatchedWorkCount: 5, criticArtifactCount: 0, skipRecordCount: 2 });
  assert.equal(result.finding, true);
  assert.match(result.reason, /3 of 5/u);
});

test("evaluateCriticSkipCoverage: any critic artifact present -> never a finding, regardless of skip count", () => {
  const result = evaluateCriticSkipCoverage({ dispatchedWorkCount: 3, criticArtifactCount: 1, skipRecordCount: 0 });
  assert.equal(result.finding, false);
  assert.match(result.reason, /1 critic artifact\(s\) present/u);
});

test("evaluateCriticSkipCoverage: zero dispatched work in scope -> never a finding", () => {
  const result = evaluateCriticSkipCoverage({ dispatchedWorkCount: 0, criticArtifactCount: 0, skipRecordCount: 0 });
  assert.equal(result.finding, false);
  assert.match(result.reason, /no dispatched work in scope/u);
});

test("evaluateCriticSkipCoverage: more skip records than dispatched work still resolves as covered, not a crash", () => {
  const result = evaluateCriticSkipCoverage({ dispatchedWorkCount: 2, criticArtifactCount: 0, skipRecordCount: 5 });
  assert.equal(result.finding, false);
});

// --- evaluateCriticSkipCoverageFromRecords (records-based convenience) --------------------

test("evaluateCriticSkipCoverageFromRecords: a SINGLE old-shaped record with no skip field is NOT itself a finding", () => {
  // This is the third Acceptance bullet's own required proof: existing/legitimately-already-
  // shipped work is not retroactively flagged once this mechanism lands.
  const oldShaped = {
    taskId: "NVA-SOME-OLDER-TASK",
    agentType: "goldfish-implementor",
    model: "claude-sonnet-5",
    rulesetSha: "cb16a3df",
    dispatcher: "elephant",
    outcome: "completed",
    commits: [],
    log: [],
    report: { text: "done", changedFiles: [] },
  };
  const result = evaluateCriticSkipCoverageFromRecords({ records: [oldShaped], criticArtifactCount: 0 });
  assert.equal(result.finding, false);
});

test("evaluateCriticSkipCoverageFromRecords: a mix of old-shaped and skip-logged records is not dragged down by the old one", () => {
  const oldShaped = { taskId: "OLD-1", outcome: "completed" };
  const newShaped = { taskId: "NEW-1", outcome: "completed", criticSkip: { schema: CRITIC_SKIP_SCHEMA, reason: "T0" } };
  const result = evaluateCriticSkipCoverageFromRecords({ records: [oldShaped, newShaped], criticArtifactCount: 0 });
  assert.equal(result.finding, false);
  assert.match(result.reason, /1 skip record\(s\) matching 1/u);
});

test("evaluateCriticSkipCoverageFromRecords: several skip-logged records, zero critic artifacts -> not a finding", () => {
  const records = [
    { taskId: "A", criticSkip: { schema: CRITIC_SKIP_SCHEMA, reason: "T5" } },
    { taskId: "B", criticSkip: { schema: CRITIC_SKIP_SCHEMA, reason: "T0" } },
    { taskId: "C", criticSkip: { schema: CRITIC_SKIP_SCHEMA } },
  ];
  const result = evaluateCriticSkipCoverageFromRecords({ records, criticArtifactCount: 0 });
  assert.equal(result.finding, false);
  assert.match(result.reason, /3 skip record\(s\) matching 3/u);
});

test("evaluateCriticSkipCoverageFromRecords: empty records array -> not a finding", () => {
  const result = evaluateCriticSkipCoverageFromRecords({ records: [], criticArtifactCount: 0 });
  assert.equal(result.finding, false);
});

test("evaluateCriticSkipCoverageFromRecords: non-array records input tolerated, not a finding", () => {
  const result = evaluateCriticSkipCoverageFromRecords({ records: undefined, criticArtifactCount: 0 });
  assert.equal(result.finding, false);
});

process.stdout.write("critic-skip-decision: all cases passed\n");
