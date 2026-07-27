#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * semgrep.test.mjs -- regression coverage for semgrep.mjs's CAPABILITY_CONTRACT_V2
 * descriptor (CYB-2D). Pure shape/value assertions on the new, additive, frozen data
 * descriptor only -- does not exercise run()/isInstalled() (that stays covered by
 * security-scan.test.mjs).
 *
 * Run:  node --test harness/scripts/security-adapters/semgrep.test.mjs
 * Exit: 0 = all cases pass, non-zero = at least one case failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { name, CAPABILITY_CONTRACT_V2 } from "./semgrep.mjs";

test("CAPABILITY_CONTRACT_V2 exists and is frozen", () => {
  assert.ok(CAPABILITY_CONTRACT_V2, "CAPABILITY_CONTRACT_V2 export is missing");
  assert.equal(Object.isFrozen(CAPABILITY_CONTRACT_V2), true);
});

test("CAPABILITY_CONTRACT_V2 fixed top-level fields match the documented v2 contract", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.contractVersion, "v2");
  assert.equal(CAPABILITY_CONTRACT_V2.kind, "capability");
  assert.equal(CAPABILITY_CONTRACT_V2.capabilityId, "cap.sast");
  assert.equal(CAPABILITY_CONTRACT_V2.controlRef, null);
  assert.equal(CAPABILITY_CONTRACT_V2.supportedEcosystems, null);
  assert.equal(CAPABILITY_CONTRACT_V2.toolVersionConstraint, null);
  assert.deepEqual(CAPABILITY_CONTRACT_V2.requiredInputs, ["rootDir"]);
  assert.equal(CAPABILITY_CONTRACT_V2.confidenceNormalization, null);
});

test("CAPABILITY_CONTRACT_V2.tool tracks the real `name` export, not a hardcoded duplicate string", () => {
  assert.equal(name, "semgrep");
  assert.equal(CAPABILITY_CONTRACT_V2.tool, name);
});

test("CAPABILITY_CONTRACT_V2.supportedEcosystems is an honest null + explanatory note (no invented ecosystem list)", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.supportedEcosystems, null);
  assert.equal(typeof CAPABILITY_CONTRACT_V2.supportedEcosystemsNote, "string");
  assert.match(CAPABILITY_CONTRACT_V2.supportedEcosystemsNote, /language\/rule-scoped/);
});

test("CAPABILITY_CONTRACT_V2.networkBehavior is honestly conditional on config.rulesDir, not a single unconditional value", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.networkBehavior, "network-optional");
  assert.equal(typeof CAPABILITY_CONTRACT_V2.networkBehaviorNote, "string");
  assert.match(CAPABILITY_CONTRACT_V2.networkBehaviorNote, /offline when config\.rulesDir/);
  assert.match(CAPABILITY_CONTRACT_V2.networkBehaviorNote, /'auto' fallback/);
  assert.match(CAPABILITY_CONTRACT_V2.networkBehaviorNote, /does not itself control or guarantee/);
});

test("CAPABILITY_CONTRACT_V2.requiredInputsNote documents config.rulesDir as optional with the real \"auto\" fallback", () => {
  assert.equal(typeof CAPABILITY_CONTRACT_V2.requiredInputsNote, "string");
  assert.match(CAPABILITY_CONTRACT_V2.requiredInputsNote, /config\.rulesDir is optional/);
  assert.match(CAPABILITY_CONTRACT_V2.requiredInputsNote, /"auto"/);
});

test("CAPABILITY_CONTRACT_V2.severityNormalization faithfully transcribes the real three-tier mapSemgrepSeverity() rule", () => {
  const sev = CAPABILITY_CONTRACT_V2.severityNormalization;
  assert.equal(sev.source, "extra.severity");
  assert.deepEqual(sev.mapping, { ERROR: "high", WARNING: "medium", INFO: "info" });
  assert.equal(sev.fallback.value, "medium");
  assert.match(sev.fallback.rule, /never silently dropped/);
  assert.match(sev.fallback.rule, /never crashes/);
});

test("CAPABILITY_CONTRACT_V2.coverageLimitations is a non-empty array of factual, code-grounded strings", () => {
  assert.ok(Array.isArray(CAPABILITY_CONTRACT_V2.coverageLimitations));
  assert.ok(CAPABILITY_CONTRACT_V2.coverageLimitations.length >= 1);
  for (const entry of CAPABILITY_CONTRACT_V2.coverageLimitations) {
    assert.equal(typeof entry, "string");
    assert.ok(entry.length > 0);
  }
  const joined = CAPABILITY_CONTRACT_V2.coverageLimitations.join(" ");
  assert.match(joined, /active rule set/);
  assert.match(joined, /'auto' registry mode/);
});

test("CAPABILITY_CONTRACT_V2.exitCodeMapping transcribes the real fail-closed exit-code/body policy", () => {
  const m = CAPABILITY_CONTRACT_V2.exitCodeMapping;
  assert.match(m.completed, /zero child exit/);
  assert.match(m.completed, /results\[\] array/);
  assert.match(m.completed, /no error payload/);
  assert.match(m.nonzero, /scanner_error/);
  assert.match(m.errorPayload, /scanner_error/);
  assert.match(m.errorPayload, /errors\[\] array/);
  assert.match(m.missingResults, /scanner_error/);
  assert.match(m.missingResults, /even if stdout otherwise looks like a clean report/);
});

test("CAPABILITY_CONTRACT_V2.timeoutContract matches run()'s real default and mechanism", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.defaultMs, 60000);
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.cancellable, true);
  assert.match(CAPABILITY_CONTRACT_V2.timeoutContract.mechanism, /spawnSync/);
  assert.match(CAPABILITY_CONTRACT_V2.timeoutContract.mechanism, /ETIMEDOUT/);
});

test("CAPABILITY_CONTRACT_V2.evidenceFields matches the real findings.map(...) object shape (same shape as gitleaks)", () => {
  assert.deepEqual(CAPABILITY_CONTRACT_V2.evidenceFields, ["tool", "severity", "rule", "path", "line", "msg"]);
});
