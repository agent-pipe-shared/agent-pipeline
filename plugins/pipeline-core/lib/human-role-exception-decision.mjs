// SPDX-License-Identifier: SUL-1.0
/**
 * Closed-shape validation for a bounded human role exception.
 *
 * A role exception is not a plan approval, and it deliberately does not reuse
 * that shape. It suspends the role separation the Operating Model relies on --
 * the reviewer stops being independent of the implementer -- so the record has
 * mandatory content a plan approval does not: the constraints the exception is
 * bound by, and the follow-up review that must still happen afterwards. Making
 * those optional would let an exception be recorded that reads like an approval
 * and carries none of what makes it accountable.
 *
 * For the same reason this class has no open-ended validity: an exception
 * always expires and always names its follow-up. A standing implicit bypass is
 * not representable here, not merely discouraged.
 */
import { HumanGovernanceLedgerError } from "./human-governance-decision.mjs";

export const HUMAN_ROLE_EXCEPTION_DECISION_SCHEMA = "pipeline.human-role-exception-decision.v1";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const EVENTS = new Set(["requested", "granted", "denied", "cancelled", "consumed", "revoked", "expired", "corrected", "superseded"]);
const OUTCOMES = EVENTS;
const AUTHORITIES = new Set(["product-owner", "delegated-reviewer", "security-reviewer", "privacy-reviewer"]);
const ASSURANCE = new Set(["locally-attributed", "externally-attested", "unknown"]);
// The exception classes the Operating Model recognises. Each names a specific
// separation being suspended, so "some other exception" cannot be recorded.
const EXCEPTIONS = new Set(["direct-elephant-implementation", "self-review", "skipped-critic-review", "reduced-rigor", "role-substitution"]);
// A follow-up is a named review that must still occur. `waived` is not a value.
const FOLLOW_UP_REVIEWS = new Set(["critic-review", "security-review", "privacy-review", "product-owner-acceptance"]);
const CONSTRAINT_KINDS = new Set(["max-artifacts", "max-commits", "no-guard-override", "no-remote-action", "no-schema-change", "no-authority-change", "single-work-package"]);
// The action of a role exception lives in its own namespace, and the grammar --
// not a convention -- keeps it there. `scope` is byte-identical across the two
// human decision classes, so a consumer that matches on `scope.action` alone
// cannot tell them apart. Sharing the action vocabulary would let an exception
// name another consumer's authority verb (`OVERRIDE.<rule>` for the git guard,
// `APPROVE_PLAN` for the dev-plan guard) and be matched by it. Requiring the
// `ROLE.` prefix makes that collision unrepresentable rather than unlikely.
const ROLE_ACTION = /^ROLE\.[A-Z][A-Z0-9._:-]{0,120}$/u;

