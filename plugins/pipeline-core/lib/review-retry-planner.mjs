// SPDX-License-Identifier: SUL-1.0
/**
 * Deterministic, evidence-bound review-retry planner.
 *
 * Backlog item `pipeline.evidence-bound-review-retry-economics`
 * (`backlog/items/2026-07-20-evidence-bound-review-retry-economics.md`): given
 * prior stage receipts and one new abort event, decide which receipts are still
 * valid to reuse and which stages must rerun, so that a review/dispatch abort
 * stops forcing a broad repeat of stages whose evidence never became stale.
 *
 * STANDALONE BY CONSTRUCTION. This module is the mechanism only. It is
 * deliberately not wired into Verify, Critic admission, the aggregate Verify
 * entry point, or `publication-executor.mjs`; live wiring is a separate,
 * later, separately-triaged package (item Triage, 2026-08-18). Everything here is a
 * pure function of its arguments: no filesystem, no network, no process state,
 * and no ambient clock -- `evaluatedAt` is injected by the caller, which is what
 * makes the freshness-window rule testable without a live policy/clock source.
 * The only import is `node:crypto`'s hash, exactly as in the two style
 * precedents (`verify-resume.mjs`, `execution-plane-contract.mjs`).
 *
 * Relationship to `verify-resume.mjs` (deliberate similarity) and to ADR-0065
 * (deliberate difference). The binding-field-comparison shape below is modelled
 * on `firstDrift`/`planVerifyResume`: a current registration states what a stage
 * must bind now, a prior receipt records what it bound then, one closed set of
 * typed drift codes explains every difference, and invalidation propagates
 * through declared dependents to a fixpoint. The difference is that ADR-0065
 * gave `verify-resume.mjs` a Tier-B path where candidate drift can be skipped
 * behind an explicit `allowCrossCandidateReuse` opt-in. **This planner has no
 * such switch and must never grow one**: its own acceptance boundary lists
 * candidate drift first among the things that invalidate dependent receipts, and
 * ADR-0065's Decision 8 kept even the Verify flag defaulted off with
 * push/release-bound runs forcing full re-execution. A review receipt is closer
 * to the release-bound case than to the working-run case, so the conservative
 * reading is the only one implemented here.
 *
 * WHAT THIS MODULE STRUCTURALLY IS NOT. A retry plan is a statement about what
 * to do next. It is never a Critic PASS, a readiness statement, a release
 * authorization or a conformance claim, and the shape is built so it cannot be
 * mistaken for one even by careless code:
 *
 *   1. A plan carries no verdict vocabulary at all -- no `status`, `verdict`,
 *      `passed`, `ok`, `result`, `ready`, `release` or `conformant` key.
 *   2. No value anywhere in a plan is boolean `true`, so no truthiness test on
 *      any plan field can read acceptance out of it.
 *   3. `claimAuthority` is pinned to the constant `"none"`, is covered by the
 *      plan's self-digest, and is re-checked by `validateReviewRetryPlan`.
 *   4. A plan never embeds a receipt. A retained stage is reported as a stage
 *      id, a reason and the retained receipt's digest -- never as that stage's
 *      outcome -- so no consumer can lift "this stage was clean" out of a plan.
 *   5. `isReviewRetryPlan` is exported so an acceptance-consuming call site can
 *      positively refuse a retry plan handed to it in place of real evidence.
 *
 * A receipt is equally constrained: `status` is pinned to `"completed"` and
 * `finding` to `"none"`, so an interrupted stage and a stage that produced a
 * domain finding both have NO representable sealed receipt. Retaining receipts
 * therefore cannot retain a failure -- the failure has nowhere to live.
 */
import { createHash } from "node:crypto";

export const REVIEW_STAGE_RECEIPT_SCHEMA = "pipeline.review-stage-receipt.v1";
export const REVIEW_ABORT_EVENT_SCHEMA = "pipeline.review-abort-event.v1";
export const REVIEW_RETRY_PLAN_SCHEMA = "pipeline.review-retry-plan.v1";

/** A retry plan grants no authority of any kind; pinned, digested, re-validated. */
export const REVIEW_RETRY_PLAN_CLAIM_AUTHORITY = "none";

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_STAGES = 256;
const MAX_ATTEMPT_BOUND = 64;
const MAX_ATTEMPTS_SPENT = 4096;

