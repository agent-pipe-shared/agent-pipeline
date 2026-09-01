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

// Adversarial rationale variant coverage (privacy-review.md §4 bullet 2:
// "nested, encoded, Unicode-confusable, multiline, oversized, malformed,
// external-content, and error-path variants"). Oversized/malformed/error-path
// are covered above ("rejects an empty, oversized, or non-scalar rationale"
// and every assert.throws in this file exercises the typed error path). The
// five below were previously uncovered
// (backlog/items/2026-08-31-restricted-store-rationale-field-lacks-adversarial-variant-coverage.md).
//
// All five are ACCEPTED, and this is the module's correct, deliberate
// behaviour, not a coverage gap disguised as a passing test: rationale is
// documented (human-decision-attribution.mjs:78-80) to require only a
// non-empty Unicode-scalar string of at most 4096 characters, and
// privacy-review.md §1's "Restricted human decision" row is explicit that
// free-form rationale belongs exactly here -- machine-local, encrypted,
// owner-only, never portable -- unlike the "Portable human decision" row,
// which structurally excludes free text instead of content-filtering it.
// Confusable glyphs, encoded substrings, nested lookalike-shaped text,
// multiline formatting, and pasted external-ticket text are all ordinary
// free-form rationale content for this store; nothing in the design implies
// they should be rejected here, so acceptance is not a divergence.

test("accepts a Unicode-confusable rationale (homoglyph impersonation is a valid Unicode-scalar string; the restricted store does not content-filter free-form rationale, only its shape/length/encoding-validity)", () => {
  const confusable = "Ѕecurity revіew аpproved by Аdmin"; // Cyrillic С/і/а/А standing in for Latin lookalikes
  const validated = validateHumanDecisionAttribution(fixture({ rationale: confusable }));
  assert.equal(validated.rationale, confusable);
  assert.ok(Object.isFrozen(validated));
});

test("accepts an encoded rationale (base64 and percent-encoding); the validator checks Unicode-scalar validity and length, not content encoding", () => {
  const base64 = "c3ludGhldGljIHRpY2tldCByZWZlcmVuY2UgZm9yIGVuY29kaW5nIHRlc3Q=";
  const percentEncoded = "%2Fexample%2Fpath%2Fplaceholder.txt%3Fq%3D1";
  assert.equal(validateHumanDecisionAttribution(fixture({ rationale: base64 })).rationale, base64);
  assert.equal(validateHumanDecisionAttribution(fixture({ rationale: percentEncoded })).rationale, percentEncoded);
});

test("accepts a nested-payload rationale that tries to smuggle a portable-shaped object as free text; it stays an inert string, never parsed, and adds none of its keys to the record (R-2 stays structural)", () => {
  const nested = JSON.stringify({ schema: "pipeline.human-governance-decision.v1", decisionId: "d-1", eventId: "e-1", outcome: "approved" });
  const validated = validateHumanDecisionAttribution(fixture({ rationale: nested }));
  assert.equal(validated.rationale, nested);
  assert.ok(!Object.hasOwn(validated, "decisionId"));
  assert.ok(!Object.hasOwn(validated, "eventId"));
});

test("accepts a multiline rationale", () => {
  const multiline = "Lifting GS-6 for the release window.\nSecond line of context.\nThird line: ticket ref attached separately.";
  const validated = validateHumanDecisionAttribution(fixture({ rationale: multiline }));
  assert.equal(validated.rationale, multiline);
});

test("accepts an external-content rationale (pasted ITSM/ticket text); the restricted store is the design-sanctioned home for exactly this kind of free text (privacy-review.md §1)", () => {
  const external = "Per ticket https://itsm.example.invalid/tickets/12345: customer requested emergency guard lift, approved by on-call.";
  const validated = validateHumanDecisionAttribution(fixture({ rationale: external }));
  assert.equal(validated.rationale, external);
});
