#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Unit tests for the restricted attribution record validator (GMW/HGO D-1). */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRIBUTION_TIME_BUCKET_MS,
  HUMAN_DECISION_ATTRIBUTION_SCHEMA,
  HumanGovernanceLedgerError,
  isHumanDecisionAttribution,
  validateHumanDecisionAttribution,
} from "./human-decision-attribution.mjs";

function fixture(overrides = {}) {
  return {
    schema: HUMAN_DECISION_ATTRIBUTION_SCHEMA,
    packageId: "guard-maintenance-window",
    authorityClass: "product-owner",
    identityAssurance: "locally-attributed",
    reasonCode: "GUARD.MAINTENANCE.LIFT",
    rationale: "Lifting GS-6 for the release window.",
    keyReference: "po-signing-key-1",
    publicKeySha256: "a".repeat(64),
    timeBucketEpochMs: ATTRIBUTION_TIME_BUCKET_MS * 3,
    ...overrides,
  };
}

test("accepts a well-formed attribution payload and freezes the result", () => {
  const validated = validateHumanDecisionAttribution(fixture());
  assert.equal(validated.schema, HUMAN_DECISION_ATTRIBUTION_SCHEMA);
  assert.ok(Object.isFrozen(validated));
});

test("isHumanDecisionAttribution tags before validation", () => {
  assert.equal(isHumanDecisionAttribution(fixture()), true);
  assert.equal(isHumanDecisionAttribution({ schema: "pipeline.human-governance-decision.v1" }), false);
  assert.equal(isHumanDecisionAttribution(null), false);
});

test("rejects an unknown or missing key with HDA-SHAPE", () => {
  assert.throws(() => validateHumanDecisionAttribution({ ...fixture(), extra: "x" }), (error) => error instanceof HumanGovernanceLedgerError && error.code === "HDA-SHAPE");
  const { rationale, ...missingRationale } = fixture();
  assert.throws(() => validateHumanDecisionAttribution(missingRationale), (error) => error.code === "HDA-SHAPE");
});

test("rejects a packageId outside the closed producer set", () => {
  assert.throws(() => validateHumanDecisionAttribution(fixture({ packageId: "some-other-package" })), (error) => error.code === "HDA-SHAPE");
});

test("rejects an authorityClass or identityAssurance outside the kernel's own sets", () => {
  assert.throws(() => validateHumanDecisionAttribution(fixture({ authorityClass: "agent" })), (error) => error.code === "HDA-SHAPE");
  assert.throws(() => validateHumanDecisionAttribution(fixture({ identityAssurance: "trusted" })), (error) => error.code === "HDA-SHAPE");
});

test("rejects a reasonCode that is not a stable upper-case code", () => {
  assert.throws(() => validateHumanDecisionAttribution(fixture({ reasonCode: "lowercase.code" })), (error) => error.code === "HDA-SHAPE");
});

test("rejects an empty, oversized, or non-scalar rationale", () => {
  assert.throws(() => validateHumanDecisionAttribution(fixture({ rationale: "" })), (error) => error.code === "HDA-RATIONALE");
  assert.throws(() => validateHumanDecisionAttribution(fixture({ rationale: "x".repeat(4097) })), (error) => error.code === "HDA-RATIONALE");
  assert.throws(() => validateHumanDecisionAttribution(fixture({ rationale: "\ud800" })), (error) => error.code === "HDA-RATIONALE");
});

test("rejects a keyReference outside the trust anchor's pattern", () => {
  assert.throws(() => validateHumanDecisionAttribution(fixture({ keyReference: "" })), (error) => error.code === "HDA-KEY-REFERENCE");
  assert.throws(() => validateHumanDecisionAttribution(fixture({ keyReference: "has a space" })), (error) => error.code === "HDA-KEY-REFERENCE");
});

test("rejects a publicKeySha256 that is not a sha-256 hex digest", () => {
  assert.throws(() => validateHumanDecisionAttribution(fixture({ publicKeySha256: "not-a-digest" })), (error) => error.code === "HDA-DIGEST");
});

test("rejects a timeBucketEpochMs that is negative, not an integer, or not bucket-aligned", () => {
  assert.throws(() => validateHumanDecisionAttribution(fixture({ timeBucketEpochMs: -1 })), (error) => error.code === "HDA-TIME-BUCKET");
  assert.throws(() => validateHumanDecisionAttribution(fixture({ timeBucketEpochMs: 1.5 })), (error) => error.code === "HDA-TIME-BUCKET");
  assert.throws(() => validateHumanDecisionAttribution(fixture({ timeBucketEpochMs: ATTRIBUTION_TIME_BUCKET_MS + 1 })), (error) => error.code === "HDA-TIME-BUCKET");
});

test("R-2: the shape has no field that could carry a portable correlator", () => {
  const keys = Object.keys(fixture());
  for (const forbidden of ["decisionId", "eventId", "idempotencyKey", "intentSha256", "subjectSha256", "nonce", "candidate", "artifacts", "ruleDigest", "policyDigest", "validity", "links"]) {
    assert.ok(!keys.includes(forbidden), `payload must not carry ${forbidden}`);
  }
});
