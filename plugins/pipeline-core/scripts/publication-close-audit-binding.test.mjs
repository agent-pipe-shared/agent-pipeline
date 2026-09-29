// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved sibling callback registration");
  completionCases.push({ id: "PCB" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}

import {
  advanceCloseCoordinator,
  createCloseCoordinator,
  lifecycleDigest,
} from "./publication-close-journal.mjs";

const h = (value) => value.repeat(64);
const authority = {
  implementationResultSha256: h("a"), pipelineStateSha256: h("b"),
  planSha256: h("c"), prdSha256: h("d"), specSha256: h("e"),
};
const feature = { id: "audit-feature", phase: "implementation", planPath: "specs/audit/prd.md" };
const advance = (state, values) => advanceCloseCoordinator(state, {
  expectedRevision: state.revision,
  expectedStateSha256: lifecycleDigest(state),
  operationSha256: h("f"),
  ...values,
});

test("feature-close preparation requires an exact durable audit and Critic/Verify binding", () => {
  let state = createCloseCoordinator({ lifecycleId: "audit-lifecycle", featureId: feature.id, activeFeature: feature, authority });
  state = advance(state, { phase: "checkpointed", inputDigest: h("1"), observedDigest: h("2") });
  assert.throws(() => advance(state, {
    phase: "feature-close-prepared", inputDigest: h("3"), observedDigest: h("4"),
    authority, architectureImpact: "no-architecture-impact",
  }), /audit/);
  const audit = {
    auditPlanSha256: h("3"), auditReceiptSha256: h("4"),
    criticVerifyLifecycleId: h("5"), criticVerifyLifecycleReceiptSha256: h("6"),
    outputPath: `audit-bundles/${feature.id}/${"7".repeat(40)}`,
  };
  state = advance(state, {
    phase: "feature-close-prepared", inputDigest: h("7"), observedDigest: h("8"),
    authority, architectureImpact: "no-architecture-impact", featureCloseAudit: audit,
  });
  assert.deepEqual(state.featureCloseAudit, audit);
  const fresh = createCloseCoordinator({ lifecycleId: "fresh", featureId: feature.id, activeFeature: feature, authority, featureCloseAudit: audit });
  assert.equal(fresh.featureCloseAudit, null, "only the audited preparation transition can install the binding");
});

// Register each original sibling callback directly with the canonical recorder.
if (completionCases.length !== 1) throw new Error("Required completion case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
