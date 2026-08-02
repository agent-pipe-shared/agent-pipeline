// SPDX-License-Identifier: SUL-1.0
/** Pure validation and authority resolution for PHX-2 human decisions. */
import { createHash, verify } from "node:crypto";
import { canonicalSha256, validateGovernanceEventEnvelope } from "./governance-event.mjs";
import { appendPortableGovernanceEvent, queryPortableGovernanceStream } from "./governance-event-store.mjs";
import { HumanGovernanceLedgerError, createConsumedHumanGovernanceDecision, validateHumanGovernanceDecision } from "./human-governance-decision.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const EXTERNAL_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const EXTERNAL_INTENT_SCHEMA = "pipeline.po-approval-intent.v1";
const EXTERNAL_PROOF_SCHEMA = "pipeline.po-approval-proof.v1";
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function text(value) { return typeof value === "string" && value.trim() !== ""; }
function validExternalIntent(intent) {
  return exact(intent, ["value", "sha256"])
    && exact(intent.value, ["schema", "kind", "featureId", "planSha256", "specSha256", "candidate", "policyRevision", "subjectSha256", "decision"])
    && intent.value.schema === EXTERNAL_INTENT_SCHEMA && EXTERNAL_ID.test(intent.value.kind)
    && EXTERNAL_ID.test(intent.value.featureId) && SHA256.test(intent.value.planSha256)
    && SHA256.test(intent.value.specSha256) && exact(intent.value.candidate, ["commit", "tree"])
    && OID.test(intent.value.candidate.commit) && OID.test(intent.value.candidate.tree)
    && intent.value.candidate.commit !== intent.value.candidate.tree && EXTERNAL_ID.test(intent.value.policyRevision)
    && SHA256.test(intent.value.subjectSha256) && EXTERNAL_ID.test(intent.value.decision)
    && SHA256.test(intent.sha256) && canonicalSha256(intent.value) === intent.sha256;
}
function fail(code) { throw new HumanGovernanceLedgerError(code); }

export { HumanGovernanceLedgerError, createConsumedHumanGovernanceDecision, validateHumanGovernanceDecision };

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

/**
 * Create the Cyborg-compatible detached-approval intent for one already valid
 * Phoenix ledger grant.  The hashed subject binds the complete immutable grant
 * plus the exact plan/spec artifacts; callers cannot substitute an arbitrary
 * feature, candidate, policy revision, or decision after a person signs it.
 */
export function createExternalHumanGovernanceIntent({ decision, plan, spec } = {}) {
  const grant = validateHumanGovernanceDecision(decision);
  if (grant.event !== "granted" || grant.outcome !== "granted" || !EXTERNAL_ID.test(grant.scope.packageId)
    || !exact(plan, ["path", "sha256"]) || !exact(spec, ["path", "sha256"])
    || typeof plan.path !== "string" || typeof spec.path !== "string" || !SHA256.test(plan.sha256) || !SHA256.test(spec.sha256)) fail("HGL-EXTERNAL-INTENT");
  const artifacts = grant.scope.artifacts;
  if (!artifacts.some((artifact) => artifact.path === plan.path && artifact.sha256 === plan.sha256)
    || !artifacts.some((artifact) => artifact.path === spec.path && artifact.sha256 === spec.sha256)) fail("HGL-EXTERNAL-ARTIFACT");
  const value = {
    schema: EXTERNAL_INTENT_SCHEMA,
    kind: "human-authority",
    featureId: grant.scope.packageId,
    planSha256: plan.sha256,
    specSha256: spec.sha256,
    candidate: grant.scope.candidate,
    policyRevision: `policy-${grant.policyDigest.slice(0, 16)}`,
    subjectSha256: canonicalSha256({ decision: grant, plan, spec }),
    decision: "granted",
  };
  return Object.freeze({ value: Object.freeze(value), sha256: canonicalSha256(value) });
}

