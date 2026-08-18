#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for the evidence-bound review-retry planner. Every named
 * test below is one bullet of the acceptance boundary in
 * `backlog/items/2026-07-20-evidence-bound-review-retry-economics.md`; bullets
 * with several distinct failure/success shapes get one test per shape rather
 * than one blanket assertion.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ABORT_CLASSIFICATIONS,
  REVIEW_RETRY_PLAN_SCHEMA,
  REVIEW_STAGE_RECEIPT_SCHEMA,
  createReviewAbortEvent,
  isReviewRetryPlan,
  planReviewRetry,
  reviewRetryPlanSha256,
  sealReviewStageReceipt,
  summarizeRetryCost,
  validateReviewRetryPlan,
  validateReviewStageReceipt,
} from "./review-retry-planner.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const candidate = { commit: "1".repeat(40), tree: "2".repeat(40) };
const POLICY = "review-policy.v3";
const ROUTE = { model: "claude-opus-5", effort: "xhigh" };
const COMPLETED_AT = "2026-08-18T00:00:00.000Z";
const EVALUATED_AT = "2026-08-18T00:10:00.000Z";
const WINDOW_MS = 3600000;

const stage = (id, domain, overrides = {}) => ({ id, domain, dependsOn: [], scopeSha256: A, policyVersion: POLICY, route: { ...ROUTE }, assurance: "bounded", ...overrides });
// `readiness` depends on both Critic stages; `intake` is independent and is the
// default aborting stage, so binding drift elsewhere can be observed in isolation.
const STAGES = [
  stage("intake", "intake-surface"),
  stage("critic-guard", "guard-surface"),
  stage("critic-docs", "doc-surface"),
  stage("readiness", "release-surface", { dependsOn: ["critic-docs", "critic-guard"] }),
];

function receiptFor(target, overrides = {}) {
  return sealReviewStageReceipt({
    stage: target.id, domain: target.domain, candidate, scopeSha256: target.scopeSha256, policyVersion: target.policyVersion,
    route: { ...target.route }, assurance: target.assurance, attempt: 0, status: "completed", finding: "none",
    completedAt: COMPLETED_AT, freshnessWindowMs: WINDOW_MS, evidenceSha256: B, ...overrides,
  });
}
const RECEIPTS = Object.fromEntries(STAGES.map((target) => [target.id, receiptFor(target)]));
const abortEvent = () => createReviewAbortEvent({ stage: "intake", classification: "transport", domain: null, evidenceSha256: C, observedAt: "2026-08-18T00:05:00.000Z" });
const infraAbort = (classification = "transport", target = "intake") => createReviewAbortEvent({ stage: target, classification, domain: null, evidenceSha256: C, observedAt: "2026-08-18T00:05:00.000Z" });
const findingAbort = (target, domain) => createReviewAbortEvent({ stage: target, classification: "domain-finding", domain, evidenceSha256: C, observedAt: "2026-08-18T00:05:00.000Z" });

function plan(overrides = {}) {
  return planReviewRetry({ candidate, policyVersion: POLICY, stages: STAGES, receipts: RECEIPTS, abort: abortEvent(), evaluatedAt: EVALUATED_AT, maxAttemptsPerStage: 3, ...overrides });
}
const decisionFor = (result, id) => result.decisions.find((entry) => entry.stage === id);
const codeFor = (result, id) => decisionFor(result, id).code;
const withStage = (id, overrides) => STAGES.map((entry) => (entry.id === id ? { ...entry, ...overrides } : entry));

test("bullet 1a: a retained receipt binds commit and tree, and candidate drift always invalidates -- there is no cross-candidate reuse switch here (ADR-0065 Decision 8's conservative default, made unconditional)", () => {
  const clean = plan();
  assert.deepEqual(clean.retained, ["critic-docs", "critic-guard", "readiness"]);
  const commitDrift = plan({ candidate: { commit: "3".repeat(40), tree: candidate.tree } });
  assert.deepEqual(commitDrift.retained, []);
  assert.equal(codeFor(commitDrift, "critic-docs"), "candidate-drift");
  assert.equal(codeFor(commitDrift, "critic-guard"), "candidate-drift");
  const treeDrift = plan({ candidate: { commit: candidate.commit, tree: "4".repeat(40) } });
  assert.deepEqual(treeDrift.retained, []);
  assert.equal(codeFor(treeDrift, "critic-docs"), "candidate-drift");
  // No caller-supplied option can turn candidate drift off: an unknown option is
  // simply ignored, never honoured, so a future caller cannot re-open the hole
  // ADR-0065 deliberately kept shut for release-bound evidence.
  const attempted = plan({ candidate: { commit: "3".repeat(40), tree: candidate.tree }, allowCrossCandidateReuse: true });
  assert.deepEqual(attempted.retained, []);
  assert.equal(codeFor(attempted, "critic-docs"), "candidate-drift");
});