// Always type-guard before matching. `RegExp.prototype.test` coerces its
// argument, so a bare `ID.test(value)` accepts `null` (it matches the coerced
// string "null") -- which is exactly how a `domain-finding` abort carrying no
// domain slipped past validation until this suite caught it. Every identifier,
// digest and object-id check in this module goes through these three.
const isId = (value) => typeof value === "string" && ID.test(value);
const isSha256 = (value) => typeof value === "string" && SHA256.test(value);
const isOid = (value) => typeof value === "string" && OID.test(value);

/**
 * The closed abort vocabulary. The item requires the abort evidence to classify
 * a failure "as transport, execution, or orchestration rather than a domain
 * finding"; `unclassified` is the fifth member added here on purpose, and it
 * only ever fails closed. It is how an abort with no usable classification
 * evidence is represented, so that a caller who does not know the cause is never
 * pushed into naming an infrastructure class it cannot evidence -- which is the
 * exact way a cheap single-stage retry would otherwise be obtained fraudulently.
 * An `unclassified` abort reruns every stage.
 */
export const ABORT_CLASSIFICATIONS = Object.freeze([
  "transport",
  "execution",
  "orchestration",
  "domain-finding",
  "unclassified",
]);
const INFRASTRUCTURE_CLASSIFICATIONS = new Set(["transport", "execution", "orchestration"]);

/** Closed set of reasons a stage is not retained. An unregistered reason is a programming error. */
export const RETRY_REASONS = Object.freeze([
  "missing-receipt",
  "corrupt-receipt",
  "stage-identity-drift",
  "candidate-drift",
  "domain-drift",
  "scope-drift",
  "policy-drift",
  "route-drift",
  "assurance-drift",
  "freshness-expired",
  "domain-finding",
  "abort-stage",
  "unclassified-abort",
  "dependency-invalidated",
]);
const REASON_SET = new Set(RETRY_REASONS);

const RECEIPT_KEYS = ["schema", "stage", "domain", "candidate", "scopeSha256", "policyVersion", "route", "assurance", "attempt", "status", "finding", "completedAt", "freshnessWindowMs", "evidenceSha256", "receiptSha256"];
const ABORT_KEYS = ["schema", "stage", "classification", "domain", "evidenceSha256", "observedAt"];
const STAGE_KEYS = ["id", "domain", "dependsOn", "scopeSha256", "policyVersion", "route", "assurance"];
const PLAN_KEYS = ["schema", "candidate", "evaluatedAt", "policyVersion", "abort", "claimAuthority", "retained", "rerun", "exhausted", "decisions", "cost", "planSha256"];
const DECISION_KEYS = ["stage", "decision", "code", "dependency", "attemptsSpent", "attemptNext", "receiptSha256"];
const COST_KEYS = ["stages", "retained", "rerun", "exhausted", "attemptsSpent", "attemptsPlanned"];

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Canonical, key-order-independent digest -- the same construction the Verify receipts use. */
export function digestReviewJson(value) { return createHash("sha256").update(canonical(value), "utf8").digest("hex"); }

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function candidateShape(value) { return exact(value, ["commit", "tree"]) && isOid(value.commit) && isOid(value.tree); }
function routeShape(value) { return exact(value, ["model", "effort"]) && isId(value.model) && isId(value.effort); }
function iso(value) { if (typeof value !== "string") return false; const time = Date.parse(value); return Number.isFinite(time) && new Date(time).toISOString() === value; }
function sortedUniqueIds(values) { return Array.isArray(values) && values.length <= MAX_STAGES && values.every((value, index) => isId(value) && (index === 0 || values[index - 1] < value)); }
function sameRoute(left, right) { return left.model === right.model && left.effort === right.effort; }

/** A stage registration states what a stage must bind NOW (counterpart to `validSuite`). */
export function validReviewStage(stage) {
  return exact(stage, STAGE_KEYS)
    && isId(stage.id)
    && isId(stage.domain)
    && sortedUniqueIds(stage.dependsOn)
    && isSha256(stage.scopeSha256)
    && isId(stage.policyVersion)
    && routeShape(stage.route)
    && isId(stage.assurance);
}

export function reviewStageReceiptSha256(receipt) { const { receiptSha256: omitted, ...body } = receipt ?? {}; return digestReviewJson(body); }

/**
 * A receipt exists only for a stage that terminated cleanly. `status` and
 * `finding` are pinned constants rather than free fields: an interrupted stage
 * and a stage that produced a domain finding are both unrepresentable here, by
 * construction, which is why "retained evidence" can never mean "retained
 * failure".
 */
