#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";
import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
import { bindOnboardingSessionCleanup, continuityAssertStateWriteIdentity, continuityStateEntryRefusalReason, observeSessionCleanupState,
  releaseOnboardingSessionCleanup } from "../lib/onboarding-continuity.mjs";
import { createControlledMethodRuntimeFixture, inspectSourceOwnedCurrentAuthorityContext } from "../lib/session-requester-bridge.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "../lib/test-item-approved-course-fixture.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../lib/worktree-lifecycle.mjs";
import { createSessionAuthorityParticipantPorts } from "../lib/session-authority-observers.mjs";
import { initializeSessionAuthorityRegistry } from "../lib/session-authority-registry.mjs";

const NOW = "2026-08-02T14:30:00.000Z";
const AUTHORITY = {
  schema: "pipeline.po-gate-authority.v2",
  humanFacing: "en",
  sourceSha256: "1".repeat(64),
  runtimeSha256: "2".repeat(64),
  receiptSha256: "3".repeat(64),
  repositoryFingerprint: "4".repeat(64),
  planPath: "specs/legacy/prd.md",
  planSha256: "5".repeat(64),
  specPath: "specs/legacy/spec.md",
  specSha256: "6".repeat(64),
};

function continuity() {
  return {
    schema: "pipeline.continuity.v0",
    featureId: "legacy",
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator", sessionCleanup: null },
    authority: { prd: { path: AUTHORITY.planPath, sha256: "7".repeat(64) }, spec: { path: AUTHORITY.specPath, sha256: "8".repeat(64) }, result: null },
    queueHead: { packageId: "legacy", actionId: "repair", nextAction: "review", productRetryCount: 0, environmentRerouteCount: 0, dispatch: null },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    closeTransition: null,
    capacity: { concurrencyLimit: 2, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
}

function legacyMixedState() {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "legacy", planPath: AUTHORITY.planPath, phase: "implementation" },
    planApproved: false,
    planApproval: { schema: "pipeline.plan-approval.v2", approvedBy: "PO", approvedAt: NOW, specBoundBy: "PO", specBoundAt: NOW, poGateAuthority: AUTHORITY },
    planRevocation: { schema: "pipeline.plan-revocation.v2", planPath: AUTHORITY.planPath, planSha256: AUTHORITY.planSha256, specPath: AUTHORITY.specPath, specSha256: AUTHORITY.specSha256, revokedBy: "PO", revokedAt: NOW },
    continuity: continuity(),
  };
}

function fixture(state) {
  const root = mkdtempSync(join(tmpdir(), "pipeline-revocation-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", root, "config", "user.email", "fixture@example.invalid"]);
  mkdirSync(join(root, ".claude"));
  const path = join(root, ".claude", "pipeline-state.json");
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
  return { root, path };
}

