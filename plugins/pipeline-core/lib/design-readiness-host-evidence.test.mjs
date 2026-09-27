// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  designReadinessReportSha256,
  designReadinessRunnerSelectionSha256,
  verifyDesignReadinessHostExecution,
} from "./design-readiness-host-evidence.mjs";
import { createDesignReadinessRunnerHostStore } from "./design-readiness-runner-host-store.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const NAMES = ["input", "prd", "spec", "design", "traceability"];
function fixture(t, runner) {
  const root = mkdtempSync(join(tmpdir(), "design-readiness-host-evidence-"));
  const gitCommonDir = join(root, ".git");
  mkdirSync(gitCommonDir, { mode: 0o700 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repoFingerprint = "a".repeat(64);
  const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
  const sourceBytes = Object.fromEntries(NAMES.map((name) => {
    const bytes = Buffer.from(`# ${name}\nBound source.\n`);
    return [name, { path: `spec/${name}.md`, bytes }];
  }));
  const sources = Object.fromEntries(NAMES.map((name) => [name, {
    path: sourceBytes[name].path,
    sha256: sha(sourceBytes[name].bytes),
  }]));
  const route = { model: runner === "claude" ? "opus" : "gemini-3.8-flash", effort: "high",
    sourceSha256: "d".repeat(64), candidateCommit: candidate.commit };
  const report = {
    schema: "pipeline.design-readiness-receipt.v1",
    dispatchId: `readiness-${runner}`,
    runner,
    candidate,
    sources,
    outcome: "ready-for-po-review",
    findings: [],
    unresolvedChoices: [],
    summary: "The exact design source set is ready for PO review.",
  };
  const selectionId = `drh_${(runner === "claude" ? "1" : "2").repeat(32)}`;
  const record = {
    schema: "pipeline.design-readiness-runner-host-receipt.v1",
    receiptId: selectionId,
    runner,
    repoFingerprint,
    dispatchId: report.dispatchId,
    candidate,
    sources,
    route,
    executableSha256: "e".repeat(64),
    requestSha256: "f".repeat(64),
    responseSha256: "1".repeat(64),
    dutyReceiptSha256: designReadinessReportSha256(report),
    child: { started: true, exitCode: 0, signal: null, stdoutStatus: "complete", writeToolsObserved: false },
    createdAt: "2026-09-27T12:00:00.000Z",
  };
  const store = createDesignReadinessRunnerHostStore({ gitCommonDir, repoFingerprint });
  const stored = store.write(record);
  const readinessReceipt = {
    ...report,
    hostExecution: {
      schema: "pipeline.design-readiness-host-execution.v1",
      runner,
      repoFingerprint,
      selectionId,
      selectionSha256: designReadinessRunnerSelectionSha256(record),
      executionReceiptSha256: stored.sha256,
      dutyReceiptSha256: record.dutyReceiptSha256,
      route,
    },
  };
  const verifier = (receipt = readinessReceipt) => verifyDesignReadinessHostExecution({
    repoRoot: root,
    hostExecution: receipt.hostExecution,
    readinessReceipt: receipt,
    candidate,
    sources,
    sourceBytes,
    resolveTopology: () => ({ gitCommonDir, primaryRoot: root }),
    deriveRepositoryFingerprint: () => repoFingerprint,
    resolveRoute: ({ dutyId, runner: selectedRunner, candidateCommit }) => ({
      dutyId, runner: selectedRunner, state: "default", ...route,
      model: route.model, candidateCommit,
    }),
  });
  return { readinessReceipt, verifier };
}

test("DWH01 Claude host-observed receipt is verified against its write-once private execution record", (t) => {
  const fx = fixture(t, "claude");
  assert.equal(fx.verifier().ok, true);
  assert.equal(fx.verifier().assurance, "host-observed-local");
});

test("DWH02 Antigravity host-observed receipt is local evidence and binds exact report, candidate and route", (t) => {
  const fx = fixture(t, "antigravity");
  assert.equal(fx.verifier().ok, true);
  const changed = structuredClone(fx.readinessReceipt);
  changed.summary = "tampered";
  assert.equal(fx.verifier(changed).code, "DWP-READINESS-HOST-RECEIPT-MISMATCH");
  const routeChanged = structuredClone(fx.readinessReceipt);
  routeChanged.hostExecution.route.model = "gemini-other";
  assert.equal(fx.verifier(routeChanged).code, "DWP-READINESS-HOST-ROUTE-MISMATCH");
});

test("DWH03 host-observed receipts fail closed on missing local readback and repository mismatch", (t) => {
  const fx = fixture(t, "antigravity");
  const missing = verifyDesignReadinessHostExecution({
    repoRoot: "/missing",
    hostExecution: fx.readinessReceipt.hostExecution,
    readinessReceipt: fx.readinessReceipt,
    candidate: fx.readinessReceipt.candidate,
    sources: fx.readinessReceipt.sources,
    sourceBytes: null,
    resolveTopology: () => { throw new Error("no topology"); },
  });
  assert.equal(missing.code, "DWP-READINESS-HOST-RECEIPT-UNAVAILABLE");
});