test("bullet 1b: a retained receipt binds scoped diff/domain, policy version, route and assurance -- drift on ANY single field invalidates that receipt", () => {
  assert.equal(codeFor(plan({ stages: withStage("critic-docs", { domain: "moved-surface" }) }), "critic-docs"), "domain-drift");
  assert.equal(codeFor(plan({ stages: withStage("critic-docs", { scopeSha256: B }) }), "critic-docs"), "scope-drift");
  assert.equal(codeFor(plan({ stages: withStage("critic-docs", { policyVersion: "review-policy.v4" }) }), "critic-docs"), "policy-drift");
  // The current policy version drifting invalidates even when the registration
  // still matches the receipt: both comparisons are load-bearing.
  const policyMoved = planReviewRetry({ candidate, policyVersion: "review-policy.v4", stages: STAGES, receipts: RECEIPTS, abort: abortEvent(), evaluatedAt: EVALUATED_AT, maxAttemptsPerStage: 3 });
  assert.equal(codeFor(policyMoved, "critic-docs"), "policy-drift");
  assert.deepEqual(policyMoved.retained, []);
  assert.equal(codeFor(plan({ stages: withStage("critic-docs", { route: { model: "claude-sonnet-4", effort: "xhigh" } }) }), "critic-docs"), "route-drift");
  assert.equal(codeFor(plan({ stages: withStage("critic-docs", { route: { model: ROUTE.model, effort: "medium" } }) }), "critic-docs"), "route-drift");
  assert.equal(codeFor(plan({ stages: withStage("critic-docs", { assurance: "full" }) }), "critic-docs"), "assurance-drift");
});

test("bullet 1c: a retained receipt must remain within its declared freshness window, and a clock inversion fails closed rather than reading as very fresh", () => {
  assert.equal(decisionFor(plan(), "critic-docs").decision, "retain");
  const expired = plan({ evaluatedAt: "2026-08-18T02:00:00.000Z" });
  assert.equal(codeFor(expired, "critic-docs"), "freshness-expired");
  assert.deepEqual(expired.retained, []);
  // Exactly at the window boundary is still inside it; one millisecond past is not.
  const atBoundary = plan({ evaluatedAt: "2026-08-18T01:00:00.000Z" });
  assert.equal(decisionFor(atBoundary, "critic-docs").decision, "retain");
  const pastBoundary = plan({ evaluatedAt: "2026-08-18T01:00:00.001Z" });
  assert.equal(codeFor(pastBoundary, "critic-docs"), "freshness-expired");
  const inverted = plan({ evaluatedAt: "2026-08-17T23:00:00.000Z" });
  assert.equal(codeFor(inverted, "critic-docs"), "freshness-expired");
  // A per-receipt window, not a global one: a receipt declaring a shorter window
  // expires while its neighbours stay valid.
  const shortWindow = { ...RECEIPTS, "critic-docs": receiptFor(STAGES[2], { freshnessWindowMs: 60000 }) };
  const mixed = plan({ receipts: shortWindow });
  assert.equal(codeFor(mixed, "critic-docs"), "freshness-expired");
  assert.deepEqual(mixed.retained, ["critic-guard"]);
});

