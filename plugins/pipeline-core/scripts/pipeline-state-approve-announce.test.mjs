#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pipeline-state-approve-announce.test.mjs — NVA-BL-77: the approve-plan success
 * output must announce the required `set-phase --phase implementation` step,
 * rather than leaving that discoverable only via guard-devplan.mjs's refusal.
 *
 * Run: node --test plugins/pipeline-core/scripts/pipeline-state-approve-announce.test.mjs
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "./pipeline-state.mjs";
import {
  PO_GATE_AUTHORITY_EVIDENCE_SCHEMA,
  PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
} from "../lib/po-gate-authority.mjs";

const FIXED_NOW = () => "2026-08-12T09:00:00.000Z";
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

function freshDir() {
  return mkdtempSync(join(tmpdir(), "pipeline-state-approve-announce-"));
}

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
    value: {
      schema: PO_GATE_AUTHORITY_EVIDENCE_SCHEMA,
      humanFacing: "en",
      sourceSha256: A,
      runtimeSha256: B,
      receiptSha256: C,
      repositoryFingerprint: D,
    },
  });
}

function lifecycleDeps(dir, planPath) {
  return {
    dir,
    now: FIXED_NOW,
    poGateAuthority: injectedPoGateAuthority(planPath),
    poGateProfile: injectedPoGateProfile(),
  };
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
  return {
    dir,
    now: FIXED_NOW,
    nowMs: () => 60_000,
    ownerNonce: () => `nonce-${String(++nonceSequence).padStart(8, "0")}`,
    lockStaleMs: 30_000,
  };
}

function initializeLifecycleContinuity(dir, featureId, planPath) {
  const observed = injectedPoGateAuthority(planPath)();
  assert.equal(observed.ok, true);
  const requestFile = writeRequest(dir, `lifecycle-continuity-${featureId}`, lifecycleContinuity(featureId, observed.value));
  return run(continuityArgs("continuity-init", "absent", requestFile), continuityDeps(dir));
}

function captureConsole(action) {
  const original = console.log;
  const messages = [];
  console.log = (...args) => messages.push(args.join(" "));
  try {
    return { value: action(), text: messages.join("\n") };
  } finally {
    console.log = original;
  }
}

test("approve-plan success output announces the required set-phase --phase implementation step", () => {
  const dir = freshDir();
  try {
    const planPath = ".claude/plans/approve-announce.md";
    const initCode = run(["set-feature", "--id", "approve-announce", "--plan-path", planPath], { dir, now: FIXED_NOW });
    assert.equal(initCode, 0);
    const continuityInit = initializeLifecycleContinuity(dir, "approve-announce", planPath);
    assert.equal(continuityInit, 0);
    const submitted = run(["submit-plan", "--by", "coordinator", "--profile", "feature"], lifecycleDeps(dir, planPath));
    assert.equal(submitted, 0);
    const presented = run(["present-plan", "--by", "coordinator"], lifecycleDeps(dir, planPath));
    assert.equal(presented, 0);

    const approved = captureConsole(() => run(["approve-plan", "--by", "po-test"], lifecycleDeps(dir, planPath)));
    assert.equal(approved.value, 0);
    assert.match(approved.text, /Plan approved by "po-test"/);
    assert.match(
      approved.text,
      /set-phase --phase implementation/,
      `approve-plan success output must name the required next command; got: ${approved.text}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
