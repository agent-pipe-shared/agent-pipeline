#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  approveSubmittedPlan,
  derivePlanLifecycle,
  enterPlanImplementation,
  reopenPlanDesign,
  sha256CanonicalJson,
  submitPlan,
} from "./plan-spec-state-v2.mjs";

const PLAN = "1".repeat(64);
const SPEC = "2".repeat(64);
const PROFILE = "3".repeat(64);
const AUTHORITY = {
  schema: "pipeline.po-gate-authority.v2",
  humanFacing: "en",
  sourceSha256: "4".repeat(64),
  runtimeSha256: "5".repeat(64),
  receiptSha256: "6".repeat(64),
  repositoryFingerprint: "7".repeat(64),
  planPath: "specs/feature/prd.md",
  planSha256: PLAN,
  specPath: "specs/feature/spec.md",
  specSha256: SPEC,
};
const NOW = "2026-07-30T20:00:00.000Z";
const LATER = "2026-07-30T20:05:00.000Z";
const REOPENED = "2026-07-30T20:10:00.000Z";
const RESUBMITTED = "2026-07-30T20:15:00.000Z";
const REAPPROVED = "2026-07-30T20:20:00.000Z";

function draft() {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "feature", planPath: AUTHORITY.planPath, phase: "design" },
    planApproved: false,
  };
}

function submitted(state = draft(), authority = AUTHORITY, at = NOW) {
  const result = submitPlan({
    state,
    expectedStateSha256: sha256CanonicalJson(state),
    poGateAuthority: authority,
    profile: "feature",
    profileSha256: PROFILE,
    by: "Coordinator",
    at,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.state;
}

function approved(state = submitted(), authority = AUTHORITY, at = LATER) {
  const lifecycle = derivePlanLifecycle(state);
  const result = approveSubmittedPlan({
    state,
    expectedStateSha256: sha256CanonicalJson(state),
    expectedSubmissionSha256: lifecycle.submissionSha256,
    poGateAuthority: authority,
    profileSha256: PROFILE,
    by: "PO",
    at,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.state;
}

test("closed lifecycle derives draft, awaiting-approval, approved, and implementing", () => {
  const initial = draft();
  assert.equal(derivePlanLifecycle(initial).status, "draft");
  const awaiting = submitted(initial);
  assert.equal(derivePlanLifecycle(awaiting).status, "awaiting-approval");
  const accepted = approved(awaiting);
  assert.equal(derivePlanLifecycle(accepted).status, "approved");
  const implementation = enterPlanImplementation({
    state: accepted,
    expectedStateSha256: sha256CanonicalJson(accepted),
  });
  assert.equal(implementation.ok, true);
  assert.equal(derivePlanLifecycle(implementation.state).status, "implementing");
  assert.deepEqual(Object.keys(implementation.state.activeFeature).sort(), ["id", "phase", "planPath"]);
});

test("repeated draft edits remain writable while edit-after-submit requires reopen", () => {
  const initial = draft();
  assert.equal(derivePlanLifecycle(initial, { planSha256: "8".repeat(64), specSha256: "9".repeat(64) }).status, "draft");
  const awaiting = submitted(initial);
  const drifted = derivePlanLifecycle(awaiting, {
    planSha256: "8".repeat(64),
    specSha256: SPEC,
    profileSha256: PROFILE,
  });
  assert.equal(drifted.status, "draft");
  assert.equal(drifted.code, "PLAN-LIFECYCLE-DIGEST-DRIFT");
  assert.equal(drifted.nextAction, "reopen-design");
  const staleApproval = derivePlanLifecycle(approved(awaiting), {
    planSha256: "8".repeat(64),
    specSha256: SPEC,
    profileSha256: PROFILE,
  });
  assert.equal(staleApproval.ok, false);
  assert.equal(staleApproval.nextAction, "reopen-design");
});

test("reopen invalidates exact authority and permits repeated edits before exact reapproval", () => {
  const firstApproval = approved();
  const reopened = reopenPlanDesign({
    state: firstApproval,
    expectedStateSha256: sha256CanonicalJson(firstApproval),
    by: "PO",
    at: REOPENED,
  });
  assert.equal(reopened.ok, true);
  assert.equal(derivePlanLifecycle(reopened.state).status, "draft");
  assert.equal(reopened.state.planApproved, false);
  assert.equal(reopened.state.planInvalidation.invalidatedSubmissionSha256, sha256CanonicalJson(firstApproval.planSubmission));
  assert.equal(reopened.state.planInvalidation.invalidatedApprovalSha256, sha256CanonicalJson(firstApproval.planApproval));
  assert.equal(derivePlanLifecycle(reopened.state, {
    planSha256: "a".repeat(64),
    specSha256: "b".repeat(64),
  }).status, "draft");

  const changedAuthority = {
    ...AUTHORITY,
    planSha256: "a".repeat(64),
    specSha256: "b".repeat(64),
  };
  const secondSubmission = submitted(reopened.state, changedAuthority, RESUBMITTED);
  assert.equal(derivePlanLifecycle(secondSubmission).status, "awaiting-approval");
  const secondApproval = approved(secondSubmission, changedAuthority, REAPPROVED);
  assert.equal(derivePlanLifecycle(secondApproval, {
    planSha256: changedAuthority.planSha256,
    specSha256: changedAuthority.specSha256,
    profileSha256: PROFILE,
  }).status, "approved");
  assert.notEqual(secondApproval.planApproval.submissionSha256, firstApproval.planApproval.submissionSha256);
});

test("restart/resume is deterministic and hostile or contradictory states fail closed", () => {
  const state = approved();
  const serialized = JSON.parse(JSON.stringify(state));
  assert.deepEqual(derivePlanLifecycle(serialized), derivePlanLifecycle(state));
  for (const hostile of [
    { ...state, activeFeature: { ...state.activeFeature, extra: true } },
    { ...state, planSubmission: { ...state.planSubmission, profile: "full" } },
    { ...state, planInvalidation: { schema: "pipeline.plan-invalidation.v1" } },
    { ...state, planApproved: false },
  ]) {
    assert.equal(derivePlanLifecycle(hostile).ok, false);
  }
});

test("legacy approval derives approved or implementing until its next sanctioned write", () => {
  const legacy = {
    schema: "pipeline.state.v0",
    activeFeature: { id: "feature", planPath: AUTHORITY.planPath, phase: "design" },
    planApproved: true,
    planApproval: { approvedBy: "PO", approvedAt: NOW },
  };
  assert.equal(derivePlanLifecycle(legacy).status, "approved");
  legacy.activeFeature.phase = "implementation";
  assert.equal(derivePlanLifecycle(legacy).status, "implementing");
});
