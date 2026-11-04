#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Late binding of the PRD and the Spec (docs/adr/draft-late-binding-of-prd-and-spec-at-the-approval.md), build step 2:
// the continuity schema knows the draft state (`sealed: false`, paths without digests) and the core readers of the bound
// authority sit on the shared seal reader. Cases are written from the ADR and the PO decisions of 2026-11-04, not from the code.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { AUTHORITY_SEAL_EXITS } from "./authority-seal-reader.mjs";
import { projectContinuityAuthorityDrift } from "./continuity-authority-drift.mjs";
import { boundAuthorityDocumentPath, protectedAuthorityDocumentWriteOnly } from "./guard/denial-route.mjs";
import { buildRunnerNativeContinuationRequest } from "./runner-native-continuation.mjs";
import {
  beginCloseTransition,
  compareAndSwapContinuity,
  continuityDispatchAllowed,
  validateContinuityState,
} from "./continuity-state.mjs";
import { criticalActionAuthority, verifySignedAction } from "./critical-action-authorization-read.mjs";
import { derivePlanLifecycle, reopenPlanDesign, sha256CanonicalJson, submitPlan } from "./plan-spec-state-v2.mjs";
import { assertPushBatchSubject } from "./push-batch-contract.mjs";
import { validateScopedVerifyRegistration } from "./scoped-verify-registration.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const FEATURE = "feature";
const PRD = "specs/feature/prd.md";
const SPEC = "specs/feature/spec.md";
const BOTH_EXITS = [AUTHORITY_SEAL_EXITS.prepareSeal, AUTHORITY_SEAL_EXITS.reopenDesign];

const sealedAuthority = () => ({ prd: { path: PRD, sha256: A }, spec: { path: SPEC, sha256: B }, result: null });
const draftAuthority = (extra = {}) => ({ sealed: false, prd: { path: PRD }, spec: { path: SPEC }, result: null, ...extra });

function continuity(authority, queueHead = {}, extra = {}) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: FEATURE,
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority,
    queueHead: { packageId: "P1", actionId: "A1", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null, ...queueHead },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    closeTransition: null,
    capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
    ...extra,
  };
}

const dispatchIdentity = () => ({
  featureId: FEATURE, queueRevision: 0, packageId: "P1", actionId: "A1", dispatchId: "dispatch-1", attemptId: "attempt-1",
  authorityDigests: { prdSha256: A, specSha256: B, resultSha256: null }, routeRequestSha256: C, mayDelegate: false,
});

test("LB2-1 a draft authority (sealed false, paths only) is a valid continuity state", () => {
  assert.equal(validateContinuityState(continuity(draftAuthority())).ok, true);
  const withResultAndPlan = draftAuthority({ result: { path: "specs/feature/result.md" }, plan: { path: "specs/feature/plan.md" } });
  assert.equal(validateContinuityState(continuity(withResultAndPlan)).ok, true);
});

test("LB2-2 a state without the marker keeps its exact old verdict", () => {
  assert.equal(validateContinuityState(continuity(sealedAuthority())).ok, true);
  const noDigest = { prd: { path: PRD }, spec: { path: SPEC }, result: null };
  assert.equal(validateContinuityState(continuity(noDigest)).ok, false, "paths without digests need the marker");
  assert.equal(validateContinuityState(continuity({ ...sealedAuthority(), prd: { path: PRD, sha256: "short" } })).ok, false);
  assert.equal(validateContinuityState(continuity({ ...sealedAuthority(), plan: null })).ok, false);
});

