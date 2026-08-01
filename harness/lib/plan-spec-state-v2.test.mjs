#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  bindPlanSpecApproval,
  bindPlanSpecApprovalWithHumanDecision,
  revokePlanV2,
  sha256CanonicalJson,
} from "./plan-spec-state-v2.mjs";

const APPROVAL_SCHEMA = "pipeline.plan-approval.v2";
const REVOCATION_SCHEMA = "pipeline.plan-revocation.v2";
const NOW = "2026-07-19T12:00:00.000Z";
const BIND_AT = "2026-07-19T12:05:00.000Z";
const REVOKED_AT = "2026-07-19T12:10:00.000Z";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function authority(overrides = {}) {
  return {
    schema: "pipeline.po-gate-authority.v2",
    humanFacing: "de",
    sourceSha256: "1".repeat(64),
    runtimeSha256: "2".repeat(64),
    receiptSha256: "3".repeat(64),
    repositoryFingerprint: "4".repeat(64),
    planPath: "specs/hawkeye/prd_hawkeye.md",
    planSha256: "5".repeat(64),
    specPath: "specs/hawkeye/spec.md",
    specSha256: "6".repeat(64),
    ...overrides,
  };
}

function legacyState(overrides = {}) {
  return {
    schema: "pipeline.state.v0",
    activeFeature: { id: "hawkeye", planPath: "specs/hawkeye/prd_hawkeye.md", phase: "design" },
    planApproved: true,
    planApproval: { approvedBy: "Original PO", approvedAt: NOW },
    ...overrides,
  };
}

function bind(input = {}) {
  const state = input.state ?? legacyState();
  const poGateAuthority = input.poGateAuthority ?? authority();
  return bindPlanSpecApproval({
    state,
    expectedStateSha256: input.expectedStateSha256 ?? sha256CanonicalJson(state),
    poGateAuthority,
    expectedPlanSha256: input.expectedPlanSha256 ?? poGateAuthority.planSha256,
    expectedSpecSha256: input.expectedSpecSha256 ?? poGateAuthority.specSha256,
    by: input.by ?? "Binding PO",
    at: input.at ?? BIND_AT,
  });
}

function approvedState() {
  const migrated = bind();
  assert.equal(migrated.ok, true, JSON.stringify(migrated));
  return migrated.state;
}

function humanDecision(overrides = {}) {
  return {
    schema: "pipeline.human-decision-reference.v1",
    decisionId: "human-plan-approval-1",
    decisionDigest: "7".repeat(64),
    candidate: { commit: "a".repeat(40), tree: "b".repeat(40) },
    checkpoint: { repositoryFingerprint: "4".repeat(64), streamId: "human", sequence: 1, eventDigest: "8".repeat(64), candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40) },
    ...overrides,
  };
}

function revoke(input = {}) {
  const state = input.state ?? approvedState();
  return revokePlanV2({
    state,
    expectedStateSha256: input.expectedStateSha256 ?? sha256CanonicalJson(state),
    expectedPlanSha256: input.expectedPlanSha256 ?? authority().planSha256,
    expectedSpecSha256: input.expectedSpecSha256 ?? authority().specSha256,
    by: input.by ?? "Revoking PO",
    at: input.at ?? REVOKED_AT,
  });
}

check("one exact legacy approval migrates to the closed v2 binding without changing its original attribution", () => {
  const result = bind();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.replay, false);
  assert.deepEqual(result.approval, {
    schema: APPROVAL_SCHEMA,
    approvedBy: "Original PO",
    approvedAt: NOW,
    specBoundBy: "Binding PO",
    specBoundAt: BIND_AT,
    poGateAuthority: authority(),
  });
  assert.equal(result.state.planApproved, true);
  assert.deepEqual(result.state.planApproval, result.approval);
});

check("bind-plan-spec exact replay returns the existing v2 object with no state mutation", () => {
  const migrated = bind();
  assert.equal(migrated.ok, true, JSON.stringify(migrated));
  const replay = bind({ state: migrated.state });
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.state, migrated.state);
  assert.deepEqual(replay.approval, migrated.state.planApproval);
});

