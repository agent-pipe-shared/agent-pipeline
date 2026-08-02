#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import { reconcileRunnerNativeContinuation } from "./continuity-state.mjs";
import {
  approveSubmittedPlan,
  derivePlanLifecycle,
  enterPlanImplementation,
  reopenPlanDesign,
  sealCurrentPlanApproval,
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

function continuity(overrides = {}) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: "feature",
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: AUTHORITY.planPath, sha256: "8".repeat(64) },
      spec: { path: AUTHORITY.specPath, sha256: "9".repeat(64) },
      result: null,
    },
    queueHead: {
      packageId: "continuity-adoption",
      actionId: "review-active-feature",
      nextAction: "review",
      productRetryCount: 0,
      environmentRerouteCount: 0,
      dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    closeTransition: null,
    capacity: {
      concurrencyLimit: 4,
      reservedCriticSlots: 1,
      reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
    ...overrides,
  };
}

function draft() {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "feature", planPath: AUTHORITY.planPath, phase: "design" },
    planApproved: false,
    continuity: continuity(),
  };
}

function submitted(state = draft(), authority = AUTHORITY, at = NOW, profile = "feature") {
  const result = submitPlan({
    state,
    expectedStateSha256: sha256CanonicalJson(state),
    poGateAuthority: authority,
    profile,
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

test("submission atomically rebinds Continuity authority before approval and implementation", () => {
  for (const profile of ["epic", "feature", "mini"]) {
    const initial = draft();
    const awaiting = submitted(initial, AUTHORITY, NOW, profile);
    assert.equal(awaiting.planSubmission.profile, profile);
    assert.equal(awaiting.continuity.revision, 1);
    assert.deepEqual(awaiting.continuity.authority, {
      prd: { path: AUTHORITY.planPath, sha256: AUTHORITY.planSha256 },
      spec: { path: AUTHORITY.specPath, sha256: AUTHORITY.specSha256 },
      result: null,
    });
    assert.deepEqual(awaiting.continuity.resume, {
      mode: "immediate",
      sourceRevision: 1,
      reasonCode: "active-turn",
    });
    const accepted = approved(awaiting);
    const implementation = enterPlanImplementation({
      state: accepted,
      expectedStateSha256: sha256CanonicalJson(accepted),
    });
    assert.equal(implementation.ok, true, JSON.stringify(implementation));
    assert.deepEqual(implementation.state.continuity, awaiting.continuity);
    assert.equal(derivePlanLifecycle(implementation.state).status, "implementing");
  }
});

test("submission fails closed for malformed, busy, overflow, path, and State-CAS inputs", () => {
  const valid = draft();
  const identity = {
    featureId: "feature",
    queueRevision: 0,
    packageId: valid.continuity.queueHead.packageId,
    actionId: valid.continuity.queueHead.actionId,
    dispatchId: "dispatch-01",
    attemptId: "attempt-01",
    authorityDigests: {
      prdSha256: valid.continuity.authority.prd.sha256,
      specSha256: valid.continuity.authority.spec.sha256,
      resultSha256: null,
    },
    routeRequestSha256: "a".repeat(64),
    mayDelegate: false,
  };
  const cases = [
    [
      {
        ...valid,
        continuity: {
          ...valid.continuity,
          runtime: { ...valid.continuity.runtime, activeDuty: "../bad" },
        },
      },
      "PLAN-SUBMIT-CONTINUITY-INVALID",
    ],
    [
      {
        ...valid,
        continuity: {
          ...valid.continuity,
          queueHead: {
            ...valid.continuity.queueHead,
            nextAction: "poll",
            dispatch: identity,
          },
        },
      },
      "PLAN-SUBMIT-CONTINUITY-BUSY",
    ],
    [
      {
        ...valid,
        continuity: {
          ...valid.continuity,
          queueHead: null,
          blocker: {
            type: "authority",
            signature: "authority-update-required",
            resumeCondition: { kind: "authority-update", evidenceSha256: null },
            decisionBrief: null,
          },
          resume: { mode: "resume-on-next-turn", sourceRevision: 0, reasonCode: "blocker" },
        },
      },
      "PLAN-SUBMIT-CONTINUITY-BUSY",
    ],
    [
      {
        ...valid,
        continuity: {
          ...valid.continuity,
          revision: Number.MAX_SAFE_INTEGER,
          resume: {
            mode: "immediate",
            sourceRevision: Number.MAX_SAFE_INTEGER,
            reasonCode: "active-turn",
          },
        },
      },
      "PLAN-SUBMIT-CONTINUITY-BUSY",
    ],
  ];
  for (const [state, code] of cases) {
    const result = submitPlan({
      state,
      expectedStateSha256: sha256CanonicalJson(state),
      poGateAuthority: AUTHORITY,
      profile: "feature",
      profileSha256: PROFILE,
      by: "Coordinator",
      at: NOW,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
  }

  const pathDrift = submitPlan({
    state: valid,
    expectedStateSha256: sha256CanonicalJson(valid),
    poGateAuthority: { ...AUTHORITY, planPath: "specs/other/prd.md" },
    profile: "feature",
    profileSha256: PROFILE,
    by: "Coordinator",
    at: NOW,
  });
  assert.equal(pathDrift.code, "PLAN-SUBMIT-REQUEST-INVALID");

  const stale = submitPlan({
    state: valid,
    expectedStateSha256: "f".repeat(64),
    poGateAuthority: AUTHORITY,
    profile: "feature",
    profileSha256: PROFILE,
    by: "Coordinator",
    at: NOW,
  });
  assert.equal(stale.code, "PLAN-LIFECYCLE-STATE-STALE");
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
  const withHistoricalRevocation = {
    ...secondSubmission,
    planRevocation: {
      schema: "pipeline.plan-revocation.v2",
      planPath: AUTHORITY.planPath,
      planSha256: AUTHORITY.planSha256,
      specPath: AUTHORITY.specPath,
      specSha256: AUTHORITY.specSha256,
      revokedBy: "PO",
      revokedAt: REOPENED,
    },
  };
  assert.equal(derivePlanLifecycle(withHistoricalRevocation).status, "awaiting-approval");
  const secondApproval = approved(withHistoricalRevocation, changedAuthority, REAPPROVED);
  assert.equal(derivePlanLifecycle(secondApproval, {
    planSha256: changedAuthority.planSha256,
    specSha256: changedAuthority.specSha256,
    profileSha256: PROFILE,
  }).status, "approved");
  assert.notEqual(secondApproval.planApproval.submissionSha256, firstApproval.planApproval.submissionSha256);
  assert.equal(secondApproval.planRevocation, undefined);
});

test("resubmission clears a native continuation bound to the preceding authority", async () => {
  const accepted = approved();
  const implementation = enterPlanImplementation({
    state: accepted,
    expectedStateSha256: sha256CanonicalJson(accepted),
  });
  assert.equal(implementation.ok, true);
  const activated = await reconcileRunnerNativeContinuation({
    continuity: implementation.state.continuity,
    activeFeature: implementation.state.activeFeature,
    continuationId: "nova-replan",
    runner: { runnerId: "codex", adapterVersion: "v2", capability: "available" },
    event: { kind: "activate", atRevision: implementation.state.continuity.revision },
    adapter: async () => ({
      ok: true,
      code: "CGH-ACTIVE",
      status: "active",
      readback: {
        goalIdSha256: "f".repeat(64),
        generation: 0,
        observedAt: REOPENED,
        status: "active",
      },
    }),
  });
  assert.equal(activated.ok, true, JSON.stringify(activated));
  const running = { ...implementation.state, continuity: activated.next };
  const reopened = reopenPlanDesign({
    state: running,
    expectedStateSha256: sha256CanonicalJson(running),
    by: "PO",
    at: REOPENED,
  });
  assert.equal(reopened.ok, true, JSON.stringify(reopened));
  const resubmitted = submitPlan({
    state: reopened.state,
    expectedStateSha256: sha256CanonicalJson(reopened.state),
    poGateAuthority: { ...AUTHORITY, planSha256: "a".repeat(64), specSha256: "b".repeat(64) },
    profile: "feature",
    profileSha256: PROFILE,
    by: "Coordinator",
    at: RESUBMITTED,
  });
  assert.equal(resubmitted.ok, true, JSON.stringify(resubmitted));
  assert.equal(resubmitted.state.continuity.nativeContinuation, null);
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

test("reopen-design retires a pre-submission V2 approval as a profile-independent draft", () => {
  for (const profile of ["epic", "feature", "mini"]) {
    // V2 states predate V3 submission/profile evidence. In particular, no
    // profile is present in the state, so every modern profile takes this same
    // closed compatibility transition.
    const legacy = {
      schema: "pipeline.state.v0",
      activeFeature: { id: `${profile}-legacy`, planPath: AUTHORITY.planPath, phase: "implementation" },
      planApproved: true,
      planApproval: {
        schema: "pipeline.plan-approval.v2",
        approvedBy: "PO",
        approvedAt: NOW,
        specBoundBy: "PO",
        specBoundAt: LATER,
        poGateAuthority: AUTHORITY,
      },
    };
    const reopened = reopenPlanDesign({
      state: legacy,
      expectedStateSha256: sha256CanonicalJson(legacy),
      by: "PO",
      at: REOPENED,
    });
    assert.equal(reopened.ok, true, `${profile}: ${JSON.stringify(reopened)}`);
    assert.equal(reopened.replay, false);
    assert.equal(reopened.invalidation, null);
    assert.equal(reopened.state.activeFeature.phase, "design");
    assert.equal(reopened.state.planApproved, false);
    assert.equal(Object.hasOwn(reopened.state, "planSubmission"), false);
    assert.equal(Object.hasOwn(reopened.state, "planApproval"), false);
    assert.equal(Object.hasOwn(reopened.state, "planInvalidation"), false);
    assert.equal(derivePlanLifecycle(reopened.state).status, "draft");

    const replay = reopenPlanDesign({
      state: reopened.state,
      expectedStateSha256: sha256CanonicalJson(reopened.state),
      by: "PO",
      at: REAPPROVED,
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.replay, true);
    assert.equal(replay.state, reopened.state);
  }
});

test("reopen-design fails closed for drifted or inconsistent pre-submission V2 states", () => {
  const legacy = {
    schema: "pipeline.state.v0",
    activeFeature: { id: "legacy", planPath: AUTHORITY.planPath, phase: "implementation" },
    planApproved: true,
    planApproval: {
      schema: "pipeline.plan-approval.v2",
      approvedBy: "PO",
      approvedAt: NOW,
      specBoundBy: "PO",
      specBoundAt: LATER,
      poGateAuthority: AUTHORITY,
    },
  };
  const drifted = {
    ...legacy,
    activeFeature: { ...legacy.activeFeature, planPath: "specs/other/prd.md" },
  };
  const inconsistent = { ...legacy, planInvalidation: {
    schema: "pipeline.plan-invalidation.v1",
    featureId: legacy.activeFeature.id,
    invalidatedSubmissionSha256: "8".repeat(64),
    invalidatedApprovalSha256: null,
    invalidatedBy: "PO",
    invalidatedAt: REOPENED,
    reason: "reopen-design",
  } };
  for (const state of [drifted, inconsistent]) {
    const result = reopenPlanDesign({
      state,
      expectedStateSha256: sha256CanonicalJson(state),
      by: "PO",
      at: REOPENED,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "PLAN-REOPEN-SUBMISSION-INVALID");
  }
  const stale = reopenPlanDesign({
    state: legacy,
    expectedStateSha256: sha256CanonicalJson({ ...legacy, planApproved: false }),
    by: "PO",
    at: REOPENED,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "PLAN-REOPEN-STATE-STALE");
});

test("AC-047-149/150: successor approvals seal fresh invalidation audit and v3 migration is closed", () => {
  const first = approved();
  const firstReopen = reopenPlanDesign({ state: first, expectedStateSha256: sha256CanonicalJson(first), by: "PO", at: REOPENED });
  assert.equal(firstReopen.ok, true);
  const successorSubmission = submitted(firstReopen.state, AUTHORITY, RESUBMITTED);
  const successor = approved(successorSubmission, AUTHORITY, REAPPROVED);
  const priorInvalidationSha256 = sha256CanonicalJson(firstReopen.invalidation);
  assert.equal(successor.planApproval.schema, "pipeline.plan-approval.v4");
  assert.equal(successor.planApproval.priorInvalidationSha256, priorInvalidationSha256);
  assert.equal(derivePlanLifecycle(successor).status, "approved");

  const missingSeal = { ...successor, planApproval: { ...successor.planApproval } };
  delete missingSeal.planApproval.priorInvalidationSha256;
  assert.equal(derivePlanLifecycle(missingSeal).ok, false);
  const wrongSeal = { ...successor, planApproval: { ...successor.planApproval, priorInvalidationSha256: "f".repeat(64) } };
  assert.equal(derivePlanLifecycle(wrongSeal).ok, false);

  const v3WithAudit = { ...successor, planApproval: { ...successor.planApproval, schema: "pipeline.plan-approval.v3" } };
  delete v3WithAudit.planApproval.priorInvalidationSha256;
  assert.equal(derivePlanLifecycle(v3WithAudit).ok, false);
  const sealed = sealCurrentPlanApproval({ state: v3WithAudit, expectedStateSha256: sha256CanonicalJson(v3WithAudit) });
  assert.equal(sealed.ok, true, JSON.stringify(sealed));
  assert.equal(sealed.state.planApproval.approvedBy, "PO");
  assert.equal(sealed.state.planApproval.priorInvalidationSha256, priorInvalidationSha256);
  assert.equal(derivePlanLifecycle(sealed.state).status, "approved");

  const v3WithoutAudit = { ...first, planApproval: { ...first.planApproval, schema: "pipeline.plan-approval.v3" } };
  delete v3WithoutAudit.planApproval.priorInvalidationSha256;
  assert.equal(derivePlanLifecycle(v3WithoutAudit).status, "approved");

  const secondAt = "2026-07-30T20:25:00.000Z";
  const secondReopen = reopenPlanDesign({ state: successor, expectedStateSha256: sha256CanonicalJson(successor), by: "PO", at: secondAt });
  assert.equal(secondReopen.ok, true);
  assert.equal(secondReopen.replay, false);
  assert.equal(secondReopen.invalidation.invalidatedAt, secondAt);
  assert.notEqual(secondReopen.invalidation.invalidatedSubmissionSha256, firstReopen.invalidation.invalidatedSubmissionSha256);
  assert.equal(secondReopen.invalidation.invalidatedApprovalSha256, sha256CanonicalJson(successor.planApproval));
});