test("LB2-3 every other draft shape is rejected", () => {
  const rejected = {
    "marker true": { ...sealedAuthority(), sealed: true },
    "marker as string": draftAuthority({ sealed: "false" }),
    "marker null": draftAuthority({ sealed: null }),
    "digest on the PRD": draftAuthority({ prd: { path: PRD, sha256: A } }),
    "digest on the Spec": draftAuthority({ spec: { path: SPEC, sha256: B } }),
    "digest on the result": draftAuthority({ result: { path: "specs/feature/result.md", sha256: C } }),
    "digest on the plan": draftAuthority({ plan: { path: "specs/feature/plan.md", sha256: C } }),
    "extra key on an artifact": draftAuthority({ prd: { path: PRD, note: "x" } }),
    "unknown authority key": draftAuthority({ extra: 1 }),
    "missing Spec": (() => { const value = draftAuthority(); delete value.spec; return value; })(),
    "missing result key": (() => { const value = draftAuthority(); delete value.result; return value; })(),
    "absolute path": draftAuthority({ prd: { path: "/etc/prd.md" } }),
    "parent path": draftAuthority({ spec: { path: "specs/../spec.md" } }),
    "backslash path": draftAuthority({ spec: { path: "specs\\spec.md" } }),
    "plan null": draftAuthority({ plan: null }),
    "authority not an object": "draft",
  };
  for (const [name, authority] of Object.entries(rejected)) {
    assert.equal(validateContinuityState(continuity(authority)).ok, false, name);
  }
});

test("LB2-4 a draft binds no digest, so it cannot carry a dispatch identity or a close transition", () => {
  assert.equal(validateContinuityState(continuity(draftAuthority(), { nextAction: "poll", dispatch: dispatchIdentity() })).ok, false);
  const closing = { intentId: "intent-1", expectedRevision: 0, authorityDigests: { prdSha256: A, specSha256: B, resultSha256: null } };
  assert.equal(validateContinuityState(continuity(draftAuthority(), {}, { revision: 1, closeTransition: closing })).ok, false);
  // the sealed twin of the dispatch case stays valid, so the rejection above is the draft rule and nothing else
  assert.equal(validateContinuityState(continuity(sealedAuthority(), { nextAction: "poll", dispatch: dispatchIdentity() })).ok, true);
});

test("LB2-5 dispatch is refused for a draft with a typed exit and allowed for the sealed twin", () => {
  const draft = continuityDispatchAllowed(continuity(draftAuthority(), { nextAction: "dispatch" }));
  assert.equal(draft.ok, true);
  assert.equal(draft.allowed, false);
  assert.equal(draft.code, "CS-UNSEALED");
  assert.deepEqual([...draft.exits], BOTH_EXITS);
  const sealed = continuityDispatchAllowed(continuity(sealedAuthority(), { nextAction: "dispatch" }));
  assert.equal(sealed.allowed, true);
  assert.equal(sealed.code, "CS-DISPATCHABLE");
  assert.equal(continuityDispatchAllowed(continuity(draftAuthority(), { nextAction: "dispatch" }), "other").code, "CS-INVALID");
});

test("LB2-6 the close gate refuses a draft with the typed exits, an invalid shape fails closed", () => {
  const request = { expectedRevision: 0, intent: {}, result: {} };
  const draft = beginCloseTransition(continuity(draftAuthority(), { nextAction: "close" }), request);
  assert.equal(draft.ok, false);
  assert.equal(draft.code, "CS-UNSEALED");
  assert.equal(draft.mutated, false);
  assert.deepEqual([...draft.exits], BOTH_EXITS);
  const invalid = beginCloseTransition(continuity({ ...draftAuthority(), prd: { path: PRD, sha256: A } }, { nextAction: "close" }), request);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "CS-INVALID");
});

test("LB2-7 a draft is never a dead end: the ordinary compare-and-swap still moves a draft state", () => {
  const current = continuity(draftAuthority());
  const next = { ...structuredClone(current), revision: 1, queueHead: { ...current.queueHead, nextAction: "poll" } };
  const moved = compareAndSwapContinuity(current, { expectedRevision: 0, next });
  assert.equal(moved.ok, true, JSON.stringify(moved));
  // but it can not smuggle a seal in through the ordinary swap: digests do not appear from nowhere
  const sealedNext = { ...structuredClone(next), authority: sealedAuthority() };
  assert.equal(compareAndSwapContinuity(current, { expectedRevision: 0, next: sealedNext }).ok, false);
});

const planState = (authority) => ({
  schema: "pipeline.state.v0",
  activeFeature: { id: FEATURE, planPath: PRD, phase: "design" },
  planApproved: false,
  continuity: continuity(authority),
});
const REOPENED = "2026-07-30T20:10:00.000Z";

