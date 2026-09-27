#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import { runSpecReadinessHost } from "./spec-readiness-host.mjs";
import { designReadinessReportSha256 } from "../lib/design-readiness-host-evidence.mjs";

const DISPATCH = Object.freeze({
  queueRevision: 9,
  candidateCommit: "a".repeat(40),
  candidateTree: "b".repeat(40),
  referenceSetSha256: "c".repeat(64),
});
const REQUEST = Object.freeze({ repoFingerprint: "f".repeat(64), requested: { runner: "codex", model: "gpt-6-luna" } });
const DISPATCH_ID = "readiness-run-9";
const SOURCES = Object.fromEntries(["input", "prd", "spec", "design", "traceability"].map((name) => [name,
  { path: `specs/feature/${name}.md`, sha256: "1".repeat(64) }]));
const REFERENCES = Object.values(SOURCES).map((source) => source.path).sort();
const ROUTE = Object.freeze({ model: REQUEST.requested.model, effort: "high", sourceSha256: "2".repeat(64), candidateCommit: DISPATCH.candidateCommit });
const REPORT = Object.freeze({
  schema: "pipeline.design-readiness-receipt.v1",
  dispatchId: DISPATCH_ID,
  runner: "codex",
  candidate: { commit: DISPATCH.candidateCommit, tree: DISPATCH.candidateTree },
  sources: SOURCES,
  outcome: "ready-for-po-review",
  findings: [],
  unresolvedChoices: [],
  summary: "All requirements are covered for PO review.",
});
const RESULT = Object.freeze({
  status: "reviewed",
  selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae",
  selectionSha256: "d".repeat(64),
  executionReceiptSha256: "e".repeat(64),
  dutyReceiptSha256: designReadinessReportSha256(REPORT),
});

test("readiness uses the generic selected duty with only fresh refs and binds the resulting review", async () => {
  const calls = [];
  const result = await runSpecReadinessHost({ dispatch: DISPATCH, dispatchId: DISPATCH_ID, sources: SOURCES,
    references: REFERENCES, ...REQUEST }, {
    executeSandboxedReadonlyDuty: async (request) => {
      calls.push(request);
      return RESULT;
    },
    takeReadinessReport: (selectionId) => selectionId === RESULT.selectionId ? { report: REPORT, route: ROUTE } : null,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].duty, "readiness");
  assert.equal(calls[0].repoFingerprint, REQUEST.repoFingerprint);
  assert.deepEqual(calls[0].requested, REQUEST.requested);
  assert.deepEqual(calls[0].dispatch, DISPATCH);
  assert.deepEqual(calls[0].references, REFERENCES);
  assert.equal(result.status, "reviewed");
  assert.equal(result.executionReceiptSha256, "e".repeat(64));
  assert.deepEqual(result.readinessReceipt.hostExecution, {
    schema: "pipeline.design-readiness-host-execution.v1",
    runner: "codex",
    repoFingerprint: REQUEST.repoFingerprint,
    selectionId: RESULT.selectionId,
    selectionSha256: RESULT.selectionSha256,
    executionReceiptSha256: RESULT.executionReceiptSha256,
    dutyReceiptSha256: RESULT.dutyReceiptSha256,
    route: ROUTE,
  });
  assert.equal(result.readinessReceipt.freshReadOnly, undefined);
});

test("readiness returns the selector's typed unavailable result without a child or a prose workaround", async () => {
  let calls = 0;
  const result = await runSpecReadinessHost({ dispatch: DISPATCH, dispatchId: DISPATCH_ID, sources: SOURCES,
    references: REFERENCES, ...REQUEST }, {
    executeSandboxedReadonlyDuty: async () => {
      calls += 1;
      return { status: "unavailable", failureClass: "host-mode-unavailable", childStarted: false, assurance: { class: "no-usable-review", literal: null } };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "unavailable", failureClass: "host-mode-unavailable", childStarted: false, assurance: { class: "no-usable-review", literal: null } });
});

test("readiness refuses to invent a direct Codex route when the host has no physical sandbox runtime", async () => {
  const result = await runSpecReadinessHost({ dispatch: DISPATCH, dispatchId: DISPATCH_ID, sources: SOURCES,
    references: REFERENCES, ...REQUEST });
  assert.deepEqual(result, {
    status: "unavailable",
    failureClass: "host-mode-unavailable",
    childStarted: false,
    assurance: { class: "no-usable-review", literal: null },
  });
});
