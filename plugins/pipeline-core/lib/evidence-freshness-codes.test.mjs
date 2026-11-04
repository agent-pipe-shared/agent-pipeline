// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { EVIDENCE_FRESHNESS_CODES, evidenceFreshnessFailureCodes, satisfiabilityStatusForFreshnessCode } from "./evidence-freshness-codes.mjs";
import { checkEvidenceFreshness } from "../scripts/push-prepare.mjs";
import { checkVerifyEvidenceBound } from "../scripts/push-gate-satisfiability.mjs";

const scratchRoots = [];
test.after(() => { for (const dir of scratchRoots) rmSync(dir, { recursive: true, force: true }); });

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);

function evidenceDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "efc-"));
  scratchRoots.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

test("EFC1: the codes are the documented, frozen strings and map to the satisfiability statuses", () => {
  assert.deepEqual({ ...EVIDENCE_FRESHNESS_CODES }, { MISSING: "EF-MISSING", EXIT_NOT_ZERO: "EF-EXIT-NOT-ZERO", STALE_COMMIT: "EF-STALE-COMMIT", NOT_PUSH_BOUNDARY: "EF-NOT-PUSH-BOUNDARY" });
  assert.ok(Object.isFrozen(EVIDENCE_FRESHNESS_CODES));
  assert.equal(satisfiabilityStatusForFreshnessCode("EF-MISSING"), "missing");
  assert.equal(satisfiabilityStatusForFreshnessCode("EF-EXIT-NOT-ZERO"), "verify-failed");
  assert.equal(satisfiabilityStatusForFreshnessCode("EF-STALE-COMMIT"), "stale-commit");
  for (const code of ["EF-NOT-PUSH-BOUNDARY", "EF-UNKNOWN", "", undefined, null, 7, "__proto__", "toString"]) {
    assert.equal(satisfiabilityStatusForFreshnessCode(code), null, String(code));
  }
});

test("EFC2: push-prepare carries the code next to the unchanged message for a missing, failed and stale record", () => {
  const missing = checkEvidenceFreshness("verify-evidence", "evidence/verify-latest.json", evidenceDir({}), HEAD);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "EF-MISSING");
  assert.equal(missing.message, "evidence/verify-latest.json is missing or unreadable.");
  const failed = checkEvidenceFreshness("verify-evidence", "evidence/verify-latest.json", evidenceDir({ "evidence/verify-latest.json": JSON.stringify({ exitCode: 1, commit: HEAD }) }), HEAD);
  assert.equal(failed.code, "EF-EXIT-NOT-ZERO");
  assert.equal(failed.message, "evidence/verify-latest.json: exitCode=1 (expected 0).");
  const stale = checkEvidenceFreshness("verify-evidence", "evidence/verify-latest.json", evidenceDir({ "evidence/verify-latest.json": JSON.stringify({ exitCode: 0, commit: OTHER }) }), HEAD);
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "EF-STALE-COMMIT");
  assert.equal(stale.message, `evidence/verify-latest.json: commit="${OTHER}" is stale (HEAD is "${HEAD}").`);
});

test("EFC3: satisfiability uses the code, and falls back to the prose for a result that has none", () => {
  const dir = evidenceDir({ "evidence/verify-latest.json": JSON.stringify({ exitCode: 0, commit: OTHER }) });
  const viaCode = checkVerifyEvidenceBound(dir, HEAD, { resolveEvidenceProjectDir: () => dir });
  assert.equal(viaCode.status, "stale-commit");
  const proseOnly = (message) => ({ checkEvidenceFreshness: () => ({ ok: false, message, remedy: "r" }), resolveEvidenceProjectDir: () => dir });
  assert.equal(checkVerifyEvidenceBound(dir, HEAD, proseOnly("evidence/verify-latest.json: commit=\"x\" is stale (HEAD is \"y\").")).status, "stale-commit");
  assert.equal(checkVerifyEvidenceBound(dir, HEAD, proseOnly("evidence/verify-latest.json is missing or unreadable.")).status, "missing");
  assert.equal(checkVerifyEvidenceBound(dir, HEAD, proseOnly("evidence/verify-latest.json: exitCode=1 (expected 0).")).status, "verify-failed");
  assert.equal(checkVerifyEvidenceBound(dir, HEAD, proseOnly("something else")).status, "unknown-failure");
});

