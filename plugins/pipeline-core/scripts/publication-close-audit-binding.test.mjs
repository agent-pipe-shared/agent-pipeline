// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

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
