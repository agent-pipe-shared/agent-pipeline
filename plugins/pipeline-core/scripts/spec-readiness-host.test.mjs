#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

// QG-04 justification (Elephant decision E12, ADR-0085): runSpecReadinessHost now returns
// retiredDesignResult(DESIGN_COURSE_RETIRED) before parsing or any dependency call. The three cases below measured dead
// code. They are retargeted, not deleted: fixtures and dependency stubs are kept, the asserted outcome is the retirement
// contract (exact retired object, zero dependency touch, no implementation authority).
import assert from "node:assert/strict";
import test from "node:test";

import { runSpecReadinessHost } from "./spec-readiness-host.mjs";
import { designReadinessReportSha256 } from "../lib/design-readiness-host-evidence.mjs";
import { DESIGN_COURSE_RETIRED, retiredDesignResult } from "../lib/retired-design-codes.mjs";

const DISPATCH = Object.freeze({
  queueRevision: 9,
  candidateCommit: "a".repeat(40),
  candidateTree: "b".repeat(40),
  referenceSetSha256: "c".repeat(64),
});
const REQUEST = Object.freeze({ repoFingerprint: "f".repeat(64), requested: { runner: "codex", model: "gpt-6-luna" } });
const DISPATCH_ID = "readiness-run-9";
const RETIRED = retiredDesignResult(DESIGN_COURSE_RETIRED);
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

test("readiness is retired before it reaches the generic selected duty, fresh refs or a bound review (ADR-0085)", async () => {
  const calls = [];
  const result = await runSpecReadinessHost({ dispatch: DISPATCH, dispatchId: DISPATCH_ID, sources: SOURCES,
    references: REFERENCES, ...REQUEST }, {
    executeSandboxedReadonlyDuty: async (request) => {
      calls.push(request);
      return RESULT;
    },
    takeReadinessReport: (selectionId) => selectionId === RESULT.selectionId ? { report: REPORT, route: ROUTE } : null,
  });
  assert.deepEqual(result, RETIRED);
  assert.equal(calls.length, 0, "the retired readiness host never reaches the selected duty");
  assert.equal(result.implementationAuthority, false);
});

test("readiness returns the retirement refusal, never the selector's unavailable result, and starts no child (ADR-0085)", async () => {
  let calls = 0;
  const result = await runSpecReadinessHost({ dispatch: DISPATCH, dispatchId: DISPATCH_ID, sources: SOURCES,
    references: REFERENCES, ...REQUEST }, {
    executeSandboxedReadonlyDuty: async () => {
      calls += 1;
      return { status: "unavailable", failureClass: "host-mode-unavailable", childStarted: false, assurance: { class: "no-usable-review", literal: null } };
    },
  });
  assert.equal(calls, 0, "the selected duty is never consulted");
  assert.deepEqual(result, RETIRED);
});

test("readiness without a sandbox runtime returns the retirement refusal, not host-mode-unavailable (ADR-0085)", async () => {
  const result = await runSpecReadinessHost({ dispatch: DISPATCH, dispatchId: DISPATCH_ID, sources: SOURCES,
    references: REFERENCES, ...REQUEST });
  assert.deepEqual(result, RETIRED);
});
