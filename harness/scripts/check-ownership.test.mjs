import assert from "node:assert/strict";
import {
  reportCheckOwnershipOverlaps,
  validateCheckOwnershipMap,
} from "./check-ownership.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

const D = "a".repeat(64);
const E = "b".repeat(64);
const O = "1".repeat(40);

function ownedCheck(checkId = "verify-1", overrides = {}) {
  return {
    checkId,
    owner: "deterministic-verify",
    errorClass: "build",
    assertionFingerprint: D,
    evidenceIds: ["evidence-1"],
    ...overrides,
  };
}

function ownership(overrides = {}) {
  return {
    schema: "pipeline.check-ownership.v1",
    candidate: { commit: O, tree: O },
    mandatoryCheckIds: ["verify-1"],
    checks: [ownedCheck()],
    overlaps: [],
    ...overrides,
  };
}

function overlap(leftCheckId = "verify-1", rightCheckId = "verify-2", fingerprint = D, overrides = {}) {
  return {
    leftCheckId,
    rightCheckId,
    leftAssertionFingerprint: fingerprint,
    rightAssertionFingerprint: fingerprint,
    overlapFingerprint: fingerprint,
    evidenceIds: ["evidence-1"],
    ...overrides,
  };
}

check("OW01 accepts a complete, unambiguous ownership map", () => {
  assert.equal(validateCheckOwnershipMap(ownership()).ok, true);
});

for (const [name, mutate] of [
  ["missing mandatory check", (map) => { map.mandatoryCheckIds.push("verify-2"); }],
  ["duplicate check identity", (map) => { map.checks.push(ownedCheck("verify-1")); }],
  ["unmapped extra check", (map) => { map.checks.push(ownedCheck("verify-2")); }],
  ["unknown owner", (map) => { map.checks[0].owner = "automatic-judge"; }],
  ["missing fingerprint evidence", (map) => { map.checks[0].evidenceIds = []; }],
  ["malformed candidate", (map) => { map.candidate.tree = "not-an-oid"; }],
]) {
  check(`OW02 rejects ${name} fail-closed`, () => {
    const map = ownership();
    mutate(map);
    assert.equal(validateCheckOwnershipMap(map).ok, false);
  });
}

check("OW03 requires exact overlap fingerprint evidence for every shared assertion", () => {
  const checks = [ownedCheck("verify-1"), ownedCheck("verify-2")];
  const withoutEvidence = ownership({ mandatoryCheckIds: ["verify-1", "verify-2"], checks });
  assert.equal(validateCheckOwnershipMap(withoutEvidence).ok, false);

  const withEvidence = ownership({
    mandatoryCheckIds: ["verify-1", "verify-2"], checks,
    overlaps: [overlap()],
  });
  assert.equal(validateCheckOwnershipMap(withEvidence).ok, true);
});

for (const [name, mutate] of [
  ["mismatched assertion fingerprint", (map) => { map.overlaps[0].rightAssertionFingerprint = E; }],
  ["mismatched overlap fingerprint", (map) => { map.overlaps[0].overlapFingerprint = E; }],
  ["reversed endpoints", (map) => {
    map.overlaps[0] = overlap("verify-2", "verify-1");
  }],
  ["duplicate overlap pair", (map) => { map.overlaps.push(structuredClone(map.overlaps[0])); }],
]) {
  check(`OW04 rejects ${name}`, () => {
    const map = ownership({
      mandatoryCheckIds: ["verify-1", "verify-2"],
      checks: [ownedCheck("verify-1"), ownedCheck("verify-2")],
      overlaps: [overlap()],
    });
    mutate(map);
    assert.equal(validateCheckOwnershipMap(map).ok, false);
  });
}

check("OW05 overlap reports are deterministic and preserve the supplied map", () => {
  const map = ownership({
    mandatoryCheckIds: ["verify-1", "verify-2"],
    checks: [ownedCheck("verify-2"), ownedCheck("verify-1")],
    overlaps: [overlap()],
  });
  const before = JSON.stringify(map);
  const first = reportCheckOwnershipOverlaps(map);
  const reversed = structuredClone(map);
  reversed.checks.reverse();
  const second = reportCheckOwnershipOverlaps(reversed);
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(map), before);
});

check("OW06 an ownership map cannot add, mutate, or remove gate configuration", () => {
  const map = ownership();
  const before = JSON.stringify(map);
  const report = reportCheckOwnershipOverlaps(map);
  assert.equal(report.ok, true);
  assert.equal(JSON.stringify(map), before);

  const attemptedGateMutation = ownership({
    gateConfiguration: { verify: { outcome: "skipped", remove: true } },
  });
  assert.equal(validateCheckOwnershipMap(attemptedGateMutation).ok, false);
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