test("LB2-8 reopen-design stays executable in a draft state and in a bound unsubmitted state", () => {
  const draft = planState(draftAuthority());
  const reopenedDraft = reopenPlanDesign({ state: draft, expectedStateSha256: sha256CanonicalJson(draft), by: "PO", at: REOPENED });
  assert.equal(reopenedDraft.ok, true, JSON.stringify(reopenedDraft));
  assert.equal(reopenedDraft.replay, true, "a draft is not locked, so there is nothing to release");
  assert.equal(reopenedDraft.state, draft);
  assert.equal(derivePlanLifecycle(draft).status, "draft");
  const bound = planState(sealedAuthority());
  const reopenedBound = reopenPlanDesign({ state: bound, expectedStateSha256: sha256CanonicalJson(bound), by: "PO", at: REOPENED });
  assert.equal(reopenedBound.ok, true, JSON.stringify(reopenedBound));
  assert.equal(reopenedBound.replay, false);
  assert.equal(reopenedBound.invalidation.reason, "pipeline.reopen-bound-unsubmitted-prd");
});

test("LB2-9 submit-plan works against a draft authority, its binding is by path", () => {
  const authority = {
    schema: "pipeline.po-gate-authority.v2", humanFacing: "en", sourceSha256: "4".repeat(64), runtimeSha256: "5".repeat(64),
    receiptSha256: "6".repeat(64), repositoryFingerprint: "7".repeat(64),
    planPath: PRD, planSha256: "1".repeat(64), specPath: SPEC, specSha256: "2".repeat(64),
  };
  const draft = planState(draftAuthority());
  const submitted = submitPlan({
    state: draft, expectedStateSha256: sha256CanonicalJson(draft), poGateAuthority: authority, profile: "feature",
    profileSha256: "3".repeat(64), by: "PO", at: "2026-07-30T20:00:00.000Z",
  });
  assert.equal(submitted.ok, true, JSON.stringify(submitted));
  const moved = planState(draftAuthority({ spec: { path: "specs/feature/other-spec.md" } }));
  const conflict = submitPlan({
    state: moved, expectedStateSha256: sha256CanonicalJson(moved), poGateAuthority: authority, profile: "feature",
    profileSha256: "3".repeat(64), by: "PO", at: "2026-07-30T20:00:00.000Z",
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "PLAN-SUBMIT-AUTHORITY-SPEC-CONFLICT");
});

test("LB2-10 the critical-action authority reader refuses an unsealed package with the typed exits", () => {
  const active = { id: FEATURE, planPath: PRD, phase: "implementation" };
  const approval = { poGateAuthority: { planSha256: A, specSha256: B } };
  const sealedState = { activeFeature: active, planApproval: approval, continuity: continuity(sealedAuthority()) };
  const authority = criticalActionAuthority({ state: sealedState, kind: "push" });
  assert.deepEqual(authority, { source: "active", featureId: FEATURE, planSha256: A, specSha256: B });
  const legacyState = { activeFeature: active, planApproval: approval };
  assert.deepEqual(criticalActionAuthority({ state: legacyState, kind: "push" }), authority);
  const draftState = { activeFeature: active, planApproval: approval, continuity: continuity(draftAuthority()) };
  const refused = verifySignedAction({ state: draftState, kind: "push", prefix: "PUSH", candidate: {}, subject: {}, recorded: {}, anchors: [], now: new Date().toISOString() });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "PUSH-NOT-SEALED");
  assert.deepEqual([...refused.exits], BOTH_EXITS);
  const invalidState = { activeFeature: active, planApproval: approval, continuity: continuity({ ...draftAuthority(), prd: { path: PRD, sha256: A } }) };
  const invalid = verifySignedAction({ state: invalidState, kind: "push", prefix: "PUSH", candidate: {}, subject: {}, recorded: {}, anchors: [], now: new Date().toISOString() });
  assert.equal(invalid.ok, false);
  assert.notEqual(invalid.code, "PUSH-RECORD-INCOMPLETE", "an invalid authority shape is refused before anything else is read");
  const sealedRefusal = verifySignedAction({ state: sealedState, kind: "push", prefix: "PUSH", candidate: {}, subject: {}, recorded: {}, anchors: [], now: new Date().toISOString() });
  assert.equal(sealedRefusal.code, "PUSH-RECORD-INCOMPLETE", "a sealed state reaches the unchanged old checks");
});