/**
 * Verify an externally produced Detached Proof.  The trust policy is an input
 * from an authority outside this checkout; neither a ledger field nor mutable
 * State may supply or override it.  This function only reports cryptographic
 * proof validity and never treats the proof itself as a ledger decision.
 */
export function verifyExternalHumanGovernanceProof({ intent, trustPolicy, proof } = {}) {
  if (!validExternalIntent(intent) || !exact(trustPolicy, ["keyReference", "publicKeySha256"])
    || !text(trustPolicy.keyReference) || !SHA256.test(trustPolicy.publicKeySha256)
    || !exact(proof, ["schema", "intentSha256", "keyReference", "publicKey", "signatureBase64"])
    || proof.schema !== EXTERNAL_PROOF_SCHEMA || proof.intentSha256 !== intent.sha256
    || proof.keyReference !== trustPolicy.keyReference || !text(proof.publicKey) || !text(proof.signatureBase64)) return Object.freeze({ verified: false, code: "HGL-EXTERNAL-PROOF-INVALID" });
  if (createHash("sha256").update(proof.publicKey).digest("hex") !== trustPolicy.publicKeySha256) return Object.freeze({ verified: false, code: "HGL-EXTERNAL-TRUST-MISMATCH" });
  let signature;
  try { signature = Buffer.from(proof.signatureBase64, "base64"); } catch { return Object.freeze({ verified: false, code: "HGL-EXTERNAL-PROOF-INVALID" }); }
  if (signature.length === 0) return Object.freeze({ verified: false, code: "HGL-EXTERNAL-PROOF-INVALID" });
  try {
    if (!verify(null, Buffer.from(intent.sha256, "utf8"), proof.publicKey, signature)) return Object.freeze({ verified: false, code: "HGL-EXTERNAL-PROOF-MISMATCH" });
  } catch { return Object.freeze({ verified: false, code: "HGL-EXTERNAL-PROOF-INVALID" }); }
  return Object.freeze({ verified: true, code: "HGL-EXTERNAL-PROOF-VERIFIED", proofSha256: canonicalSha256(proof) });
}

/**
 * Resolve a live local grant and verify a Cyborg-compatible detached proof.
 * A caller-supplied trust policy is not proof of that policy's provenance, so
 * this result deliberately reports cryptographic proof verification only; it
 * never upgrades local attribution to externally-attested human identity.
 */
export function resolveExternallyVerifiedHumanGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs = Date.now(), plan, spec, trustPolicy, proof } = {}) {
  const local = resolveHumanGovernanceAuthority({ decisions, decisionId, repositoryFingerprint, candidate, nowEpochMs });
  if (local.status !== "granted") return local;
  const selected = decisions.map(validateHumanGovernanceDecision).find((entry) => entry.decisionId === decisionId);
  try {
    const intent = createExternalHumanGovernanceIntent({ decision: selected, plan, spec });
    const verified = verifyExternalHumanGovernanceProof({ intent, trustPolicy, proof });
    if (!verified.verified) return Object.freeze({ status: "denied", reason: "external-proof-unverified", proofCode: verified.code });
    return Object.freeze({ ...local, externalProofVerified: true, proofTrustAssurance: "caller-supplied-policy", approvalIntentSha256: intent.sha256, proofSha256: verified.proofSha256 });
  } catch (error) {
    if (error instanceof HumanGovernanceLedgerError) return Object.freeze({ status: "denied", reason: "external-intent-invalid", proofCode: error.code });
    throw error;
  }
}

/** Append one already validated human decision through the canonical portable writer. */
export async function appendHumanGovernanceDecision({ repositoryRoot, repositoryFingerprint, intent } = {}) {
  if (!record(intent) || intent.origin !== "human" || intent.streamId !== "human" || intent.authorityClass !== "human-authority" || intent.payloadSchema !== "pipeline.human-governance-decision.v1") fail("HGL-APPEND-INTENT");
  const decision = validateHumanGovernanceDecision(intent.payload);
  if (intent.repositoryFingerprint !== repositoryFingerprint || decision.scope.repositoryFingerprint !== repositoryFingerprint) fail("HGL-CROSS-REPOSITORY");
  return appendPortableGovernanceEvent({ repositoryRoot, repositoryFingerprint, intent });
}

