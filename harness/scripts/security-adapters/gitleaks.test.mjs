#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * gitleaks.test.mjs -- regression coverage for gitleaks.mjs's CAPABILITY_CONTRACT_V2
 * descriptor (CYB-2D). Pure shape/value assertions on the new, additive, frozen data
 * descriptor only -- does not exercise run()/isInstalled() (that stays covered by
 * security-scan.test.mjs).
 *
 * Run:  node --test harness/scripts/security-adapters/gitleaks.test.mjs
 * Exit: 0 = all cases pass, non-zero = at least one case failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { name, CAPABILITY_CONTRACT_V2 } from "./gitleaks.mjs";

test("CAPABILITY_CONTRACT_V2 exists and is frozen", () => {
  assert.ok(CAPABILITY_CONTRACT_V2, "CAPABILITY_CONTRACT_V2 export is missing");
  assert.equal(Object.isFrozen(CAPABILITY_CONTRACT_V2), true);
});

test("CAPABILITY_CONTRACT_V2 fixed top-level fields match the documented v2 contract", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.contractVersion, "v2");
  assert.equal(CAPABILITY_CONTRACT_V2.kind, "capability");
  assert.equal(CAPABILITY_CONTRACT_V2.capabilityId, "cap.secrets");
  assert.equal(CAPABILITY_CONTRACT_V2.controlRef, null);
  assert.equal(CAPABILITY_CONTRACT_V2.supportedEcosystems, null);
  assert.equal(CAPABILITY_CONTRACT_V2.toolVersionConstraint, null);
  assert.equal(CAPABILITY_CONTRACT_V2.networkBehavior, "offline");
  assert.deepEqual(CAPABILITY_CONTRACT_V2.requiredInputs, ["rootDir"]);
  assert.equal(CAPABILITY_CONTRACT_V2.confidenceNormalization, null);
});

test("CAPABILITY_CONTRACT_V2.tool tracks the real `name` export, not a hardcoded duplicate string", () => {
  assert.equal(name, "gitleaks");
  assert.equal(CAPABILITY_CONTRACT_V2.tool, name);
});

test("CAPABILITY_CONTRACT_V2.severityNormalization faithfully transcribes the fixed-high rule", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.severityNormalization.source, "fixed");
  assert.equal(CAPABILITY_CONTRACT_V2.severityNormalization.value, "high");
  assert.equal(typeof CAPABILITY_CONTRACT_V2.severityNormalization.rationale, "string");
  assert.ok(CAPABILITY_CONTRACT_V2.severityNormalization.rationale.length > 0);
});

test("CAPABILITY_CONTRACT_V2.coverageLimitations is a non-empty array of factual strings", () => {
  assert.ok(Array.isArray(CAPABILITY_CONTRACT_V2.coverageLimitations));
  assert.ok(CAPABILITY_CONTRACT_V2.coverageLimitations.length >= 1);
  for (const entry of CAPABILITY_CONTRACT_V2.coverageLimitations) {
    assert.equal(typeof entry, "string");
    assert.ok(entry.length > 0);
  }
});

test("CAPABILITY_CONTRACT_V2.exitCodeMapping transcribes the real exit-code contract", () => {
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping["0"], /status derived from parsed report content/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping.nonzero, /scanner_error/);
});

test("CAPABILITY_CONTRACT_V2.timeoutContract matches run()'s real default and mechanism", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.defaultMs, 60000);
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.cancellable, true);
  assert.match(CAPABILITY_CONTRACT_V2.timeoutContract.mechanism, /spawnSync/);
});

test("CAPABILITY_CONTRACT_V2.evidenceFields matches the real findings.map(...) object shape", () => {
  assert.deepEqual(CAPABILITY_CONTRACT_V2.evidenceFields, ["tool", "severity", "rule", "path", "line", "msg"]);
});
