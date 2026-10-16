// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.dispatch-record-log-stays-empty-despite-mandatory-phase-entries (AC-163).
// Original item: backlog/items/2026-10-05-dispatch-record-log-stays-empty-despite-mandatory-phase-entries.md
// Proposal point: "a mechanical check at dispatch close that rejects a terminal record with an empty log".
// All cases drive the real validateDispatchRecord / validatePreviousDispatchRecord; nothing is mocked.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateDispatchRecord, validatePreviousDispatchRecord, reportSha256, OUTCOME_CLASSIFICATION_SCHEMA } from "../dispatch-record.mjs";
import { CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../critic-skip-decision.mjs";

const SHA = "a".repeat(40);
const DONE = "b".repeat(40);
const trigger = () => ({ schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } });
const skip = () => ({ schema: CRITIC_SKIP_SCHEMA, trigger: trigger(), appliedRow: "T5", reason: "no mandatory review trigger" });
const base = { taskId: "PIN-LOG-1", agentType: "goldfish-implementor", model: "claude-sonnet-5-5", effort: "medium", rulesetSha: "0.7.0+local", dispatcher: "Elephant", criticSkip: skip() };
const v3Opening = () => ({ schema: "pipeline.dispatch-record.v3", ...base, candidateCommit: SHA, resultSha256: null, outcome: "in-progress", commits: [], log: [], report: null });
const reportText = "Done.";
const v3Terminal = (log) => ({ ...v3Opening(), candidateCommit: DONE, resultSha256: "d".repeat(64), outcome: "completed", commits: [DONE], log, report: { text: reportText, changedFiles: ["plugins/pipeline-core/lib/x.mjs"] } });
const v4Terminal = (log) => ({ schema: "pipeline.dispatch-record.v4", runner: "claude", ...base, candidateCommit: DONE, resultSha256: reportSha256(reportText), outcome: "completed", commits: [DONE], log, report: { text: reportText, changedFiles: ["plugins/pipeline-core/lib/x.mjs"] }, outcomeClassification: { schema: OUTCOME_CLASSIFICATION_SCHEMA, kind: "authored-commit" } });
const goodLog = [{ phase: "verify", toolUseCount: 12, note: "focused checks passed" }];

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

// ACCEPTANCE GAP (Proposal: mechanical check at dispatch close rejects a terminal record with an empty log).
// Currently RED: validateRecord() in plugins/pipeline-core/lib/dispatch-record.mjs only bounds log.length above
// and never requires >= 1 entry for a terminal outcome, so the empty-log terminal record validates.
test("ACCEPTANCE: a terminal v4 authored-commit record with an empty log is rejected", () => {
  assert.throws(() => validateDispatchRecord(v4Terminal([])), "terminal record with log: [] must fail validation");
});

test("ACCEPTANCE: a terminal v3 record with an empty log is rejected", () => {
  assert.throws(() => validatePreviousDispatchRecord(v3Terminal([])), "terminal record with log: [] must fail validation");
});
