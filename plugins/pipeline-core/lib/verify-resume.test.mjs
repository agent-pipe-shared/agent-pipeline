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
const input = (path = "suite.test.mjs", digest = A) => ({ files: [{ path, fileSha256: digest }], nonFiles: [{ kind: "candidate-tree", path: null, sha256: B }] });
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
