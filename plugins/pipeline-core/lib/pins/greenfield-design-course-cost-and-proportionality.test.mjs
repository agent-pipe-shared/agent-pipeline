// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.greenfield-design-course-cost-and-proportionality (AC-191).
// Successor policy pinned (one review, at most one delta, on-demand Advisor, no readiness, one final decision).
//
// RESTATED TO THE DECIDED PREMISE (QG-04, K86-PIN-RESTATEMENTS, 2026-10-23; no assertion changed). PO decision D125
// (2026-10-22): ADR-0085 (one review, one signature) supersedes the Advisor-plus-independent-readiness design course for
// this item, so the item's original acceptance is judged against the single-review route; the one-final-PO-gate and
// no-intermediate-proof parts are unchanged. Acceptance map (item, shortened by D125 and D25/D121):
//   A1 order: agent submits mechanically, one review, one final decision, retired routes not recovery  -> case "order"
//   A2 cheap deterministic checks before model review, no guessed arithmetic                            -> case "deterministic checks"
//   A3 reuse an unchanged evidence tuple, bind the final package to all current sources                 -> case "evidence reuse"
//   A4 bounded low-risk course, one final gate, a third review round refused                            -> case "bounded course"
//   A5 phase wall time / tool time / human wait: LEFT this item's acceptance by D25 (2026-10-18) and is postponed for 0.7.0
//      by D121 (2026-10-22); tracked in backlog/items/2026-10-16-design-course-telemetry-is-deferred.md. The telemetry case
//      below stays as that item's deferred pin: it is not a failure of this item and not counted against it.
// NOT PROVEN HERE (stays open, needs an installed runner, not agent work): a fresh small-project run that reaches
// implementation with one final PO gate, judged against ADR-0085.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createDesignApprovalBinding, createDesignApprovalRequest, verifyDesignApprovalRequest } from "../design-approval-binding.mjs";
import { createDesignReviewReceipt } from "../design-review-receipt.mjs";
import { RETIRED_DESIGN_ROUTE_HINT } from "../retired-design-codes.mjs";
import { inspectDesignCourse } from "../../scripts/design-course-coordinator.mjs";
import { reviewChainInconsistencies } from "../design-consistency-check.mjs";

const here = (rel) => new URL(rel, import.meta.url);
const sha = (text) => createHash("sha256").update(text).digest("hex");
const ref = (path, text) => ({ path, sha256: sha(text) });
const sources = (specText) => ({ prd: ref("specs/f1/prd.md", "prd"), spec: ref("specs/f1/spec.md", specText), companions: [] });
const reviewer = { runner: "claude", model: "claude-sonnet-5-5" };
function receipt(specText, previous = null) {
  const made = createDesignReviewReceipt({
    featureId: "f1", previous, sources: sources(specText), reviewer,
    report: previous ? ref("specs/f1/review-2.md", "r2") : ref("specs/f1/review-1.md", "r1"),
    openFindingIds: [], reviewedAt: "2026-10-10T00:00:00.000Z",
  });
  assert.equal(made.ok, true, JSON.stringify(made));
  return made;
}
const course = () => readFileSync(here("../../skills/pipeline-start/references/design-course.md"), "utf8");

test("order: agent submits the plan mechanically, one review, one final PO decision; retired DWP/Advisor-course routes are not recovery", () => {
  const text = course();
  assert.match(text, /mechanical agent work, not another PO permission/u);
  assert.match(text, /one independent design review, at most one delta/u);
  assert.match(text, /one final PO decision/u);
  assert.match(text, /DWP-PRESENT-RETIRED/u);
  assert.match(text, /There is no\s+mandatory initial Advisor course/u);
  const retired = inspectDesignCourse({ rootDir: "/nonexistent-root", runner: "codex" });
  assert.deepEqual([retired.ok, retired.code, retired.implementationAuthority], [false, "DESIGN-COURSE-RETIRED", false]);
  assert.equal(retired.hint, RETIRED_DESIGN_ROUTE_HINT);
  assert.match(readFileSync(here("../../scripts/pipeline-state.mjs"), "utf8"), /DWP-PRESENT-RETIRED: use present-plan --review-receipt/u);
});

test("deterministic checks precede model review: a missing receipt chain is a typed, model-free inconsistency; undeclared register arithmetic is never guessed", () => {
  assert.match(course(), /Check explicit machine-checkable rules; do not invent\s+arithmetic from prose/u);
  const entries = reviewChainInconsistencies({ featureId: "f1", receipts: [], currentSources: sources("spec-v1") });
  assert.deepEqual(entries.map((entry) => entry.code), ["DCC-REVIEW-RECEIPT-MISSING"]);
});

test("evidence reuse and current-source binding: an unchanged receipt is reused on retry; changed sources invalidate it", () => {
  const r1 = receipt("spec-v1");
  const receipts = [{ path: "specs/f1/receipt-1.json", bytes: r1.bytes }];
  const first = createDesignApprovalBinding({ featureId: "f1", receipts, currentSources: sources("spec-v1") });
  const retry = createDesignApprovalBinding({ featureId: "f1", receipts, currentSources: sources("spec-v1") });
  assert.equal(first.ok && retry.ok, true);
  assert.equal(first.bindingSha256, retry.bindingSha256);
  const drift = createDesignApprovalBinding({ featureId: "f1", receipts, currentSources: sources("spec-v2") });
  assert.deepEqual([drift.ok, drift.code], [false, "DAB-REVIEW-CHAIN"]);
  assert.match(course(), /The approval binding must be rebuilt after material source or review drift/u);
});

test("bounded course with one final gate: one review receipt builds the single approval request, a third round is refused", () => {
  const r1 = receipt("spec-v1");
  const receipts = [{ path: "specs/f1/receipt-1.json", bytes: r1.bytes }];
  const binding = createDesignApprovalBinding({ featureId: "f1", receipts, currentSources: sources("spec-v1") });
  const request = createDesignApprovalRequest({ binding: binding.binding, candidate: { commit: "a".repeat(40), tree: "b".repeat(40) } });
  assert.equal(request.ok, true);
  assert.equal(verifyDesignApprovalRequest({ request: request.request, featureId: "f1", receipts, currentSources: sources("spec-v1") }).ok, true);
  const r2 = receipt("spec-v2", { path: "specs/f1/receipt-1.json", bytes: r1.bytes });
  const third = createDesignReviewReceipt({
    featureId: "f1", previous: { path: "specs/f1/receipt-2.json", bytes: r2.bytes }, sources: sources("spec-v3"), reviewer,
    report: ref("specs/f1/review-3.md", "r3"), openFindingIds: [], reviewedAt: "2026-10-11T00:00:00.000Z",
  });
  assert.deepEqual([third.ok, third.code], [false, "DRR-ROUND-EXCEEDED"]);
});

test("telemetry (deferred): phase wall time, tool time and human wait are recorded separately", { skip: "deferred by PO 2026-10-16 #2 and decisions D25/D121 (outside 0.7.0, no new schema before the test candidate); owner: Coordinator; follow-up: backlog/items/2026-10-16-design-course-telemetry-is-deferred.md" }, () => {
  const audit = readFileSync(here("../runner-own-session-audit.mjs"), "utf8");
  const onboarding = readFileSync(here("../project-onboarding-v3.mjs"), "utf8");
  assert.doesNotMatch(audit, /phaseWallTime:\s*'unavailable'/u, "phaseWallTime is a hard-coded 'unavailable'");
  assert.match(audit + onboarding, /humanWait/u, "no human-wait field exists in any design-course source");
  assert.match(audit + onboarding, /toolTime/u, "no tool-time field exists in any design-course source");
});
