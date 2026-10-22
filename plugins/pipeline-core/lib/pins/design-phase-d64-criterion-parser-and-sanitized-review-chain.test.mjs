// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.design-phase-runs-critic-advisor-and-readiness-instead-of-one-review, D64 clauses
// (2026-10-20 Codex WSL greenfield, second run): (1) the Spec's acceptance criteria are located with the
// parser that registration and dispatch use BEFORE present-plan; (2) the review chain counts spent rounds
// independently of file names, and a sanitized report does not reset the count.
//
// Honest scope. The parser and the round counter are real and driven here. The present-plan refusal and the
// sanitized-report digest pair are NOT implemented in this tree (present-plan lives in the protected
// scripts/pipeline-state.mjs; design-review-receipt.mjs carries no original/published digest). Those two
// clauses are therefore counted as `todo` with a typed reason, never as a pass and never as a skip.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { isCriterionId, scanAcceptedCriterionRows } from "../critic-accepted-contract.mjs";
import { DESIGN_REVIEW_MAX_ROUNDS, createDesignReviewReceipt } from "../design-review-receipt.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");
const ref = (path, text) => ({ path, sha256: sha(text) });
const sources = (specText) => ({ prd: ref("specs/f1/prd.md", "prd"), spec: ref("specs/f1/spec.md", specText), companions: [] });
const reviewer = { runner: "claude", model: "claude-sonnet-5-5" };
const PENDING = "implementation-pending: D64 clause not implemented in this tree; owner Coordinator, due 2026-11-04 (needs a protected pipeline-state.mjs / guard step, PO ceremony)";

const specWith = (table) => `# Spec\n\n## Acceptance criteria\n\n${table}\n`;
const FOUR_COLUMN = specWith("| ID | Criterion | Test | Status |\n| --- | --- | --- | --- |\n| AC-1 | The thing works | t.test.mjs | open |");
const THREE_COLUMN = specWith("| # | Criterion | Evidence |\n| --- | --- | --- |\n| AC-1 | The thing works | t.test.mjs |");
const LEADING_ZERO = specWith("| # | Criterion | Evidence |\n| --- | --- | --- |\n| AC-01 | A leading-zero id | t.test.mjs |");
const TWO_COLUMN = specWith("| # | Criterion |\n| --- | --- |\n| 1 | The thing works |");

function receipt(specText, previous, name, ids = []) {
  const made = createDesignReviewReceipt({
    featureId: "f1", previous, sources: sources(specText), reviewer, report: ref(name, name),
    openFindingIds: ids, reviewedAt: "2026-10-10T00:00:00.000Z",
  });
  assert.equal(made.ok, true, JSON.stringify(made));
  return made;
}

test("D64 criterion parser: the supported shapes locate their rows (control for the refusals below)", () => {
  assert.deepEqual(scanAcceptedCriterionRows(THREE_COLUMN).map((row) => row.id), ["AC-1"]);
  assert.deepEqual(scanAcceptedCriterionRows(TWO_COLUMN).map((row) => row.id), ["AC-1"]);
  assert.equal(isCriterionId("AC-1"), true);
});

test("D64 criterion parser: the four-column table of the greenfield run locates no criterion", () => {
  assert.deepEqual(scanAcceptedCriterionRows(FOUR_COLUMN), []);
});

test("D64 criterion parser: a leading-zero id is not a criterion id and its row is not located", () => {
  assert.equal(isCriterionId("AC-01"), false);
  assert.equal(isCriterionId("AC-0"), false);
  assert.deepEqual(scanAcceptedCriterionRows(LEADING_ZERO), []);
});

test("D64 criterion parser (RED mirror): the located-row check is meaningful, a shape the parser supports is distinguishable from the unsupported one", () => {
  assert.notDeepEqual(scanAcceptedCriterionRows(THREE_COLUMN), scanAcceptedCriterionRows(FOUR_COLUMN));
});

test("D64 review chain: the spent-round count follows the chain, not the file names; a third round is refused under any name", () => {
  assert.equal(DESIGN_REVIEW_MAX_ROUNDS, 2);
  const r1 = receipt("spec-v1", null, "specs/f1/report-a.md", ["F-ONE"]);
  const r2 = receipt("spec-v2", { path: "specs/f1/anything-but-round-two.json", bytes: r1.bytes }, "specs/f1/report-b.md");
  assert.deepEqual([r2.receipt.kind, r2.receipt.round], ["delta", 2]);
  const third = createDesignReviewReceipt({
    featureId: "f1", previous: { path: "specs/f1/receipt-1.json", bytes: r2.bytes }, sources: sources("spec-v3"), reviewer,
    report: ref("specs/f1/report-c.md", "c"), openFindingIds: [], reviewedAt: "2026-10-11T00:00:00.000Z",
  });
  assert.deepEqual([third.ok, third.code], [false, "DRR-ROUND-EXCEEDED"]);
});

test("D64 review chain (RED mirror): a producer given a predecessor derives round 2 from the chain, the caller cannot label it 'initial'", () => {
  const r1 = receipt("spec-v1", null, "specs/f1/report-a.md");
  const forged = JSON.parse(Buffer.from(r1.bytes).toString("utf8"));
  assert.equal(forged.round, 1);
  assert.equal(forged.kind, "initial");
  const mislabelled = createDesignReviewReceipt({
    featureId: "f1", previous: { path: "specs/f1/receipt-1.json", bytes: r1.bytes }, sources: sources("spec-v2"), reviewer,
    report: ref("specs/f1/report-b.md", "b"), openFindingIds: [], reviewedAt: "2026-10-10T00:00:00.000Z",
  });
  assert.equal(mislabelled.ok, true);
  assert.equal(mislabelled.receipt.round, 2, "the producer derives round 2 from the chain; the caller cannot pick 'initial'");
});

test("D64 present-plan: an unsupported criterion shape or id is refused before present-plan with the supported shapes named", { todo: PENDING }, () => {
  assert.fail("present-plan accepts a Spec whose criteria the registration parser cannot locate (observed CAC-CRITERION-UNSUPPORTED only at dispatch)");
});

test("D64 review chain: a sanitized report binds the original and the published digest and a delta after a formal correction needs no budget exception", { todo: PENDING }, () => {
  assert.fail("design-review-receipt.mjs records one report digest only; no original/published digest pair exists");
});