export function validateReviewStageReceipt(receipt) {
  if (!exact(receipt, RECEIPT_KEYS) || receipt.schema !== REVIEW_STAGE_RECEIPT_SCHEMA) return { ok: false, code: "REVIEW-RECEIPT-SHAPE" };
  if (!isId(receipt.stage) || !isId(receipt.domain) || !candidateShape(receipt.candidate)) return { ok: false, code: "REVIEW-RECEIPT-IDENTITY" };
  if (!isSha256(receipt.scopeSha256) || !isId(receipt.policyVersion) || !routeShape(receipt.route) || !isId(receipt.assurance)) return { ok: false, code: "REVIEW-RECEIPT-BINDING" };
  if (receipt.status !== "completed" || receipt.finding !== "none") return { ok: false, code: "REVIEW-RECEIPT-TERMINAL" };
  if (!Number.isSafeInteger(receipt.attempt) || receipt.attempt < 0 || receipt.attempt > MAX_ATTEMPTS_SPENT) return { ok: false, code: "REVIEW-RECEIPT-ATTEMPT" };
  if (!iso(receipt.completedAt) || !Number.isSafeInteger(receipt.freshnessWindowMs) || receipt.freshnessWindowMs < 0) return { ok: false, code: "REVIEW-RECEIPT-FRESHNESS" };
  if (!isSha256(receipt.evidenceSha256)) return { ok: false, code: "REVIEW-RECEIPT-EVIDENCE" };
  if (!isSha256(receipt.receiptSha256) || reviewStageReceiptSha256(receipt) !== receipt.receiptSha256) return { ok: false, code: "REVIEW-RECEIPT-DIGEST" };
  return { ok: true, code: null };
}

export function sealReviewStageReceipt(fields) {
  const receipt = { schema: REVIEW_STAGE_RECEIPT_SCHEMA, ...structuredClone(fields), receiptSha256: "0".repeat(64) };
  receipt.receiptSha256 = reviewStageReceiptSha256(receipt);
  const checked = validateReviewStageReceipt(receipt);
  if (!checked.ok) throw new TypeError(checked.code);
  return freeze(receipt);
}

/**
 * An abort event. `evidenceSha256` is mandatory for every classification: the
 * item admits only an *evidenced* infrastructure-only abort onto the cheap
 * single-stage path, so an unevidenced claim of `transport`/`execution`/
 * `orchestration` has no representation at all -- it is `unclassified`, and
 * `unclassified` reruns everything. `domain` is required exactly for
 * `domain-finding` and forbidden for every other classification, so an
 * infrastructure abort cannot smuggle a domain scope with it.
 */
export function validateReviewAbortEvent(abort) {
  if (!exact(abort, ABORT_KEYS) || abort.schema !== REVIEW_ABORT_EVENT_SCHEMA) return { ok: false, code: "REVIEW-ABORT-SHAPE" };
  if (!isId(abort.stage) || !ABORT_CLASSIFICATIONS.includes(abort.classification)) return { ok: false, code: "REVIEW-ABORT-CLASSIFICATION" };
  const needsDomain = abort.classification === "domain-finding";
  if (needsDomain ? !isId(abort.domain) : abort.domain !== null) return { ok: false, code: "REVIEW-ABORT-DOMAIN" };
  if (!isSha256(abort.evidenceSha256) || !iso(abort.observedAt)) return { ok: false, code: "REVIEW-ABORT-EVIDENCE" };
  return { ok: true, code: null };
}

export function createReviewAbortEvent(fields) {
  const abort = { schema: REVIEW_ABORT_EVENT_SCHEMA, ...structuredClone(fields) };
  const checked = validateReviewAbortEvent(abort);
  if (!checked.ok) throw new TypeError(checked.code);
  return freeze(abort);
}

/**
 * The first binding difference between what a stage must bind now and what its
 * prior receipt bound, in one fixed documented order. Every listed field is a
 * hard invalidator: there is no partial or best-effort reuse across a binding
 * mismatch, and `candidate` is checked before the narrower fields precisely
 * because it is the one the item names first and the one ADR-0065 showed is
 * dangerous to make optional.
 */
