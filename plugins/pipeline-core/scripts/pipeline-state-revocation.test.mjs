#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";

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