test("bullet 1d: a binding mismatch is never partially reused -- it forces the broader rerun through every declared dependent, and a missing or corrupt receipt is never treated as evidence", () => {
  const drifted = plan({ stages: withStage("critic-guard", { scopeSha256: B }) });
  assert.equal(codeFor(drifted, "critic-guard"), "scope-drift");
  assert.equal(codeFor(drifted, "readiness"), "dependency-invalidated");
  assert.equal(decisionFor(drifted, "readiness").dependency, "critic-guard");
  assert.deepEqual(drifted.retained, ["critic-docs"]);
  assert.deepEqual(drifted.rerun, ["critic-guard", "intake", "readiness"]);
  const { "critic-docs": omitted, ...withoutDocs } = RECEIPTS;
  assert.equal(codeFor(plan({ receipts: withoutDocs }), "critic-docs"), "missing-receipt");
  const tampered = { ...RECEIPTS, "critic-docs": { ...RECEIPTS["critic-docs"], scopeSha256: B } };
  assert.equal(codeFor(plan({ receipts: tampered }), "critic-docs"), "corrupt-receipt");
  const misfiled = { ...RECEIPTS, "critic-docs": RECEIPTS["critic-guard"] };
  assert.equal(codeFor(plan({ receipts: misfiled }), "critic-docs"), "stage-identity-drift");
});

test("bullet 2a: a domain finding always reopens its affected domain, however clean that stage's own binding still is, and everything that depends on it", () => {
  const result = plan({ abort: findingAbort("critic-guard", "guard-surface") });
  assert.equal(codeFor(result, "critic-guard"), "domain-finding");
  assert.equal(codeFor(result, "readiness"), "dependency-invalidated");
  assert.equal(decisionFor(result, "readiness").dependency, "critic-guard");
  // The reopened stage's own receipt is perfectly valid and fresh -- it is
  // reopened by the finding, not by any drift. That is the point of this bullet.
  assert.deepEqual(validateReviewStageReceipt(RECEIPTS["critic-guard"]), { ok: true, code: null });
  assert.deepEqual(result.retained, ["critic-docs", "intake"]);
  assert.equal(result.retained.includes("critic-guard"), false);
});

test("bullet 2b: it is the affected DOMAIN that reopens, not merely the stage that reported the finding", () => {
  // The finding surfaces in `intake` but names the doc surface: `critic-docs`
  // reopens because of its domain, `intake` because it is the aborting stage,
  // `readiness` because it depends on `critic-docs`.
  const result = plan({ abort: findingAbort("intake", "doc-surface") });
  assert.equal(codeFor(result, "critic-docs"), "domain-finding");
  assert.equal(codeFor(result, "intake"), "abort-stage");
  assert.equal(codeFor(result, "readiness"), "dependency-invalidated");
  assert.deepEqual(result.retained, ["critic-guard"]);
});

test("bullet 3a: an evidenced infrastructure-only abort (transport, execution or orchestration) retries only the failed stage and retains every other still-valid receipt exactly as-is", () => {
  for (const classification of ["transport", "execution", "orchestration"]) {
    const result = plan({ abort: infraAbort(classification) });
    assert.deepEqual(result.rerun, ["intake"], classification);
    assert.deepEqual(result.retained, ["critic-docs", "critic-guard", "readiness"], classification);
    assert.equal(codeFor(result, "intake"), "abort-stage");
    // "exactly as-is": each retained decision names the digest of the very
    // receipt that was already sealed, so nothing was re-derived or softened.
    for (const id of result.retained) assert.equal(decisionFor(result, id).receiptSha256, RECEIPTS[id].receiptSha256);
  }
});

test("bullet 3b: 'still-valid' is a real qualifier -- an infrastructure abort does not retain a neighbour whose own bindings drifted", () => {
  const result = plan({ abort: infraAbort("execution"), stages: withStage("critic-docs", { scopeSha256: B }) });
  assert.deepEqual(result.retained, ["critic-guard"]);
  assert.equal(codeFor(result, "critic-docs"), "scope-drift");
  assert.equal(codeFor(result, "readiness"), "dependency-invalidated");
});