function firstBindingDrift(stage, receipt, context) {
  const valid = validateReviewStageReceipt(receipt);
  if (!valid.ok) return "corrupt-receipt";
  if (receipt.stage !== stage.id) return "stage-identity-drift";
  if (receipt.candidate.commit !== context.candidate.commit || receipt.candidate.tree !== context.candidate.tree) return "candidate-drift";
  if (receipt.domain !== stage.domain) return "domain-drift";
  if (receipt.scopeSha256 !== stage.scopeSha256) return "scope-drift";
  if (receipt.policyVersion !== stage.policyVersion || receipt.policyVersion !== context.policyVersion) return "policy-drift";
  if (!sameRoute(receipt.route, stage.route)) return "route-drift";
  if (receipt.assurance !== stage.assurance) return "assurance-drift";
  const completed = Date.parse(receipt.completedAt);
  const evaluated = Date.parse(context.evaluatedAt);
  // A clock inversion (evaluated before completed) is not treated as "very
  // fresh"; it fails closed exactly like an expired window.
  if (!(evaluated >= completed) || evaluated - completed > receipt.freshnessWindowMs) return "freshness-expired";
  return null;
}

function assertRegistration(stages, attempts, abort) {
  if (!Array.isArray(stages) || stages.length === 0 || stages.length > MAX_STAGES) throw new TypeError("Review stage registration is invalid");
  const ids = new Set();
  for (const stage of stages) {
    if (!validReviewStage(stage) || ids.has(stage.id)) throw new TypeError("Review stage registration is invalid");
    ids.add(stage.id);
  }
  for (const stage of stages) if (stage.dependsOn.some((id) => !ids.has(id) || id === stage.id)) throw new TypeError("Review stage dependency registration is invalid");
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  function visit(id) {
    if (visiting.has(id)) throw new TypeError("Review stage dependency cycle is invalid");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const stage of stages) visit(stage.id);
  if (!object(attempts)) throw new TypeError("Review attempt ledger is invalid");
  for (const [id, spent] of Object.entries(attempts)) {
    if (!ids.has(id) || !Number.isSafeInteger(spent) || spent < 0 || spent > MAX_ATTEMPTS_SPENT) throw new TypeError("Review attempt ledger is invalid");
  }
  if (!ids.has(abort.stage)) throw new TypeError("Review abort event names an unregistered stage");
  return ids;
}

export function reviewRetryPlanSha256(plan) { const { planSha256: omitted, ...body } = plan ?? {}; return digestReviewJson(body); }

/**
 * Plans one retry.
 *
 * @param {{commit: string, tree: string}} candidate   the CURRENT candidate.
 * @param {string} policyVersion                       the CURRENT review policy version.
 * @param {object[]} stages                            the current stage registration.
 * @param {object} receipts                            stage id -> sealed prior receipt.
 * @param {object} abort                               the new abort event.
 * @param {string} evaluatedAt                         injected ISO evaluation time (no ambient clock).
 * @param {number} maxAttemptsPerStage                 the hard per-stage attempt bound.
 * @param {object} attempts                            stage id -> attempts already spent.
 * @returns {object} a frozen, self-digested retry plan that is not, and cannot be read as, a verdict.
 */