check("ledger-first bind writes a closed v3 reference and rejects missing or cross-repository evidence", () => {
  const state = legacyState();
  const input = { state, expectedStateSha256: sha256CanonicalJson(state), poGateAuthority: authority(), expectedPlanSha256: authority().planSha256, expectedSpecSha256: authority().specSha256, humanDecision: humanDecision(), by: "Binding PO", at: BIND_AT };
  const result = bindPlanSpecApprovalWithHumanDecision(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.approval.schema, "pipeline.plan-approval.v3");
  assert.deepEqual(result.approval.humanDecision, humanDecision());
  const replay = bindPlanSpecApprovalWithHumanDecision({ ...input, state: result.state, expectedStateSha256: sha256CanonicalJson(result.state) });
  assert.equal(replay.replay, true, JSON.stringify(replay));
  for (const reference of [humanDecision({ decisionId: "" }), humanDecision({ checkpoint: { ...humanDecision().checkpoint, repositoryFingerprint: "9".repeat(64) } })]) {
    const denied = bindPlanSpecApprovalWithHumanDecision({ ...input, humanDecision: reference });
    assert.equal(denied.ok, false, JSON.stringify(denied));
  }
});

check("bind-plan-spec rejects every non-exact legacy approval before mutation", () => {
  for (const planApproval of [
    { approvedBy: "Original PO" },
    { approvedBy: "Original PO", approvedAt: NOW, extra: true },
    { schema: APPROVAL_SCHEMA, approvedBy: "Original PO", approvedAt: NOW },
  ]) {
    const state = legacyState({ planApproval });
    const result = bind({ state });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(Object.prototype.hasOwnProperty.call(result, "state"), false);
  }
});

check("bind-plan-spec refuses a mismatched active feature, expected digest, or stale CAS snapshot", () => {
  for (const input of [
    { state: legacyState({ activeFeature: { id: "other", planPath: "specs/other/prd_other.md", phase: "design" } }) },
    { expectedPlanSha256: "a".repeat(64) },
    { expectedSpecSha256: "b".repeat(64) },
    { expectedStateSha256: "c".repeat(64) },
  ]) {
    const result = bind(input);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(Object.prototype.hasOwnProperty.call(result, "state"), false);
  }
});

check("revoke-plan writes only the exact v2 record bound to the v2 approval", () => {
  const result = revoke();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.replay, false);
  assert.deepEqual(result.revocation, {
    schema: REVOCATION_SCHEMA,
    planPath: authority().planPath,
    planSha256: authority().planSha256,
    specPath: authority().specPath,
    specSha256: authority().specSha256,
    revokedBy: "Revoking PO",
    revokedAt: REVOKED_AT,
  });
  assert.equal(result.state.planApproved, false);
  assert.deepEqual(result.state.planRevocation, result.revocation);
  assert.equal(
    result.planRevocationSha256,
    sha256(canonicalJson(result.revocation)),
    "the exported digest must be SHA-256 of repository-canonical JSON bytes",
  );
  assert.equal(result.planRevocationSha256, sha256CanonicalJson(result.revocation));
});

check("revoke-plan exact replay is idempotent and any changed request conflicts", () => {
  const revoked = revoke();
  assert.equal(revoked.ok, true, JSON.stringify(revoked));
  const replay = revoke({ state: revoked.state });
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.state, revoked.state);
  assert.deepEqual(replay.revocation, revoked.state.planRevocation);
  for (const input of [
    { by: "Different PO" },
    { at: "2026-07-19T12:11:00.000Z" },
    { expectedPlanSha256: "a".repeat(64) },
    { expectedSpecSha256: "b".repeat(64) },
    { expectedStateSha256: "c".repeat(64) },
  ]) {
    const result = revoke({ state: revoked.state, ...input });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(Object.prototype.hasOwnProperty.call(result, "state"), false);
  }
});

check("legacy, malformed, mismatched, and silently migrated revocations are rejected before mutation", () => {
  const state = approvedState();
  for (const planRevocation of [
    { revokedBy: "Old PO", revokedAt: NOW },
    { schema: REVOCATION_SCHEMA, revokedBy: "Old PO", revokedAt: NOW },
    {
      schema: REVOCATION_SCHEMA,
      planPath: authority().planPath,
      planSha256: authority().planSha256,
      specPath: authority().specPath,
      specSha256: authority().specSha256,
      revokedBy: "Old PO",
      revokedAt: NOW,
      extra: true,
    },
    {
      schema: REVOCATION_SCHEMA,
      planPath: authority().planPath,
      planSha256: authority().planSha256,
      specPath: authority().specPath,
      specSha256: "7".repeat(64),
      revokedBy: "Old PO",
      revokedAt: NOW,
    },
  ]) {
    const result = revoke({ state: { ...state, planRevocation } });
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(Object.prototype.hasOwnProperty.call(result, "state"), false);
  }
  const staleApproval = {
    ...state,
    planApproval: {
      ...state.planApproval,
      poGateAuthority: authority({ specSha256: "7".repeat(64) }),
    },
  };
  const result = revoke({ state: staleApproval });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(Object.prototype.hasOwnProperty.call(result, "state"), false);
});

process.stdout.write(`plan-spec-state-v2: ${passed} checks passed\n`);
