#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MACOS_ACCEPTANCE_SCHEMA,
  compileMacosAcceptance,
  isNativeMacosClosure,
  macosAcceptanceDigest,
  sealMacosAcceptance,
  validateMacosAcceptance,
} from "./macos-acceptance.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const OID = "d".repeat(40);
const clone = (value) => structuredClone(value);
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); }
}

function draft() {
  return {
    acceptanceId: "nova-b5-synthetic-01", candidate: { commit: OID, tree: "e".repeat(40) }, hardwareClass: "synthetic",
    os: { version: "synthetic-1", build: "fixture-1", architecture: "arm64" }, toolchain: [{ tool: "node", version: "24.0", executableSha256: A }], bootstrapSha256: B,
    filesystem: [{ capability: "unicode", status: "observed", evidenceSha256: C }], runnerReports: [{ reportId: "synthetic-runner", recordSha256: A, status: "observed" }],
    lifecycle: { stage: "completed", keepAwakeRequested: "not-requested", keepAwakeObserved: "not-requested", keepAwakeBoundMs: 0, inputAuthoritySha256: A, interruptionState: "not-interrupted", completionDelivery: "not-delivered", resumeTokenSha256: null, backgroundInputChannel: "none" },
    gates: [{ gate: "fixture-contract", status: "not-run", evidenceSha256: null }], cleanup: { status: "not-requested", evidenceSha256: null }, evidence: [], status: "recorded",
  };
}

const record = sealMacosAcceptance(draft());

check("B5M01 seals a valid synthetic record without a native closure claim", () => {
  assert.equal(record.schema, MACOS_ACCEPTANCE_SCHEMA);
  assert.deepEqual(validateMacosAcceptance(record), { ok: true, code: null });
  assert.equal(macosAcceptanceDigest(record), record.recordSha256);
  assert.equal(isNativeMacosClosure(record), false);
  assert.equal(Object.isFrozen(compileMacosAcceptance(record)), true);
});

check("B5M02 closed root and digest binding fail hostile mutations", () => {
  const added = { ...clone(record), keychain: "no" };
  assert.match(validateMacosAcceptance(added).code, /^SHAPE:/u);
  const changed = clone(record); changed.candidate.tree = OID;
  assert.match(validateMacosAcceptance(changed).code, /^CONFLICT:/u);
  const malformed = clone(record); malformed.bootstrapSha256 = "short"; malformed.recordSha256 = macosAcceptanceDigest(malformed);
  assert.match(validateMacosAcceptance(malformed).code, /^SHAPE:/u);
});

check("B5M03 private paths and sensitive host values are rejected", () => {
  const evidence = clone(record); evidence.evidence = [{ kind: "fixture", path: "/Users/real/evidence.json", fileSha256: A, recordSha256: null }]; evidence.recordSha256 = macosAcceptanceDigest(evidence);
  assert.match(validateMacosAcceptance(evidence).code, /^PRIVACY:/u);
  const os = clone(record); os.os.build = "keychain-secret"; os.recordSha256 = macosAcceptanceDigest(os);
  assert.match(validateMacosAcceptance(os).code, /^PRIVACY:/u);
});

check("B5M04 lifecycle cannot invent observation or use background input", () => {
  const invented = clone(record); invented.lifecycle.keepAwakeObserved = "observed-active"; invented.recordSha256 = macosAcceptanceDigest(invented);
  assert.match(validateMacosAcceptance(invented).code, /^BOUND:macos-lifecycle$/u);
  const channel = clone(record); channel.lifecycle.backgroundInputChannel = "stdin"; channel.recordSha256 = macosAcceptanceDigest(channel);
  assert.match(validateMacosAcceptance(channel).code, /^BOUND:macos-lifecycle$/u);
  const resumed = clone(record); resumed.lifecycle.interruptionState = "resumed"; resumed.recordSha256 = macosAcceptanceDigest(resumed);
  assert.match(validateMacosAcceptance(resumed).code, /^BOUND:macos-lifecycle$/u);
});

check("B5M05 Apple Silicon is mandatory for native closure and denial is never success", () => {
  const wrongHardware = clone(record); wrongHardware.status = "native-closure-passed"; wrongHardware.lifecycle.stage = "cleaned"; wrongHardware.lifecycle.completionDelivery = "delivered"; wrongHardware.gates[0] = { gate: "fixture-contract", status: "passed", evidenceSha256: A }; wrongHardware.cleanup = { status: "completed", evidenceSha256: B }; wrongHardware.recordSha256 = macosAcceptanceDigest(wrongHardware);
  assert.match(validateMacosAcceptance(wrongHardware).code, /^NATIVE:/u);
  const denied = clone(wrongHardware); denied.hardwareClass = "apple-silicon"; denied.lifecycle.keepAwakeObserved = "denied"; denied.recordSha256 = macosAcceptanceDigest(denied);
  assert.match(validateMacosAcceptance(denied).code, /^NATIVE:/u);
});

check("B5M06 all eight fixed fixtures are synthetic and sanitized", () => {
  for (const name of ["filesystem", "unicode", "case-folding", "symlink", "permissions", "durability", "process", "tool-resolution"]) {
    const fixture = JSON.parse(readFileSync(new URL(`../scripts/fixtures/nova-macos/${name}.json`, import.meta.url), "utf8"));
    assert.equal(fixture.hardwareClass, "synthetic", name);
    assert.doesNotMatch(JSON.stringify(fixture), /keychain|secret|password|\/Users\//iu, name);
  }
});

console.log(`\nmacos-acceptance: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) process.exitCode = 1;
