#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * license-check.test.mjs -- regression coverage for license-check.mjs's CAPABILITY_CONTRACT_V2
 * descriptor (CYB-2D). Pure shape/value assertions on the new, additive, frozen data descriptor
 * only -- does not exercise run()/isInstalled() (that stays covered by security-scan.test.mjs).
 *
 * Run:  node --test harness/scripts/security-adapters/license-check.test.mjs
 * Exit: 0 = all cases pass, non-zero = at least one case failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { name, CAPABILITY_CONTRACT_V2 } from "./license-check.mjs";

test("CAPABILITY_CONTRACT_V2 exists and is frozen", () => {
  assert.ok(CAPABILITY_CONTRACT_V2, "CAPABILITY_CONTRACT_V2 export is missing");
  assert.equal(Object.isFrozen(CAPABILITY_CONTRACT_V2), true);
});

test("CAPABILITY_CONTRACT_V2 fixed top-level fields match the documented v2 contract", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.contractVersion, "v2");
  assert.equal(CAPABILITY_CONTRACT_V2.kind, "control");
  assert.equal(CAPABILITY_CONTRACT_V2.capabilityId, null);
  assert.equal(CAPABILITY_CONTRACT_V2.supportedEcosystems, null);
  assert.equal(CAPABILITY_CONTRACT_V2.toolVersionConstraint, null);
  assert.equal(CAPABILITY_CONTRACT_V2.networkBehavior, "offline");
  assert.deepEqual(CAPABILITY_CONTRACT_V2.requiredInputs, ["config.allowlistPath", "config.declaredPath"]);
  assert.equal(CAPABILITY_CONTRACT_V2.confidenceNormalization, null);
});

test("CAPABILITY_CONTRACT_V2 never drifts into a capability-shaped value (F-4 compliance)", () => {
  // This is the one CYB-2D sibling where kind/capabilityId must NEVER look like the other three
  // (binary-backed, cap.* capability) adapters -- a dedicated assertion per the briefing, since a
  // subtle mistake here would silently violate CYB-1F's already-ratified F-4.
  assert.notEqual(CAPABILITY_CONTRACT_V2.kind, "capability");
  assert.equal(CAPABILITY_CONTRACT_V2.kind, "control");
  assert.equal(CAPABILITY_CONTRACT_V2.capabilityId, null);
  assert.ok(
    CAPABILITY_CONTRACT_V2.capabilityId === null || !/^cap\./.test(String(CAPABILITY_CONTRACT_V2.capabilityId)),
    "capabilityId must never be a cap.* string on this control-kind descriptor",
  );
});

test("CAPABILITY_CONTRACT_V2.tool tracks the real `name` export, not a hardcoded duplicate string", () => {
  assert.equal(name, "license-check");
  assert.equal(CAPABILITY_CONTRACT_V2.tool, name);
});

test("CAPABILITY_CONTRACT_V2.controlRef reflects today's live catalog (no matching entry) with an explanatory note", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.controlRef, null);
  assert.equal(typeof CAPABILITY_CONTRACT_V2.controlRefNote, "string");
  assert.ok(CAPABILITY_CONTRACT_V2.controlRefNote.length > 0);
  assert.match(CAPABILITY_CONTRACT_V2.controlRefNote, /no matching control entry exists/);
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
  assert.ok(
    CAPABILITY_CONTRACT_V2.coverageLimitations.some((entry) => /third-party-licenses\.json/.test(entry)),
    "expected a coverage-limitation entry naming the declared-dependency file this adapter trusts",
  );
});

test("CAPABILITY_CONTRACT_V2.exitCodeMapping is honestly null (no child process, no exit-code contract)", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.exitCodeMapping, null);
  assert.equal(typeof CAPABILITY_CONTRACT_V2.exitCodeMappingNote, "string");
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMappingNote, /never spawns a child process/);
});

test("CAPABILITY_CONTRACT_V2.timeoutContract is honestly empty (nothing to time out or cancel)", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.defaultMs, null);
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.cancellable, false);
  assert.match(CAPABILITY_CONTRACT_V2.timeoutContract.mechanism, /no child process is spawned/);
});

test("CAPABILITY_CONTRACT_V2.evidenceFields matches the real findings.push(...) object shape", () => {
  assert.deepEqual(CAPABILITY_CONTRACT_V2.evidenceFields, ["tool", "severity", "rule", "path", "line", "msg"]);
});