export function planReviewRetry({ candidate, policyVersion, stages, receipts = {}, abort, evaluatedAt, maxAttemptsPerStage, attempts = {} }) {
  if (!candidateShape(candidate) || !isId(policyVersion) || !iso(evaluatedAt)) throw new TypeError("Review retry context is invalid");
  if (!Number.isSafeInteger(maxAttemptsPerStage) || maxAttemptsPerStage < 1 || maxAttemptsPerStage > MAX_ATTEMPT_BOUND) throw new TypeError("Review attempt bound is invalid");
  const checkedAbort = validateReviewAbortEvent(abort);
  if (!checkedAbort.ok) throw new TypeError(checkedAbort.code);
  if (!object(receipts)) throw new TypeError("Review receipt set is invalid");
  assertRegistration(stages, attempts, abort);

  const context = { candidate, policyVersion, evaluatedAt };
  const codes = new Map();
  const dependencies = new Map();
  for (const stage of stages) {
    let code;
    if (abort.classification === "unclassified") {
      // Fail closed: an abort whose cause is not evidenced buys no reuse at all.
      code = "unclassified-abort";
    } else if (abort.classification === "domain-finding" && stage.domain === abort.domain) {
      // A real defect always reopens its whole domain, however clean this
      // stage's own binding still looks. Never silently retained.
      code = "domain-finding";
    } else if (stage.id === abort.stage) {
      // The stage that actually aborted always reruns. For an evidenced
      // infrastructure-only abort this is the ONLY stage the abort itself
      // invalidates; every other stage is judged purely on its own bindings.
      code = "abort-stage";
    } else if (!Object.hasOwn(receipts, stage.id) || receipts[stage.id] === undefined) {
      code = "missing-receipt";
    } else {
      code = firstBindingDrift(stage, receipts[stage.id], context);
    }
    codes.set(stage.id, code);
    dependencies.set(stage.id, null);
  }

  // Invalidation propagates to every declared dependent, to a fixpoint: a stage
  // whose input was reopened cannot keep its own receipt either.
  let changed = true;
  while (changed) {
    changed = false;
    for (const stage of stages) {
      if (codes.get(stage.id) !== null) continue;
      const dependency = stage.dependsOn.find((id) => codes.get(id) !== null);
      if (dependency !== undefined) { codes.set(stage.id, "dependency-invalidated"); dependencies.set(stage.id, dependency); changed = true; }
    }
  }

  const decisions = [];
  const retained = [];
  const rerun = [];
  const exhausted = [];
  let attemptsSpentTotal = 0;
  for (const stage of stages) {
    const code = codes.get(stage.id);
    const spent = Object.hasOwn(attempts, stage.id) ? attempts[stage.id] : 0;
    attemptsSpentTotal += spent;
    if (code === null) {
      retained.push(stage.id);
      decisions.push({ stage: stage.id, decision: "retain", code: null, dependency: null, attemptsSpent: spent, attemptNext: null, receiptSha256: receipts[stage.id].receiptSha256 });
      continue;
    }
    if (!REASON_SET.has(code)) throw new TypeError("Review retry reason is not registered");
    // The attempt bound is what makes retrying terminate. A stage that must
    // rerun with its budget already spent is reported as `exhausted`, keeping
    // its causal reason, rather than being planned for an attempt the policy
    // does not allow.
    const decision = spent >= maxAttemptsPerStage ? "exhausted" : "rerun";
    (decision === "rerun" ? rerun : exhausted).push(stage.id);
    decisions.push({ stage: stage.id, decision, code, dependency: dependencies.get(stage.id), attemptsSpent: spent, attemptNext: decision === "rerun" ? spent + 1 : null, receiptSha256: null });
  }

  const plan = {
    schema: REVIEW_RETRY_PLAN_SCHEMA,
    candidate: { commit: candidate.commit, tree: candidate.tree },
    evaluatedAt,
    policyVersion,
    abort: { stage: abort.stage, classification: abort.classification, domain: abort.domain, evidenceSha256: abort.evidenceSha256, observedAt: abort.observedAt },
    claimAuthority: REVIEW_RETRY_PLAN_CLAIM_AUTHORITY,
    retained: retained.sort(),
    rerun: rerun.sort(),
    exhausted: exhausted.sort(),
    // Code-unit ordering, not `localeCompare`: it must agree exactly with the
    // plain `.sort()` used for the three summary lists and with the strict
    // ordering `validateReviewRetryPlan` enforces, or a legitimate plan could
    // fail its own validation for ids like "a-b" versus "ab".
    decisions: decisions.sort((left, right) => (left.stage < right.stage ? -1 : 1)),
    cost: { stages: stages.length, retained: retained.length, rerun: rerun.length, exhausted: exhausted.length, attemptsSpent: attemptsSpentTotal, attemptsPlanned: rerun.length },
    planSha256: "0".repeat(64),
  };
  plan.planSha256 = reviewRetryPlanSha256(plan);
  const checked = validateReviewRetryPlan(plan);
  if (!checked.ok) throw new TypeError(checked.code);
  return freeze(plan);
}

/**
 * Re-validates a plan. Because the key set is exact and the digest covers every
 * field, a plan that has had a verdict-shaped field bolted onto it -- the exact
 * misuse the item's last acceptance bullet forbids -- fails here rather than
 * being carried onward as if it were evidence.
 */
