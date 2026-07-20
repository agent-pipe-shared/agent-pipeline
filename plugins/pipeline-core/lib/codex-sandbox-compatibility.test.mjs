#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { INTERMEDIATE_LITERAL, WEAK_LITERAL, buildCompatibilityProjection, canonicalJson, classifyCompatibility, compatibilityReceiptDigest, decideFallback, deriveAssurance, loadCompatibilityPolicy, sha256, validateCompatibilityPolicy } from "./codex-sandbox-compatibility.mjs";

const D = "a".repeat(64);
test("F4 policy and projection schemas parse and close their root vocabulary", () => {
  for (const path of [new URL("../config/codex-sandbox-compatibility.schema.json", import.meta.url), new URL("../scripts/codex-sandbox-compatibility-receipt.schema.json", import.meta.url)]) {
    const schema = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(schema.additionalProperties, false);
  }
});
function observation(policy) {
  const entry = policy.entries.find(({ filesystemClass }) => filesystemClass === "wsl-native");
  const nowMs = 1_000_000;
  const preflightReceipt = {
    schema: "pipeline.codex-sandbox-preflight.v1",
    cli: { version: entry.cliVersion, artifactSha256: entry.releasedArtifactSha256 },
    profile: { id: entry.permissionProfileId, rawSha256: entry.permissionProfileSha256 },
    platform: { kernelClass: entry.kernelClass, filesystemClass: entry.filesystemClass },
    networkEnabled: true,
    terminalCode: "ok",
    eligibility: "intermediate",
  };
  return {
    runnerId: entry.runnerId, cliVersion: entry.cliVersion, releasedArtifactSha256: entry.releasedArtifactSha256,
    kernelClass: entry.kernelClass, filesystemClass: entry.filesystemClass, permissionProfileId: entry.permissionProfileId,
    permissionProfileSha256: entry.permissionProfileSha256, bootId: "boot-1", nowMs,
    preflight: { bootId: "boot-1", observedAtMs: nowMs - 1, rawSha256: sha256(Buffer.from(canonicalJson(preflightReceipt))), schemaSha256: entry.preflightSchemaSha256, receipt: preflightReceipt },
    runner: null, shadow: null, activation: null, routePostimageSha256: null,
  };
}
function proven(kind) { return { state: "proven", evidence: [{ kind, locator: "receipt", rawSha256: D }] }; }

test("committed registry is closed, exact-versioned and has exactly one fallback", () => {
  const { value } = loadCompatibilityPolicy();
  assert.equal(validateCompatibilityPolicy(value), value);
  assert.equal(value.fallback.assuranceLiteral, WEAK_LITERAL);
  assert.equal(value.entries.every((entry) => entry.cliVersion === "0.144.6" && !/[<>=*]/.test(entry.cliVersion)), true);
});

test("unknown version, artifact and stale/foreign-boot evidence fail closed", () => {
  const policy = loadCompatibilityPolicy().value;
  const unknown = observation(policy); unknown.cliVersion = "0.144.7";
  assert.equal(classifyCompatibility(policy, unknown).state, "unsupported");
  const stale = observation(policy); stale.nowMs += policy.maxEvidenceAgeMs + 1;
  assert.equal(classifyCompatibility(policy, stale).state, "intermediate-preflight-candidate");
  const foreign = observation(policy); foreign.preflight.bootId = "boot-2";
  assert.equal(classifyCompatibility(policy, foreign).state, "intermediate-preflight-candidate");
  const schemaDrift = observation(policy); schemaDrift.preflight.schemaSha256 = "0".repeat(64);
  assert.equal(classifyCompatibility(policy, schemaDrift).state, "diagnostic-only");
  const receiptDrift = observation(policy); receiptDrift.preflight.rawSha256 = "0".repeat(64);
  assert.equal(classifyCompatibility(policy, receiptDrift).state, "diagnostic-only");
});