function fail(code, message) { throw new HumanGovernanceLedgerError(code, message); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function nullableId(value) { return value === null || (typeof value === "string" && ID.test(value)); }

/**
 * Validates one portable role-exception decision.
 *
 * Rejects free text, natural-person attribution, private coordinates, an
 * unbounded validity, an empty constraint set, and an absent follow-up review.
 */
export function validateHumanRoleExceptionDecision(decision) {
  const keys = ["schema", "decisionId", "event", "outcome", "exceptionClass", "authorityClass", "identityAssurance", "timeAssurance", "scope", "constraints", "followUpReview", "reasonCode", "policyDigest", "ruleDigest", "validity", "links"];
  if (!exact(decision, keys) || decision.schema !== HUMAN_ROLE_EXCEPTION_DECISION_SCHEMA
    || !ID.test(decision.decisionId) || !EVENTS.has(decision.event) || !OUTCOMES.has(decision.outcome)
    || !EXCEPTIONS.has(decision.exceptionClass) || !AUTHORITIES.has(decision.authorityClass)
    || !ASSURANCE.has(decision.identityAssurance) || !new Set(["locally-observed", "externally-attested", "unknown"]).has(decision.timeAssurance)
    || !CODE.test(decision.reasonCode) || !SHA256.test(decision.policyDigest) || !SHA256.test(decision.ruleDigest)) fail("HRE-SHAPE");

  const scope = decision.scope;
  if (!exact(scope, ["repositoryFingerprint", "candidate", "packageId", "action", "environment", "artifacts"])
    || !SHA256.test(scope.repositoryFingerprint) || !exact(scope.candidate, ["commit", "tree"]) || !OID.test(scope.candidate.commit) || !OID.test(scope.candidate.tree)
    || !ID.test(scope.packageId) || !ROLE_ACTION.test(scope.action) || !ID.test(scope.environment)
    || !Array.isArray(scope.artifacts) || scope.artifacts.length === 0 || scope.artifacts.length > 128) fail("HRE-SCOPE");
  for (const artifact of scope.artifacts) {
    if (!exact(artifact, ["path", "sha256"]) || typeof artifact.path !== "string"
      || !/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u.test(artifact.path) || !SHA256.test(artifact.sha256)) fail("HRE-ARTIFACT");
  }

  // At least one constraint, from a closed vocabulary, each with a bounded
  // value. An exception with no constraints is a bypass with extra steps.
  const constraints = decision.constraints;
  if (!Array.isArray(constraints) || constraints.length === 0 || constraints.length > 16
    || new Set(constraints.map((entry) => entry?.kind)).size !== constraints.length) fail("HRE-CONSTRAINTS");
  for (const constraint of constraints) {
    if (!exact(constraint, ["kind", "limit"]) || !CONSTRAINT_KINDS.has(constraint.kind)) fail("HRE-CONSTRAINTS");
    const counted = constraint.kind === "max-artifacts" || constraint.kind === "max-commits";
    if (counted ? !(Number.isSafeInteger(constraint.limit) && constraint.limit >= 1 && constraint.limit <= 1024) : constraint.limit !== null) fail("HRE-CONSTRAINTS");
  }

  // The follow-up review is mandatory and is a commitment, not a status: it
  // records what must still happen, never that it already has.
  const followUp = decision.followUpReview;
  if (!exact(followUp, ["review", "dueByEpochMs", "satisfiedByDecisionId"])
    || !FOLLOW_UP_REVIEWS.has(followUp.review) || !Number.isSafeInteger(followUp.dueByEpochMs) || followUp.dueByEpochMs < 0
    || !nullableId(followUp.satisfiedByDecisionId)) fail("HRE-FOLLOW-UP");

  const validity = decision.validity;
  if (!exact(validity, ["notBeforeEpochMs", "expiresAtEpochMs", "singleUse"])
    || !Number.isSafeInteger(validity.notBeforeEpochMs) || !Number.isSafeInteger(validity.expiresAtEpochMs)
    || validity.notBeforeEpochMs < 0 || validity.expiresAtEpochMs <= validity.notBeforeEpochMs
    || typeof validity.singleUse !== "boolean") fail("HRE-VALIDITY");
  // The follow-up must outlive the exception itself, otherwise the review it
  // promises could fall due while the exception is still being exercised.
  if (followUp.dueByEpochMs < validity.expiresAtEpochMs) fail("HRE-FOLLOW-UP");

  const links = decision.links;
  const linkKeys = ["requestDecisionId", "consumesDecisionId", "revokesDecisionId", "expiresDecisionId", "supersedesDecisionId", "correctsDecisionId"];
  if (!exact(links, linkKeys) || linkKeys.some((key) => !nullableId(links[key]))) fail("HRE-LINKS");
  const requiredLink = { requested: null, granted: "requestDecisionId", denied: "requestDecisionId", cancelled: "requestDecisionId", consumed: "consumesDecisionId", revoked: "revokesDecisionId", expired: "expiresDecisionId", corrected: "correctsDecisionId", superseded: "supersedesDecisionId" }[decision.event];
  if ((decision.event === "requested" && decision.outcome !== "pending") || (decision.event !== "requested" && decision.outcome !== decision.event)) fail("HRE-OUTCOME");
  if (linkKeys.filter((key) => links[key] !== null).length !== (requiredLink === null ? 0 : 1) || (requiredLink !== null && links[requiredLink] === null)) fail("HRE-LIFECYCLE");

  return Object.freeze({
    ...decision,
    scope: Object.freeze({ ...scope, candidate: Object.freeze({ ...scope.candidate }), artifacts: Object.freeze(scope.artifacts.map((entry) => Object.freeze({ ...entry }))) }),
    constraints: Object.freeze(constraints.map((entry) => Object.freeze({ ...entry }))),
    followUpReview: Object.freeze({ ...followUp }),
    validity: Object.freeze({ ...validity }),
    links: Object.freeze({ ...links }),
  });
}

/**
 * Derives the immutable consumption disposition for one granted role
 * exception. The consumed record stays in the role-exception class and carries
 * the same constraints and outstanding follow-up: a reader of the consumption
 * alone must still be able to see what the exception was bound by, and that a
 * review is still owed.
 */
export function createConsumedHumanRoleExceptionDecision({ grant, decisionId, observedAtEpochMs } = {}) {
  const source = validateHumanRoleExceptionDecision(grant);
  if (source.event !== "granted" || source.outcome !== "granted" || decisionId === source.decisionId
    || !Number.isSafeInteger(observedAtEpochMs) || observedAtEpochMs < source.validity.notBeforeEpochMs
    || observedAtEpochMs > source.validity.expiresAtEpochMs) fail("HRE-CONSUME-REQUEST");
  return validateHumanRoleExceptionDecision({
    schema: HUMAN_ROLE_EXCEPTION_DECISION_SCHEMA,
    decisionId,
    event: "consumed",
    outcome: "consumed",
    exceptionClass: source.exceptionClass,
    authorityClass: source.authorityClass,
    identityAssurance: source.identityAssurance,
    timeAssurance: "locally-observed",
    scope: source.scope,
    constraints: source.constraints.map((entry) => ({ ...entry })),
    followUpReview: { ...source.followUpReview },
    reasonCode: "AUTHORITY.CONSUMED",
    policyDigest: source.policyDigest,
    ruleDigest: source.ruleDigest,
    validity: source.validity,
    links: { requestDecisionId: null, consumesDecisionId: source.decisionId, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null },
  });
}

/** True for a payload that declares itself a role exception, before validation. */
export function isHumanRoleExceptionDecision(value) {
  return record(value) && value.schema === HUMAN_ROLE_EXCEPTION_DECISION_SCHEMA;
}

export { HumanGovernanceLedgerError };
