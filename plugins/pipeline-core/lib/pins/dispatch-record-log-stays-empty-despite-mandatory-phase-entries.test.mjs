// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.dispatch-record-log-stays-empty-despite-mandatory-phase-entries (AC-163).
// Original item: backlog/items/2026-10-05-dispatch-record-log-stays-empty-despite-mandatory-phase-entries.md
// Proposal point: "a mechanical check at dispatch close that rejects a terminal record with an empty log".
// Restated by PO decision D77 (K6, specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md):
//   "a new terminal record with an empty log is refused at write; committed v3 history stays readable".
// Both halves are pinned, plus the v4 read refusal:
//   write half  - writeDispatchRecordObject refuses a NEW terminal v3 or v4 record with log: [] (code record-log,
//                 message names the repair) and leaves no file behind; the completed-undelivered v4 observation keeps
//                 its documented exception.
//   read half   - a committed terminal v3 record with an empty log (NVA-B-CONSUMER-SAFE-STALE-ALLOWLIST-1,
//                 NVA-B-INSTALLER-ATTESTATION-RUNNER-PARITY-1) stays readable; a terminal v4 record with an empty log
//                 stays refused at read, so the v4 write refusal is defense in depth behind the read validator.
// All cases drive the real validators and the real writer; nothing is mocked.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { validateDispatchRecord, validatePreviousDispatchRecord, reportSha256, OUTCOME_CLASSIFICATION_SCHEMA } from "../dispatch-record.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../critic-skip-decision.mjs";
import { writeDispatchRecordObject } from "../../scripts/dispatch-record-write.mjs";

const SHA = "a".repeat(40);
const DONE = "b".repeat(40);
const trigger = () => ({ schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } });
const skip = () => ({ schema: CRITIC_SKIP_SCHEMA, trigger: trigger(), appliedRow: "T5", reason: "no mandatory review trigger" });
const base = { taskId: "PIN-LOG-1", agentType: "goldfish-implementor", model: "claude-sonnet-5-5", effort: "medium", rulesetSha: "0.7.0+local", dispatcher: "Elephant", criticSkip: skip() };
const v3Opening = () => ({ schema: "pipeline.dispatch-record.v3", ...base, candidateCommit: SHA, resultSha256: null, outcome: "in-progress", commits: [], log: [], report: null });
const reportText = "Done.";
const v3Terminal = (log) => ({ ...v3Opening(), candidateCommit: DONE, resultSha256: "d".repeat(64), outcome: "completed", commits: [DONE], log, report: { text: reportText, changedFiles: ["plugins/pipeline-core/lib/x.mjs"] } });
const v4Terminal = (log) => ({ schema: "pipeline.dispatch-record.v4", runner: "claude", ...base, candidateCommit: DONE, resultSha256: reportSha256(reportText), outcome: "completed", commits: [DONE], log, report: { text: reportText, changedFiles: ["plugins/pipeline-core/lib/x.mjs"] }, outcomeClassification: { schema: OUTCOME_CLASSIFICATION_SCHEMA, kind: "authored-commit" } });
const undelivered = () => {
  const { criticSkip, ...rest } = base;
  return { schema: "pipeline.dispatch-record.v4", runner: "antigravity", ...rest, model: "gemini-3.8-flash-high", effort: "high", candidateCommit: SHA, resultSha256: null,
    outcome: "completed-no-delivery", commits: [], log: [], report: null,
    outcomeClassification: { schema: OUTCOME_CLASSIFICATION_SCHEMA, kind: "completed-undelivered" },
    observationIdentity: { dispatchId: "PIN-LOG-1", attemptId: "attempt-1" },
    criticRequired: { schema: CRITIC_REQUIRED_SCHEMA, trigger: { ...trigger(), rigorLevel: 2 }, appliedRow: "T3" } };
};
const goodLog = [{ phase: "verify", toolUseCount: 12, note: "focused checks passed" }];
const REPAIR = /append the mandatory phase entries/u;
const writeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "pin-log-write-"));
  mkdirSync(join(root, "evidence"));
  return root;
};
const target = (record) => `evidence/dispatch-record-${record.taskId}.json`;
const refusal = (fn) => { try { fn(); } catch (error) { return error; } return null; };

