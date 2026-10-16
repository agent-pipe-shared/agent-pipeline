// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.design-phase-runs-critic-advisor-and-readiness-instead-of-one-review (AC-155).
// The ordinary design phase needs exactly one review receipt (at most one delta follow-up), no mandatory
// Advisor stage and no readiness ceremony; the design course is retired; the signed object carries only
// the review chain. Real modules, no mocks of the behavior under test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createDesignApprovalBinding, createDesignApprovalRequest, verifyDesignApprovalRequest } from "../design-approval-binding.mjs";
import { DESIGN_REVIEW_MAX_ROUNDS, createDesignReviewReceipt } from "../design-review-receipt.mjs";
import { RETIRED_DESIGN_ROUTE_HINT } from "../retired-design-codes.mjs";
import { inspectDesignCourse, main as courseMain } from "../../scripts/design-course-coordinator.mjs";
import { evaluateDesignAdvisoryAdmission } from "../design-advisory-admission.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");
const ref = (path, text) => ({ path, sha256: sha(text) });
const sources = (specText) => ({ prd: ref("specs/f1/prd.md", "prd"), spec: ref("specs/f1/spec.md", specText), companions: [] });
const reviewer = { runner: "claude", model: "claude-sonnet-5-5" };
const report = ref("specs/f1/review-1.md", "report");

function receipt(specText, previous = null, ids = []) {
  const made = createDesignReviewReceipt({
    featureId: "f1", previous, sources: sources(specText), reviewer,
    report: previous ? ref("specs/f1/review-2.md", "report2") : report,
    openFindingIds: ids, reviewedAt: "2026-10-10T00:00:00.000Z",
  });
  assert.equal(made.ok, true, JSON.stringify(made));
  return made;
}

test("one review receipt is enough: a single PASS receipt yields a binding with only the review chain", () => {
  const r1 = receipt("spec-v1");
  assert.equal(r1.receipt.round, 1);
  assert.equal(r1.receipt.verdict, "pass");
  const binding = createDesignApprovalBinding({ featureId: "f1", receipts: [{ path: "specs/f1/receipt-1.json", bytes: r1.bytes }], currentSources: sources("spec-v1") });
  assert.equal(binding.ok, true, JSON.stringify(binding));
  assert.deepEqual(Object.keys(binding.binding).sort(), ["featureId", "openFindingIds", "reviewReceipts", "schema", "sources", "verdict"]);
  assert.equal(binding.binding.reviewReceipts.length, 1);
  const text = JSON.stringify(binding.binding).toLowerCase();
  for (const forbidden of ["advisor", "readiness", "course", "exception"]) assert.equal(text.includes(forbidden), false, forbidden);
});

test("the review is capped at one initial plus at most one delta follow-up; a third round is refused", () => {
  assert.equal(DESIGN_REVIEW_MAX_ROUNDS, 2);
  const r1 = receipt("spec-v1", null, ["F-ONE"]);
  const r2 = receipt("spec-v2", { path: "specs/f1/receipt-1.json", bytes: r1.bytes });
  assert.equal(r2.receipt.kind, "delta");
  assert.equal(r2.receipt.round, 2);
  const third = createDesignReviewReceipt({
    featureId: "f1", previous: { path: "specs/f1/receipt-2.json", bytes: r2.bytes }, sources: sources("spec-v3"), reviewer,
    report: ref("specs/f1/review-3.md", "r3"), openFindingIds: [], reviewedAt: "2026-10-11T00:00:00.000Z",
  });
  assert.deepEqual([third.ok, third.code], [false, "DRR-ROUND-EXCEEDED"]);
});

test("one PO approval request is built from receipts alone (no Advisor record, no readiness evidence) and re-verifies", () => {
  const r1 = receipt("spec-v1");
  const receipts = [{ path: "specs/f1/receipt-1.json", bytes: r1.bytes }];
  const binding = createDesignApprovalBinding({ featureId: "f1", receipts, currentSources: sources("spec-v1") });
  const request = createDesignApprovalRequest({ binding: binding.binding, candidate: { commit: "a".repeat(40), tree: "b".repeat(40) } });
  assert.equal(request.ok, true, JSON.stringify(request));
  assert.deepEqual(Object.keys(request.request).sort(), ["approvalIntent", "binding", "bindingSha256", "schema"]);
  const verified = verifyDesignApprovalRequest({ request: request.request, featureId: "f1", receipts, currentSources: sources("spec-v1") });
  assert.equal(verified.ok, true, JSON.stringify(verified));
  assert.equal(verified.verdict, "pass");
});

test("a drifted design after the first review is refused rather than waved through (protected binding of the signed object)", () => {
  const r1 = receipt("spec-v1");
  const drifted = createDesignApprovalBinding({ featureId: "f1", receipts: [{ path: "specs/f1/receipt-1.json", bytes: r1.bytes }], currentSources: sources("spec-v2") });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.code, "DAB-REVIEW-CHAIN");
});

test("the multi-stage design course is retired: the coordinator refuses to start Advisor/readiness stages and names the one-review route", () => {
  const direct = inspectDesignCourse({ rootDir: "/nonexistent-root", runner: "codex" });
  assert.equal(direct.ok, false);
  assert.equal(direct.code, "DESIGN-COURSE-RETIRED");
  assert.equal(direct.implementationAuthority, false);
  assert.equal(direct.hint, RETIRED_DESIGN_ROUTE_HINT);
  assert.match(direct.hint, /Advisor on demand/u);
  assert.match(direct.hint, /one review/u);
  assert.match(direct.hint, /present-plan --review-receipt/u);
  const logged = [];
  const result = courseMain([], { log: (line) => logged.push(line) });
  assert.equal(result.code, "DESIGN-COURSE-RETIRED");
  assert.equal(logged.length, 1);
});

test("an Advisor admission with no consultation does not exist as a pass: the Advisor gate remains an explicit on-demand record, never auto-satisfied", () => {
  assert.equal(evaluateDesignAdvisoryAdmission(null).ok, false);
});
