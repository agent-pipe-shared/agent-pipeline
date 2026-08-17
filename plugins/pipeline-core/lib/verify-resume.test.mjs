#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPublicVerifyRunEvidence, digestJson, planVerifyResume, sealVerifySuiteReceipt, validateVerifySuiteReceipt, verifySuiteReceiptSha256 } from "./verify-resume.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const candidate = { commit: "1".repeat(40), tree: "2".repeat(40) };
const scriptDir = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
// "declared-tree:root" (not the pre-ADR-0065 "candidate-tree") so these Tier-A fixture suites
// carry the real production Tier-A marker (ADR-0065 Decision clarification 1/2) -- required for
// `isTierARegistration` inside firstDrift to classify them correctly; every assertion below is
// otherwise unchanged from before this rename.
const input = (path = "suite.test.mjs", digest = A) => ({ files: [{ path, fileSha256: digest }], nonFiles: [{ kind: "declared-tree:root", path: null, sha256: B }] });
const tierBInput = (path = "tierb.test.mjs", digest = A) => ({ files: [{ path, fileSha256: digest }], nonFiles: [{ kind: "suite-arguments", path: null, sha256: B }] });
const suite = (id, overrides = {}) => ({ id, implementationSha256: A, inputs: input(`${id}.test.mjs`), environmentContractSha256: B, dependsOn: [], ...overrides });
const suites = [suite("alpha"), suite("beta", { dependsOn: ["alpha"] })];

function receipt(target = suites[0], overrides = {}) {
  return sealVerifySuiteReceipt({ runId: "verify-source", candidate, suite: target.id, implementationSha256: target.implementationSha256, inputs: target.inputs, environmentContractSha256: target.environmentContractSha256, policySha256: C, status: "completed", exitCode: 0, log: { path: `logs/${target.id}.log`, fileSha256: A, byteLength: 7, truncated: false }, startedAt: "2026-08-01T00:00:00.000Z", completedAt: "2026-08-01T00:00:01.000Z", ...overrides });
}
function plan(receipts = {}, logs = {}, overrides = {}) { return planVerifyResume({ runId: "verify-next", candidate, suites, receipts, logs, policySha256: C, ...overrides }); }
const log = (id) => ({ path: `logs/${id}.log`, fileSha256: A, byteLength: 7, truncated: false });

test("closed receipt self-digest rejects shape and byte drift", () => {
  const value = receipt();
  assert.deepEqual(validateVerifySuiteReceipt(value), { ok: true, code: null });
  assert.equal(value.receiptSha256, verifySuiteReceiptSha256(value));
  assert.equal(validateVerifySuiteReceipt({ ...value, extra: true }).ok, false);
  assert.equal(validateVerifySuiteReceipt({ ...value, exitCode: 1 }).ok, false);
  const badTime = { ...value, completedAt: "not-a-time" }; badTime.receiptSha256 = verifySuiteReceiptSha256(badTime);
  assert.equal(validateVerifySuiteReceipt(badTime).code, "VERIFY-RECEIPT-TIME");
});

test("same complete bindings reuse terminal PASS receipts", () => {
  const alpha = receipt(suites[0]);
  const beta = receipt(suites[1]);
  const result = plan({ alpha, beta }, { alpha: log("alpha"), beta: log("beta") });
  assert.deepEqual(result.reusable, ["alpha", "beta"]);
  assert.deepEqual(result.rerun, []);
  assert.equal(result.planSha256, digestJson(Object.fromEntries(Object.entries(result).filter(([key]) => key !== "planSha256"))));
});

test("interrupted, failed, missing and corrupt artifacts rerun without prose inference", () => {
  const alpha = receipt(suites[0]);
  const partial = { ...alpha, status: "running", receiptSha256: alpha.receiptSha256 };
  assert.deepEqual(plan({ alpha: partial }, { alpha: log("alpha") }).rerun, ["alpha", "beta"]);
  assert.equal(plan({ alpha }, {}).reasons[0].code, "missing-log");
  assert.equal(plan({ alpha }, { alpha: { ...log("alpha"), fileSha256: B } }).reasons[0].code, "corrupt-log");
  assert.equal(plan({ alpha }, { alpha: { ...log("alpha"), truncated: true } }).reasons[0].code, "truncated-log");
  assert.equal(plan({ alpha: { ...alpha, receiptSha256: B } }, { alpha: log("alpha") }).reasons[0].code, "corrupt-receipt");
  assert.equal(plan({ alpha: receipt(suites[0], { exitCode: 1 }) }, { alpha: log("alpha") }).reasons[0].code, "not-successful");
});

