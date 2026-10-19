// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.critic-round-cap-and-delta-scope-are-not-enforced (AC-142).
// Exercises the real review-economy / critic-course-admission functions; no mocks.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { admitReviewAttempt, CRITIC_DISPATCH_LIMITS, sha256Canonical } from "../review-economy.mjs";
import { deriveCriticCourseAdmission, CriticCourseAdmissionError } from "../critic-course-admission.mjs";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(pluginRoot, rel), "utf8");
const O = (c) => c.repeat(40);
const H = (c) => c.repeat(64);
const p = "src/example.mjs";
const map = { [p]: ["INV-1"] };
const delta = (over = {}) => ({
  round: 2, correctionCommits: 1, requestedMode: "delta",
  base: O("1"), head: O("2"), tree: O("3"),
  changedPaths: [p], changedBehaviorClaims: ["behavior-one"],
  priorReceipt: { id: "receipt-1", sha256: H("4") },
  pathInvariantMap: map, pathInvariantMapSha256: sha256Canonical(map),
  coordinatorImpactConfirmed: true, trustBoundaryChanged: false, impactAmbiguous: false,
  ...over,
});

// Scratch mirror of the production cap check, used only to prove the pin can fail (RED).
const mirrorNoCap = (input) => (input.round === 1
  ? { ok: true, code: "RE-FIRST-FULL" } : { ok: true, code: "RE-DELTA-ADMITTED" });

test("AC1 round counter: round beyond the cap is refused with a typed course-gate code", () => {
  const max = CRITIC_DISPATCH_LIMITS.criticRounds;
  assert.equal(max, 4);
  assert.equal(admitReviewAttempt(delta({ round: max })).ok, true);
  const refused = admitReviewAttempt(delta({ round: max + 1 }));
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "RE-CRITIC-ROUND-LIMIT");
  assert.equal(refused.courseGateRequired, true);
  const corr = admitReviewAttempt(delta({ correctionCommits: 4 }));
  assert.equal(corr.code, "RE-CORRECTION-LIMIT");
  assert.equal(corr.courseGateRequired, true);
});

test("AC1 RED: a mirror without the cap admits the over-cap round, so the pin is meaningful", () => {
  assert.equal(mirrorNoCap(delta({ round: 5 })).ok, true);
  assert.notEqual(admitReviewAttempt(delta({ round: 5 })).ok, mirrorNoCap(delta({ round: 5 })).ok);
});

test("AC1 course derivation computes round from history, never from invented counters", () => {
  const genesis = { history: [], candidate: { base: O("1"), commit: O("2"), tree: O("3") }, correctionCommitsInRange: 0, requestedMode: "full", delta: {} };
  const out = deriveCriticCourseAdmission(genesis);
  assert.equal(out.attempt.round, 1);
  assert.throws(() => deriveCriticCourseAdmission({ ...genesis, round: 3 }),
    (e) => e instanceof CriticCourseAdmissionError && e.code === "CCA-SHAPE");
  assert.throws(() => deriveCriticCourseAdmission({ ...genesis, requestedMode: "delta" }),
    (e) => e instanceof CriticCourseAdmissionError && e.code === "CCA-GENESIS");
});

test("AC2 follow-up must be delta mode with bound base/head/tree range", () => {
  assert.equal(admitReviewAttempt(delta()).code, "RE-DELTA-ADMITTED");
  assert.equal(admitReviewAttempt(delta({ requestedMode: "full" })).code, "RE-FOLLOWUP-DELTA-REQUIRED");
  for (const key of ["base", "head", "tree"]) {
    const r = admitReviewAttempt(delta({ [key]: undefined }));
    assert.equal(r.ok, false, key);
    assert.equal(r.code, "RE-DELTA-BINDINGS-INVALID", key);
  }
  assert.equal(admitReviewAttempt(delta({ base: "not-a-sha" })).code, "RE-DELTA-BINDINGS-INVALID");
});

test("AC2 follow-up wider than the delta is refused (unmapped path, boundary change, ambiguity)", () => {
  const wide = delta({ changedPaths: [p, "src/other.mjs"] });
  assert.equal(admitReviewAttempt(wide).code, "RE-DELTA-UNKNOWN-PATH");
  assert.equal(admitReviewAttempt(delta({ trustBoundaryChanged: true })).code, "RE-DELTA-BINDINGS-INVALID");
  assert.equal(admitReviewAttempt(delta({ impactAmbiguous: true })).code, "RE-DELTA-BINDINGS-INVALID");
  assert.equal(admitReviewAttempt(delta({ pathInvariantMapSha256: H("9") })).code, "RE-DELTA-BINDINGS-INVALID");
});

test("AC2 dispatch preflight carries the typed course-budget refusal", () => {
  const src = read("scripts/critic-dispatch-preflight.mjs");
  assert.match(src, /CDP-COURSE-BUDGET/u);
  assert.match(src, /one full review and at most three correction-DIFF reviews/u);
});

test("AC3 guardrail and Elephant role contract state the delta-only, bounded follow-up rule", () => {
  const qg = read("guardrails/quality-gates.md");
  assert.match(qg, /Four Critic calls total is the maximum/u);
  assert.match(qg, /Correction-only scope/u);
  assert.match(qg, /examines only that immediate correction diff/u);
  assert.match(qg, /Self-verification[^.]*cannot become PASS/u);
  const el = read("roles/elephant.md");
  assert.match(el, /maximum of three correction-diff reviews/u);
});

test("AC1 typed budget refusal names Elephant self-verification or an explicit PO decision as the next step (E3: one number, four calls)", () => {
  const src = read("scripts/critic-dispatch-preflight.mjs");
  assert.match(src, /CDP-COURSE-BUDGET/u);
  assert.match(src, /nextStep: BUDGET_NEXT_STEP/u);
  assert.match(src, /do not dispatch another Critic/u);
  assert.match(src, /Elephant self-verification, which cannot become PASS, or an explicit PO decision/u);
  assert.doesNotMatch(src, /at most one (?:re-review|follow-up)/iu);
});

test("AC3 coordinator next-action text offers the Critic dispatch only with the delta-only batch rule", () => {
  const src = read("scripts/close-coordinator.mjs");
  assert.match(src, /CLOSE-CRITIC-EVIDENCE-MISSING/u);
  assert.match(src, /follow-up = correction-diff Critic only, over the previously reviewed commit to the new candidate/u);
  assert.match(src, /one full review plus at most three correction-diff reviews per declared batch/u);
  assert.match(src, /Elephant self-verification or an explicit PO decision/u);
});