test("control: an in-progress opening may start with an empty log (progress not yet made)", () => {
  assert.deepEqual(validatePreviousDispatchRecord(v3Opening()).log, []);
});

test("control: a terminal record carrying phase entries validates (v3 and v4)", () => {
  assert.equal(validatePreviousDispatchRecord(v3Terminal(goodLog)).log.length, 1);
  assert.equal(validateDispatchRecord(v4Terminal(goodLog)).log.length, 1);
});

test("log entries are strictly shaped: phase and non-negative integer toolUseCount are required", () => {
  for (const bad of [[{ phase: "", toolUseCount: 1 }], [{ phase: "verify" }], [{ phase: "verify", toolUseCount: -1 }], [{ phase: "verify", toolUseCount: 1.5 }], [{ phase: "verify", toolUseCount: 1, extra: true }]]) {
    assert.throws(() => validateDispatchRecord(v4Terminal(bad)), `entry ${JSON.stringify(bad)} must be rejected`);
  }
});

test("log is bounded (<= 2048 entries)", () => {
  const entries = Array.from({ length: 2049 }, () => ({ phase: "p", toolUseCount: 1 }));
  assert.throws(() => validateDispatchRecord(v4Terminal(entries)));
});

test("native host finalizer sources a non-empty log for a successful return (source-shape pin)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(here, "../native-goldfish-host-finalizer.mjs"), "utf8");
  assert.match(src, /log:\s*observedNativeHostProgress\(/u);
  assert.match(src, /phase:\s*"host-dispatch-prepared"/u);
  assert.match(src, /phase:\s*"host-return-observed"/u);
});

// READ half (D77): committed v3 history with an empty log stays readable, through both v3 entry points.
test("ACCEPTANCE: committed v3 history stays readable - a terminal v3 record with an empty log validates at read", () => {
  assert.deepEqual(validatePreviousDispatchRecord(v3Terminal([])).log, []);
  assert.deepEqual(validateDispatchRecord(v3Terminal([])).log, []);
});

// READ half (D77): the v4 contract is unchanged - a terminal v4 record with an empty log is refused at read.
test("ACCEPTANCE: a terminal v4 authored-commit record with an empty log is rejected at read, naming the repair", () => {
  const error = refusal(() => validateDispatchRecord(v4Terminal([])));
  assert.ok(error, "terminal v4 record with log: [] must fail validation");
  assert.equal(error.code, "record-log");
  assert.match(error.message, REPAIR);
});

// WRITE half (D77): a NEW terminal record with an empty log is refused at write, with a message that names the repair.
// For v3 this is the only gate, because the read validator accepts committed v3 history; for v4 the read validator
// already refuses first, so this case pins that the writer's observable result is the same typed refusal.
for (const [label, build] of [["v3", v3Terminal], ["v4", v4Terminal]]) {
  test(`ACCEPTANCE: a new terminal ${label} record with an empty log is refused at write and leaves no file`, () => {
    const root = writeRoot();
    const record = build([]);
    const error = refusal(() => writeDispatchRecordObject({ repoRoot: root, target: target(record), record }));
    assert.ok(error, `terminal ${label} record with log: [] must not be written`);
    assert.equal(error.code, "record-log");
    assert.match(error.message, REPAIR);
    assert.equal(existsSync(join(root, target(record))), false, "a refused write leaves no record behind");
  });
}

test("control: a new terminal v3 record with one log entry is written", () => {
  const root = writeRoot();
  const record = { ...v3Terminal(goodLog), model: "claude-sonnet-5" };
  const receipt = writeDispatchRecordObject({ repoRoot: root, target: target(record), record });
  assert.equal(receipt.target, target(record));
  assert.equal(existsSync(join(root, target(record))), true);
});

test("control: the completed-undelivered v4 observation keeps its empty-log exception at read and at write", () => {
  const record = undelivered();
  assert.deepEqual(validateDispatchRecord(record).log, []);
  const root = writeRoot();
  const receipt = writeDispatchRecordObject({ repoRoot: root, target: target(record), record });
  assert.equal(receipt.target, target(record));
  assert.equal(existsSync(join(root, target(record))), true);
});