test("bullet 3c: an infrastructure class must be evidenced and cannot smuggle a domain scope; an unevidenced or unknown cause is representable only as `unclassified`, which fails closed to a full rerun", () => {
  const base = { stage: "intake", domain: null, evidenceSha256: C, observedAt: "2026-08-18T00:05:00.000Z" };
  assert.throws(() => createReviewAbortEvent({ ...base, classification: "transport", evidenceSha256: "not-a-digest" }), /REVIEW-ABORT-EVIDENCE/u);
  assert.throws(() => createReviewAbortEvent({ ...base, classification: "transport", domain: "guard-surface" }), /REVIEW-ABORT-DOMAIN/u);
  assert.throws(() => createReviewAbortEvent({ ...base, classification: "domain-finding" }), /REVIEW-ABORT-DOMAIN/u);
  assert.throws(() => createReviewAbortEvent({ ...base, classification: "flaky" }), /REVIEW-ABORT-CLASSIFICATION/u);
  const unclassified = plan({ abort: createReviewAbortEvent({ ...base, classification: "unclassified" }) });
  assert.deepEqual(unclassified.retained, []);
  assert.deepEqual(unclassified.rerun, ["critic-docs", "critic-guard", "intake", "readiness"]);
  for (const entry of unclassified.decisions) assert.equal(entry.code, "unclassified-abort");
  assert.deepEqual(ABORT_CLASSIFICATIONS, ["transport", "execution", "orchestration", "domain-finding", "unclassified"]);
});

test("bullet 4a: every per-stage reuse/rerun decision is recorded in the returned machine evidence, exactly once per registered stage", () => {
  const result = plan({ abort: findingAbort("critic-guard", "guard-surface") });
  assert.deepEqual(result.decisions.map((entry) => entry.stage), ["critic-docs", "critic-guard", "intake", "readiness"]);
  assert.deepEqual(new Set(result.decisions.map((entry) => entry.decision)), new Set(["retain", "rerun"]));
  assert.equal(result.decisions.length, result.retained.length + result.rerun.length + result.exhausted.length);
  assert.deepEqual(decisionFor(result, "critic-docs"), { stage: "critic-docs", decision: "retain", code: null, dependency: null, attemptsSpent: 0, attemptNext: null, receiptSha256: RECEIPTS["critic-docs"].receiptSha256 });
  assert.deepEqual(decisionFor(result, "readiness"), { stage: "readiness", decision: "rerun", code: "dependency-invalidated", dependency: "critic-guard", attemptsSpent: 0, attemptNext: 1, receiptSha256: null });
  assert.deepEqual(result.cost, { stages: 4, retained: 2, rerun: 2, exhausted: 0, attemptsSpent: 0, attemptsPlanned: 2 });
  assert.deepEqual(validateReviewRetryPlan(result), { ok: true, code: null });
});

test("bullet 4b: attempt counts are bounded and the cost is measurable from the plan alone, without re-running anything", () => {
  const attempts = { intake: 2, "critic-guard": 1 };
  const result = plan({ attempts });
  assert.equal(decisionFor(result, "intake").attemptsSpent, 2);
  assert.equal(decisionFor(result, "intake").attemptNext, 3);
  assert.equal(decisionFor(result, "critic-guard").attemptsSpent, 1);
  assert.equal(result.cost.attemptsSpent, 3);
  assert.equal(result.cost.attemptsPlanned, 1);
  assert.equal(summarizeRetryCost(result), "retry-plan stages=4 retained=3 rerun=1 exhausted=0 attemptsSpent=3 attemptsPlanned=1 abort=transport claimAuthority=none");
});

test("bullet 4c: a stage whose bounded attempt budget is spent is recorded as exhausted with its causal reason kept, never planned for another attempt", () => {
  const spent = plan({ attempts: { intake: 3 }, maxAttemptsPerStage: 3 });
  assert.deepEqual(spent.exhausted, ["intake"]);
  assert.deepEqual(spent.rerun, []);
  assert.equal(decisionFor(spent, "intake").decision, "exhausted");
  assert.equal(decisionFor(spent, "intake").code, "abort-stage");
  assert.equal(decisionFor(spent, "intake").attemptNext, null);
  assert.equal(spent.cost.attemptsPlanned, 0);
  const remaining = plan({ attempts: { intake: 3 }, maxAttemptsPerStage: 4 });
  assert.deepEqual(remaining.rerun, ["intake"]);
  assert.equal(decisionFor(remaining, "intake").attemptNext, 4);
  // An exhausted stage is still not retained, so its dependents stay reopened.
  const exhaustedDependency = plan({ abort: infraAbort("transport", "critic-guard"), attempts: { "critic-guard": 3 }, maxAttemptsPerStage: 3 });
  assert.deepEqual(exhaustedDependency.exhausted, ["critic-guard"]);
  assert.equal(codeFor(exhaustedDependency, "readiness"), "dependency-invalidated");
  assert.throws(() => plan({ maxAttemptsPerStage: 0 }), /attempt bound/u);
  assert.throws(() => plan({ maxAttemptsPerStage: 65 }), /attempt bound/u);
  assert.throws(() => plan({ attempts: { "not-a-stage": 1 } }), /attempt ledger/u);
  assert.throws(() => plan({ attempts: { intake: -1 } }), /attempt ledger/u);
});

