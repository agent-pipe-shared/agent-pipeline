#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canonicalSha256, canonicalizeJson } from "./governance-event.mjs";
import { createConsumedHumanRoleExceptionDecision, isHumanRoleExceptionDecision, validateHumanRoleExceptionDecision } from "./human-role-exception-decision.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { HumanGovernanceLedgerError, appendConsumedHumanGovernanceDecision, appendHumanGovernanceDecision, createConsumedHumanGovernanceDecision, createExternalHumanGovernanceIntent, queryHumanGovernanceDecisions, resolveExternallyVerifiedHumanGovernanceAuthority, resolveHumanGovernanceAuthority, validateHumanGovernanceDecision, verifyExternalHumanGovernanceProof } from "./human-governance-ledger.mjs";

const sha = "a".repeat(64);
const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
function decision(overrides = {}) { return { decisionId: "decision-1", event: "granted", outcome: "granted", authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed", scope: { repositoryFingerprint: sha, candidate, packageId: "sprint-phoenix-epic", action: "PLAN.APPROVE", environment: "local", artifacts: [{ path: "specs/sprint-phoenix-epic/spec.md", sha256: sha }] }, reasonCode: "SCOPE.ACCEPTED", policyDigest: sha, ruleDigest: sha, validity: { notBeforeEpochMs: 10, expiresAtEpochMs: 100, singleUse: true }, links: { requestDecisionId: "request-1", consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null }, ...overrides }; }

const absent = { state: "not-applicable" };
function registry(fingerprint) { return { schema: "pipeline.governance-stream-registry.v1", repositoryFingerprint: fingerprint, canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventDigestDomain: "pipeline.governance-event.v1\0", storageRoot: "governance/events", streams: [
  { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
  { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
  { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
] }; }
function capturePolicy() { return { schema: "pipeline.governance-capture-policy.v1", policyId: "fixture", revision: "e".repeat(64), defaultAction: "deny", streams: ["human", "agent", "lifecycle"].map((origin) => ({ origin, purpose: origin === "human" ? "authority-history" : "declared-assumption", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null })), sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false } }; }
async function ledgerFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "phoenix-human-ledger-"));
  execFileSync("git", ["init", "-q", root]);
  const repository = discoverRepository(root);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const policy = capturePolicy();
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registry(fingerprint))}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(policy)}\n`);
  const grant = decision({ scope: { repositoryFingerprint: fingerprint, candidate, packageId: "sprint-phoenix-epic", action: "PLAN.APPROVE", environment: "local", artifacts: [{ path: "specs/sprint-phoenix-epic/spec.md", sha256: sha }] } });
  const intent = { schema: "pipeline.governance-event-envelope.v1", payloadSchema: "pipeline.human-governance-decision.v1", canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventId: "grant-event-1", idempotencyKey: "grant-idempotency-1", origin: "human", authorityClass: "human-authority", eventType: "human.granted", occurredAtEpochMs: 20, observedAtEpochMs: 20, timeAssurance: "locally-observed", repositoryFingerprint: fingerprint, sourceUri: `urn:pipeline:repository:${fingerprint}`, streamId: "human", correlation: { featureId: absent, packageId: absent, requestId: absent, sessionId: absent, dispatchId: absent, traceId: absent }, candidate, artifacts: [absent], policy: { policyDigest: absent, configurationDigest: absent, capturePolicyDigest: canonicalSha256(policy), redactionPolicyDigest: absent }, classification: "repository-public-safe", storageProfile: "repository-public-safe", retentionCompatibility: "repository-retained", disclosureClass: "repository-visible", payload: grant };
  await appendHumanGovernanceDecision({ repositoryRoot: root, repositoryFingerprint: fingerprint, intent });
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  return { root, fingerprint, grantEvent: events.events[0] };
}
function consumptionInput(values, decisionId, eventId, replayToken, observedAtEpochMs) {
  return {
    repositoryRoot: values.root,
    repositoryFingerprint: values.fingerprint,
    grantEvent: values.grantEvent,
    decisionId,
    eventId,
    ["idempotency" + "Key"]: replayToken,
    observedAtEpochMs,
  };
}

test("validates a closed portable grant and resolves matching authority", () => {
  const value = validateHumanGovernanceDecision(decision());
  assert.equal(value.decisionId, "decision-1");
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [value], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 50 }).status, "granted");
});

test("fails closed for repository/candidate drift, expiry, and consuming disposition", () => {
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [decision()], decisionId: "decision-1", repositoryFingerprint: "d".repeat(64), candidate, nowEpochMs: 50 }).reason, "scope-mismatch");
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [decision()], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 101 }).reason, "expired");
  const consumed = decision({ decisionId: "consume-1", event: "consumed", outcome: "consumed", links: { requestDecisionId: null, consumesDecisionId: "decision-1", revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } });
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [decision(), consumed], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 50 }).reason, "disposed");
});

test("verifies an external detached proof without upgrading caller-supplied trust to human identity", () => {
  const plan = { path: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", sha256: "d".repeat(64) };
  const spec = { path: "specs/sprint-phoenix-epic/spec.md", sha256: "e".repeat(64) };
  const grant = decision({ scope: { repositoryFingerprint: sha, candidate, packageId: "sprint-phoenix-epic", action: "PLAN.APPROVE", environment: "local", artifacts: [plan, spec] } });
  const intent = createExternalHumanGovernanceIntent({ decision: grant, plan, spec });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: intent.sha256,
    keyReference: "external-po-v1",
    publicKey,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), keys.privateKey).toString("base64"),
  };
  const trustPolicy = { keyReference: proof.keyReference, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
  const verified = resolveExternallyVerifiedHumanGovernanceAuthority({ decisions: [grant], decisionId: grant.decisionId, repositoryFingerprint: sha, candidate, nowEpochMs: 50, plan, spec, trustPolicy, proof });
  assert.equal(verified.status, "granted");
  assert.equal(verified.externalProofVerified, true);
  assert.equal(verified.proofTrustAssurance, "caller-supplied-policy");
  assert.equal(verified.identityAssurance, undefined);
  assert.equal(verified.approvalIntentSha256, intent.sha256);
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [grant], decisionId: grant.decisionId, repositoryFingerprint: sha, candidate, nowEpochMs: 50 }).identityAssurance, undefined);
  const unsigned = resolveExternallyVerifiedHumanGovernanceAuthority({ decisions: [grant], decisionId: grant.decisionId, repositoryFingerprint: sha, candidate, nowEpochMs: 50, plan, spec, trustPolicy, proof: { ...proof, signatureBase64: "AA==" } });
  assert.equal(unsigned.status, "denied");
  assert.equal(unsigned.reason, "external-proof-unverified");
  assert.equal(unsigned.proofCode, "HGL-EXTERNAL-PROOF-MISMATCH");
  assert.equal(verifyExternalHumanGovernanceProof({ intent: { sha256: intent.sha256 }, trustPolicy, proof }).code, "HGL-EXTERNAL-PROOF-INVALID");
});

test("binds an external proof to the ledger grant, its candidate, and both scoped artifacts", () => {
  const plan = { path: "specs/sprint-phoenix-epic/prd_phoenix-epic.md", sha256: "d".repeat(64) };
  const spec = { path: "specs/sprint-phoenix-epic/spec.md", sha256: "e".repeat(64) };
  const grant = decision({ scope: { repositoryFingerprint: sha, candidate, packageId: "sprint-phoenix-epic", action: "PLAN.APPROVE", environment: "local", artifacts: [plan, spec] } });
  assert.throws(() => createExternalHumanGovernanceIntent({ decision: grant, plan: { ...plan, sha256: "f".repeat(64) }, spec }), (error) => error.code === "HGL-EXTERNAL-ARTIFACT");
  const keys = generateKeyPairSync("ed25519");
  const intent = createExternalHumanGovernanceIntent({ decision: grant, plan, spec });
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: intent.sha256, keyReference: "external-po-v1", publicKey, signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), keys.privateKey).toString("base64") };
  const trustPolicy = { keyReference: proof.keyReference, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
  const wrongCandidate = resolveExternallyVerifiedHumanGovernanceAuthority({ decisions: [grant], decisionId: grant.decisionId, repositoryFingerprint: sha, candidate: { ...candidate, tree: "f".repeat(40) }, nowEpochMs: 50, plan, spec, trustPolicy, proof });
  assert.equal(wrongCandidate.status, "denied");
  assert.equal(wrongCandidate.reason, "scope-mismatch");
});

test("derives an append-only consumption disposition without rewriting the grant", () => {
  const grant = decision();
  const consumed = createConsumedHumanGovernanceDecision({ grant, decisionId: "consume-1", observedAtEpochMs: 50 });
  assert.equal(consumed.event, "consumed");
  assert.equal(consumed.reasonCode, "AUTHORITY.CONSUMED");
  assert.equal(consumed.links.consumesDecisionId, grant.decisionId);
  assert.equal(grant.event, "granted");
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [grant, consumed], decisionId: grant.decisionId, repositoryFingerprint: sha, candidate, nowEpochMs: 50 }).reason, "disposed");
  assert.throws(() => createConsumedHumanGovernanceDecision({ grant, decisionId: grant.decisionId, observedAtEpochMs: 50 }), (error) => error.code === "HGL-CONSUME-REQUEST");
  assert.throws(() => createConsumedHumanGovernanceDecision({ grant, decisionId: "consume-expired", observedAtEpochMs: 101 }), (error) => error.code === "HGL-CONSUME-REQUEST");
});

test("consumes a persisted single-use grant exactly once under the canonical stream lock", async (t) => {
  const values = await ledgerFixture();
  t.after(() => rm(values.root, { recursive: true, force: true }));
  const receipt = await appendConsumedHumanGovernanceDecision(consumptionInput(values, "consumed-1", "consumed-event-1", "consumed-idempotency-1", 50));
  assert.equal(receipt.outcome, "appended");
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: values.root, repositoryFingerprint: values.fingerprint, checkpoint: receipt.checkpoint });
  assert.equal(events.decisions.length, 2);
  assert.equal(events.decisions[1].links.consumesDecisionId, "decision-1");
  await assert.rejects(() => appendConsumedHumanGovernanceDecision(consumptionInput(values, "consumed-2", "consumed-event-2", "consumed-idempotency-2", 51)), (error) => error.code === "HGL-CONSUME-NOT-LIVE");
});

test("rejects open payloads and invalid lifecycle link cardinality", () => {
  assert.throws(() => validateHumanGovernanceDecision({ ...decision(), privateReason: "no" }), (error) => error instanceof HumanGovernanceLedgerError && error.code === "HGL-SHAPE");
  assert.throws(() => validateHumanGovernanceDecision(decision({ links: { requestDecisionId: null, consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } })), (error) => error instanceof HumanGovernanceLedgerError && error.code === "HGL-LIFECYCLE");
});

// H-AC-11: a reviewer must be able to reconstruct the whole decision from the
// portable record, while natural-person attribution and free-form rationale
// stay out of it entirely. The second half holds by construction -- the record
// is closed-key, so neither is representable and neither has a join handle.
test("H-AC-11 exposes the full reconstruction surface and admits no attribution or rationale", () => {
  const granted = validateHumanGovernanceDecision(decision());
  // Every element the criterion enumerates, and nothing else.
  assert.deepEqual(Object.keys(granted).sort(), ["authorityClass", "decisionId", "event", "identityAssurance", "links", "outcome", "policyDigest", "reasonCode", "ruleDigest", "scope", "timeAssurance", "validity"]);
  assert.equal(granted.links.requestDecisionId, "request-1");            // request
  assert.equal(granted.authorityClass, "product-owner");                  // authority class
  assert.equal(granted.identityAssurance, "locally-attributed");          // its assurance
  assert.equal(granted.timeAssurance, "locally-observed");                // time assurance
  assert.equal(granted.validity.notBeforeEpochMs, 10);                    // time
  assert.equal(granted.reasonCode, "SCOPE.ACCEPTED");                     // stable reason code
  assert.equal(granted.policyDigest, sha); assert.equal(granted.ruleDigest, sha);
  assert.deepEqual(Object.keys(granted.scope).sort(), ["action", "artifacts", "candidate", "environment", "packageId", "repositoryFingerprint"]);
  assert.equal(granted.scope.artifacts[0].path, "specs/sprint-phoenix-epic/spec.md"); // evidence
  assert.equal(granted.outcome, "granted");
  // Consumption, revocation, expiry, correction and supersession each have a
  // dedicated link, so a reviewer reconstructs the chain without inference.
  assert.deepEqual(Object.keys(granted.links).sort(), ["consumesDecisionId", "correctsDecisionId", "expiresDecisionId", "requestDecisionId", "revokesDecisionId", "supersedesDecisionId"]);
  // No natural-person attribution, free-form rationale, or join handle to one.
  for (const field of ["approvedBy", "actor", "personName", "email", "userId", "rationale", "comment", "note", "restrictedRecordId", "localDecisionRef"]) {
    assert.throws(() => validateHumanGovernanceDecision({ ...decision(), [field]: "person-fixture" }), (error) => error instanceof HumanGovernanceLedgerError && error.code === "HGL-SHAPE", field);
    assert.throws(() => validateHumanGovernanceDecision(decision({ scope: { ...decision().scope, [field]: "person-fixture" } })), (error) => error instanceof HumanGovernanceLedgerError && error.code === "HGL-SCOPE", field);
  }
  // The reason code is a code, never a sentence.
  for (const free of ["approved because the risk looked acceptable", "ok", "Approved By Alice"]) {
    assert.throws(() => validateHumanGovernanceDecision(decision({ reasonCode: free })), (error) => error.code === "HGL-SHAPE", free);
  }
  assert.equal(JSON.stringify(granted).includes("person-fixture"), false);
});

test("requires one event-specific link and outcome for every authority lifecycle disposition", () => {
  const variants = [
    ["requested", "pending", null], ["denied", "denied", "requestDecisionId"], ["cancelled", "cancelled", "requestDecisionId"],
    ["revoked", "revoked", "revokesDecisionId"], ["expired", "expired", "expiresDecisionId"], ["corrected", "corrected", "correctsDecisionId"], ["superseded", "superseded", "supersedesDecisionId"],
  ];
  for (const [event, outcome, link] of variants) {
    const links = { requestDecisionId: null, consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null };
    if (link) links[link] = "decision-1";
    assert.equal(validateHumanGovernanceDecision(decision({ decisionId: `${event}-1`, event, outcome, links })).event, event);
  }
  assert.throws(() => validateHumanGovernanceDecision(decision({ event: "requested", outcome: "granted", links: { requestDecisionId: null, consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } })), (error) => error.code === "HGL-OUTCOME");
});

const exceptionLinks = { requestDecisionId: "request-1", consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null };
function exception(overrides = {}) {
  return {
    schema: "pipeline.human-role-exception-decision.v1",
    decisionId: "exception-1", event: "granted", outcome: "granted",
    exceptionClass: "direct-elephant-implementation",
    authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed",
    scope: { repositoryFingerprint: sha, candidate, packageId: "sprint-phoenix-epic", action: "ROLE.EXCEPTION", environment: "local", artifacts: [{ path: "specs/sprint-phoenix-epic/spec.md", sha256: sha }] },
    constraints: [{ kind: "single-work-package", limit: null }, { kind: "max-commits", limit: 3 }],
    followUpReview: { review: "critic-review", dueByEpochMs: 200, satisfiedByDecisionId: null },
    reasonCode: "ROLE.EXCEPTION.GRANTED",
    policyDigest: sha, ruleDigest: sha,
    validity: { notBeforeEpochMs: 10, expiresAtEpochMs: 100, singleUse: true },
    links: exceptionLinks,
    ...overrides,
  };
}

// H-AC-10: a bounded role exception records exact scope, reason, expiry,
// constraints and a mandatory follow-up review, and cannot become a standing
// implicit bypass. The class exists precisely so those last two are mandatory.
test("H-AC-10 records scope, reason, expiry, constraints and a mandatory follow-up review", () => {
  const granted = validateHumanRoleExceptionDecision(exception());
  assert.equal(granted.scope.packageId, "sprint-phoenix-epic");
  assert.equal(granted.scope.action, "ROLE.EXCEPTION");
  assert.equal(granted.reasonCode, "ROLE.EXCEPTION.GRANTED");
  assert.equal(granted.validity.expiresAtEpochMs, 100);
  assert.deepEqual(granted.constraints.map((entry) => entry.kind), ["single-work-package", "max-commits"]);
  assert.equal(granted.followUpReview.review, "critic-review");
  assert.equal(granted.followUpReview.satisfiedByDecisionId, null);
  assert.equal(Object.isFrozen(granted.constraints), true);
  assert.equal(Object.isFrozen(granted.followUpReview), true);
  // Each of the five is individually required, not merely present in the fixture.
  for (const missing of ["scope", "reasonCode", "validity", "constraints", "followUpReview"]) {
    const value = exception(); delete value[missing];
    assert.throws(() => validateHumanRoleExceptionDecision(value), (error) => error instanceof HumanGovernanceLedgerError, missing);
  }
});

test("H-AC-10 refuses an unconstrained, unreviewed or non-expiring exception", () => {
  // No constraints at all is a bypass with extra steps.
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ constraints: [] })), (error) => error.code === "HRE-CONSTRAINTS");
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ constraints: [{ kind: "anything-goes", limit: null }] })), (error) => error.code === "HRE-CONSTRAINTS");
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ constraints: [{ kind: "max-commits", limit: null }] })), (error) => error.code === "HRE-CONSTRAINTS");
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ constraints: [{ kind: "no-remote-action", limit: 5 }] })), (error) => error.code === "HRE-CONSTRAINTS");
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ constraints: [{ kind: "max-commits", limit: 3 }, { kind: "max-commits", limit: 9 }] })), (error) => error.code === "HRE-CONSTRAINTS");
  // The follow-up review is mandatory, comes from a closed set, and cannot be
  // waived by naming something that is not a review.
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ followUpReview: { review: "waived", dueByEpochMs: 200, satisfiedByDecisionId: null } })), (error) => error.code === "HRE-FOLLOW-UP");
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ followUpReview: { review: "critic-review", dueByEpochMs: 200 } })), (error) => error.code === "HRE-FOLLOW-UP");
  // A follow-up due before the exception expires could fall due while the
  // exception is still being exercised.
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ followUpReview: { review: "critic-review", dueByEpochMs: 50, satisfiedByDecisionId: null } })), (error) => error.code === "HRE-FOLLOW-UP");
  // No standing bypass: validity is mandatory and must actually be bounded.
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ validity: { notBeforeEpochMs: 10, expiresAtEpochMs: 10, singleUse: true } })), (error) => error.code === "HRE-VALIDITY");
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ validity: { notBeforeEpochMs: 10, expiresAtEpochMs: null, singleUse: true } })), (error) => error.code === "HRE-VALIDITY");
  // The exception class itself is closed: "some other exception" is not recordable.
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ exceptionClass: "just-this-once" })), (error) => error.code === "HRE-SHAPE");
});

test("H-AC-10 admits no attribution, rationale or provider field, exactly like the plan class", () => {
  for (const field of ["approvedBy", "actor", "personName", "rationale", "comment", "credential", "endpoint"]) {
    assert.throws(() => validateHumanRoleExceptionDecision({ ...exception(), [field]: "person-fixture" }), (error) => error.code === "HRE-SHAPE", field);
    assert.throws(() => validateHumanRoleExceptionDecision(exception({ scope: { ...exception().scope, [field]: "person-fixture" } })), (error) => error.code === "HRE-SCOPE", field);
    assert.throws(() => validateHumanRoleExceptionDecision(exception({ constraints: [{ kind: "max-commits", limit: 3, [field]: "person-fixture" }] })), (error) => error.code === "HRE-CONSTRAINTS", field);
    assert.throws(() => validateHumanRoleExceptionDecision(exception({ followUpReview: { review: "critic-review", dueByEpochMs: 200, satisfiedByDecisionId: null, [field]: "person-fixture" } })), (error) => error.code === "HRE-FOLLOW-UP", field);
  }
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ reasonCode: "granted because it was late and we were in a hurry" })), (error) => error.code === "HRE-SHAPE");
});

// H-AC-10 regression: both shipped guards identify their own authority purely
// by `scope.action`, and `scope` is byte-identical across the two human classes.
// If the exception class shared the action vocabulary, a bounded exception could
// name a guard's verb and be matched by it. The grammar closes that off at the
// point of record, independently of what any consumer checks.
test("H-AC-10 an exception cannot name another consumer's authority verb", () => {
  for (const action of ["OVERRIDE.GG_03", "OVERRIDE.GG_01", "APPROVE_PLAN", "PLAN.APPROVE", "PUBLISH", "PUSH"]) {
    assert.throws(() => validateHumanRoleExceptionDecision(exception({ scope: { ...exception().scope, action } })), (error) => error.code === "HRE-SCOPE", action);
  }
  // Its own namespace stays available, and the prefix is required, not merely
  // conventional -- a bare verb is refused however plausible it reads.
  assert.equal(validateHumanRoleExceptionDecision(exception({ scope: { ...exception().scope, action: "ROLE.SELF_REVIEW" } })).scope.action, "ROLE.SELF_REVIEW");
  assert.throws(() => validateHumanRoleExceptionDecision(exception({ scope: { ...exception().scope, action: "ROLEX.EXCEPTION" } })), (error) => error.code === "HRE-SCOPE");
});

test("H-AC-10 keeps the two decision classes apart in both directions", () => {
  assert.equal(isHumanRoleExceptionDecision(exception()), true);
  // A role exception cannot be validated as a plan decision, so it cannot be
  // smuggled past the laxer contract by dropping its discriminator's meaning.
  assert.throws(() => validateHumanGovernanceDecision(exception()), (error) => error.code === "HGL-SHAPE");
  // And a plan decision does not accidentally satisfy the exception contract.
  const planDecision = { decisionId: "decision-1", event: "granted", outcome: "granted", authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed", scope: exception().scope, reasonCode: "SCOPE.ACCEPTED", policyDigest: sha, ruleDigest: sha, validity: { notBeforeEpochMs: 10, expiresAtEpochMs: 100, singleUse: true }, links: exceptionLinks };
  assert.equal(isHumanRoleExceptionDecision(planDecision), false);
  assert.throws(() => validateHumanRoleExceptionDecision(planDecision), (error) => error.code === "HRE-SHAPE");
  assert.equal(validateHumanGovernanceDecision(planDecision).decisionId, "decision-1");
});

test("H-AC-10 resolves through the shared ledger and carries its bounds with the grant", () => {
  const granted = resolveHumanGovernanceAuthority({ decisions: [exception()], decisionId: "exception-1", repositoryFingerprint: sha, candidate, nowEpochMs: 50 });
  assert.equal(granted.status, "granted");
  assert.equal(granted.exceptionClass, "direct-elephant-implementation");
  assert.deepEqual(granted.constraints.map((entry) => entry.kind), ["single-work-package", "max-commits"]);
  assert.equal(granted.followUpReview.review, "critic-review");
  // Expiry is enforced by the same resolver that governs a plan decision.
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [exception()], decisionId: "exception-1", repositoryFingerprint: sha, candidate, nowEpochMs: 101 }).reason, "expired");
  // A consumption disposition stays in the class and keeps the bounds visible.
  const consumed = createConsumedHumanRoleExceptionDecision({ grant: exception(), decisionId: "exception-consumed-1", observedAtEpochMs: 50 });
  assert.equal(consumed.schema, "pipeline.human-role-exception-decision.v1");
  assert.equal(consumed.event, "consumed");
  assert.equal(consumed.links.consumesDecisionId, "exception-1");
  assert.deepEqual(consumed.constraints.map((entry) => entry.kind), ["single-work-package", "max-commits"]);
  assert.equal(consumed.followUpReview.review, "critic-review");
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [exception(), consumed], decisionId: "exception-1", repositoryFingerprint: sha, candidate, nowEpochMs: 50 }).reason, "disposed");
  // Mixed streams resolve without either class loosening the other.
  const mixed = resolveHumanGovernanceAuthority({ decisions: [exception(), { decisionId: "decision-1", event: "granted", outcome: "granted", authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed", scope: exception().scope, reasonCode: "SCOPE.ACCEPTED", policyDigest: sha, ruleDigest: sha, validity: { notBeforeEpochMs: 10, expiresAtEpochMs: 100, singleUse: true }, links: exceptionLinks }], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 50 });
  assert.equal(mixed.status, "granted");
  assert.equal(Object.hasOwn(mixed, "constraints"), false);
});

test("H-AC-10 keeps the published schema and the validator in agreement", () => {
  const schema = JSON.parse(readFileSync(new URL("../../../governance/schemas/human-role-exception-decision.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, "pipeline.human-role-exception-decision.v1");
  assert.deepEqual([...schema.required].sort(), Object.keys(exception()).sort());
  for (const name of schema.required) assert.ok(Object.hasOwn(schema.properties, name), name);
  assert.deepEqual([...schema.$defs.constraints.items.properties.kind.enum], ["max-artifacts", "max-commits", "no-guard-override", "no-remote-action", "no-schema-change", "no-authority-change", "single-work-package"]);
  assert.deepEqual([...schema.$defs.followUpReview.properties.review.enum], ["critic-review", "security-review", "privacy-review", "product-owner-acceptance"]);
  assert.equal(schema.$defs.constraints.minItems, 1);
  assert.deepEqual([...schema.$defs.followUpReview.required].sort(), ["dueByEpochMs", "review", "satisfiedByDecisionId"]);
  const envelope = JSON.parse(readFileSync(new URL("../../../governance/schemas/governance-event-envelope.schema.json", import.meta.url), "utf8"));
  assert.ok(envelope.properties.payloadSchema.enum.includes("pipeline.human-role-exception-decision.v1"));
});