test("network-open receipt is only intermediate and production requires F5 binding", () => {
  const policyEnvelope = loadCompatibilityPolicy();
  const policy = policyEnvelope.value;
  const input = observation(policy);
  assert.equal(classifyCompatibility(policy, input).state, "intermediate-preflight-eligible");
  const runnerReceipt = { schema: "pipeline.codex-isolated-critic-receipt.v1", terminalCode: "verdict-success" };
  input.runner = { bootId: input.bootId, observedAtMs: input.nowMs, rawSha256: sha256(Buffer.from(canonicalJson(runnerReceipt))), receipt: runnerReceipt };
  const shadowReceipt = { schema: "pipeline.codex-critic-shadow-receipt.v1", gateEligible: true, productionCriticGateSatisfied: false, packetSetSha256: "3".repeat(64) };
  input.shadow = { bootId: input.bootId, observedAtMs: input.nowMs, rawSha256: sha256(Buffer.from(canonicalJson(shadowReceipt))), packetSetSha256: shadowReceipt.packetSetSha256, receipt: shadowReceipt };
  assert.equal(classifyCompatibility(policy, input).state, "intermediate-shadow-eligible");
  input.routePostimageSha256 = "5".repeat(64);
  const activationReceipt = { schema: "pipeline.critic-route-activation.v1", status: "verified", route: { postimageSha256: input.routePostimageSha256 } };
  input.activation = { bootId: input.bootId, observedAtMs: input.nowMs, rawSha256: sha256(Buffer.from(canonicalJson(activationReceipt))), receipt: activationReceipt };
  assert.equal(classifyCompatibility(policy, input).state, "intermediate-production-eligible");
  assert.equal(buildCompatibilityProjection({ value: policyEnvelope.value, rawSha256: policyEnvelope.rawSha256 }, input).activationReceiptSha256, input.activation.rawSha256);
});

test("forged strong claim from intermediate evidence is rejected", () => {
  const claims = {
    briefingBounded: proven("briefing"), inputConfined: proven("input-manifest"),
    technicallyIsolatedReadOnly: proven("sandbox-preflight"), verdictIntegrity: proven("verdict"),
  };
  const result = deriveAssurance({ compatibilityState: "strong-preflight-eligible", claims, preflightReceipt: { eligibility: "intermediate", networkEnabled: true }, terminalCode: "verdict-success", verdictBytesObserved: true });
  assert.equal(result.class, "no-usable-review");
});

test("intermediate assurance preserves its exact literal and disclaims input confinement", () => {
  const claims = { briefingBounded: proven("briefing"), inputConfined: { state: "not-proven", evidence: [] }, technicallyIsolatedReadOnly: proven("sandbox-preflight"), verdictIntegrity: proven("verdict") };
  const result = deriveAssurance({ compatibilityState: "intermediate-preflight-eligible", claims, preflightReceipt: { eligibility: "intermediate", networkEnabled: true }, terminalCode: "verdict-success", verdictBytesObserved: true });
  assert.deepEqual(result, { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: INTERMEDIATE_LITERAL });
});

test("fallback is same-runner, pre-verdict, allowlisted and exactly once", () => {
  const policy = loadCompatibilityPolicy().value;
  const base = { selectedRunnerId: "codex", primaryRunnerId: "codex", failureCode: "sandbox-setup-error", verdictBytesObserved: false, ambiguous: false, cleanupAttempted: false, fallbackAttempts: 0 };
  assert.deepEqual(decideFallback(policy, base), { action: "run-exact-fallback", runnerId: "codex", laneId: policy.fallback.laneId, assuranceClass: "contractual-read-only", literal: WEAK_LITERAL });
  for (const change of [{ verdictBytesObserved: true }, { fallbackAttempts: 1 }, { cleanupAttempted: true }, { selectedRunnerId: "claude" }, { failureCode: "lifecycle-stall" }]) {
    assert.equal(decideFallback(policy, { ...base, ...change }).action, "no-fallback");
  }
});

test("registry policy digest is deterministic", () => {
  const policy = loadCompatibilityPolicy().value;
  assert.equal(sha256(Buffer.from(canonicalJson(policy))), sha256(Buffer.from(canonicalJson(structuredClone(policy)))));
});

test("compatibility receipts use their own canonical digest domain", () => {
  const policyEnvelope = loadCompatibilityPolicy();
  const projection = buildCompatibilityProjection(policyEnvelope, observation(policyEnvelope.value));
  const expected = sha256(Buffer.concat([
    Buffer.from("pipeline.codex-sandbox-compatibility-receipt.v1\0", "utf8"),
    Buffer.from(canonicalJson(projection), "utf8"),
  ]));
  assert.equal(compatibilityReceiptDigest(projection), expected);
  assert.notEqual(compatibilityReceiptDigest(projection), sha256(Buffer.from(canonicalJson(projection), "utf8")));
});