test("bullet 5a: a retry plan is structurally not a verdict -- no acceptance vocabulary, no truthy field, and no embedded receipt a consumer could lift an outcome from", () => {
  const result = plan();
  const forbidden = /^(status|verdict|pass|passed|passes|ok|okay|result|outcome|ready|readiness|release|released|approved|conformant|conformance|green|success|succeeded)$/iu;
  const seen = [];
  (function walk(value) {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value !== null && typeof value === "object") { for (const [key, nested] of Object.entries(value)) { seen.push(key); walk(nested); } return; }
    // No plan value is ever boolean `true`, so no truthiness test on any plan
    // field -- present or future -- can read acceptance out of a retry plan.
    assert.notEqual(value, true);
  })(result);
  for (const key of seen) assert.equal(forbidden.test(key), false, key);
  assert.equal(result.claimAuthority, "none");
  assert.equal(result.schema, REVIEW_RETRY_PLAN_SCHEMA);
  // A plan references retained receipts by digest only; no receipt body, and
  // therefore no stage outcome, is reachable through a plan.
  assert.equal(JSON.stringify(result).includes(REVIEW_STAGE_RECEIPT_SCHEMA), false);
  assert.equal(JSON.stringify(result).includes("\"finding\""), false);
  assert.equal(summarizeRetryCost(result).match(forbidden), null);
});

test("bullet 5b: a plan cannot be mutated, re-labelled or re-digested into an acceptance claim", () => {
  const result = plan();
  assert.throws(() => { result.claimAuthority = "granted"; }, TypeError);
  assert.throws(() => { result.retained.push("intake"); }, TypeError);
  // Bolting a verdict field on breaks the exact key set...
  const bolted = { ...result, status: "passed" };
  assert.equal(validateReviewRetryPlan(bolted).code, "REVIEW-PLAN-SHAPE");
  assert.equal(isReviewRetryPlan(bolted), false);
  // ...and re-labelling the claim authority is refused even when the attacker
  // recomputes the digest, because the constant is pinned independently.
  const relabelled = { ...result, claimAuthority: "granted" };
  relabelled.planSha256 = reviewRetryPlanSha256(relabelled);
  assert.equal(validateReviewRetryPlan(relabelled).code, "REVIEW-PLAN-CLAIM");
  // Silently promoting a rerun into the retained list is refused even when the
  // forger also fixes `cost` and recomputes the digest, because the per-stage
  // decisions and the summary lists must agree.
  const promoted = structuredClone(result);
  promoted.rerun = [];
  promoted.retained = ["critic-docs", "critic-guard", "intake", "readiness"];
  promoted.cost = { ...promoted.cost, retained: 4, rerun: 0, attemptsPlanned: 0 };
  promoted.planSha256 = reviewRetryPlanSha256(promoted);
  assert.equal(validateReviewRetryPlan(promoted).code, "REVIEW-PLAN-DECISIONS");
  assert.equal(isReviewRetryPlan(promoted), false);
  assert.equal(isReviewRetryPlan(result), true);
  assert.equal(isReviewRetryPlan({ schema: REVIEW_RETRY_PLAN_SCHEMA }), false);
  assert.throws(() => summarizeRetryCost(bolted), /REVIEW-PLAN-SHAPE/u);
});