export function validateReviewRetryPlan(plan) {
  if (!exact(plan, PLAN_KEYS) || plan.schema !== REVIEW_RETRY_PLAN_SCHEMA) return { ok: false, code: "REVIEW-PLAN-SHAPE" };
  if (plan.claimAuthority !== REVIEW_RETRY_PLAN_CLAIM_AUTHORITY) return { ok: false, code: "REVIEW-PLAN-CLAIM" };
  if (!candidateShape(plan.candidate) || !iso(plan.evaluatedAt) || !isId(plan.policyVersion)) return { ok: false, code: "REVIEW-PLAN-CONTEXT" };
  if (!exact(plan.abort, ["stage", "classification", "domain", "evidenceSha256", "observedAt"]) || !ABORT_CLASSIFICATIONS.includes(plan.abort.classification)) return { ok: false, code: "REVIEW-PLAN-ABORT" };
  if (![plan.retained, plan.rerun, plan.exhausted].every((list) => sortedUniqueIds(list))) return { ok: false, code: "REVIEW-PLAN-SETS" };
  if (!Array.isArray(plan.decisions) || plan.decisions.length !== plan.retained.length + plan.rerun.length + plan.exhausted.length) return { ok: false, code: "REVIEW-PLAN-DECISIONS" };
  for (const [index, decision] of plan.decisions.entries()) {
    if (!exact(decision, DECISION_KEYS) || !isId(decision.stage) || !["retain", "rerun", "exhausted"].includes(decision.decision)) return { ok: false, code: "REVIEW-PLAN-DECISIONS" };
    // The three summary lists and the per-stage decisions must agree exactly and
    // be strictly ordered. Without this, a forged plan could move a stage from
    // `rerun` into `retained`, recompute `cost` AND recompute the digest, and
    // still validate -- the summary lists are what a careless consumer reads.
    if (index > 0 && plan.decisions[index - 1].stage >= decision.stage) return { ok: false, code: "REVIEW-PLAN-DECISIONS" };
    const list = decision.decision === "retain" ? plan.retained : decision.decision === "rerun" ? plan.rerun : plan.exhausted;
    if (!list.includes(decision.stage)) return { ok: false, code: "REVIEW-PLAN-DECISIONS" };
    if (decision.decision === "retain" ? decision.code !== null || !isSha256(decision.receiptSha256) : !REASON_SET.has(decision.code) || decision.receiptSha256 !== null) return { ok: false, code: "REVIEW-PLAN-DECISIONS" };
    if (!Number.isSafeInteger(decision.attemptsSpent) || decision.attemptsSpent < 0) return { ok: false, code: "REVIEW-PLAN-ATTEMPTS" };
    if (decision.decision === "rerun" ? decision.attemptNext !== decision.attemptsSpent + 1 : decision.attemptNext !== null) return { ok: false, code: "REVIEW-PLAN-ATTEMPTS" };
    if (!(decision.dependency === null || isId(decision.dependency))) return { ok: false, code: "REVIEW-PLAN-DECISIONS" };
  }
  if (!exact(plan.cost, COST_KEYS) || !COST_KEYS.every((key) => Number.isSafeInteger(plan.cost[key]) && plan.cost[key] >= 0)) return { ok: false, code: "REVIEW-PLAN-COST" };
  if (plan.cost.retained !== plan.retained.length || plan.cost.rerun !== plan.rerun.length || plan.cost.exhausted !== plan.exhausted.length || plan.cost.attemptsPlanned !== plan.rerun.length) return { ok: false, code: "REVIEW-PLAN-COST" };
  if (!isSha256(plan.planSha256) || reviewRetryPlanSha256(plan) !== plan.planSha256) return { ok: false, code: "REVIEW-PLAN-DIGEST" };
  return { ok: true, code: null };
}

/**
 * Positive identification, exported so that a call site which expects real
 * acceptance evidence can REFUSE a retry plan handed to it instead. This is the
 * fifth structural defence listed in this module's header: the other four make a
 * plan unreadable as a verdict, this one lets a consumer say so out loud.
 */
export function isReviewRetryPlan(value) { return object(value) && value.schema === REVIEW_RETRY_PLAN_SCHEMA && validateReviewRetryPlan(value).ok; }

/**
 * The one-line audit summary of a plan's retry economics, for logs and evidence
 * artifacts. Deliberately contains no stage outcome and no verdict word.
 */
export function summarizeRetryCost(plan) {
  if (!isReviewRetryPlan(plan)) throw new TypeError("REVIEW-PLAN-SHAPE");
  const { stages, retained, rerun, exhausted, attemptsSpent, attemptsPlanned } = plan.cost;
  return `retry-plan stages=${stages} retained=${retained} rerun=${rerun} exhausted=${exhausted} attemptsSpent=${attemptsSpent} attemptsPlanned=${attemptsPlanned} abort=${plan.abort.classification} claimAuthority=${plan.claimAuthority}`;
}