test("candidate, implementation, input, environment and policy drift are typed", () => {
  const alpha = receipt(suites[0]);
  const artifacts = { alpha };
  const logs = { alpha: log("alpha") };
  assert.equal(plan(artifacts, logs, { candidate: { commit: "3".repeat(40), tree: candidate.tree } }).reasons[0].code, "candidate-drift");
  assert.equal(plan(artifacts, logs, { suites: [suite("alpha", { implementationSha256: B }), suites[1]] }).reasons[0].code, "suite-implementation-drift");
  assert.equal(plan(artifacts, logs, { suites: [suite("alpha", { inputs: input("alpha.test.mjs", B) }), suites[1]] }).reasons[0].code, "declared-input-drift");
  assert.equal(plan(artifacts, logs, { suites: [suite("alpha", { environmentContractSha256: A }), suites[1]] }).reasons[0].code, "environment-contract-drift");
  assert.equal(plan(artifacts, logs, { policySha256: B }).reasons[0].code, "verify-policy-drift");
});

test("ADR-0065: candidate-drift no longer gates the content checks, but stays exactly as strict", () => {
  const alpha = receipt(suites[0]);
  const artifacts = { alpha };
  const logs = { alpha: log("alpha") };
  // A candidate change that ALSO changes the suite's declared inputs (the realistic case, since
  // Tier A's declared-tree digest is a function of the candidate tree) is now reported as
  // declared-input-drift -- the content check fires before candidate-drift is even reached,
  // proving candidate-drift no longer pre-empts it. The suite is still invalidated either way.
  const bothDrifted = plan(artifacts, logs, {
    candidate: { commit: "3".repeat(40), tree: "4".repeat(40) },
    suites: [suite("alpha", { inputs: input("alpha.test.mjs", B) }), suites[1]],
  });
  assert.equal(bothDrifted.reasons[0].code, "declared-input-drift");
  assert.deepEqual(bothDrifted.rerun, ["alpha", "beta"]);
  // The one case content checks cannot see on their own -- a differing commit whose tree and every
  // other declared input are byte-identical -- still invalidates via the demoted candidate-drift
  // check, which stays reachable, just lower in the chain. This is the exact scenario the negative
  // control's own commit-vs-tree distinction rests on: the verdict (rerun, never reused) is
  // unchanged from before the reorder.
  const commitOnly = plan(artifacts, logs, { candidate: { commit: "3".repeat(40), tree: candidate.tree } });
  assert.equal(commitOnly.reasons[0].code, "candidate-drift");
  assert.deepEqual(commitOnly.rerun, ["alpha", "beta"]);
});