test("LB2-11 the push subject and the scoped Verify registration need digests, a draft can not form either", () => {
  const subject = {
    schema: "pipeline.push-batch-subject.v1", repository: { fingerprint: A, objectFormat: "sha1" }, candidate: { commit: "1".repeat(40), tree: "2".repeat(40) },
    authority: { featureId: FEATURE, planSha256: undefined, specSha256: undefined },
  };
  assert.throws(() => assertPushBatchSubject(subject), TypeError);
  assert.equal(validateScopedVerifyRegistration({ schema: "x", taskId: "x", authority: { sealed: false, prd: { path: PRD } }, suites: [] }).ok, false);
});

test("LB2-12 the core readers sit on the shared seal reader and no longer read the digest fields directly", () => {
  const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
  for (const name of ["continuity-state.mjs", "onboarding-continuity.mjs", "plan-spec-state-v2.mjs", "po-gate-authority-read.mjs", "critical-action-authorization-read.mjs"]) {
    const source = read(name);
    assert.match(source, /from "\.\/authority-seal-reader\.mjs"/u, `${name} imports the shared reader`);
    assert.doesNotMatch(source, /continuity\??\.authority\??\.(prd|spec)\??\.sha256/u, `${name} reads no raw continuity digest`);
  }
  assert.doesNotMatch(read("continuity-state.mjs"), /state\.authority\.(prd|spec)\.sha256/u);
  assert.doesNotMatch(read("continuity-state.mjs"), /current\.authority\.(prd|spec)\.sha256/u);
});

// ---- build step 3 (LB3): the remaining readers, the guard tripwire, the drift detector ----

const D = "d".repeat(64);