test("EFC5: the shared function orders the failures missing, exit code, stale commit, push boundary", () => {
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: null, expectedCommit: HEAD }), ["EF-MISSING"]);
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: undefined, expectedCommit: HEAD }), ["EF-MISSING"]);
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: { exitCode: 0, commit: HEAD }, expectedCommit: HEAD }), []);
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: { exitCode: 1, commit: OTHER }, expectedCommit: HEAD, isVerify: true, satisfiesPushBoundary: () => false }),
    ["EF-EXIT-NOT-ZERO", "EF-STALE-COMMIT", "EF-NOT-PUSH-BOUNDARY"]);
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: { exitCode: 1, commit: OTHER }, expectedCommit: HEAD, isVerify: true, satisfiesPushBoundary: () => false, firstOnly: true }), ["EF-EXIT-NOT-ZERO"]);
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: { exitCode: 0, commit: OTHER }, expectedCommit: HEAD, firstOnly: true }), ["EF-STALE-COMMIT"]);
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: {}, expectedCommit: HEAD }), ["EF-EXIT-NOT-ZERO", "EF-STALE-COMMIT"]);
});

test("EFC6: a vouched-for differing commit is not stale, the boundary check still applies, and neither thunk runs when it is not needed", () => {
  const calls = [];
  const promoted = (value) => () => { calls.push("promoted"); return value; };
  const boundary = (value) => () => { calls.push("boundary"); return value; };
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: { exitCode: 0, commit: OTHER }, expectedCommit: HEAD, promoted: promoted(true) }), []);
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: { exitCode: 0, commit: OTHER }, expectedCommit: HEAD, promoted: promoted(true), isVerify: true, satisfiesPushBoundary: boundary(false) }), ["EF-NOT-PUSH-BOUNDARY"]);
  assert.deepEqual(calls, ["promoted", "promoted", "boundary"]);
  calls.length = 0;
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: { exitCode: 0, commit: HEAD }, expectedCommit: HEAD, promoted: promoted(false), satisfiesPushBoundary: boundary(false) }), []);
  assert.deepEqual(calls, [], "same commit and not a Verify record: no thunk runs");
  assert.deepEqual(evidenceFreshnessFailureCodes({ data: { exitCode: 1, commit: HEAD }, expectedCommit: HEAD, promoted: promoted(false), firstOnly: true }), ["EF-EXIT-NOT-ZERO"]);
  assert.deepEqual(calls, []);
});

test("EFC7: push-prepare reports a promoted record as fresh and a boundary failure of a promoted Verify record with the push-mode remedy", () => {
  const verify = { exitCode: 0, commit: OTHER };
  const dir = evidenceDir({ "evidence/verify-latest.json": JSON.stringify(verify), "evidence/security-latest.json": JSON.stringify({ exitCode: 0, commit: OTHER }) });
  const promoting = { promotionEnvelope: { schema: "x" }, validateReleasePromotionEnvelope: () => ({ ok: true, sourceCommit: OTHER, recordCommit: HEAD }) };
  const security = checkEvidenceFreshness("security-evidence", "evidence/security-latest.json", dir, HEAD, promoting);
  assert.equal(security.ok, true);
  assert.equal(security.message, `evidence/security-latest.json is fresh and green at HEAD (promoted from ${OTHER.slice(0, 8)} via release-promotion-envelope).`);
  const notPromoted = checkEvidenceFreshness("security-evidence", "evidence/security-latest.json", dir, HEAD, { ...promoting, validateReleasePromotionEnvelope: () => ({ ok: false }) });
  assert.equal(notPromoted.code, "EF-STALE-COMMIT");
  const unknownId = checkEvidenceFreshness("other-evidence", "evidence/security-latest.json", dir, HEAD, promoting);
  assert.equal(unknownId.code, "EF-STALE-COMMIT", "only the two known evidence ids can be promoted");
});

test("EFC4: a wrong code never overrides a green result, and an unknown code falls back to the prose", () => {
  const dir = evidenceDir({});
  const ok = checkVerifyEvidenceBound(dir, HEAD, { checkEvidenceFreshness: () => ({ ok: true, code: "EF-STALE-COMMIT", message: "fresh" }), resolveEvidenceProjectDir: () => dir });
  assert.equal(ok.status, "fresh-and-bound");
  const unknown = checkVerifyEvidenceBound(dir, HEAD, { checkEvidenceFreshness: () => ({ ok: false, code: "EF-NOPE", message: "x is missing or unreadable." }), resolveEvidenceProjectDir: () => dir });
  assert.equal(unknown.status, "missing");
});
