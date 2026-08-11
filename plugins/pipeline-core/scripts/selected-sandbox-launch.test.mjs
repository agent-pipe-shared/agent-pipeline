#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Unit coverage for the NVA-A29-LAUNCH-01 launcher, using a mocked/stubbed
 * `probeRunner` -- deterministic, no real process invocation in this suite.
 * The real-spawn path (`realProbeRunner`) is exercised separately by an
 * actual invocation of the script (see the sealed evidence file), not here.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { canonicalJson } from "../lib/selected-sandbox-disposition.mjs";
import {
  ASSURANCE_VALUE,
  CONTRACT_VERSION,
  DUTY,
  SELECTED_TRANSPORT,
  launchSelectedSandbox,
} from "./selected-sandbox-launch.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); }
}

function fixedFingerprint(overrides = {}) {
  return {
    runnerSha256: A, hostBootSha256: B, platformClass: "linux", architectureClass: "x64",
    sandboxSha256: C, profileSha256: D, policySha256: A, duty: DUTY, contractVersion: CONTRACT_VERSION, ...overrides,
  };
}
function counterClock(start = 1_000) {
  let value = start;
  return () => { value += 1; return value; };
}
function fingerprintDigest(fingerprint) {
  return createHash("sha256").update(canonicalJson(fingerprint), "utf8").digest("hex");
}

check("A29L01 probe-start -> real-shaped success reaches available-attested with genuine SHA256 bindings", () => {
  const fingerprint = fixedFingerprint();
  const mockProbeRunner = ({ nonceHex }) => ({
    error: null, status: 0, signal: null,
    stdout: JSON.stringify({ pid: 4242, nonce: nonceHex, platform: "linux", arch: "x64", nowMs: 1 }),
    stderr: "", durationMs: 3,
  });
  const result = launchSelectedSandbox({ probeRunner: mockProbeRunner, nowMs: counterClock(), fingerprint });
  assert.equal(result.outcome, "available-attested");
  assert.equal(result.final.state, "available-attested");
  assert.equal(result.final.childReceipt.assurance, ASSURANCE_VALUE);
  assert.equal(result.final.childReceipt.transport, SELECTED_TRANSPORT);
  assert.equal(result.final.childReceipt.duty, DUTY);
  assert.equal(result.final.childReceipt.subjectSha256, fingerprintDigest(fingerprint));
  assert.equal(result.final.assurance.observed, ASSURANCE_VALUE);
  assert.notEqual(result.observation, null);
  assert.equal(result.failureObservation, null);
  // The receipt's SHA256 fields must trace to the mocked observation, not be arbitrary.
  assert.notEqual(result.final.childReceipt.resultSha256, A);
  assert.notEqual(result.final.childReceipt.childIdSha256, A);
});

check("A29L02 probe-start -> genuine non-zero exit reaches a real probe-failure, never a fabricated success", () => {
  const fingerprint = fixedFingerprint({ hostBootSha256: C });
  const mockProbeRunner = () => ({ error: null, status: 1, signal: null, stdout: "", stderr: "boom", durationMs: 2 });
  const result = launchSelectedSandbox({ probeRunner: mockProbeRunner, nowMs: counterClock(2_000), fingerprint });
  assert.equal(result.outcome, "transient-unavailable");
  assert.equal(result.final.state, "transient-unavailable");
  assert.equal(result.final.childReceipt, null);
  assert.equal(result.final.failure.class, "transient-unavailable");
  assert.equal(result.observation, null);
  assert.notEqual(result.failureObservation, null);
});

check("A29L03 a spawn error (no such runtime) reaches terminal-unavailable, not a retryable class", () => {
  const fingerprint = fixedFingerprint({ profileSha256: C });
  const mockProbeRunner = () => ({ error: { code: "ENOENT" }, status: null, signal: null, stdout: "", stderr: "", durationMs: 1 });
  const result = launchSelectedSandbox({ probeRunner: mockProbeRunner, nowMs: counterClock(3_000), fingerprint });
  assert.equal(result.outcome, "terminal-unavailable");
  assert.equal(result.final.failure.class, "terminal-unavailable");
});

check("A29L04 a child that echoes the wrong nonce is treated as a genuine failure, not fabricated success", () => {
  const fingerprint = fixedFingerprint({ policySha256: B });
  const mockProbeRunner = () => ({
    error: null, status: 0, signal: null,
    stdout: JSON.stringify({ pid: 1, nonce: "not-the-real-nonce", platform: "linux", arch: "x64", nowMs: 1 }),
    stderr: "", durationMs: 1,
  });
  const result = launchSelectedSandbox({ probeRunner: mockProbeRunner, nowMs: counterClock(4_000), fingerprint });
  assert.equal(result.outcome, "terminal-unavailable");
  assert.equal(result.final.childReceipt, null);
});

console.log(`\nselected-sandbox-launch: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
