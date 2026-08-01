// SPDX-License-Identifier: SUL-1.0
/** Closed-shape validation for portable PHX-2 human governance decisions. */

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const EVENTS = new Set(["requested", "granted", "denied", "cancelled", "consumed", "revoked", "expired", "corrected", "superseded"]);
const OUTCOMES = new Set(["pending", "granted", "denied", "cancelled", "consumed", "revoked", "expired", "corrected", "superseded"]);
const AUTHORITIES = new Set(["product-owner", "delegated-reviewer", "security-reviewer", "privacy-reviewer"]);
const ASSURANCE = new Set(["locally-attributed", "externally-attested", "unknown"]);

export class HumanGovernanceLedgerError extends Error {
  constructor(code, message = "Human governance decision is invalid.") { super(message); this.name = "HumanGovernanceLedgerError"; this.code = code; }
}
function fail(code, message) { throw new HumanGovernanceLedgerError(code, message); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function nullableId(value) { return value === null || (typeof value === "string" && ID.test(value)); }

/** Rejects free text, private coordinates, missing target bindings, and invalid lifecycle links. */
export function validateHumanGovernanceDecision(decision) {
  const keys = ["decisionId", "event", "outcome", "authorityClass", "identityAssurance", "timeAssurance", "scope", "reasonCode", "policyDigest", "ruleDigest", "validity", "links"];
  if (!exact(decision, keys) || !ID.test(decision.decisionId) || !EVENTS.has(decision.event) || !OUTCOMES.has(decision.outcome)
    || !AUTHORITIES.has(decision.authorityClass) || !ASSURANCE.has(decision.identityAssurance) || !new Set(["locally-observed", "externally-attested", "unknown"]).has(decision.timeAssurance)
    || !CODE.test(decision.reasonCode) || !SHA256.test(decision.policyDigest) || !SHA256.test(decision.ruleDigest)) fail("HGL-SHAPE");
  const scope = decision.scope;
  if (!exact(scope, ["repositoryFingerprint", "candidate", "packageId", "action", "environment", "artifacts"])
    || !SHA256.test(scope.repositoryFingerprint) || !exact(scope.candidate, ["commit", "tree"]) || !OID.test(scope.candidate.commit) || !OID.test(scope.candidate.tree)
    || !ID.test(scope.packageId) || !CODE.test(scope.action) || !ID.test(scope.environment) || !Array.isArray(scope.artifacts) || scope.artifacts.length === 0 || scope.artifacts.length > 128) fail("HGL-SCOPE");
  for (const artifact of scope.artifacts) if (!exact(artifact, ["path", "sha256"]) || typeof artifact.path !== "string" || !/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u.test(artifact.path) || !SHA256.test(artifact.sha256)) fail("HGL-ARTIFACT");
  const validity = decision.validity;
  if (!exact(validity, ["notBeforeEpochMs", "expiresAtEpochMs", "singleUse"]) || !Number.isSafeInteger(validity.notBeforeEpochMs) || !Number.isSafeInteger(validity.expiresAtEpochMs) || validity.notBeforeEpochMs < 0 || validity.expiresAtEpochMs < validity.notBeforeEpochMs || typeof validity.singleUse !== "boolean") fail("HGL-VALIDITY");
  const links = decision.links;
  const linkKeys = ["requestDecisionId", "consumesDecisionId", "revokesDecisionId", "expiresDecisionId", "supersedesDecisionId", "correctsDecisionId"];
  if (!exact(links, linkKeys) || linkKeys.some((key) => !nullableId(links[key]))) fail("HGL-LINKS");
  const requiredLink = { requested: null, granted: "requestDecisionId", denied: "requestDecisionId", cancelled: "requestDecisionId", consumed: "consumesDecisionId", revoked: "revokesDecisionId", expired: "expiresDecisionId", corrected: "correctsDecisionId", superseded: "supersedesDecisionId" }[decision.event];
  if ((decision.event === "requested" && decision.outcome !== "pending") || (decision.event !== "requested" && decision.outcome !== decision.event)) fail("HGL-OUTCOME");
  if (linkKeys.filter((key) => links[key] !== null).length !== (requiredLink === null ? 0 : 1) || (requiredLink !== null && links[requiredLink] === null)) fail("HGL-LIFECYCLE");
  return Object.freeze({ ...decision, scope: Object.freeze({ ...scope, candidate: Object.freeze({ ...scope.candidate }), artifacts: Object.freeze(scope.artifacts.map((entry) => Object.freeze({ ...entry }))) }), validity: Object.freeze({ ...validity }), links: Object.freeze({ ...links }) });
}
