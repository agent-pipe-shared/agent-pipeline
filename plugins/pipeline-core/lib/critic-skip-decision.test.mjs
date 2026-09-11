// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import {
  CRITIC_EVIDENCE_SCHEMA,
  CRITIC_DISPOSITION_WIRING_MARKER,
  CRITIC_REQUIRED_SCHEMA,
  CRITIC_SKIP_SCHEMA,
  CRITIC_TRIGGER_INPUT_SCHEMA,
  countCriticSkipDecisions,
  classifyCriticChangedPaths,
  criticDecisionPathFinding,
  criticDisposition,
  evaluateCriticTriggerRow,
  evaluateCriticSkipCoverage,
  evaluateCriticSkipCoverageFromRecords,
  hasCriticEvidenceReference,
  hasCriticRequiredDecision,
  hasCriticSkipDecision,
  validateCriticDecision,
  validateCriticTriggerInput,
} from "./critic-skip-decision.mjs";

const trigger = (overrides = {}) => ({
  schema: CRITIC_TRIGGER_INPUT_SCHEMA,
  rigorLevel: 0,
  riskClass: "low",
  riskFlag: false,
  diff: { mechanical: false, architecture: false, guardrails: false, security: false },
  ...overrides,
});
const skip = { schema: CRITIC_SKIP_SCHEMA, trigger: trigger(), appliedRow: "T5", reason: "fast path" };
const required = { schema: CRITIC_REQUIRED_SCHEMA, trigger: trigger({ rigorLevel: 2 }), appliedRow: "T3" };
const evidence = { schema: CRITIC_EVIDENCE_SCHEMA, taskId: "A", candidateCommit: "a".repeat(40), path: "evidence/critic-A.json", sha256: "b".repeat(64) };

test("the real-dispatch wiring marker remains machine discoverable", () => {
  assert.equal(CRITIC_DISPOSITION_WIRING_MARKER, "pipeline.critic-skip-wired-into-real-dispatch");
});

test("presence helpers accept objects and reject malformed lanes", () => {
  assert.equal(hasCriticSkipDecision({ criticSkip: skip }), true);
  assert.equal(hasCriticRequiredDecision({ criticRequired: required }), true);
  assert.equal(hasCriticEvidenceReference({ criticEvidence: evidence }), true);
  for (const value of [null, undefined, "yes", true, []]) {
    assert.equal(hasCriticSkipDecision({ criticSkip: value }), false);
    assert.equal(hasCriticRequiredDecision({ criticRequired: value }), false);
    assert.equal(hasCriticEvidenceReference({ criticEvidence: value }), false);
  }
});

test("criticDisposition distinguishes the five structural outcomes", () => {
  assert.equal(criticDisposition({ criticSkip: skip }), "skipped");
  assert.equal(criticDisposition({ criticRequired: required }), "required");
  assert.equal(criticDisposition({ criticEvidence: evidence }), "evidenced");
  assert.equal(criticDisposition({}), "missing");
  assert.equal(criticDisposition({ criticSkip: skip, criticEvidence: evidence }), "conflicting");
});

test("closed trigger inputs deterministically select the strictest matching row", () => {
  assert.deepEqual(validateCriticTriggerInput(trigger()), trigger());
  assert.equal(evaluateCriticTriggerRow(trigger({ diff: { mechanical: true, architecture: false, guardrails: false, security: false } })), "T0");
  assert.equal(evaluateCriticTriggerRow(trigger()), "T5");
  assert.equal(evaluateCriticTriggerRow(trigger({ diff: { mechanical: true, architecture: true, guardrails: false, security: false } })), "T1");
  assert.equal(evaluateCriticTriggerRow(trigger({ diff: { mechanical: true, architecture: false, guardrails: true, security: false } })), "T1");
  assert.equal(evaluateCriticTriggerRow(trigger({ diff: { mechanical: true, architecture: false, guardrails: false, security: true } })), "T1");
  assert.equal(evaluateCriticTriggerRow(trigger({ riskClass: "high" })), "T2");
  assert.equal(evaluateCriticTriggerRow(trigger({ rigorLevel: 2 })), "T3");
  assert.equal(evaluateCriticTriggerRow(trigger({ rigorLevel: 1 })), "T4");
  assert.equal(evaluateCriticTriggerRow(trigger({ riskFlag: true })), "T4");
});

test("changed paths conservatively expose A/G/S authority and mechanical-only surfaces", () => {
  assert.deepEqual(classifyCriticChangedPaths(["plugins/pipeline-core/hooks/guard-push.mjs"]), {
    mechanical: false, architecture: false, guardrails: true, security: false,
  });
  assert.deepEqual(classifyCriticChangedPaths(["agents/critic.md", "docs/adr/0042-review.md", "src/auth/token.mjs"]), {
    mechanical: false, architecture: true, guardrails: false, security: true,
  });
  assert.deepEqual(classifyCriticChangedPaths(["generated/client.mjs", "pnpm-lock.yaml"]), {
    mechanical: true, architecture: false, guardrails: false, security: false,
  });
  assert.equal(classifyCriticChangedPaths(["generated/client.mjs", "src/client.mjs"]).mechanical, false);
  assert.equal(classifyCriticChangedPaths([".claude/settings.local.json"]).guardrails, true);
});

