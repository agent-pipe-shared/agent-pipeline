#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression coverage for checkStatePhaseConsistency (mirrors
 * check-release-state-consistency.test.mjs's fixture style) and for the
 * marker-emission hook it reads (statePhaseProjectionMarker /
 * syncStatePhaseMarker in pipeline-state.mjs), filed against
 * backlog/items/2026-08-29-docs-state-human-summary-diverges-from-machine-next-action.md.
 *
 * pipeline.state-phase-projection-atomicity
 *
 * Run: node --test plugins/pipeline-core/scripts/check-state-phase-consistency.test.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";
import { checkStatePhaseConsistency } from "./check-state-phase-consistency.mjs";
import {
  PO_GATE_AUTHORITY_EVIDENCE_SCHEMA,
  PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
} from "../lib/po-gate-authority.mjs";

const FIXED_NOW = () => "2026-08-29T09:00:00.000Z";
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

function freshDir() {
  const dir = mkdtempSync(join(tmpdir(), "state-phase-consistency-"));
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs/state.md"), "# Project state\n\n## Next action\n\nplaceholder\n");
  return dir;
}

// Mirrors pipeline-state-approve-announce.test.mjs's injectedPoGateAuthority:
// a synthetic authority derived from the plan/spec path text (not real file
// bytes), stable across submit-plan's initial call and approve-plan's
// beforeCommit re-check.
function injectedPoGateAuthority(planPath) {
  const planSha256 = createHash("sha256").update(`fixture:${planPath}`).digest("hex");
  const specPath = `${planPath.slice(0, planPath.lastIndexOf("/") + 1)}spec.md`;
  const specSha256 = createHash("sha256").update(`fixture:${specPath}`).digest("hex");
  const value = {
    schema: PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
    humanFacing: "en",
    sourceSha256: A,
    runtimeSha256: B,
    receiptSha256: C,
    repositoryFingerprint: D,
    planPath,
    planSha256,
    specPath,
    specSha256,
  };
  return ({ expectedPlanSha256, expectedSpecSha256 } = {}) =>
    (expectedPlanSha256 === undefined || expectedPlanSha256 === planSha256)
      && (expectedSpecSha256 === undefined || expectedSpecSha256 === specSha256)
      ? { ok: true, code: "PO-GATE-AUTHORITY-VALID", value }
      : { ok: false, code: "PO-GATE-AUTHORITY-STALE" };
}

function injectedPoGateProfile() {
  return () => ({
    ok: true,
    code: "PO-PROFILE-AUTHORITY-VALID",
    value: { schema: PO_GATE_AUTHORITY_EVIDENCE_SCHEMA, humanFacing: "en", sourceSha256: A, runtimeSha256: B, receiptSha256: C, repositoryFingerprint: D },
  });
}

function lifecycleDeps(dir, planPath) {
  return { dir, now: FIXED_NOW, poGateAuthority: injectedPoGateAuthority(planPath), poGateProfile: injectedPoGateProfile() };
}

function lifecycleContinuity(featureId, authority) {
  return {
    schema: "pipeline.continuity.v0",
    featureId,
    revision: 0,
    runtime: { humanFacingLanguage: authority.humanFacing, activeDuty: "Coordinator", sessionCleanup: null },
    authority: {
      prd: { path: authority.planPath, sha256: authority.planSha256 },
      spec: { path: authority.specPath, sha256: authority.specSha256 },
      result: null,
    },
    queueHead: {
      packageId: "initial-planning", actionId: "review-plan", nextAction: "review",
      productRetryCount: 0, environmentRerouteCount: 0, dispatch: null,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: { concurrencyLimit: 4, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
  };
}

function writeRequest(dir, name, value) {
  const rel = `${name}.json`;
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2) + "\n");
  return rel;
}

function continuityArgs(sub, revision, requestFile, token = "token-00000001") {
  return [sub, "--expected-revision", String(revision), "--request-file", requestFile, "--lock-token", token];
}

let nonceSequence = 0;
function continuityDeps(dir) {
  return { dir, now: FIXED_NOW, nowMs: () => 60_000, ownerNonce: () => `nonce-${String(++nonceSequence).padStart(8, "0")}`, lockStaleMs: 30_000 };
}

function initializeLifecycleContinuity(dir, featureId, planPath) {
  const observed = injectedPoGateAuthority(planPath)();
  assert.equal(observed.ok, true);
  const requestFile = writeRequest(dir, `lifecycle-continuity-${featureId}`, lifecycleContinuity(featureId, observed.value));
  return run(continuityArgs("continuity-init", "absent", requestFile), continuityDeps(dir));
}

