// SPDX-License-Identifier: SUL-1.0
/** Pure validation and authority resolution for PHX-2 human decisions. */
import { canonicalSha256 } from "./governance-event.mjs";
import { appendPortableGovernanceEvent, queryPortableGovernanceStream } from "./governance-event-store.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const EVENTS = new Set(["requested", "granted", "denied", "cancelled", "consumed", "revoked", "expired", "corrected", "superseded"]);
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
  if (!exact(decision, keys) || !ID.test(decision.decisionId) || !EVENTS.has(decision.event) || !EVENTS.has(decision.outcome)
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
  const linkKeys = ["requestDecisionId", "consumesDecisionId", "revokesDecisionId", "supersedesDecisionId", "correctsDecisionId"];
  if (!exact(links, linkKeys) || linkKeys.some((key) => !nullableId(links[key]))) fail("HGL-LINKS");
  const linked = linkKeys.filter((key) => links[key] !== null);
  if (decision.event === "granted" && linked.length !== 1) fail("HGL-LIFECYCLE");
  if (["consumed", "revoked", "superseded", "corrected"].includes(decision.event) && linked.length !== 1) fail("HGL-LIFECYCLE");
  if (["requested", "denied", "cancelled", "expired"].includes(decision.event) && linked.length !== 0) fail("HGL-LIFECYCLE");
  return Object.freeze({ ...decision, scope: Object.freeze({ ...scope, candidate: Object.freeze({ ...scope.candidate }), artifacts: Object.freeze(scope.artifacts.map((entry) => Object.freeze({ ...entry }))) }), validity: Object.freeze({ ...validity }), links: Object.freeze({ ...links }) });
}

/** Returns an immutable authority result; any ambiguity or stale binding fails closed. */
export function resolveHumanGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs = Date.now() } = {}) {
  if (!Array.isArray(decisions) || !ID.test(decisionId) || !SHA256.test(repositoryFingerprint) || !exact(candidate, ["commit", "tree"]) || !OID.test(candidate.commit) || !OID.test(candidate.tree) || !Number.isSafeInteger(nowEpochMs)) fail("HGL-RESOLVE-REQUEST");
  const valid = decisions.map(validateHumanGovernanceDecision);
  const selected = valid.filter((entry) => entry.decisionId === decisionId);
  if (selected.length !== 1) return Object.freeze({ status: "unavailable", reason: "decision-not-unique" });
  const decision = selected[0];
  if (decision.event !== "granted" || decision.outcome !== "granted") return Object.freeze({ status: "denied", reason: "not-granted" });
  if (decision.scope.repositoryFingerprint !== repositoryFingerprint || decision.scope.candidate.commit !== candidate.commit || decision.scope.candidate.tree !== candidate.tree) return Object.freeze({ status: "denied", reason: "scope-mismatch" });
  if (nowEpochMs < decision.validity.notBeforeEpochMs || nowEpochMs > decision.validity.expiresAtEpochMs) return Object.freeze({ status: "denied", reason: "expired" });
  const dispositions = valid.filter((entry) => Object.values(entry.links).includes(decisionId));
  if (dispositions.some((entry) => ["consumed", "revoked", "superseded", "corrected"].includes(entry.event))) return Object.freeze({ status: "denied", reason: "disposed" });
  return Object.freeze({ status: "granted", decisionId, decisionDigest: canonicalSha256(decision), singleUse: decision.validity.singleUse, scope: decision.scope });
}

/** Append one already validated human decision through the canonical portable writer. */
export async function appendHumanGovernanceDecision({ repositoryRoot, repositoryFingerprint, intent } = {}) {
  if (!record(intent) || intent.origin !== "human" || intent.streamId !== "human" || intent.authorityClass !== "human-authority" || intent.payloadSchema !== "pipeline.human-governance-decision.v1") fail("HGL-APPEND-INTENT");
  const decision = validateHumanGovernanceDecision(intent.payload);
  if (intent.repositoryFingerprint !== repositoryFingerprint || decision.scope.repositoryFingerprint !== repositoryFingerprint) fail("HGL-CROSS-REPOSITORY");
  return appendPortableGovernanceEvent({ repositoryRoot, repositoryFingerprint, intent });
}

/** Return only verified/prefix-valid canonical human decisions, never mutable projection state. */
export async function queryHumanGovernanceDecisions({ repositoryRoot, repositoryFingerprint, checkpoint } = {}) {
  const result = await queryPortableGovernanceStream({ repositoryRoot, repositoryFingerprint, streamId: "human", checkpoint });
  return Object.freeze({ ...result, decisions: Object.freeze(result.events.map((event) => validateHumanGovernanceDecision(event.payload))) });
}
