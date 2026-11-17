#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";
import { sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";
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

// C30F-G1 (AC-108; Codex greenfield 2026-11-16): `cancel-submitted-plan` was refused with the untyped "continuity State entry not admitted" and no
// route. The continuity producer admits an entry only when the write keeps its cleanup identity (revision and continuity object) unchanged, so an
// entry that advances the continuity revision cannot be admitted without a change to that identity check. It must be refused with its own typed
// reason that names the admitted entries and a route that runs, and the refusal must leave the State bytes unchanged.
const ADMITTED_STATE_ENTRIES = "reopen-design, seal-plan-approval, set-gate-estimate, revoke-plan, set-phase";
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

function expectEntryRefused({ root, statePath }, entry, args, route = "session-cleanup.mjs plan-recovery --repo <root>") {
  const before = readFileSync(statePath);
  const refused = refusedRun(args, { dir: root });
  assert.equal(refused.status, 2, `${entry}: ${refused.stderr}`);
  assert.match(refused.stderr, /SDC-AUTHORITY-UNAVAILABLE: /u, entry);
  assert.doesNotMatch(refused.stderr, /untyped/u, `${entry} is a typed refusal`);
  assert.ok(refused.stderr.includes(`${entry} is not admitted`), `${entry} is named: ${refused.stderr}`);
  assert.ok(refused.stderr.includes(`Admitted: ${ADMITTED_STATE_ENTRIES}`), `${entry} names the admitted entries: ${refused.stderr}`);
  assert.ok(refused.stderr.includes(route), `${entry} names its route: ${refused.stderr}`);
  assert.deepEqual(readFileSync(statePath), before, `${entry} wrote nothing`);
}

test("C30F-G1: cancel-submitted-plan and cancel-mixed-plan-state in a catalogue project are refused with a typed reason, the admitted entries and a route, and write nothing", () => {
  const fixture = catalogueFixture();
  try {
    const sha = "a".repeat(64);
    expectEntryRefused(fixture, "state.cancel-mixed-plan-state", ["cancel-mixed-plan-state", "--by", "PO", "--reason", "fixture", "--submission-sha256", sha, "--approval-sha256", sha, "--invalidation-sha256", sha]);
    assert.equal(run(["submit-plan", "--by", "Synthetic fixture", "--profile", "mini"], { dir: fixture.root, architectureEntryReadiness: () => ({ status: "ready" }) }), 0);
    const submitted = JSON.parse(readFileSync(fixture.statePath, "utf8"));
    expectEntryRefused(fixture, "state.cancel-submitted-plan", ["cancel-submitted-plan", "--by", "PO", "--submission-sha256", sha256CanonicalJson(submitted.planSubmission)], "reopen-design --by <name>");
    // The submission is still bound: the refusal changed nothing, so the route the reason names has something to withdraw.
    assert.deepEqual(JSON.parse(readFileSync(fixture.statePath, "utf8")).planSubmission, submitted.planSubmission);
    // Control: an admitted entry passes the entry check. This fixture keeps its State in the legacy path, which the next check (neutral State
    // required) refuses, so even the admitted entry is not driven to success here; that is why no entry could be admitted on the strength of a test.
    const control = refusedRun(["reopen-design", "--by", "Synthetic fixture PO"], { dir: fixture.root });
    assert.equal(control.status, 2, control.stderr);
    assert.doesNotMatch(control.stderr, /not admitted/u, control.stderr);
    assert.match(control.stderr, /historical authority requires owning lifecycle transition/u, control.stderr);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