test("legacy V2 recovery is attended, digest-bound and zero-write on replay", () => {
  const { root, path } = fixture(legacyMixedState());
  const logs = [];
  const originalLog = console.log;
  console.log = (line) => logs.push(line);
  try {
    assert.equal(run(["plan-legacy-v2-revocation-recovery", "--by", "Phoenix PO"], { dir: root, now: () => NOW }), 0);
    const plan = JSON.parse(logs.at(-1));
    assert.equal(plan.recoveryClass, "legacy-v2-revocation-implementation-to-design");
    assert.equal(plan.nextAction.requiresConfirmation, true);
    assert.equal(plan.nextAction.requiresAttendedHumanOverride, true);
    assert.equal(plan.nextAction.humanAuthority.kind, "one-time-guard-override");
    assert.equal(plan.nextAction.argv.at(-2), "--activate");
    assert.equal(run(plan.nextAction.argv.slice(1), { dir: root, now: () => NOW }), 0);
    const recovered = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(recovered.activeFeature.phase, "design");
    assert.equal(recovered.planApproval, undefined);
    assert.equal(recovered.planRevocation, undefined);
    assert.equal(recovered.planRecovery.recoveredBy, "Phoenix PO");
    const bytes = readFileSync(path, "utf8");
    assert.equal(run(plan.nextAction.argv.slice(1), { dir: root, now: () => NOW }), 0);
    assert.equal(readFileSync(path, "utf8"), bytes);
  } finally {
    console.log = originalLog;
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown legacy-state envelopes cannot receive recovery", () => {
  for (const state of [
    { ...legacyMixedState(), planSubmission: {} },
    { ...legacyMixedState(), planRecovery: { schema: "unrelated" } },
    { ...legacyMixedState(), unrecognisedFutureState: true },
    { ...legacyMixedState(), schema: "pipeline.state.v1" },
  ]) {
    const { root, path } = fixture(state);
    try {
      const before = readFileSync(path, "utf8");
      assert.equal(run(["plan-legacy-v2-revocation-recovery", "--by", "Phoenix PO"], { dir: root, now: () => NOW }), 2);
      assert.equal(readFileSync(path, "utf8"), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// C30F-G1 (AC-108; Codex greenfield 2026-11-16): a State entry the continuity producer does not admit was refused with the untyped "continuity State
// entry not admitted" and no route. It must be refused with its own typed reason that names the entry and a route that runs, and the refusal must
// leave the State bytes unchanged. C30F-G1B admits the two entries that advance the continuity revision by exactly one (cancel-submitted-plan,
// cancel-mixed-plan-state); the refusal stays for the entries the observation does not model (set-feature, set-phase-with-calibration).
function refusedRun(args, deps) {
  const errors = [];
  const originalError = console.error;
  console.error = (...parts) => errors.push(parts.join(" "));
  let status;
  try { status = run(args, deps); } finally { console.error = originalError; }
  return { status, stderr: errors.join("\n") };
}

// A catalogue project: the approved-course fixture, reopened to design, then the session-authority registry the first native Goldfish creates.
function catalogueFixture() {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = realpathSync(mkdtempSync(join(parent, "continuity-entry-refusal-")));
  prepareApprovedItemCourseFixture({ root });
  const statePath = join(root, ".claude", "pipeline-state.json");
  assert.equal(run(["reopen-design", "--by", "Synthetic fixture PO"], { dir: root }), 0);
  const repository = inspectSignedDescriptorCustodyRepository(root);
  assert.equal(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status, "initialized");
  return { root, statePath };
}

// C30F-G1B: the same catalogue project with its State in the NEUTRAL path (project/pipeline-state.json). The continuity producer observes a State
// write only for a neutral, active State; the legacy-path fixture above can never be driven past that check. The approved-course fixture is
// built in the legacy tier and its three authority files are moved to the neutral tier before the registry is initialised.
function neutralCatalogueFixture() {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = realpathSync(mkdtempSync(join(parent, "continuity-neutral-")));
  prepareApprovedItemCourseFixture({ root });
  mkdirSync(join(root, "project"), { recursive: true });
  for (const [from, to] of [["pipeline.yaml", "pipeline.yaml"], ["pipeline.json", "pipeline.json"], ["pipeline-state.json", "pipeline-state.json"]]) {
    renameSync(join(root, ".claude", from), join(root, "project", to));
  }
  const statePath = join(root, "project", "pipeline-state.json");
  const priorApproval = JSON.parse(readFileSync(statePath, "utf8")).planApproval;
  assert.equal(run(["reopen-design", "--by", "Synthetic fixture PO"], { dir: root }), 0);
  const repository = inspectSignedDescriptorCustodyRepository(root);
  assert.equal(initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository })).status, "initialized");
  return { root, statePath, priorApproval };
}

function submitPlan({ root, statePath }) {
  assert.equal(run(["submit-plan", "--by", "Synthetic fixture", "--profile", "mini"], { dir: root, architectureEntryReadiness: () => ({ status: "ready" }) }), 0);
  return JSON.parse(readFileSync(statePath, "utf8"));
}

const ADMITTED_ENTRIES = ["state.reopen-design", "state.seal-plan-approval", "state.set-gate-estimate", "state.revoke-plan", "state.set-phase-no-calibration",
  "state.cancel-submitted-plan", "state.cancel-mixed-plan-state"];
test("C30F-G1: a State entry the continuity producer does not admit has a typed reason that names the entry and a route; the seven admitted entries have none", () => {
  for (const entry of ADMITTED_ENTRIES) assert.equal(continuityStateEntryRefusalReason(entry), null, entry);
  // set-feature replaces the whole continuity object; set-phase with a calibration also writes the calibration companion. Neither can be driven
  // through the CLI to this check (set-feature refuses on an active continuity before its writer, set-phase on the calibration tiers), so the
  // reason is asserted where it is built.
  for (const entry of ["state.set-feature", "state.set-phase-with-calibration", "state.unknown-entry"]) {
    const reason = continuityStateEntryRefusalReason(entry);
    assert.equal(reason, `${entry} is not admitted; nothing written. Repair: node <plugin-root>/scripts/session-cleanup.mjs plan-recovery --repo <root>`);
    assert.ok(reason.length <= 240, `${entry}: the refusal text fits the 240 characters describeStateAuthorityRefusal prints`);
  }
});

test("C30F-G1: the admitted entries, the two advancing ones included, pass the entry check in a catalogue project", () => {
  const fixture = catalogueFixture();
  try {
    const sha = "a".repeat(64);
    assert.equal(run(["submit-plan", "--by", "Synthetic fixture", "--profile", "mini"], { dir: fixture.root, architectureEntryReadiness: () => ({ status: "ready" }) }), 0);
    const submitted = JSON.parse(readFileSync(fixture.statePath, "utf8"));
    assert.deepEqual(JSON.parse(readFileSync(fixture.statePath, "utf8")).planSubmission, submitted.planSubmission);
    // Controls: the admitted entries (the five non-advancing ones and the two advancing ones) pass the entry check. This fixture keeps its State in
    // the legacy path, which the next check (neutral State required) refuses; the neutral-State fixture below drives them to success.
    for (const args of [["reopen-design", "--by", "Synthetic fixture PO"],
      ["cancel-submitted-plan", "--by", "PO", "--submission-sha256", sha256CanonicalJson(submitted.planSubmission)],
      ["cancel-mixed-plan-state", "--by", "PO", "--reason", "fixture", "--submission-sha256", sha, "--approval-sha256", sha, "--invalidation-sha256", sha]]) {
      const control = refusedRun(args, { dir: fixture.root });
      assert.equal(control.status, 2, control.stderr);
      assert.doesNotMatch(control.stderr, /not admitted/u, `${args[0]}: ${control.stderr}`);
      assert.match(control.stderr, /historical authority requires owning lifecycle transition/u, `${args[0]}: ${control.stderr}`);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// C30F-G1B (AC-108): the two State writes that advance the continuity revision by exactly one are admitted by the continuity authority.
test("C30F-G1B: cancel-submitted-plan in a neutral-State catalogue project succeeds under the live continuity authority", () => {
  const fixture = neutralCatalogueFixture();
  try {
    const submitted = submitPlan(fixture);
    const submissionSha256 = sha256CanonicalJson(submitted.planSubmission);
    const result = refusedRun(["cancel-submitted-plan", "--by", "PO", "--submission-sha256", submissionSha256], { dir: fixture.root });
    assert.equal(result.status, 0, result.stderr);
    const after = JSON.parse(readFileSync(fixture.statePath, "utf8"));
    assert.equal(after.planSubmission, undefined, "the submission is withdrawn");
    assert.equal(after.planCancellation.submissionSha256, submissionSha256);
    assert.equal(after.planCancellation.cancelledBy, "PO");
    assert.equal(after.continuity.revision, submitted.continuity.revision + 1);
    assert.deepEqual(after.continuity.resume, { mode: "immediate", sourceRevision: after.continuity.revision, reasonCode: "active-turn" });
    assert.equal(after.continuity.nativeContinuation, null);
    // Everything else of the continuity object is the prepared one: the advance is exactly revision, resume and nativeContinuation.
    const { revision, resume, nativeContinuation, ...restAfter } = after.continuity;
    const { revision: r0, resume: s0, nativeContinuation: n0, ...restBefore } = submitted.continuity;
    assert.deepEqual(restAfter, restBefore);
    // An exact replay under the live authority is a zero write and is admitted (identity unchanged).
    const bytes = readFileSync(fixture.statePath);
    const replay = refusedRun(["cancel-submitted-plan", "--by", "PO", "--submission-sha256", submissionSha256], { dir: fixture.root });
    assert.equal(replay.status, 0, replay.stderr);
    assert.deepEqual(readFileSync(fixture.statePath), bytes, "the replay wrote nothing");
    // A second action after the withdrawal: the design can be submitted again under the same authority.
    const resubmitted = submitPlan(fixture);
    assert.equal(resubmitted.continuity.revision, after.continuity.revision + 1);
    assert.deepEqual(resubmitted.planCancellation, after.planCancellation);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("C30F-G1B: cancel-mixed-plan-state in a neutral-State catalogue project succeeds under the live continuity authority", () => {
  const fixture = neutralCatalogueFixture();
  try {
    const submitted = submitPlan(fixture);
    // The retained, invalidated v4 approval of the earlier design next to the current successor submission is the mixed record.
    const mixed = { ...submitted, planApproval: fixture.priorApproval };
    assert.equal(mixed.planInvalidation.invalidatedApprovalSha256, sha256CanonicalJson(fixture.priorApproval), "the fixture invalidation names the retained approval");
    writeFileSync(fixture.statePath, `${JSON.stringify(mixed, null, 2)}\n`);
    const args = ["cancel-mixed-plan-state", "--by", "PO", "--reason", "Retire mixed history",
      "--submission-sha256", sha256CanonicalJson(mixed.planSubmission), "--approval-sha256", sha256CanonicalJson(mixed.planApproval),
      "--invalidation-sha256", sha256CanonicalJson(mixed.planInvalidation)];
    const result = refusedRun(args, { dir: fixture.root });
    assert.equal(result.status, 0, result.stderr);
    const after = JSON.parse(readFileSync(fixture.statePath, "utf8"));
    for (const key of ["planSubmission", "planApproval", "planPresentation", "planApprovalBriefing"]) assert.equal(after[key], undefined, key);
    assert.equal(after.planMixedStateRecovery.recoveredBy, "PO");
    assert.deepEqual(after.planInvalidation, mixed.planInvalidation);
    assert.equal(after.continuity.revision, mixed.continuity.revision + 1);
    assert.deepEqual(after.continuity.resume, { mode: "immediate", sourceRevision: after.continuity.revision, reasonCode: "active-turn" });
    const bytes = readFileSync(fixture.statePath);
    assert.equal(refusedRun(args, { dir: fixture.root }).status, 0, "an exact replay is admitted");
    assert.deepEqual(readFileSync(fixture.statePath), bytes, "the replay wrote nothing");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("C30F-G1B: cancel-submitted-plan is refused cleanly, before any write, while a session-cleanup binding is held", async () => {
  const fixture = neutralCatalogueFixture();
  try {
    const submitted = submitPlan(fixture);
    const submissionSha256 = sha256CanonicalJson(submitted.planSubmission);
    const repository = inspectSignedDescriptorCustodyRepository(fixture.root);
    const runtime = createControlledMethodRuntimeFixture({ repository,
      fixtureRoot: join(repository.commonDir, "agent-pipeline", "controlled-method-fixtures", "cancel"), sessionId: "cancel-fixture" });
    await runtime.run(async () => {
      const observed = observeSessionCleanupState(fixture.root);
      const current = inspectSourceOwnedCurrentAuthorityContext({ repository }).currentRequester;
      const tuple = { sessionId: current.sessionId, descriptorSha256: current.descriptorSha256 };
      bindOnboardingSessionCleanup({ rootDir: fixture.root, sessionCleanup: tuple, expectedStateSha256: observed.stateSha256, expectedRevision: observed.revision });
      const bound = observeSessionCleanupState(fixture.root);
      assert.notEqual(bound.sessionCleanup, null, "the session is bound");
      // Observed before the guard: the State was WRITTEN (submission withdrawn, revision + 1) and the registry then refused with
      // SDC-AUTHORITY-CAS state-legacy-operation-effects, because the bound session's legacy lifetime is keyed by the whole cleanup
      // identity, which the advance changes. The admission is therefore refused before the write while a session is bound.
      const before = readFileSync(fixture.statePath);
      const result = refusedRun(["cancel-submitted-plan", "--by", "PO", "--submission-sha256", submissionSha256], { dir: fixture.root });
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /SDC-AUTHORITY-UNAVAILABLE: state\.cancel-submitted-plan is not admitted while a session cleanup binding is held; nothing written\./u, result.stderr);
      assert.doesNotMatch(result.stderr, /untyped|state-legacy-operation-effects/u, result.stderr);
      assert.deepEqual(readFileSync(fixture.statePath), before, "the refusal wrote nothing");
      const rebound = observeSessionCleanupState(fixture.root);
      releaseOnboardingSessionCleanup({ rootDir: fixture.root, sessionCleanup: tuple, expectedStateSha256: rebound.stateSha256, expectedRevision: rebound.revision });
    });
    await runtime.dispose();
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// The cleanup identity the verification compares (the shape continuitySharedStateCleanupIdentity builds).
function cleanupIdentity() {
  const resume = { mode: "immediate", sourceRevision: 4, reasonCode: "active-turn" };
  return {
    root: "/synthetic/root", path: "/synthetic/root/project/pipeline-state.json", neutral: true, mode: "active",
    revision: 4, activeFeatureId: "unit", sessionCleanup: null, orphanBinding: null, discardedEntry: null,
    releaseProof: null, releaseReceipt: null, released: false, privateBinding: null,
    continuity: { schema: "pipeline.continuity.v0", featureId: "unit", revision: 4, resume, nativeContinuation: null, queueHead: { nextAction: "review" } },
    closedFeatures: [], discardedFeatures: [], cleanupReleases: null, binding: { status: "absent" }, release: { status: "absent" },
  };
}
function advanced(identity, extra = {}) {
  const revision = identity.revision + 1;
  return { ...identity, revision, continuity: { ...identity.continuity, revision, nativeContinuation: null,
    resume: { mode: "immediate", sourceRevision: revision, reasonCode: "active-turn" }, ...extra } };
}
const ADVANCING = ["state.cancel-submitted-plan", "state.cancel-mixed-plan-state"];
const NON_ADVANCING = ["state.reopen-design", "state.seal-plan-approval", "state.set-gate-estimate", "state.revoke-plan", "state.set-phase-no-calibration"];

test("C30F-G1B: an advancing entry admits exactly revision + 1 with the writer's resume, every other identity change is refused with SDC-AUTHORITY-CAS", () => {
  const prepared = cleanupIdentity();
  for (const entry of ADVANCING) {
    assert.doesNotThrow(() => continuityAssertStateWriteIdentity(entry, prepared, advanced(prepared)), `${entry}: the advance`);
    assert.doesNotThrow(() => continuityAssertStateWriteIdentity(entry, prepared, structuredClone(prepared)), `${entry}: a replay leaves the identity unchanged`);
    const refused = [
      ["revision + 2", { ...advanced(prepared), revision: 6, continuity: { ...advanced(prepared).continuity, revision: 6, resume: { mode: "immediate", sourceRevision: 6, reasonCode: "active-turn" } } }],
      ["revision - 1", { ...prepared, revision: 3, continuity: { ...prepared.continuity, revision: 3, resume: { mode: "immediate", sourceRevision: 3, reasonCode: "active-turn" } } }],
      ["the advance with another resume reason", advanced(prepared, { resume: { mode: "immediate", sourceRevision: 5, reasonCode: "recovery" } })],
      ["the advance with another resume source revision", advanced(prepared, { resume: { mode: "immediate", sourceRevision: 4, reasonCode: "active-turn" } })],
      ["the advance with a kept native continuation", advanced(prepared, { nativeContinuation: { synthetic: true } })],
      ["the advance with a changed queue head", advanced(prepared, { queueHead: { nextAction: "dispatch" } })],
      ["the advance with a changed continuity feature", advanced(prepared, { featureId: "other" })],
      ["a changed activeFeatureId", { ...advanced(prepared), activeFeatureId: "other" }],
      ["a changed closedFeatures", { ...advanced(prepared), closedFeatures: [{ id: "x" }] }],
      ["a changed discardedFeatures", { ...advanced(prepared), discardedFeatures: [{ id: "x" }] }],
      ["a changed cleanupReleases", { ...advanced(prepared), cleanupReleases: [] }],
      ["a changed session cleanup binding", { ...advanced(prepared), sessionCleanup: { sessionId: "controller-0" } }],
      ["a changed private binding", { ...advanced(prepared), privateBinding: { synthetic: true } }],
      ["a changed mode", { ...advanced(prepared), mode: "closed" }],
      ["a changed path", { ...advanced(prepared), path: "/synthetic/root/.claude/pipeline-state.json" }],
      ["a changed binding", { ...advanced(prepared), binding: { status: "present" } }],
      ["a changed release", { ...advanced(prepared), release: { status: "present" } }],
      ["a top-level revision that does not follow the continuity revision", { ...advanced(prepared), revision: 4 }],
    ];
    for (const [name, current] of refused) {
      assert.throws(() => continuityAssertStateWriteIdentity(entry, prepared, current), { code: "SDC-AUTHORITY-CAS" }, `${entry}: ${name}`);
    }
  }
  // A prepared identity without a numeric revision (design-unbound) admits no advance.
  assert.throws(() => continuityAssertStateWriteIdentity(ADVANCING[0], { ...prepared, revision: null, continuity: null }, advanced(prepared)), { code: "SDC-AUTHORITY-CAS" });
  assert.throws(() => continuityAssertStateWriteIdentity(ADVANCING[0], { ...prepared, revision: Number.MAX_SAFE_INTEGER, continuity: { ...prepared.continuity, revision: Number.MAX_SAFE_INTEGER } }, advanced(prepared)), { code: "SDC-AUTHORITY-CAS" });
});

test("C30F-G1B: an admitted non-advancing entry keeps the exact identity equality and still refuses a revision advance", () => {
  const prepared = cleanupIdentity();
  for (const entry of NON_ADVANCING) {
    assert.doesNotThrow(() => continuityAssertStateWriteIdentity(entry, prepared, structuredClone(prepared)), `${entry}: unchanged`);
    assert.throws(() => continuityAssertStateWriteIdentity(entry, prepared, advanced(prepared)), { code: "SDC-AUTHORITY-CAS" }, `${entry}: advance`);
    assert.throws(() => continuityAssertStateWriteIdentity(entry, prepared, { ...prepared, activeFeatureId: "other" }), { code: "SDC-AUTHORITY-CAS" }, `${entry}: other feature`);
  }
  // An entry outside both closed sets gets no allowance either.
  for (const entry of ["state.set-feature", "state.set-phase-with-calibration"]) {
    assert.throws(() => continuityAssertStateWriteIdentity(entry, prepared, advanced(prepared)), { code: "SDC-AUTHORITY-CAS" }, entry);
  }
});