test("bullet 5c: a receipt cannot record an interrupted stage or one that produced a finding, so retained evidence can never be retained failure", () => {
  const base = { stage: "intake", domain: "intake-surface", candidate, scopeSha256: A, policyVersion: POLICY, route: { ...ROUTE }, assurance: "bounded", attempt: 0, status: "completed", finding: "none", completedAt: COMPLETED_AT, freshnessWindowMs: WINDOW_MS, evidenceSha256: B };
  assert.throws(() => sealReviewStageReceipt({ ...base, status: "running" }), /REVIEW-RECEIPT-TERMINAL/u);
  assert.throws(() => sealReviewStageReceipt({ ...base, status: "aborted" }), /REVIEW-RECEIPT-TERMINAL/u);
  assert.throws(() => sealReviewStageReceipt({ ...base, finding: "regression" }), /REVIEW-RECEIPT-TERMINAL/u);
  assert.throws(() => sealReviewStageReceipt({ ...base, evidenceSha256: "none" }), /REVIEW-RECEIPT-EVIDENCE/u);
  assert.throws(() => sealReviewStageReceipt({ ...base, freshnessWindowMs: -1 }), /REVIEW-RECEIPT-FRESHNESS/u);
  assert.throws(() => sealReviewStageReceipt({ ...base, candidate: { commit: "1".repeat(41), tree: candidate.tree } }), /REVIEW-RECEIPT-IDENTITY/u);
  assert.throws(() => sealReviewStageReceipt({ ...base, extra: true }), /REVIEW-RECEIPT-SHAPE/u);
  const sealed = sealReviewStageReceipt(base);
  assert.equal(validateReviewStageReceipt({ ...sealed, assurance: "full" }).code, "REVIEW-RECEIPT-DIGEST");
  assert.throws(() => { sealed.finding = "regression"; }, TypeError);
});

test("bullet 6: the planner is deterministic and closed over its registration -- identical inputs give an identical plan digest, and an invalid registration is refused rather than half-planned", () => {
  const first = plan();
  const second = plan();
  assert.equal(first.planSha256, second.planSha256);
  assert.deepEqual(first, second);
  assert.equal(reviewRetryPlanSha256(first), first.planSha256);
  const before = structuredClone({ STAGES, RECEIPTS });
  plan({ abort: findingAbort("critic-guard", "guard-surface"), attempts: { intake: 1 } });
  assert.deepEqual(structuredClone({ STAGES, RECEIPTS }), before);
  assert.throws(() => plan({ stages: [] }), /stage registration/u);
  assert.throws(() => plan({ stages: [stage("intake", "a"), stage("intake", "b")] }), /stage registration/u);
  assert.throws(() => plan({ stages: [stage("intake", "a", { dependsOn: ["ghost"] })] }), /dependency registration/u);
  assert.throws(() => plan({ stages: [stage("intake", "a", { dependsOn: ["intake"] })] }), /dependency registration/u);
  assert.throws(() => plan({ stages: [stage("alpha", "a", { dependsOn: ["beta"] }), stage("beta", "b", { dependsOn: ["alpha"] })] }), /cycle/u);
  assert.throws(() => plan({ stages: [stage("beta", "b"), stage("alpha", "a", { dependsOn: ["beta", "beta"] })] }), /stage registration/u);
  assert.throws(() => plan({ abort: infraAbort("transport", "unregistered-stage") }), /unregistered stage/u);
  assert.throws(() => plan({ evaluatedAt: "not-a-time" }), /retry context/u);
  assert.throws(() => plan({ candidate: { commit: "zz", tree: candidate.tree } }), /retry context/u);
});

test("bullet 7: the module is a pure function set -- no filesystem, network, process or ambient-clock reach, and no dependency on the Verify/Critic runtime", () => {
  const source = readFileSync(fileURLToPath(new URL("./review-retry-planner.mjs", import.meta.url)), "utf8");
  const imports = [...source.matchAll(/^import\s.*?from\s+"([^"]+)";$/gmu)].map((match) => match[1]);
  assert.deepEqual(imports, ["node:crypto"]);
  for (const forbidden of ["node:fs", "node:child_process", "node:net", "node:http", "node:process", "Date.now(", "process.env", "process.argv", "spawnSync", "readFileSync", "writeFileSync", "fetch("]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  // The import list above is the real proof that no live call site is reachable
  // from here (the header comment names them only to say it is NOT wired to
  // them). What that regex cannot see is a dynamic or CommonJS load, so those
  // are excluded separately.
  for (const loader of ["require(", "import(", "createRequire", "process.binding"]) assert.equal(source.includes(loader), false, loader);
});