test("ADR-0065 candidate (b) fix (Critic F1): a Tier-B suite (no declared-tree:* input) skips candidate-drift and is reused across an unrelated candidate change WHEN the caller explicitly opts in via allowCrossCandidateReuse", () => {
  const tierB = suite("tierb", { inputs: tierBInput() });
  const sealed = sealVerifySuiteReceipt({ runId: "verify-source", candidate, suite: tierB.id, implementationSha256: tierB.implementationSha256, inputs: tierB.inputs, environmentContractSha256: tierB.environmentContractSha256, policySha256: C, status: "completed", exitCode: 0, log: log("tierb"), startedAt: "2026-08-01T00:00:00.000Z", completedAt: "2026-08-01T00:00:01.000Z" });
  const unrelatedCandidate = { commit: "3".repeat(40), tree: "4".repeat(40) };
  // Both commit AND tree differ from the receipt's -- exactly the case that unconditionally fired
  // candidate-drift before the ADR-0065 candidate (b) fix, even though this suite's own declared
  // files never moved. This proves the underlying mechanism still works when a caller explicitly
  // opts in (NVA-ADR65TIERFIX-2, Critic finding F1's follow-up: the mechanism must stay gated
  // behind a caller-supplied flag, never on by default).
  const reused = planVerifyResume({ runId: "verify-next", candidate: unrelatedCandidate, suites: [tierB], receipts: { tierb: sealed }, logs: { tierb: log("tierb") }, policySha256: C, allowCrossCandidateReuse: true });
  assert.deepEqual(reused.reusable, ["tierb"]);
  assert.deepEqual(reused.rerun, []);
  assert.deepEqual(reused.reasons, []);
  // Skipping candidate-drift never means skipping content checks: the suite's OWN declared file
  // changing must still invalidate it, via declared-input-drift, even with the flag set.
  const changedTierB = suite("tierb", { inputs: tierBInput("tierb.test.mjs", B) });
  const invalidated = planVerifyResume({ runId: "verify-next", candidate: unrelatedCandidate, suites: [changedTierB], receipts: { tierb: sealed }, logs: { tierb: log("tierb") }, policySha256: C, allowCrossCandidateReuse: true });
  assert.equal(invalidated.reasons[0].code, "declared-input-drift");
  assert.deepEqual(invalidated.rerun, ["tierb"]);
});

test("NVA-ADR65TIERFIX-2: WITHOUT allowCrossCandidateReuse (the default, matching harness/scripts/verify.mjs's real unmodified call shape), a Tier-B suite whose own files are unchanged is NOT reused across a candidate change -- candidate-drift still fires", () => {
  const tierB = suite("tierb", { inputs: tierBInput() });
  const sealed = sealVerifySuiteReceipt({ runId: "verify-source", candidate, suite: tierB.id, implementationSha256: tierB.implementationSha256, inputs: tierB.inputs, environmentContractSha256: tierB.environmentContractSha256, policySha256: C, status: "completed", exitCode: 0, log: log("tierb"), startedAt: "2026-08-01T00:00:00.000Z", completedAt: "2026-08-01T00:00:01.000Z" });
  const unrelatedCandidate = { commit: "3".repeat(40), tree: "4".repeat(40) };
  // Deliberately omit allowCrossCandidateReuse entirely -- this is the actual safety property that
  // matters: the production call site (harness/scripts/verify.mjs) cannot pass the flag (TP-3
  // protected, no active Guard Maintenance Window), so its call shape is exactly this one.
  const notReused = planVerifyResume({ runId: "verify-next", candidate: unrelatedCandidate, suites: [tierB], receipts: { tierb: sealed }, logs: { tierb: log("tierb") }, policySha256: C });
  assert.deepEqual(notReused.reusable, []);
  assert.deepEqual(notReused.rerun, ["tierb"]);
  assert.equal(notReused.reasons[0].code, "candidate-drift");
  // Explicitly passing allowCrossCandidateReuse: false must be identical to omitting it.
  const explicitFalse = planVerifyResume({ runId: "verify-next", candidate: unrelatedCandidate, suites: [tierB], receipts: { tierb: sealed }, logs: { tierb: log("tierb") }, policySha256: C, allowCrossCandidateReuse: false });
  assert.deepEqual(explicitFalse.rerun, ["tierb"]);
  assert.equal(explicitFalse.reasons[0].code, "candidate-drift");
});

test("NVA-ADR65TIERFIX-2: allowCrossCandidateReuse never affects Tier A -- candidate-drift stays unconditional regardless of the flag", () => {
  const alpha = receipt(suites[0]);
  const artifacts = { alpha };
  const logs = { alpha: log("alpha") };
  const driftedCandidate = { commit: "3".repeat(40), tree: candidate.tree };
  const withFlagTrue = plan(artifacts, logs, { candidate: driftedCandidate, allowCrossCandidateReuse: true });
  assert.equal(withFlagTrue.reasons[0].code, "candidate-drift");
  assert.deepEqual(withFlagTrue.rerun, ["alpha", "beta"]);
});