function withStateFile(state, run) {
  const root = mkdtempSync(join(tmpdir(), "lb3-"));
  try {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(state));
    return run(root, (relative) => resolve(root, relative));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const DESIGN_INPUT = "specs/feature/design-input.md";

test("LB3-1 the guard admits an ordinary PRD and Spec edit in the draft state and still refuses design-input.md", () => {
  const draftDesign = { activeFeature: { id: FEATURE, phase: "design" }, planApproved: false, continuity: { authority: draftAuthority() } };
  withStateFile(draftDesign, (root, abs) => {
    assert.equal(boundAuthorityDocumentPath(root, abs(PRD)), null);
    assert.equal(boundAuthorityDocumentPath(root, abs(SPEC)), null);
    assert.equal(boundAuthorityDocumentPath(root, abs(DESIGN_INPUT)), DESIGN_INPUT);
  });
  // the draft rule does not depend on the phase flag: a draft outside the design phase is guarded the same way
  const draftElsewhere = { activeFeature: { id: FEATURE, phase: "implementation" }, planApproved: true, continuity: { authority: draftAuthority() } };
  withStateFile(draftElsewhere, (root, abs) => {
    assert.equal(boundAuthorityDocumentPath(root, abs(PRD)), null);
    assert.equal(boundAuthorityDocumentPath(root, abs(SPEC)), null);
    assert.equal(boundAuthorityDocumentPath(root, abs(DESIGN_INPUT)), DESIGN_INPUT);
  });
});

test("LB3-2 a draft whose design was reopened releases design-input.md too, so reopen-design is a real exit", () => {
  const reopened = { activeFeature: { id: FEATURE, phase: "design" }, planApproved: false, planInvalidation: { invalidatedAt: "2026-11-04T10:00:00.000Z" }, continuity: { authority: draftAuthority() } };
  withStateFile(reopened, (root, abs) => {
    assert.equal(boundAuthorityDocumentPath(root, abs(DESIGN_INPUT)), null);
  });
});

test("LB3-3 the sealed state and a state without the marker are guarded exactly as before", () => {
  const approved = { activeFeature: { id: FEATURE, phase: "implementation" }, planApproved: true, continuity: { authority: sealedAuthority() } };
  withStateFile(approved, (root, abs) => {
    for (const path of [PRD, SPEC, DESIGN_INPUT]) assert.equal(boundAuthorityDocumentPath(root, abs(path)), path);
    assert.equal(boundAuthorityDocumentPath(root, abs("specs/feature/other.md")), null);
  });
  // the pre-existing fixture shape: paths without a marker and without digests is NOT a draft, the old rule applies
  const unmarked = { activeFeature: { id: FEATURE, phase: "implementation" }, planApproved: true, continuity: { authority: { prd: { path: PRD }, spec: { path: SPEC } } } };
  withStateFile(unmarked, (root, abs) => {
    for (const path of [PRD, SPEC, DESIGN_INPUT]) assert.equal(boundAuthorityDocumentPath(root, abs(path)), path);
  });
  // a sealed design-phase package that is not approved yet keeps its old release
  const sealedDesign = { activeFeature: { id: FEATURE, phase: "design" }, planApproved: false, continuity: { authority: sealedAuthority() } };
  withStateFile(sealedDesign, (root, abs) => {
    for (const path of [PRD, SPEC, DESIGN_INPUT]) assert.equal(boundAuthorityDocumentPath(root, abs(path)), null);
  });
});

test("LB3-4 the refusal of design-input.md in a draft names reopen-design", () => {
  const refusal = protectedAuthorityDocumentWriteOnly(DESIGN_INPUT, "/project");
  assert.match(refusal.stderr, /GUARD-LIFECYCLE-AUTHORITY-BOUND/u);
  assert.match(refusal.stderr, /reopen-design/u);
});

test("LB3-5 a drift detector treats a draft as not drifting and a sealed package keeps its verdict", () => {
  const observeAll = () => D;
  const draft = projectContinuityAuthorityDrift(continuity(draftAuthority()), observeAll);
  assert.equal(draft.status, "current");
  assert.equal(draft.recovery, null);
  assert.deepEqual(draft.artifacts.map((entry) => entry.state), ["unbound", "unbound"]);
  const sealedDrift = projectContinuityAuthorityDrift(continuity(sealedAuthority()), observeAll);
  assert.equal(sealedDrift.status, "drift");
  assert.deepEqual(sealedDrift.artifacts.map((entry) => entry.state), ["changed", "changed"]);
  const sealedCurrent = projectContinuityAuthorityDrift(continuity(sealedAuthority()), (path) => (path === PRD ? A : B));
  assert.equal(sealedCurrent.status, "current");
});

test("LB3-7 the remaining readers sit on the shared seal reader", () => {
  const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
  for (const relative of [
    "./guard/denial-route.mjs", "./continuity-authority-drift.mjs", "./runner-native-continuation.mjs", "./workflow-writer-preflight.mjs",
    "./architecture-design.mjs", "./critic-preflight-observer.mjs", "../scripts/pipeline-state.mjs",
  ]) {
    assert.match(read(relative), /from ["'](?:\.\.?\/)+(?:lib\/)?authority-seal-reader\.mjs["']/u, `${relative} imports the shared reader`);
  }
  // the PO rebind, decision and acknowledge routes and the result bootstrap refuse a draft with the typed exits
  const state = read("../scripts/pipeline-state.mjs");
  assert.match(state, /continuityRefusal\("PO-REBIND-CONTINUITY", state\)/u);
  assert.match(state, /continuityRefusal\("PO-DECISION-CONTINUITY", state\)/u);
  assert.match(state, /continuityRefusal\("PO-ACK-CONTINUITY", state\)/u);
  assert.match(state, /!isDraftAuthority\(continuity\)\s+&& continuity\.authority\.result === null/u);
});

test("LB3-6 the native continuation request needs a sealed package: a draft gets the typed refusal, a sealed one the old request", () => {
  const request = (authority) => buildRunnerNativeContinuationRequest({
    continuationId: "nova-b0", activeFeature: { id: "nova", phase: "implementation" },
    continuity: { featureId: "nova", revision: 3, blocker: null, queueHead: { packageId: "b0", actionId: "implement" }, authority },
    runner: { runnerId: "codex", adapterVersion: "v2", capability: "available" }, acceptance: [], evidence: [], progress: [],
  });
  const refused = request(draftAuthority());
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "RNC-UNSEALED");
  assert.deepEqual(refused.exits, BOTH_EXITS);
  const sealed = request({ prd: { sha256: D }, spec: { sha256: D } });
  assert.equal(sealed.ok, true);
  assert.equal(sealed.request.subject.planSha256, D);
});