/**
 * Append the only valid disposition of a live single-use grant.  The grant is
 * re-read under the human-stream append lock, so a stale caller cannot race a
 * second consumption into the immutable ledger.  Mutable State is deliberately
 * not touched here; its writer must project the returned receipt afterwards.
 */
export async function appendConsumedHumanGovernanceDecision({ repositoryRoot, repositoryFingerprint, grantEvent, decisionId, eventId, idempotencyKey, observedAtEpochMs } = {}) {
  if (!record(grantEvent) || !validateGovernanceEventEnvelope(grantEvent).valid
    || grantEvent.origin !== "human" || grantEvent.streamId !== "human"
    || grantEvent.authorityClass !== "human-authority"
    || grantEvent.payloadSchema !== "pipeline.human-governance-decision.v1"
    || !ID.test(decisionId) || !ID.test(eventId) || !ID.test(idempotencyKey)
    || !Number.isSafeInteger(observedAtEpochMs)) fail("HGL-CONSUME-ENVELOPE");
  const grant = validateHumanGovernanceDecision(grantEvent.payload);
  if (grant.event !== "granted" || grant.outcome !== "granted"
    || grant.scope.repositoryFingerprint !== repositoryFingerprint
    || grantEvent.repositoryFingerprint !== repositoryFingerprint
    || decisionId === grant.decisionId) fail("HGL-CONSUME-ENVELOPE");
  const consumed = createConsumedHumanGovernanceDecision({ grant, decisionId, observedAtEpochMs });
  const intent = {
    schema: "pipeline.governance-event-envelope.v1",
    payloadSchema: "pipeline.human-governance-decision.v1",
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventId,
    idempotencyKey,
    origin: "human",
    authorityClass: "human-authority",
    eventType: "human.consumed",
    occurredAtEpochMs: observedAtEpochMs,
    observedAtEpochMs,
    timeAssurance: "locally-observed",
    repositoryFingerprint,
    sourceUri: grantEvent.sourceUri,
    streamId: "human",
    correlation: grantEvent.correlation,
    candidate: grant.scope.candidate,
    artifacts: grantEvent.artifacts,
    policy: grantEvent.policy,
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payload: consumed,
  };
  return appendPortableGovernanceEvent({
    repositoryRoot,
    repositoryFingerprint,
    intent,
    assertAppend: (events) => {
      const persisted = events.find((event) => event.eventDigest === grantEvent.eventDigest);
      if (!persisted || canonicalSha256(persisted) !== canonicalSha256(grantEvent)) fail("HGL-CONSUME-GRANT-STALE");
      const decisions = events
        .filter((event) => event.origin === "human" && event.streamId === "human")
        .map((event) => validateHumanGovernanceDecision(event.payload));
      const authority = resolveHumanGovernanceAuthority({
        decisions,
        decisionId: grant.decisionId,
        repositoryFingerprint,
        candidate: grant.scope.candidate,
        nowEpochMs: observedAtEpochMs,
      });
      if (authority.status !== "granted" || authority.singleUse !== true) fail("HGL-CONSUME-NOT-LIVE");
    },
  });
}

/** Return only verified/prefix-valid canonical human decisions, never mutable projection state. */
export async function queryHumanGovernanceDecisions({ repositoryRoot, repositoryFingerprint, checkpoint } = {}) {
  const result = await queryPortableGovernanceStream({ repositoryRoot, repositoryFingerprint, streamId: "human", checkpoint });
  return Object.freeze({ ...result, decisions: Object.freeze(result.events.map((event) => validateHumanGovernanceDecision(event.payload))) });
}