test("targeted invalidation propagates only through declared deterministic dependents", () => {
  const gamma = suite("gamma");
  const current = [suites[0], suites[1], gamma];
  const receipts = { alpha: receipt(suites[0], { implementationSha256: B }), beta: receipt(suites[1]), gamma: receipt(gamma) };
  const logs = { alpha: log("alpha"), beta: log("beta"), gamma: log("gamma") };
  const result = planVerifyResume({ runId: "verify-next", candidate, suites: current, receipts, logs, policySha256: C });
  assert.deepEqual(result.reusable, ["gamma"]);
  assert.deepEqual(result.invalidated, ["alpha", "beta"]);
  assert.deepEqual(result.reasons, [{ suite: "alpha", code: "suite-implementation-drift", dependency: null }, { suite: "beta", code: "dependency-invalidated", dependency: "alpha" }]);
});

test("the current registration remains the complete coverage set", () => {
  const result = plan();
  assert.deepEqual(result.reusable, []);
  assert.deepEqual(result.rerun, ["alpha", "beta"]);
  assert.throws(() => planVerifyResume({ runId: "verify-next", candidate, suites: [suites[0], suites[0]], policySha256: C }));
  assert.throws(() => planVerifyResume({ runId: "verify-next", candidate: { commit: "1".repeat(41), tree: candidate.tree }, suites, policySha256: C }));
  assert.throws(() => planVerifyResume({ runId: "verify-next", candidate, suites: [suite("alpha", { dependsOn: ["beta"] }), suite("beta", { dependsOn: ["alpha"] })], policySha256: C }), /cycle/u);
});

test("public run evidence cannot report pass with incomplete terminal coverage", () => {
  const complete = createPublicVerifyRunEvidence({ runId: "verify-next", policySha256: A, resumePlanSha256: B, terminalSha256: C, registeredSuiteCount: 2, terminalReceiptCount: 2, terminalStatus: "passed" });
  assert.equal(complete.status, "passed");
  const incomplete = createPublicVerifyRunEvidence({ runId: "verify-next", policySha256: A, resumePlanSha256: B, terminalSha256: C, registeredSuiteCount: 2, terminalReceiptCount: 1, terminalStatus: "passed" });
  assert.equal(incomplete.status, "failed");
  assert.throws(() => createPublicVerifyRunEvidence({ runId: "verify-next", policySha256: A, resumePlanSha256: B, terminalSha256: C, registeredSuiteCount: 1, terminalReceiptCount: 2, terminalStatus: "passed" }));
});

test("closed Verify schemas expose the exact Spec root keys and public run coverage", () => {
  const expected = new Map([
    ["verify-progress.schema.json", ["schema", "runId", "candidate", "suite", "index", "total", "state", "startedAt", "completedAt", "receiptSha256", "diagnosticDigest"]],
    ["verify-suite-receipt.schema.json", ["schema", "runId", "candidate", "suite", "implementationSha256", "inputs", "environmentContractSha256", "policySha256", "status", "exitCode", "log", "startedAt", "completedAt", "receiptSha256"]],
    ["verify-resume-plan.schema.json", ["schema", "runId", "candidate", "policySha256", "reusable", "rerun", "invalidated", "reasons", "planSha256"]],
  ]);
  for (const [name, keys] of expected) {
    const schema = JSON.parse(readFileSync(join(scriptDir, name), "utf8"));
    assert.deepEqual(schema.required, keys);
    assert.equal(schema.additionalProperties, false);
    const oid = new RegExp(schema.$defs.candidate.properties.commit.pattern, "u");
    assert.equal(oid.test("1".repeat(40)), true);
    assert.equal(oid.test("1".repeat(41)), false);
    assert.equal(oid.test("1".repeat(64)), true);
  }
  const evidence = JSON.parse(readFileSync(join(scriptDir, "verify-evidence.schema.json"), "utf8"));
  assert.deepEqual(evidence.$defs.verifyRun.required, ["runId", "policySha256", "resumePlanSha256", "terminalSha256", "registeredSuiteCount", "terminalReceiptCount", "status"]);
  assert.equal(evidence.$defs.verifyRun.additionalProperties, false);
});