// Reproduces the exact drift class from the source report: docs/state.md's
// marker says "design" while project/pipeline-state.json's machine-tracked
// phase has already moved to "implementation".
test("checkStatePhaseConsistency reports the design-vs-implementation drift class as blocked", () => {
  const dir = freshDir();
  try {
    mkdirSync(join(dir, "project"), { recursive: true });
    writeFileSync(join(dir, "project/pipeline-state.json"), `${JSON.stringify({
      schema: "pipeline.state.v0",
      activeFeature: { id: "drift-feature", planPath: "specs/drift/prd.md", phase: "implementation" },
      planApproved: true,
    }, null, 2)}\n`);
    writeFileSync(join(dir, "docs/state.md"),
      "# Project state\n\n## Next action\n\n**Lifecycle phase:** feature `drift-feature` · phase `design`\n\nplaceholder\n");
    const result = checkStatePhaseConsistency({ rootDir: dir });
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.reasons, ["state-phase-projection-mismatch"]);
    assert.equal(result.phase, "implementation");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkStatePhaseConsistency reports consistent when the marker agrees with the machine phase", () => {
  const dir = freshDir();
  try {
    mkdirSync(join(dir, "project"), { recursive: true });
    writeFileSync(join(dir, "project/pipeline-state.json"), `${JSON.stringify({
      schema: "pipeline.state.v0",
      activeFeature: { id: "agree-feature", planPath: "specs/agree/prd.md", phase: "design" },
      planApproved: false,
    }, null, 2)}\n`);
    writeFileSync(join(dir, "docs/state.md"),
      "# Project state\n\n## Next action\n\n**Lifecycle phase:** feature `agree-feature` · phase `design`\n\nplaceholder\n");
    const result = checkStatePhaseConsistency({ rootDir: dir });
    assert.equal(result.status, "consistent");
    assert.deepEqual(result.reasons, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Atomicity: not a static snapshot -- runs the REAL set-feature -> submit-plan
// -> present-plan -> approve-plan -> set-phase --phase implementation command
// sequence (pipeline-state.mjs's own syncNextActionDocs()/syncStatePhaseMarker
// hook) and re-checks after each phase-affecting step, proving the marker is
// re-synced atomically with the transition rather than matching once and then
// drifting silently.
test("the marker stays atomic with a real design -> implementation transition", () => {
  const dir = freshDir();
  try {
    const planPath = "specs/atomic-feature/prd.md";
    const setFeature = run(["set-feature", "--id", "atomic-feature", "--plan-path", planPath], { dir, now: FIXED_NOW });
    assert.equal(setFeature, 0);
    const afterSetFeature = checkStatePhaseConsistency({ rootDir: dir });
    assert.equal(afterSetFeature.status, "consistent", JSON.stringify(afterSetFeature));
    assert.equal(afterSetFeature.phase, "design");
    const markerAfterSetFeature = readFileSync(join(dir, "docs/state.md"), "utf8");
    assert.match(markerAfterSetFeature, /\*\*Lifecycle phase:\*\* feature `atomic-feature` . phase `design`/u);

    const continuityInit = initializeLifecycleContinuity(dir, "atomic-feature", planPath);
    assert.equal(continuityInit, 0);
    const submitted = run(["submit-plan", "--by", "coordinator", "--profile", "feature"], lifecycleDeps(dir, planPath));
    assert.equal(submitted, 0);
    const presented = run(["present-plan", "--by", "coordinator"], lifecycleDeps(dir, planPath));
    assert.equal(presented, 0);
    const approved = run(["approve-plan", "--by", "po-test"], lifecycleDeps(dir, planPath));
    assert.equal(approved, 0);

    const setPhase = run(["set-phase", "--phase", "implementation", "--verify-command", `${process.execPath} -e "process.exit(0)"`], { dir, now: FIXED_NOW });
    assert.equal(setPhase, 0);
    const afterSetPhase = checkStatePhaseConsistency({ rootDir: dir });
    assert.equal(afterSetPhase.status, "consistent", JSON.stringify(afterSetPhase));
    assert.equal(afterSetPhase.phase, "implementation");
    const markerAfterSetPhase = readFileSync(join(dir, "docs/state.md"), "utf8");
    assert.match(markerAfterSetPhase, /\*\*Lifecycle phase:\*\* feature `atomic-feature` . phase `implementation`/u);
    assert.doesNotMatch(markerAfterSetPhase, /phase `design`/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
