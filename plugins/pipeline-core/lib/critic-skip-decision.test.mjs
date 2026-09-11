// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import {
  CRITIC_EVIDENCE_SCHEMA,
  CRITIC_SKIP_SCHEMA,
  countCriticSkipDecisions,
  criticDisposition,
  evaluateCriticSkipCoverage,
  evaluateCriticSkipCoverageFromRecords,
  hasCriticEvidenceReference,
  hasCriticSkipDecision,
} from "./critic-skip-decision.mjs";

const skip = { schema: CRITIC_SKIP_SCHEMA, reason: "T5" };
const evidence = { schema: CRITIC_EVIDENCE_SCHEMA, taskId: "A", candidateCommit: "a".repeat(40), path: "evidence/critic-A.json", sha256: "b".repeat(64) };

test("presence helpers accept objects and reject malformed lanes", () => {
  assert.equal(hasCriticSkipDecision({ criticSkip: skip }), true);
  assert.equal(hasCriticEvidenceReference({ criticEvidence: evidence }), true);
  for (const value of [null, undefined, "yes", true, []]) {
    assert.equal(hasCriticSkipDecision({ criticSkip: value }), false);
    assert.equal(hasCriticEvidenceReference({ criticEvidence: value }), false);
  }
});

test("criticDisposition distinguishes the four structural outcomes", () => {
  assert.equal(criticDisposition({ criticSkip: skip }), "skipped");
  assert.equal(criticDisposition({ criticEvidence: evidence }), "evidenced");
  assert.equal(criticDisposition({}), "missing");
  assert.equal(criticDisposition({ criticSkip: skip, criticEvidence: evidence }), "conflicting");
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

test("a global Critic-like object cannot cover an unrelated applicable record", () => {
  const records = [
    { schema: "pipeline.dispatch-record.v3", taskId: "A", criticEvidence: evidence },
    { schema: "pipeline.dispatch-record.v3", taskId: "B" },
  ];
  const result = evaluateCriticSkipCoverageFromRecords({ records });
  assert.equal(result.finding, true);
  assert.match(result.reason, /1 of 2/u);
});