test("path evidence rejects underdeclared T5 and false T0 while accepting honest declarations", () => {
  const falseT5 = criticDecisionPathFinding(skip, ["plugins/pipeline-core/hooks/guard-push.mjs"]);
  assert.equal(falseT5.code, "critic-trigger-underdeclared");
  assert.deepEqual(falseT5.missing, ["guardrails"]);
  const falseT0 = { ...skip, trigger: trigger({ diff: { mechanical: true, architecture: false, guardrails: false, security: false } }), appliedRow: "T0" };
  assert.equal(criticDecisionPathFinding(falseT0, ["src/runtime.mjs"]).code, "critic-mechanical-path-mismatch");
  assert.equal(criticDecisionPathFinding(falseT0, ["generated/client.mjs", "package-lock.json"]), null);
  const honestT1 = { ...required, trigger: trigger({ diff: { mechanical: false, architecture: false, guardrails: true, security: false } }), appliedRow: "T1" };
  assert.equal(criticDecisionPathFinding(honestT1, ["guardrails/quality-gates.md"]), null);
});

test("skip and required decisions are closed and restricted to their evaluated rows", () => {
  assert.deepEqual(validateCriticDecision(skip, { required: false }), skip);
  assert.deepEqual(validateCriticDecision(required, { required: true }), required);
  for (const triggerInput of [
    trigger({ diff: { mechanical: false, architecture: true, guardrails: false, security: false } }),
    trigger({ diff: { mechanical: false, architecture: false, guardrails: true, security: false } }),
    trigger({ diff: { mechanical: false, architecture: false, guardrails: false, security: true } }),
    trigger({ riskClass: "high" }),
    trigger({ rigorLevel: 2 }),
    trigger({ rigorLevel: 1 }),
  ]) {
    assert.throws(() => validateCriticDecision({ ...skip, trigger: triggerInput, appliedRow: evaluateCriticTriggerRow(triggerInput) }, { required: false }));
  }
  assert.throws(() => validateCriticDecision({ ...skip, unknown: true }, { required: false }));
  assert.throws(() => validateCriticTriggerInput({ ...trigger(), unknown: true }));
});

test("countCriticSkipDecisions counts only structured skip decisions", () => {
  assert.equal(countCriticSkipDecisions([{ criticSkip: skip }, {}, { criticSkip: "yes" }]), 1);
  assert.equal(countCriticSkipDecisions(undefined), 0);
});

test("numeric coverage requires the sum of individually evidenced and skipped records", () => {
  assert.equal(evaluateCriticSkipCoverage({ dispatchedWorkCount: 3, criticArtifactCount: 1, skipRecordCount: 2 }).finding, false);
  const missing = evaluateCriticSkipCoverage({ dispatchedWorkCount: 3, criticArtifactCount: 1, skipRecordCount: 1 });
  assert.equal(missing.finding, true);
  assert.match(missing.reason, /1 of 3/u);
  assert.equal(evaluateCriticSkipCoverage({ dispatchedWorkCount: 0, criticArtifactCount: 0, skipRecordCount: 0 }).finding, false);
});

test("records-based coverage uses only v3 as the forward cutover and preserves v2 as legacy", () => {
  const records = [
    { schema: "pipeline.dispatch-record.v2", taskId: "LEGACY" },
    { schema: "pipeline.dispatch-record.v3", taskId: "A", criticSkip: skip },
    { schema: "pipeline.dispatch-record.v3", taskId: "B", criticEvidence: evidence },
  ];
  assert.equal(evaluateCriticSkipCoverageFromRecords({ records }).finding, false);
  const uncovered = [...records, { schema: "pipeline.dispatch-record.v3", taskId: "C" }];
  assert.equal(evaluateCriticSkipCoverageFromRecords({ records: uncovered }).finding, true);
});

test("a required disposition remains uncovered until candidate-bound evidence replaces it", () => {
  const pending = [{ schema: "pipeline.dispatch-record.v3", taskId: "A", criticRequired: required }];
  const result = evaluateCriticSkipCoverageFromRecords({ records: pending });
  assert.equal(result.finding, true);
  assert.match(result.reason, /explicitly require Critic evidence/u);
  assert.equal(evaluateCriticSkipCoverageFromRecords({
    records: [{ schema: "pipeline.dispatch-record.v3", taskId: "A", criticEvidence: evidence }],
  }).finding, false);
});

test("a global Critic-like object cannot cover an unrelated applicable record", () => {
  const records = [
    { schema: "pipeline.dispatch-record.v3", taskId: "A", criticEvidence: evidence },
    { schema: "pipeline.dispatch-record.v3", taskId: "B" },
  ];
  const result = evaluateCriticSkipCoverageFromRecords({ records });
  assert.equal(result.finding, true);
  assert.match(result.reason, /1 of 2/u);
});
