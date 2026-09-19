// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DESIGN_ADVISORY_RECORD_PATH } from "./design-advisory-enforcement.mjs";
import { DESIGN_ADVISORY_RECEIPT_DIRECTORY, readDesignAdvisoryTransaction, writeDesignAdvisoryTransaction } from "./design-advisory-transaction.mjs";

const COMMIT = "c".repeat(40);
const TREE = "d".repeat(40);
const PLAN_SHA = createHash("sha256").update("# Plan\n").digest("hex");

function root() {
  const value = mkdtempSync(join(tmpdir(), "design-advisor-transaction-"));
  mkdirSync(join(value, ".git", "agent-pipeline", "design-advisory-receipts"), { recursive: true, mode: 0o700 });
  mkdirSync(join(value, "project"), { recursive: true });
  mkdirSync(join(value, "specs", "feature-1"), { recursive: true });
  writeFileSync(join(value, "specs", "feature-1", "prd.md"), "# Plan\n");
  writeFileSync(join(value, "specs", "feature-1", "spec.md"), "# Spec\n");
  return value;
}
function receipt({ status = "answered" } = {}) {
  return {
    schema: "pipeline.advisory-receipt.v1", receiptId: "advisor-1",
    dispatch: { dispatchId: "design-1", queueRevision: 0, candidateCommit: COMMIT, candidateTree: TREE },
    duty: "advisory", profile: "feature",
    configuredRoute: { runner: "codex", selector: { kind: "model-id", value: "gpt-5.6-sol" }, effort: "high" },
    adapter: "consult",
    observed: status === "answered" ? { status, identity: { provider: "openai", modelId: "gpt-5.6-sol", effort: "high" } } : { status, identity: null },
    questionSha256: PLAN_SHA, answerSha256: status === "answered" ? "b".repeat(64) : null,
    fallback: status === "answered" ? { reason: "none", redactedErrorClass: null } : { reason: "consult-unavailable", redactedErrorClass: "unavailable" },
    emittedAtMs: 1,
  };
}
function writeReceipt(value, data = receipt()) {
  writeFileSync(join(value, ".git", DESIGN_ADVISORY_RECEIPT_DIRECTORY, "advisor-1.json"), `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}
function input(value, overrides = {}) {
  return {
    repoRoot: value, gitCommonDir: join(value, ".git"), featureId: "feature-1", planPath: "specs/feature-1/prd.md", specPath: "specs/feature-1/spec.md",
    receiptId: "advisor-1", nativeAvailable: false, disposition: { decision: "accept", rationale: "The plan remains bounded." }, finalApprovalValid: false, expectedPublicSha256: null,
    ...overrides,
  };
}
function readInput(value, overrides = {}) { return { repoRoot: value, gitCommonDir: join(value, ".git"), featureId: "feature-1", planPath: "specs/feature-1/prd.md", specPath: "specs/feature-1/spec.md", finalApprovalValid: false, ...overrides }; }

test("writes one private transaction and a CAS/readback public admission projection", () => {
  const value = root();
  try {
    writeReceipt(value);
    const written = writeDesignAdvisoryTransaction(input(value));
    assert.equal(written.written, true);
    assert.equal(written.mode, "complete");
    const observed = readDesignAdvisoryTransaction(readInput(value));
    assert.equal(observed.id, written.id);
    assert.equal(observed.record.admission.elephant.decision, "accept");
    const retry = writeDesignAdvisoryTransaction(input(value, { expectedPublicSha256: written.sha256 }));
    assert.equal(retry.written, false, "an exact replay is idempotent rather than a replacement");
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("rejects a public handcraft because no matching private transaction exists", () => {
  const value = root();
  try {
    writeReceipt(value);
    const written = writeDesignAdvisoryTransaction(input(value));
    const publicPath = join(value, DESIGN_ADVISORY_RECORD_PATH);
    const publicBytes = readFileSync(publicPath);
    rmSync(join(value, ".git", "agent-pipeline", "design-advisory-transactions", `${written.id}.json`));
    writeFileSync(publicPath, publicBytes);
    assert.throws(() => readDesignAdvisoryTransaction(readInput(value)), (error) => error.code === "DAA-PRIVATE-UNAVAILABLE");
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("rejects receipt substitution, stale package bytes, and a changed public CAS preimage", () => {
  const value = root();
  try {
    writeReceipt(value);
    const written = writeDesignAdvisoryTransaction(input(value));
    const changed = receipt(); changed.answerSha256 = "e".repeat(64);
    writeReceipt(value, changed);
    assert.throws(() => readDesignAdvisoryTransaction(readInput(value)), (error) => error.code === "DAA-RECEIPT-DRIFT");
    writeReceipt(value);
    writeFileSync(join(value, "specs", "feature-1", "prd.md"), "# Changed plan\n");
    assert.throws(() => readDesignAdvisoryTransaction(readInput(value)), (error) => error.code === "DAA-PUBLIC-INVALID");
    writeFileSync(join(value, "specs", "feature-1", "prd.md"), "# Plan\n");
    writeFileSync(join(value, DESIGN_ADVISORY_RECORD_PATH), "{}\n");
    assert.throws(() => writeDesignAdvisoryTransaction(input(value, { expectedPublicSha256: "f".repeat(64) })), (error) => error.code === "DAA-PUBLIC-CAS");
    assert.ok(written.id.length === 64);
  } finally { rmSync(value, { recursive: true, force: true }); }
});

test("unavailable Advisor path cannot be recorded without a verified final PO approval", () => {
  const value = root();
  try {
    writeReceipt(value, receipt({ status: "unavailable" }));
    assert.throws(() => writeDesignAdvisoryTransaction(input(value, { disposition: null, finalApprovalValid: false })), (error) => error.code === "DAA-UNAVAILABLE-FINAL-APPROVAL");
    const written = writeDesignAdvisoryTransaction(input(value, { disposition: null, finalApprovalValid: true }));
    assert.equal(written.mode, "unavailable");
    assert.equal(readDesignAdvisoryTransaction(readInput(value, { finalApprovalValid: true })).mode, "advisor-unavailable-exception");
  } finally { rmSync(value, { recursive: true, force: true }); }
});
