#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * osv-scanner.test.mjs -- regression coverage for osv-scanner.mjs's CAPABILITY_CONTRACT_V2
 * descriptor (CYB-2D). Pure shape/value assertions on the new, additive, frozen data
 * descriptor only -- does not exercise run()/isInstalled() (that stays covered by
 * security-scan.test.mjs).
 *
 * Run:  node --test harness/scripts/security-adapters/osv-scanner.test.mjs
 * Exit: 0 = all cases pass, non-zero = at least one case failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { name, CAPABILITY_CONTRACT_V2 } from "./osv-scanner.mjs";

test("CAPABILITY_CONTRACT_V2 exists and is frozen", () => {
  assert.ok(CAPABILITY_CONTRACT_V2, "CAPABILITY_CONTRACT_V2 export is missing");
  assert.equal(Object.isFrozen(CAPABILITY_CONTRACT_V2), true);
});

test("CAPABILITY_CONTRACT_V2 fixed top-level fields match the documented v2 contract", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.contractVersion, "v2");
  assert.equal(CAPABILITY_CONTRACT_V2.kind, "capability");
  assert.equal(CAPABILITY_CONTRACT_V2.capabilityId, "cap.sca");
  assert.equal(CAPABILITY_CONTRACT_V2.controlRef, null);
  assert.deepEqual(CAPABILITY_CONTRACT_V2.requiredInputs, ["rootDir"]);
  assert.equal(CAPABILITY_CONTRACT_V2.confidenceNormalization, null);
});

test("CAPABILITY_CONTRACT_V2.tool tracks the real `name` export, not a hardcoded duplicate string", () => {
  assert.equal(name, "osv-scanner");
  assert.equal(CAPABILITY_CONTRACT_V2.tool, name);
});

test("CAPABILITY_CONTRACT_V2.toolVersionConstraint documents the real major-v2 requirement (checkV2())", () => {
  assert.equal(typeof CAPABILITY_CONTRACT_V2.toolVersionConstraint, "string");
  assert.match(CAPABILITY_CONTRACT_V2.toolVersionConstraint, /version 2/);
  assert.match(CAPABILITY_CONTRACT_V2.toolVersionConstraint, /checkV2/);
});

test("CAPABILITY_CONTRACT_V2.supportedEcosystems is an honest null + explanatory note (no invented ecosystem list)", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.supportedEcosystems, null);
  assert.equal(typeof CAPABILITY_CONTRACT_V2.supportedEcosystemsNote, "string");
  assert.match(CAPABILITY_CONTRACT_V2.supportedEcosystemsNote, /auto-detected/);
  assert.match(CAPABILITY_CONTRACT_V2.supportedEcosystemsNote, /does not itself enumerate or restrict ecosystems/);
});

test("CAPABILITY_CONTRACT_V2.networkBehavior is an honest 'unknown' + explanatory note (no false offline/network-required claim)", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.networkBehavior, "unknown");
  assert.equal(typeof CAPABILITY_CONTRACT_V2.networkBehaviorNote, "string");
  assert.match(CAPABILITY_CONTRACT_V2.networkBehaviorNote, /does not control osv-scanner's own network access/);
});

test("CAPABILITY_CONTRACT_V2.severityNormalization faithfully transcribes the real three-tier mapOsvSeverity() rule", () => {
  const tiers = CAPABILITY_CONTRACT_V2.severityNormalization.tiers;
  assert.ok(Array.isArray(tiers));
  assert.equal(tiers.length, 3);

  const tier1 = tiers.find((t) => t.order === 1);
  assert.match(tier1.source, /database_specific\.severity/);
  assert.match(tier1.rule, /moderate/);
  assert.match(tier1.rule, /medium/);

  const tier2 = tiers.find((t) => t.order === 2);
  assert.match(tier2.source, /severity\[\]\.score/);
  assert.match(tier2.rule, />=9/);
  assert.match(tier2.rule, /critical/);
  assert.match(tier2.rule, />=7/);
  assert.match(tier2.rule, /high/);
  assert.match(tier2.rule, />=4/);
  assert.match(tier2.rule, /medium/);
  assert.match(tier2.rule, /low/);

  const tier3 = tiers.find((t) => t.order === 3);
  assert.equal(tier3.source, "fallback");
  assert.equal(tier3.value, "high");
});

test("CAPABILITY_CONTRACT_V2.coverageLimitations is a non-empty array of factual, code-grounded strings", () => {
  assert.ok(Array.isArray(CAPABILITY_CONTRACT_V2.coverageLimitations));
  assert.ok(CAPABILITY_CONTRACT_V2.coverageLimitations.length >= 1);
  for (const entry of CAPABILITY_CONTRACT_V2.coverageLimitations) {
    assert.equal(typeof entry, "string");
    assert.ok(entry.length > 0);
  }
  const joined = CAPABILITY_CONTRACT_V2.coverageLimitations.join(" ");
  assert.match(joined, /No package sources found/);
  assert.match(joined, /SKIPPED/);
  assert.match(joined, /128/);
});

test("CAPABILITY_CONTRACT_V2.exitCodeMapping transcribes the real four-way exit-code contract (0/1/128/other)", () => {
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping["0"], /clean/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping["0"], /no findings/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping["1"], /findings present/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping["1"], /NEVER conflated with ERROR/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping["128"], /No package sources found/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping["128"], /SKIPPED/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping["128"], /any OTHER exit 128 stays ERROR/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping.other, /ERROR/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping.other, /scanner_error/);
});

test("CAPABILITY_CONTRACT_V2.timeoutContract matches run()'s real default and mechanism", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.defaultMs, 60000);
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.cancellable, true);
  assert.match(CAPABILITY_CONTRACT_V2.timeoutContract.mechanism, /spawnSync/);
  assert.match(CAPABILITY_CONTRACT_V2.timeoutContract.mechanism, /ETIMEDOUT/);
});

test("CAPABILITY_CONTRACT_V2.evidenceFields matches the real extractFindings() finding-object shape", () => {
  assert.deepEqual(CAPABILITY_CONTRACT_V2.evidenceFields, ["tool", "severity", "rule", "path", "line", "msg"]);
});
