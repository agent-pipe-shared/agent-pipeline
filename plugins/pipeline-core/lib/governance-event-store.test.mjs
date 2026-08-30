#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Stateful PHX-1 tests for portable governance event storage. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalSha256, canonicalizeJson, sealGovernanceEvent } from "./governance-event.mjs";
import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { CRITICAL_ACTION_KINDS, createCriticalActionApprovalRequest } from "./critical-action-approval-request.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import {
  GOVERNANCE_FORK_DISPOSITION_APPROVAL,
  GovernanceEventStoreError,
  governanceForkDispositionApprovalSubject,
  assertRestrictedRoot,
  createRestrictedAuthorization,
  appendPortableGovernanceEvent,
  eraseRestrictedGovernanceEvent,
  inspectForkedGovernanceStream,
  inspectRestrictedGovernanceStore,
  loadGovernanceEventRegistry,
  putRestrictedGovernanceEvent,
  planRestrictedGovernanceOperation,
  queryRestrictedGovernanceEvent,
  queryPortableGovernanceStream,
  queryPortableGovernanceStreams,
  recoverPortableGovernanceProjection,
  verifyPortableGovernanceStream,
} from "./governance-event-store.mjs";

let fingerprint = "a".repeat(64);
let capturePolicyDigest = "b".repeat(64);
const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
const unavailable = { state: "not-applicable" };

function registryFixture() {
  return {
    schema: "pipeline.governance-stream-registry.v1",
    repositoryFingerprint: fingerprint,
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventDigestDomain: "pipeline.governance-event.v1\0",
    storageRoot: "governance/events",
    streams: [
      { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
    ],
  };
}

function capturePolicyFixture() {
  return { schema: "pipeline.governance-capture-policy.v1", policyId: "fixture", revision: "c".repeat(64), defaultAction: "deny", streams: [
    { origin: "human", purpose: "authority-history", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    { origin: "agent", purpose: "declared-assumption", materiality: "policy-selected", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    { origin: "lifecycle", purpose: "deterministic-lifecycle", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
  ], sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false }, mandatoryEventClasses: [] };
}

/*
 * NVA-REPOID-1: the physical binding this store reads is no longer a
 * function of `repositoryRoot`/`gitCommonDir` -- it is a randomly generated
 * identity, minted and persisted on first use under the git common
 * directory. `derivePoGateRepositoryFingerprint` is kept here only as a
 * convenient deterministic 64-hex value generator per fixture root (nothing
 * about its shape or meaning is asserted by this suite any more); every
 * fixture that wants the store to see it as the bound identity must SEED the
 * local binding file directly, exactly the way `assertPhysicalRoot` would
 * have written it on first use. This keeps every existing test's `fingerprint`
 * variable meaningful without rewriting each test to first learn a
 * store-generated value it cannot predict.
 */
const REPOSITORY_BINDING_SCHEMA = "pipeline.governance-event-repository-binding.v2";

async function seedRepositoryBinding(root, repositoryFingerprint, legacyAliases = []) {
  const repository = discoverRepository(root);
  const directory = path.join(repository.commonDir, "agent-pipeline", "governance-events");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "repository-binding.json"), `${canonicalizeJson({ schema: REPOSITORY_BINDING_SCHEMA, repositoryFingerprint, legacyAliases, boundAtEpochMs: 1 })}\n`);
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "governance-event-store-"));
  execFileSync("git", ["init", "-q", root]);
  const repository = discoverRepository(root);
  fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const capturePolicy = capturePolicyFixture(); capturePolicyDigest = canonicalSha256(capturePolicy);
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registryFixture())}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(capturePolicy)}\n`);
  await seedRepositoryBinding(root, fingerprint);
  return root;
}

function intent(overrides = {}) {
  return {
    schema: "pipeline.governance-event-envelope.v1",
    payloadSchema: "pipeline.lifecycle-governance-event.v1",
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventId: "evt-1",
    idempotencyKey: "idem-1",
    origin: "lifecycle",
    authorityClass: "non-authoritative",
    eventType: "lifecycle.dispatch",
    occurredAtEpochMs: 1,
    observedAtEpochMs: 1,
    timeAssurance: "locally-observed",
    repositoryFingerprint: fingerprint,
    sourceUri: `urn:pipeline:repository:${fingerprint}`,
    streamId: "lifecycle",
    correlation: { featureId: unavailable, packageId: "phoenix-3", requestId: unavailable, sessionId: unavailable, dispatchId: "dispatch-1", traceId: unavailable },
    candidate,
    artifacts: [unavailable],
    policy: { policyDigest: unavailable, configurationDigest: unavailable, capturePolicyDigest, redactionPolicyDigest: unavailable },
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payload: { eventId: "lifecycle-1", kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1", correlationId: "correlation-1", queueRevision: 0 }, candidate, invalidatesEventId: null, supersedesEventId: null },
    ...overrides,
  };
}

async function append(root, event = intent()) {
  return appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint: fingerprint, intent: event });
}

async function cleanup(root) { await rm(root, { recursive: true, force: true }); }

/* ADR-0072 fixtures: a fork disposition is no longer self-mintable, so every
 * disposition below now carries a real, verified PO approval. The trust anchor
 * is declared in the repository's OWN policy file because the store accepts no
 * caller-supplied one — a library caller that could hand in the anchor its own
 * proof verifies against would be exactly the self-minting K-AC-05 Finding 1. */
const PO_KEY_REFERENCE = "po-fork-disposition-fixture";
const FAR_FUTURE = "2999-01-01T00:00:00.000Z";

async function poAuthority(root, { keyReference = PO_KEY_REFERENCE, declare = true } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  if (declare) {
    await mkdir(path.join(root, "project"), { recursive: true });
    await writeFile(path.join(root, "project/critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1",
      requiredKinds: ["governance-fork-disposition"],
      trustAnchor: { keyReference, publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") },
    }));
  }
  return { privateKey, publicKeyPem, keyReference };
}

async function forkedEventDigestsAt(root, streamId, sequence) {
  const inspected = await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId });
  return inspected.forks.find((entry) => entry.sequence === sequence).entries.map((entry) => entry.eventDigest);
}

/** Mints the signature-mode approval a real PO would produce offline: the subject
 * is rebuilt from the fork's actual content digests, exactly as the store rebuilds
 * it at verification time. */
async function approvalFor(root, streamId, sequence, { expiresAt = FAR_FUTURE, authority = null, forkedEventDigests = null, signWith = null } = {}) {
  const anchor = authority ?? await poAuthority(root);
  const subject = governanceForkDispositionApprovalSubject({
    repositoryFingerprint: fingerprint,
    streamId,
    sequence,
    forkedEventDigests: forkedEventDigests ?? await forkedEventDigestsAt(root, streamId, sequence),
  });
  const request = createCriticalActionApprovalRequest({
    candidate: subject.candidate,
    featureId: GOVERNANCE_FORK_DISPOSITION_APPROVAL.featureId,
    planBytes: Buffer.from(GOVERNANCE_FORK_DISPOSITION_APPROVAL.planLabel, "utf8"),
    specBytes: Buffer.from(GOVERNANCE_FORK_DISPOSITION_APPROVAL.specLabel, "utf8"),
    action: { kind: GOVERNANCE_FORK_DISPOSITION_APPROVAL.kind, subjectSha256: subject.subjectSha256, expiresAt },
  });
  const signer = signWith ?? anchor;
  return {
    mode: "signature",
    request,
    proof: {
      schema: PO_APPROVAL_PROOF_SCHEMA,
      intentSha256: request.approvalIntent.sha256,
      keyReference: anchor.keyReference,
      publicKey: signer.publicKeyPem,
      signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), signer.privateKey).toString("base64"),
    },
  };
}

/** A stream with two genuine, sequence-1-rooted events, forked from the same
 * predecessor at sequence 2 — reusing the exact fork-construction technique
 * the existing K-AC-05 test uses (a rogue `sealGovernanceEvent` written
 * directly to the canonical directory), just at the second position instead
 * of the first, so the non-forked prefix is non-trivial. */
async function forkedLifecycleFixture() {
  const root = await fixtureRoot();
  const first = await append(root);
  const second = await append(root, intent({ eventId: "evt-2", idempotencyKey: "idem-2", payload: { ...intent().payload, eventId: "lifecycle-2", reasonCode: "CONTINUED" }, occurredAtEpochMs: 2, observedAtEpochMs: 2 }));
  const fork = sealGovernanceEvent({ ...intent({ eventId: "evt-fork", idempotencyKey: "idem-fork" }), sequence: 2, previousEventDigest: first.eventDigest, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  await writeFile(path.join(root, "governance/events/lifecycle/2-evt-fork.json"), `${canonicalizeJson(fork)}\n`);
  return { root, first, second, fork };
}

test("portable append publishes canonical bytes, readback checkpoint, and source-last head", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const observed = await append(root);
  assert.equal(observed.outcome, "appended");
  assert.equal(observed.eventPath, "governance/events/lifecycle/1-evt-1.json");
  assert.deepEqual(observed.checkpoint, { repositoryFingerprint: fingerprint, streamId: "lifecycle", sequence: 1, eventDigest: observed.eventDigest, candidateCommit: candidate.commit, candidateTree: candidate.tree });
  const stored = await readFile(path.join(root, observed.eventPath), "utf8");
  assert.match(stored, /^\{"artifacts":/u, "stored record must be canonical JSON, not a pretty-print projection");
  const heads = JSON.parse(await readFile(path.join(root, "governance/events/heads.json"), "utf8"));
  assert.deepEqual(heads.streams.lifecycle, { sequence: 1, eventDigest: observed.eventDigest });
  assert.equal((await loadGovernanceEventRegistry({ repositoryRoot: root })).repositoryFingerprint, fingerprint);
});

test("exact idempotency is a zero-write replay while a conflicting key fails closed", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const replay = await append(root);
  assert.equal(replay.outcome, "idempotent-replay");
  assert.equal(replay.eventDigest, first.eventDigest);
  const conflict = intent({ payload: { ...intent().payload, reasonCode: "CHANGED" } });
  await assert.rejects(() => append(root, conflict), (error) => error instanceof GovernanceEventStoreError && error.code === "GES-IDEMPOTENCY-CONFLICT");
  const result = await verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.equal(result.eventCount, 1);
});

test("D-1: an attribution-schema intent cannot reach the portable stream even mislabeled repository-public-safe", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const attempt = intent({
    payloadSchema: "pipeline.human-decision-attribution.v1",
    origin: "human", authorityClass: "human-authority", streamId: "human",
    eventType: "human.attributed",
    payload: { schema: "pipeline.human-decision-attribution.v1" },
  });
  // assertIntent's own storageProfile === "repository-public-safe" requirement
  // for every portable intent, and governance-event.mjs's new attribution-only-
  // restricted coherence rule, are mutually exclusive for this schema -- so the
  // envelope-shape check inside assertIntent fails first, before the human
  // payload validator ever runs.
  await assert.rejects(() => append(root, attempt), (error) => error instanceof GovernanceEventStoreError && error.code === "GES-INTENT");
});

test("agent journal payloads persist only as candidate-bound, closed observational events", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const payload = { eventId: "agent-decision-1", kind: "assumption", state: "declared", reasonCode: "ASSUMPTION.DECLARED", candidateDigest: canonicalSha256(candidate), relatedHumanDecisionId: null, supersedesEventId: null };
  const observed = await append(root, intent({ payloadSchema: "pipeline.agent-decision-event.v1", eventId: "agent-event-1", idempotencyKey: "agent-idem-1", origin: "agent", authorityClass: "non-authoritative", eventType: "agent.assumption", streamId: "agent", payload }));
  assert.equal(observed.eventPath, "governance/events/agent/1-agent-event-1.json");
  const mismatched = { ...payload, candidateDigest: "d".repeat(64) };
  await assert.rejects(() => append(root, intent({ payloadSchema: "pipeline.agent-decision-event.v1", eventId: "agent-event-2", idempotencyKey: "agent-idem-2", origin: "agent", authorityClass: "non-authoritative", eventType: "agent.assumption", streamId: "agent", payload: mismatched })), (error) => error.code === "GES-PAYLOAD-SCHEMA");
});

test("portable admission requires the exact effective policy and closed safe payload", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  await assert.rejects(() => append(root, intent({ policy: { ...intent().policy, capturePolicyDigest: "d".repeat(64) } })), (error) => error.code === "GES-CAPTURE-POLICY-BINDING");
  await assert.rejects(() => append(root, intent({ payload: { ...intent().payload, privateReason: "no" } })), (error) => error.code === "GES-PAYLOAD-SCHEMA");
});

/** Same layout as `fixtureRoot`, but the written capture policy marks the
 * given A-AC-07 event classes `mandatoryEventClasses` instead of leaving the
 * set empty, reusing (and reassigning, exactly like `fixtureRoot`) the
 * shared `fingerprint`/`capturePolicyDigest` module state so `intent()`
 * still binds correctly with no further overrides. */
async function mandatoryFixtureRoot(mandatoryEventClasses) {
  const root = await mkdtemp(path.join(os.tmpdir(), "governance-event-store-mandatory-"));
  execFileSync("git", ["init", "-q", root]);
  const repository = discoverRepository(root);
  fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const capturePolicy = { ...capturePolicyFixture(), mandatoryEventClasses };
  capturePolicyDigest = canonicalSha256(capturePolicy);
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registryFixture())}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(capturePolicy)}\n`);
  await seedRepositoryBinding(root, fingerprint);
  return root;
}

function offerPayload(overrides = {}) {
  return {
    eventId: "agent-offer-1", kind: "command-offer", state: "offered", reasonCode: "EXTERNAL_OPERATION_OFFERED",
    candidateDigest: canonicalSha256(candidate), relatedHumanDecisionId: null, supersedesEventId: null,
    offerOrigin: "pipeline-initiated",
    operation: { operationClass: "governed-repair", version: "v1", governedArtifactSha256: "b".repeat(64) },
    target: { repositoryFingerprint: "c".repeat(64), scopeDigest: "d".repeat(64) },
    sideEffectClass: "non-authoritative", authorityRequirement: "not-required",
    policyDigest: "e".repeat(64), redactionPolicyDigest: "f".repeat(64),
    executionAssurance: "not-applicable",
    omissions: ["raw-command", "arguments", "private-coordinates", "unrestricted-output"],
    offerEventId: null, preEvidenceDigest: null, postEvidenceDigest: null, recoverability: "not-applicable",
    ...overrides,
  };
}

function offerIntent(overrides = {}) {
  return intent({
    payloadSchema: "pipeline.agent-decision-event.v1", eventId: "agent-offer-1", idempotencyKey: "agent-offer-idem-1",
    origin: "agent", authorityClass: "non-authoritative", eventType: "agent.command-offer", streamId: "agent",
    payload: offerPayload(),
    ...overrides,
  });
}

test("A-AC-07 a mandatory event class cannot be silently sampled out, while a non-mandatory class still can", async (t) => {
  const root = await mandatoryFixtureRoot(["security"]); t.after(() => cleanup(root));
  const securityOffer = offerIntent({ payload: offerPayload({ sideEffectClass: "guard-bypass" }) });
  await assert.rejects(
    () => appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint: fingerprint, intent: securityOffer, captureDecision: "sampled-out" }),
    (error) => error instanceof GovernanceEventStoreError && error.code === "GES-MANDATORY-CAPTURE",
    "a guard-bypass command offer represents the security class, which this policy marks mandatory",
  );
  const captured = await appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint: fingerprint, intent: securityOffer });
  assert.equal(captured.outcome, "appended", "the default captured decision is unaffected by the new mandatory gate");
  const recoveryOnly = offerIntent({ eventId: "agent-offer-2", idempotencyKey: "agent-offer-idem-2", payload: offerPayload({ eventId: "agent-offer-2", recoverability: "rollback-required" }) });
  const sampledOut = await appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint: fingerprint, intent: recoveryOnly, captureDecision: "sampled-out" });
  assert.equal(sampledOut.outcome, "sampled-out", "recovery is not marked mandatory in this policy, so today's sampling behavior is unchanged");
  assert.equal(sampledOut.eventDigest, null);
  const scanned = await verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "agent" });
  assert.equal(scanned.eventCount, 1, "only the captured security offer was durably written; the sampled-out event left no file");
});

test("A-AC-07 capture decisions are closed, and only the policy-selected agent stream may ever be sampled out", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  await assert.rejects(
    () => appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint: fingerprint, intent: intent(), captureDecision: "maybe" }),
    (error) => error instanceof GovernanceEventStoreError && error.code === "GES-CAPTURE-DECISION",
  );
  await assert.rejects(
    () => appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint: fingerprint, intent: intent(), captureDecision: "sampled-out" }),
    (error) => error instanceof GovernanceEventStoreError && error.code === "GES-MANDATORY-CAPTURE",
    "the lifecycle origin's materiality is required, never policy-selected, so it may never be sampled out",
  );
});

test("verification is checkpoint-aware and queries return only validated chain records", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const second = await append(root, intent({ eventId: "evt-2", idempotencyKey: "idem-2", payload: { ...intent().payload, eventId: "lifecycle-2", reasonCode: "CONTINUED" }, occurredAtEpochMs: 2, observedAtEpochMs: 2 }));
  const prefix = await verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.deepEqual(prefix, { integrity: "prefix-valid", completeness: "unknown", streamId: "lifecycle", eventCount: 2 });
  const complete = await verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: second.checkpoint });
  assert.equal(complete.completeness, "verified");
  const queried = await queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: first.checkpoint });
  assert.equal(queried.completeness, "unknown");
  assert.deepEqual(queried.events.map((event) => event.sequence), [1]);
});

test("tampering, non-canonical bytes, and forks fail before projection or query", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const eventPath = path.join(root, first.eventPath);
  await writeFile(eventPath, `${JSON.stringify({ changed: true })}\n`);
  await assert.rejects(() => verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error.code === "GES-EVENT-INVALID");
  const forkRoot = await fixtureRoot(); t.after(() => cleanup(forkRoot));
  await append(forkRoot);
  const fork = sealGovernanceEvent({ ...intent({ eventId: "evt-fork", idempotencyKey: "idem-fork" }), sequence: 1, previousEventDigest: null, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  await writeFile(path.join(forkRoot, "governance/events/lifecycle/1-evt-fork.json"), `${canonicalizeJson(fork)}\n`);
  await assert.rejects(() => verifyPortableGovernanceStream({ repositoryRoot: forkRoot, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error.code === "GES-FORK");
});

test("K-AC-05 a forked stream also fails closed for append and recovery attempts, not only verify/query", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const fork = sealGovernanceEvent({ ...intent({ eventId: "evt-fork", idempotencyKey: "idem-fork" }), sequence: 1, previousEventDigest: null, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  await writeFile(path.join(root, "governance/events/lifecycle/1-evt-fork.json"), `${canonicalizeJson(fork)}\n`);
  await assert.rejects(() => append(root, intent({ eventId: "evt-after-fork-append", idempotencyKey: "idem-after-fork-append" })), (error) => error.code === "GES-FORK", "append must fail closed on a forked stream, not silently pick a winner");
  const recovery = { idempotencyKey: "recover-after-fork-1", expectedHeadsDigest: "e".repeat(64), requestedPostimageDigest: "f".repeat(64) };
  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: first.checkpoint, recovery }), (error) => error.code === "GES-FORK", "recovery must still fail closed on a forked stream when no matching governed disposition is supplied — recovery IS the sanctioned recovery operation that can process a fork, but only via its own disposition parameter, not by silently proceeding");
});

test("inspectForkedGovernanceStream tolerates exactly the forked-sequence condition, returns the correct non-forked prefix, and still throws on unrelated defects with no fork present", async (t) => {
  const { root, second, fork } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const inspected = await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.deepEqual(inspected.prefix.map((event) => event.sequence), [1], "the prefix must stop strictly before the first fork position");
  assert.equal(inspected.prefix[0].eventId, "evt-1");
  assert.equal(inspected.forks.length, 1);
  assert.equal(inspected.forks[0].sequence, 2);
  assert.deepEqual(inspected.forks[0].entries.map((entry) => entry.eventId).sort(), ["evt-2", "evt-fork"]);
  assert.deepEqual(inspected.forks[0].entries.map((entry) => entry.eventDigest).sort(), [second.eventDigest, fork.eventDigest].sort());

  const symlinkedRoot = await fixtureRoot(); t.after(() => cleanup(symlinkedRoot));
  await mkdir(path.join(symlinkedRoot, "outside"));
  await symlink(path.join(symlinkedRoot, "outside"), path.join(symlinkedRoot, "governance/events/lifecycle"));
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: symlinkedRoot, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error.code === "GES-SYMLINK", "an unrelated symlinked stream directory must still hard-fail even though no fork is present");

  const noncanonicalRoot = await fixtureRoot(); t.after(() => cleanup(noncanonicalRoot));
  const noncanonicalAppend = await append(noncanonicalRoot);
  const noncanonicalPath = path.join(noncanonicalRoot, noncanonicalAppend.eventPath);
  const storedValue = JSON.parse(await readFile(noncanonicalPath, "utf8"));
  await writeFile(noncanonicalPath, `${JSON.stringify(storedValue, null, 2)}\n`);
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: noncanonicalRoot, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error.code === "GES-NONCANONICAL", "non-canonical bytes must still hard-fail even though no fork is present — this is scanStream tolerant of exactly one condition, not scanStream-that-never-throws");
});

test("K-AC-05 a fork at sequence 1 yields an empty non-forked prefix (zero-length prefix boundary), and a matching disposition can still be recorded through recovery", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  await mkdir(path.join(root, "governance/events/lifecycle"), { recursive: true });
  const first = sealGovernanceEvent({ ...intent({ eventId: "evt-1a", idempotencyKey: "idem-1a" }), sequence: 1, previousEventDigest: null, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  const second = sealGovernanceEvent({ ...intent({ eventId: "evt-1b", idempotencyKey: "idem-1b" }), sequence: 1, previousEventDigest: null, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  await writeFile(path.join(root, "governance/events/lifecycle/1-evt-1a.json"), `${canonicalizeJson(first)}\n`);
  await writeFile(path.join(root, "governance/events/lifecycle/1-evt-1b.json"), `${canonicalizeJson(second)}\n`);

  const inspected = await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.deepEqual(inspected.prefix, [], "a fork at the very first sequence must yield an empty, not a throwing, non-forked prefix");
  assert.equal(inspected.forks.length, 1);
  assert.equal(inspected.forks[0].sequence, 1);
  assert.deepEqual(inspected.forks[0].entries.map((entry) => entry.eventId).sort(), ["evt-1a", "evt-1b"]);

  const disposition = { idempotencyKey: "fork-disp-seq1", sequence: 1, acknowledgedEventIds: ["evt-1a", "evt-1b"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 1, approval: await approvalFor(root, "lifecycle", 1) };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  assert.equal(recorded.status, "fork-disposition-recorded");
  assert.equal(recorded.path, "governance/events/fork-disposition/lifecycle/1.json");
});

test("K-AC-05 a 3-way fork at one sequence is detected in full, and a disposition must acknowledge every conflicting record", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const makeConflict = (eventId, idempotencyKey) => sealGovernanceEvent({ ...intent({ eventId, idempotencyKey }), sequence: 2, previousEventDigest: first.eventDigest, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  const conflictA = makeConflict("evt-2a", "idem-2a");
  const conflictB = makeConflict("evt-2b", "idem-2b");
  const conflictC = makeConflict("evt-2c", "idem-2c");
  await writeFile(path.join(root, "governance/events/lifecycle/2-evt-2a.json"), `${canonicalizeJson(conflictA)}\n`);
  await writeFile(path.join(root, "governance/events/lifecycle/2-evt-2b.json"), `${canonicalizeJson(conflictB)}\n`);
  await writeFile(path.join(root, "governance/events/lifecycle/2-evt-2c.json"), `${canonicalizeJson(conflictC)}\n`);

  const inspected = await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.equal(inspected.forks.length, 1);
  assert.equal(inspected.forks[0].sequence, 2);
  assert.deepEqual(inspected.forks[0].entries.map((entry) => entry.eventId).sort(), ["evt-2a", "evt-2b", "evt-2c"]);

  const disposition = { idempotencyKey: "fork-disp-3way", sequence: 2, acknowledgedEventIds: ["evt-2a", "evt-2b", "evt-2c"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 2, approval: await approvalFor(root, "lifecycle", 2) };
  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...disposition, idempotencyKey: "fork-disp-3way-partial", acknowledgedEventIds: ["evt-2a", "evt-2b"] } }), (error) => error.code === "GES-FORK-DISPOSITION-MISMATCH", "acknowledging only two of three conflicting records must fail closed");
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  assert.equal(recorded.status, "fork-disposition-recorded");
  assert.deepEqual(recorded.disposition.acknowledgedEventIds, ["evt-2a", "evt-2b", "evt-2c"].sort());
});

test("inspectForkedGovernanceStream still throws GES-CHAIN on a sequence gap with no fork present anywhere", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const gapped = sealGovernanceEvent({ ...intent({ eventId: "evt-3", idempotencyKey: "idem-3" }), sequence: 3, previousEventDigest: first.eventDigest, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  await writeFile(path.join(root, "governance/events/lifecycle/3-evt-3.json"), `${canonicalizeJson(gapped)}\n`);
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error.code === "GES-CHAIN", "a sequence gap with no fork anywhere must still hard-fail exactly as scanStream would");
});

test("inspectForkedGovernanceStream still throws GES-IDEMPOTENCY-CONFLICT on a duplicate idempotency key across two singleton, non-forked sequences", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const reused = sealGovernanceEvent({ ...intent({ eventId: "evt-2", idempotencyKey: "idem-1", payload: { ...intent().payload, eventId: "lifecycle-2", reasonCode: "DIFFERENT" } }), sequence: 2, previousEventDigest: first.eventDigest, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  await writeFile(path.join(root, "governance/events/lifecycle/2-evt-2.json"), `${canonicalizeJson(reused)}\n`);
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error.code === "GES-IDEMPOTENCY-CONFLICT", "a reused idempotency key across two singleton, non-forked sequences must still hard-fail exactly as scanStream would");
});

test("K-AC-05 recovering a forked stream with a matching disposition is recoverPortableGovernanceProjection itself: it binds the exact fork position and event set, writes exactly one durable record, never touches heads.json, and never touches either conflicting canonical file", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const canonicalPathA = path.join(root, "governance/events/lifecycle/2-evt-2.json");
  const canonicalPathB = path.join(root, "governance/events/lifecycle/2-evt-fork.json");
  const headsPath = path.join(root, "governance/events/heads.json");
  const beforeA = await readFile(canonicalPathA);
  const beforeB = await readFile(canonicalPathB);
  const headsBefore = await readFile(headsPath, "utf8");

  const disposition = { idempotencyKey: "fork-disp-1", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 12345, approval: await approvalFor(root, "lifecycle", 2) };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  assert.equal(recorded.status, "fork-disposition-recorded");
  assert.equal(recorded.path, "governance/events/fork-disposition/lifecycle/2.json");
  const dispositionPath = path.join(root, recorded.path);
  const persisted = JSON.parse(await readFile(dispositionPath, "utf8"));
  assert.equal(persisted.sequence, 2);
  assert.deepEqual(persisted.acknowledgedEventIds, ["evt-2", "evt-fork"].sort());

  assert.deepEqual(await readFile(canonicalPathA), beforeA, "the original event at 2-evt-2.json must be byte-for-byte unchanged");
  assert.deepEqual(await readFile(canonicalPathB), beforeB, "the original event at 2-evt-fork.json must be byte-for-byte unchanged");
  assert.equal(await readFile(headsPath, "utf8"), headsBefore, "recording a disposition through recovery must never touch heads.json — this is never a projection rebuild");

  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...disposition, idempotencyKey: "fork-disp-2", sequence: 1, acknowledgedEventIds: ["evt-1", "evt-x"] } }), (error) => error.code === "GES-FORK-DISPOSITION-MISMATCH", "naming a sequence that is not actually forked must fail closed");

  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...disposition, idempotencyKey: "fork-disp-3", acknowledgedEventIds: ["evt-2"] } }), (error) => error.code === "GES-FORK-DISPOSITION-MISMATCH", "omitting a conflicting eventId must fail closed");
  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...disposition, idempotencyKey: "fork-disp-4", acknowledgedEventIds: ["evt-2", "evt-fork", "evt-extra"] } }), (error) => error.code === "GES-FORK-DISPOSITION-MISMATCH", "naming an extra eventId must fail closed");

  const beforeMtime = (await stat(dispositionPath)).mtimeMs;
  const replay = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  assert.equal(replay.status, "fork-disposition-idempotent-replay");
  const afterMtime = (await stat(dispositionPath)).mtimeMs;
  assert.equal(afterMtime, beforeMtime, "an identical replay must be a zero-additional-write idempotent replay");

  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...disposition, reasonCode: "DIFFERENT_REASON" } }), (error) => error.code === "GES-FORK-DISPOSITION-CONFLICT", "the same idempotencyKey with different disposition content must fail closed with a distinct conflict code");
});

test("K-AC-05 recording a fork disposition removes an orphaned temporary disposition file left behind by a crashed writer, exactly as canonical-event orphans are swept", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const dispositionDir = path.join(root, "governance/events/fork-disposition/lifecycle");
  await mkdir(dispositionDir, { recursive: true });
  const orphan = path.join(dispositionDir, ".2.json.0123456789abcdef01234567.tmp");
  await writeFile(orphan, "partial writer bytes");
  const disposition = { idempotencyKey: "fork-disp-orphan", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 5, approval: await approvalFor(root, "lifecycle", 2) };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  assert.equal(recorded.status, "fork-disposition-recorded");
  await assert.rejects(() => stat(orphan), { code: "ENOENT" }, "an orphaned temporary disposition file must be swept while the stream's exclusive lock is held");
});

test("K-AC-05 a recorded fork disposition never makes the stream normally usable again — append/verify/query/an ordinary recovery call carrying no matching disposition still fail closed with GES-FORK", async (t) => {
  const { root, first } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const disposition = { idempotencyKey: "fork-disp-boundary-1", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 999, approval: await approvalFor(root, "lifecycle", 2) };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  assert.equal(recorded.status, "fork-disposition-recorded");
  await assert.rejects(() => append(root, intent({ eventId: "evt-after-disposition", idempotencyKey: "idem-after-disposition" })), (error) => error.code === "GES-FORK", "append must still fail closed after a disposition is recorded");
  await assert.rejects(() => verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error.code === "GES-FORK", "verify must still fail closed after a disposition is recorded");
  await assert.rejects(() => queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error.code === "GES-FORK", "query must still fail closed after a disposition is recorded");
  const recovery = { idempotencyKey: "recover-after-disposition-1", expectedHeadsDigest: "e".repeat(64), requestedPostimageDigest: "f".repeat(64) };
  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: first.checkpoint, recovery }), (error) => error.code === "GES-FORK", "an ordinary recovery call carrying no matching disposition must still fail closed after a disposition is recorded");
});

test("K-AC-05 inspectForkedGovernanceStream reports a recorded disposition's own content on the corresponding fork entry, readable without touching internal storage paths", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const approval = await approvalFor(root, "lifecycle", 2);
  const disposition = { idempotencyKey: "fork-disp-visible-1", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 4242, approval };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  assert.equal(recorded.status, "fork-disposition-recorded");
  const inspected = await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.equal(inspected.forks.length, 1);
  assert.deepEqual(inspected.forks[0].disposition, {
    idempotencyKey: "fork-disp-visible-1",
    sequence: 2,
    acknowledgedEventIds: ["evt-2", "evt-fork"].sort(),
    reasonCode: "GOVERNED_ACK",
    disposedAtEpochMs: 4242,
    approval: {
      mode: "signature",
      subjectSha256: approval.request.action.subjectSha256,
      intentSha256: approval.request.approvalIntent.sha256,
      proofSha256: inspected.forks[0].disposition.approval.proofSha256,
      keyReference: PO_KEY_REFERENCE,
      expiresAt: FAR_FUTURE,
    },
  }, "the recorded governed disposition must be readable straight from inspectForkedGovernanceStream's own output, not from the internal fork-disposition path");
});

test("ADR-0072 CRITICAL_ACTION_KINDS gains the fork-disposition kind without disturbing its three original members", () => {
  assert.equal(CRITICAL_ACTION_KINDS.includes("governance-fork-disposition"), true);
  assert.deepEqual(CRITICAL_ACTION_KINDS.slice(0, 3), ["push", "deploy", "publication"], "the three original kinds must keep their identity and order");
});

test("ADR-0072 a fork disposition carrying no approval at all is refused — the record is no longer self-mintable", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const bare = { idempotencyKey: "fork-disp-bare", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 1 };
  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: bare }), (error) => error.code === "GES-FORK-DISPOSITION", "the exact pre-ADR-0072 shape — every field a caller could mint alone — must now be refused as an incomplete disposition");
  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...bare, approval: null } }), (error) => error.code === "GES-FORK-DISPOSITION-APPROVAL");
  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...bare, approval: { mode: "none" } } }), (error) => error.code === "GES-FORK-DISPOSITION-APPROVAL");
});

test("ADR-0072 a fork disposition proof must come from the repository's declared trust anchor, must not be expired, and must not be forged", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const base = { idempotencyKey: "fork-disp-proof", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 1 };
  const dispose = (approval, overrides = {}) => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...base, ...overrides, approval } });

  const declared = await poAuthority(root);
  const impostor = await poAuthority(root, { declare: false });
  await assert.rejects(async () => dispose(await approvalFor(root, "lifecycle", 2, { authority: declared, signWith: impostor })), (error) => error.code === "GES-FORK-DISPOSITION-APPROVAL-UNVERIFIED", "a proof signed by a key the repository never declared must fail closed");

  const valid = await approvalFor(root, "lifecycle", 2, { authority: declared });
  await assert.rejects(async () => dispose({ ...valid, proof: { ...valid.proof, signatureBase64: Buffer.from("not a signature").toString("base64") } }), (error) => error.code === "GES-FORK-DISPOSITION-APPROVAL-UNVERIFIED", "a tampered signature must fail closed");
  await assert.rejects(async () => dispose(await approvalFor(root, "lifecycle", 2, { authority: declared, expiresAt: "2000-01-01T00:00:00.000Z" })), (error) => error.code === "GES-FORK-DISPOSITION-APPROVAL-UNVERIFIED", "an expired approval must fail closed");

  // The genuine one still records, so the rejections above are not a fixture that could never succeed.
  assert.equal((await dispose(valid)).status, "fork-disposition-recorded");
});

test("ADR-0072 a fork disposition proof binds the exact stream position and the exact conflicting CONTENT digests, not the caller's claim", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const declared = await poAuthority(root);
  const base = { idempotencyKey: "fork-disp-subject", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 1 };
  const dispose = (approval) => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...base, approval } });

  const actual = await forkedEventDigestsAt(root, "lifecycle", 2);
  await assert.rejects(async () => dispose(await approvalFor(root, "lifecycle", 2, { authority: declared, forkedEventDigests: [actual[0], "9".repeat(64)] })), (error) => error.code === "GES-FORK-DISPOSITION-APPROVAL-SUBJECT", "an approval signed over different content digests must not clear this fork");
  const wrongSequence = await approvalFor(root, "lifecycle", 2, { authority: declared, forkedEventDigests: actual });
  const otherSequence = governanceForkDispositionApprovalSubject({ repositoryFingerprint: fingerprint, streamId: "lifecycle", sequence: 7, forkedEventDigests: actual });
  await assert.rejects(async () => dispose({ ...wrongSequence, request: { ...wrongSequence.request, action: { ...wrongSequence.request.action, subjectSha256: otherSequence.subjectSha256 } } }), (error) => error.code === "GES-FORK-DISPOSITION-APPROVAL-SUBJECT", "an approval bound to another sequence must not clear this one");
});

test("ADR-0072 a fork disposition needs a declared trust anchor, and chat clearance is refused while gates.push_approval resolves to signature", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const base = { idempotencyKey: "fork-disp-mode", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 1 };
  const dispose = (approval) => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition: { ...base, approval } });
  await assert.rejects(async () => dispose({ mode: "chat", clearedBy: "product-owner", clearedAtEpochMs: 5 }), (error) => error.code === "GES-FORK-DISPOSITION-APPROVAL-MODE", "a repository that never configured chat mode must refuse an in-session clearance, exactly as push does");

  const digests = await forkedEventDigestsAt(root, "lifecycle", 2);
  const undeclared = await poAuthority(root, { declare: false });
  await assert.rejects(async () => dispose(await approvalFor(root, "lifecycle", 2, { authority: undeclared, forkedEventDigests: digests })), (error) => error.code === "GES-FORK-DISPOSITION-TRUST-ANCHOR", "with no committed trustAnchor there is no external authority to verify against, so the disposition must fail closed rather than accept the caller's own key");
});

test("ADR-0072 gates.push_approval: chat records an attributed, self-declaring in-session clearance — exactly as weak as push's own chat mode", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  await writeFile(path.join(root, "pipeline.user.yaml"), "gates:\n  push_approval: chat\n");
  execFileSync("git", ["-C", root, "add", "--", "pipeline.user.yaml"]);
  execFileSync("git", ["-C", root, "-c", "user.email=fixture@example.invalid", "-c", "user.name=fixture", "commit", "-q", "-m", "fixture: configure chat approval mode"]);

  const disposition = { idempotencyKey: "fork-disp-chat", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 1, approval: { mode: "chat", clearedBy: "product-owner", clearedAtEpochMs: 5 } };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  assert.equal(recorded.status, "fork-disposition-recorded");
  const inspected = await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  const approval = inspected.forks[0].disposition.approval;
  assert.equal(approval.mode, "chat", "the record must declare its own weakness rather than reading like a verified proof");
  assert.equal(approval.clearedBy, "product-owner");
  assert.equal(approval.source, "pipeline.user.yaml", "the clearance must name the configuration that admitted it, and the store — not the caller — must set that field");
  assert.equal(Object.hasOwn(approval, "proofSha256"), false, "a chat clearance must never masquerade as carrying proof material");
});

test("ADR-0076 committed global human_approval: chat records a terminal- and proof-free explicit attribution bound to the observed fork", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  await writeFile(path.join(root, "pipeline.user.yaml"), "gates:\n  human_approval: chat\n");
  execFileSync("git", ["-C", root, "add", "--", "pipeline.user.yaml"]);
  execFileSync("git", ["-C", root, "-c", "user.email=fixture@example.invalid", "-c", "user.name=fixture", "commit", "-q", "-m", "fixture: configure global chat approval mode"]);
  const disposition = { idempotencyKey: "fork-disp-global-chat", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 1, approval: { mode: "chat", clearedBy: "product-owner", clearedAtEpochMs: 5 } };
  await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  const inspected = await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  const approval = inspected.forks[0].disposition.approval;
  assert.equal(approval.mode, "chat-attributed-unattested");
  assert.equal(approval.subjectSha256, governanceForkDispositionApprovalSubject({ repositoryFingerprint: fingerprint, streamId: "lifecycle", sequence: 2, forkedEventDigests: await forkedEventDigestsAt(root, "lifecycle", 2) }).subjectSha256);
  assert.equal(approval.source, "pipeline.user.yaml");
  assert.equal(Object.hasOwn(approval, "proofSha256"), false);
});

test("ADR-0072 the durable record references the verified approval and never re-embeds the raw proof or signature", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const approval = await approvalFor(root, "lifecycle", 2);
  const disposition = { idempotencyKey: "fork-disp-reference", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 1, approval };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  const bytes = await readFile(path.join(root, recorded.path), "utf8");
  assert.equal(bytes.includes(approval.proof.signatureBase64), false, "the detached signature must not be copied into repository-public-safe storage");
  assert.equal(bytes.includes("BEGIN PUBLIC KEY"), false, "the public key material must not be copied into the durable record either");
  const persisted = JSON.parse(bytes);
  assert.deepEqual(Object.keys(persisted.approval).sort(), ["expiresAt", "intentSha256", "keyReference", "mode", "proofSha256", "subjectSha256"], "the record must carry a closed approval REFERENCE, mirroring how pushApproval.lastApproved references an approval");
});

test("ADR-0072 / K-AC-05 Finding 3 the read path re-checks a recorded disposition against the conflicting entries that actually exist now", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const disposition = { idempotencyKey: "fork-disp-recheck", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 1, approval: await approvalFor(root, "lifecycle", 2) };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  const dispositionPath = path.join(root, recorded.path);
  const persisted = JSON.parse(await readFile(dispositionPath, "utf8"));
  const rewrite = (overrides) => writeFile(dispositionPath, `${canonicalizeJson({ ...persisted, ...overrides })}\n`);
  const isMismatch = (error) => error instanceof GovernanceEventStoreError && error.code === "GES-FORK-DISPOSITION-MISMATCH";

  await rewrite({ acknowledgedEventIds: ["evt-2", "evt-somewhere-else"] });
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), isMismatch, "a structurally perfect, perfectly canonical record naming entries that are not the ones at this sequence must fail closed on READ, not only at write time");

  await rewrite({ approval: { ...persisted.approval, subjectSha256: "0".repeat(64) } });
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), isMismatch, "an approval whose signed subject no longer matches the conflicting entries' content digests must fail closed on read");

  await rewrite({});
  assert.equal((await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" })).forks[0].disposition.reasonCode, "GOVERNED_ACK", "the untouched record must still read back cleanly, so the rejections above discriminate");
});

test("ADR-0072 / K-AC-05 Finding 4 a symlinked ancestor on the disposition path is refused on the read side too", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const outside = await mkdtemp(path.join(os.tmpdir(), "governance-fork-disposition-outside-")); t.after(() => cleanup(outside));
  await mkdir(path.join(outside, "lifecycle"), { recursive: true });
  await writeFile(path.join(outside, "lifecycle/2.json"), "{}\n");
  await symlink(outside, path.join(root, "governance/events/fork-disposition"));
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error.code === "GES-SYMLINK", "a disposition served through a symlinked ancestor must be refused before its content is ever considered");
});

test("K-AC-05 a persisted fork disposition with a malformed non-binding field fails closed with a GovernanceEventStoreError carrying a .code, never an uncaught raw exception", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const disposition = { idempotencyKey: "fork-disp-corrupt", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 100, approval: await approvalFor(root, "lifecycle", 2) };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  const dispositionPath = path.join(root, recorded.path);
  const persisted = JSON.parse(await readFile(dispositionPath, "utf8"));
  const writeCorrupted = (overrides) => writeFile(dispositionPath, `${canonicalizeJson({ ...persisted, ...overrides })}\n`);
  const isClosedStoreError = (error) => error instanceof GovernanceEventStoreError && error.code === "GES-FORK-DISPOSITION-RECORD";

  await writeCorrupted({ acknowledgedEventIds: null });
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), isClosedStoreError, "a non-iterable acknowledgedEventIds must fail closed with a store error, not a raw TypeError out of Object.freeze([...null])");

  await writeCorrupted({ idempotencyKey: "not a closed token!" });
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), isClosedStoreError, "an out-of-pattern idempotencyKey must fail closed");

  await writeCorrupted({ reasonCode: "not a closed token!" });
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), isClosedStoreError, "an out-of-pattern reasonCode must fail closed");

  await writeCorrupted({ disposedAtEpochMs: -1 });
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), isClosedStoreError, "a negative disposedAtEpochMs must fail closed");

  await writeCorrupted({ disposedAtEpochMs: 1.5 });
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), isClosedStoreError, "a non-integer disposedAtEpochMs must fail closed");
});

test("K-AC-05 a persisted fork disposition whose on-disk bytes are not the exact canonical serialization of its own parsed value is rejected with GES-NONCANONICAL", async (t) => {
  const { root } = await forkedLifecycleFixture(); t.after(() => cleanup(root));
  const disposition = { idempotencyKey: "fork-disp-noncanonical", sequence: 2, acknowledgedEventIds: ["evt-2", "evt-fork"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 200, approval: await approvalFor(root, "lifecycle", 2) };
  const recorded = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });
  const dispositionPath = path.join(root, recorded.path);
  const persisted = JSON.parse(await readFile(dispositionPath, "utf8"));
  await writeFile(dispositionPath, `${JSON.stringify(persisted, null, 2)}\n`);
  await assert.rejects(() => inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" }), (error) => error instanceof GovernanceEventStoreError && error.code === "GES-NONCANONICAL", "pretty-printed (non-canonical) bytes for an otherwise structurally valid disposition must be rejected, mirroring readEvent's own GES-NONCANONICAL check");
});

test("K-AC-05 inspectForkedGovernanceStream distinguishes an undisposed fork (null) from a disposed one, at two fork positions in the same stream", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const forkA1 = sealGovernanceEvent({ ...intent({ eventId: "evt-2a", idempotencyKey: "idem-2a" }), sequence: 2, previousEventDigest: first.eventDigest, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  const forkA2 = sealGovernanceEvent({ ...intent({ eventId: "evt-2b", idempotencyKey: "idem-2b" }), sequence: 2, previousEventDigest: first.eventDigest, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  await writeFile(path.join(root, "governance/events/lifecycle/2-evt-2a.json"), `${canonicalizeJson(forkA1)}\n`);
  await writeFile(path.join(root, "governance/events/lifecycle/2-evt-2b.json"), `${canonicalizeJson(forkA2)}\n`);
  const forkB1 = sealGovernanceEvent({ ...intent({ eventId: "evt-3a", idempotencyKey: "idem-3a" }), sequence: 3, previousEventDigest: "0".repeat(64), payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  const forkB2 = sealGovernanceEvent({ ...intent({ eventId: "evt-3b", idempotencyKey: "idem-3b" }), sequence: 3, previousEventDigest: "0".repeat(64), payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  await writeFile(path.join(root, "governance/events/lifecycle/3-evt-3a.json"), `${canonicalizeJson(forkB1)}\n`);
  await writeFile(path.join(root, "governance/events/lifecycle/3-evt-3b.json"), `${canonicalizeJson(forkB2)}\n`);

  const beforeDisposition = await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.equal(beforeDisposition.forks.length, 2);
  assert.equal(beforeDisposition.forks[0].sequence, 2);
  assert.equal(beforeDisposition.forks[1].sequence, 3);
  assert.equal(beforeDisposition.forks[0].disposition, null, "an undisposed fork must report its absence as null, distinguishable from a fork with a recorded disposition");
  assert.equal(beforeDisposition.forks[1].disposition, null);

  const disposition = { idempotencyKey: "fork-disp-partial", sequence: 2, acknowledgedEventIds: ["evt-2a", "evt-2b"], reasonCode: "GOVERNED_ACK", disposedAtEpochMs: 7, approval: await approvalFor(root, "lifecycle", 2) };
  await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", disposition });

  const afterDisposition = await inspectForkedGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.notEqual(afterDisposition.forks[0].disposition, null, "the now-disposed sequence must report its disposition content instead of null");
  assert.equal(afterDisposition.forks[0].disposition.reasonCode, "GOVERNED_ACK");
  assert.equal(afterDisposition.forks[1].disposition, null, "the still-undisposed sequence must remain distinguishably null, unaffected by the other sequence's disposition");
});

test("K-AC-08 rejects a head/index checkpoint asserting an absent or invalid canonical record instead of trusting the projection", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const absent = { ...first.checkpoint, sequence: 99, eventDigest: "e".repeat(64) };
  await assert.rejects(() => verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: absent }), (error) => error.code === "GES-CHECKPOINT", "an absent asserted record must fail closed");
  await assert.rejects(() => queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: absent }), (error) => error.code === "GES-CHECKPOINT", "query must not trust the absent-record assertion either");
  const invalid = { ...first.checkpoint, eventDigest: "f".repeat(64) };
  await assert.rejects(() => verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: invalid }), (error) => error.code === "GES-CHECKPOINT", "an invalid (digest-mismatched) asserted record must fail closed");
  await assert.rejects(() => queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: invalid }), (error) => error.code === "GES-CHECKPOINT", "query must not trust the invalid-record assertion either");
});

test("symlink, cross-repository, and writer-owned intent fields are rejected", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  await assert.rejects(() => appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint: "d".repeat(64), intent: intent() }), (error) => error.code === "GES-CROSS-REPOSITORY");
  await assert.rejects(() => append(root, { ...intent(), sequence: 1 }), (error) => error.code === "GES-INTENT-FIELDS");
  await mkdir(path.join(root, "outside"));
  await symlink(path.join(root, "outside"), path.join(root, "governance/events/lifecycle"));
  await assert.rejects(() => append(root), (error) => error.code === "GES-SYMLINK");
});

/* NVA-GESBIND-2 / dd50d386: the tracked registry.json in this repository now
 * carries a fixed, non-path-derived 64-zero placeholder for
 * `repositoryFingerprint` (governance/events/registry.json) instead of a
 * hash baked in at one machine's absolute path. A fixture built with that
 * exact placeholder is therefore a genuinely non-vacuous reproduction of the
 * fixed clone-at-a-different-path defect, PROVIDED the placeholder never
 * equals a real derived physical fingerprint -- asserted below rather than
 * assumed. */
const PLACEHOLDER_REPOSITORY_FINGERPRINT = "0".repeat(64);

async function placeholderRegistryFixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "governance-event-store-placeholder-registry-"));
  execFileSync("git", ["init", "-q", root]);
  const repository = discoverRepository(root);
  fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  assert.notEqual(fingerprint, PLACEHOLDER_REPOSITORY_FINGERPRINT, "fixture precondition: this checkout's physical fingerprint must genuinely differ from the tracked placeholder, or the mismatch this test exercises would be vacuous");
  const capturePolicy = capturePolicyFixture(); capturePolicyDigest = canonicalSha256(capturePolicy);
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson({ ...registryFixture(), repositoryFingerprint: PLACEHOLDER_REPOSITORY_FINGERPRINT })}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(capturePolicy)}\n`);
  await seedRepositoryBinding(root, fingerprint);
  return root;
}

test("NVA-GESBIND-2: a tracked registry carrying a fingerprint that does not match the physical repository is now usable (the fixed clone-at-a-different-path defect)", async (t) => {
  const root = await placeholderRegistryFixtureRoot(); t.after(() => cleanup(root));
  const registry = await loadGovernanceEventRegistry({ repositoryRoot: root });
  assert.equal(registry.repositoryFingerprint, PLACEHOLDER_REPOSITORY_FINGERPRINT, "fixture precondition: the tracked registry carries the placeholder, not the physical fingerprint");
  assert.notEqual(registry.repositoryFingerprint, fingerprint, "fixture precondition: the tracked registry fingerprint genuinely mismatches the physical repository -- this is the exact defect scenario, not a vacuous fixture");
  const observed = await append(root);
  assert.equal(observed.outcome, "appended", "a mismatched tracked registry fingerprint must no longer block append against the physical repository");
  const verified = await verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.equal(verified.integrity, "prefix-valid");
  assert.equal(verified.eventCount, 1, "verify must also succeed against a physically bound repository whose tracked registry fingerprint does not match it");
});

test("NVA-GESBIND-2: an event copied verbatim from a genuinely different physical repository still fails closed on read-back (GES-EVENT-PATH, not GES-CROSS-REPOSITORY)", async (t) => {
  const rootA = await fixtureRoot(); t.after(() => cleanup(rootA));
  const observedA = await append(rootA);
  const eventBytes = await readFile(path.join(rootA, observedA.eventPath));

  const rootB = await fixtureRoot(); t.after(() => cleanup(rootB));
  assert.notEqual(fingerprint, observedA.repositoryFingerprint, "fixture precondition: root A and root B are genuinely different physical repositories");
  const streamDirB = path.join(rootB, "governance/events/lifecycle");
  await mkdir(streamDirB, { recursive: true });
  await writeFile(path.join(streamDirB, path.basename(observedA.eventPath)), eventBytes);

  await assert.rejects(
    () => verifyPortableGovernanceStream({ repositoryRoot: rootB, repositoryFingerprint: fingerprint, streamId: "lifecycle" }),
    (error) => error instanceof GovernanceEventStoreError && error.code === "GES-EVENT-PATH",
    "an event carrying repository A's own physical fingerprint, copied verbatim into repository B's stream directory, must still fail closed on read-back -- per design this is GES-EVENT-PATH now (event-vs-binding disagreement), not GES-CROSS-REPOSITORY (registry-vs-binding disagreement)",
  );
});

test("NVA-REPOID-1: a fingerprint present at first use is adopted as a legacy alias and keeps validating, but a fingerprint that was never present is still refused", async (t) => {
  const rootA = await fixtureRoot(); t.after(() => cleanup(rootA));
  const observedA = await append(rootA);
  const legacyBytes = await readFile(path.join(rootA, observedA.eventPath));

  // Root B: a fresh checkout that already carries this repository's own
  // committed event (as git would check it out) but has never been locally
  // bound yet -- built WITHOUT seedRepositoryBinding.
  const rootB = await mkdtemp(path.join(os.tmpdir(), "governance-event-store-legacy-"));
  execFileSync("git", ["init", "-q", rootB]);
  const capturePolicyB = capturePolicyFixture();
  await mkdir(path.join(rootB, "governance/events"), { recursive: true });
  await writeFile(path.join(rootB, "governance/events/registry.json"), `${canonicalizeJson(registryFixture())}\n`);
  await writeFile(path.join(rootB, "governance/events/capture-policy.json"), `${canonicalizeJson(capturePolicyB)}\n`);
  t.after(() => cleanup(rootB));
  const streamDirB = path.join(rootB, "governance/events/lifecycle");
  await mkdir(streamDirB, { recursive: true });
  await writeFile(path.join(streamDirB, path.basename(observedA.eventPath)), legacyBytes);

  // First real use of B must bind fresh and adopt A's fingerprint as the
  // sole legacy alias.
  await loadGovernanceEventRegistry({ repositoryRoot: rootB });
  const repositoryB = discoverRepository(rootB);
  const bindingB = JSON.parse(await readFile(path.join(repositoryB.commonDir, "agent-pipeline", "governance-events", "repository-binding.json"), "utf8"));
  assert.deepEqual(bindingB.legacyAliases, [observedA.repositoryFingerprint], "the pre-existing event's own fingerprint must be adopted as the sole legacy alias at first bind");
  assert.notEqual(bindingB.repositoryFingerprint, observedA.repositoryFingerprint, "the freshly bound identity must be new, not reused from the legacy event");

  const verified = await verifyPortableGovernanceStream({ repositoryRoot: rootB, repositoryFingerprint: bindingB.repositoryFingerprint, streamId: "lifecycle" });
  assert.equal(verified.integrity, "prefix-valid");
  assert.equal(verified.eventCount, 1, "the legacy event, carrying only the adopted alias fingerprint rather than the new primary identity, must still read back");

  // A wholly unrelated third fingerprint -- present at neither bind time nor
  // as the primary identity -- must still fail closed rather than being
  // silently accepted because SOME alias mechanism exists.
  const legacyEvent = JSON.parse(legacyBytes.toString("utf8"));
  const foreignFingerprint = "f".repeat(64);
  fingerprint = foreignFingerprint;
  const foreignSealed = sealGovernanceEvent({
    ...intent({ eventId: "evt-foreign", idempotencyKey: "idem-foreign", repositoryFingerprint: foreignFingerprint, sourceUri: `urn:pipeline:repository:${foreignFingerprint}` }),
    sequence: 2,
    previousEventDigest: legacyEvent.eventDigest,
    payloadDigest: "0".repeat(64),
    eventDigest: "0".repeat(64),
  });
  await writeFile(path.join(streamDirB, `2-${foreignSealed.eventId}.json`), `${canonicalizeJson(foreignSealed)}\n`);
  await assert.rejects(
    () => verifyPortableGovernanceStream({ repositoryRoot: rootB, repositoryFingerprint: bindingB.repositoryFingerprint, streamId: "lifecycle" }),
    (error) => error instanceof GovernanceEventStoreError && error.code === "GES-EVENT-PATH",
    "a fingerprint that was neither adopted as a legacy alias nor is the bound identity must still fail closed -- the alias set is not a blanket accept-anything",
  );
});

test("NVA-REPOID-1: the same repository resolves to one identity across two different absolute access paths", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "governance-event-store-path-"));
  execFileSync("git", ["init", "-q", root]);
  const capturePolicy = capturePolicyFixture(); capturePolicyDigest = canonicalSha256(capturePolicy);
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registryFixture())}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(capturePolicy)}\n`);
  t.after(() => cleanup(root));
  const alias = `${root}-alias`;
  await symlink(root, alias);
  t.after(() => rm(alias, { force: true }));

  // First access, via the real path, binds a fresh identity.
  await loadGovernanceEventRegistry({ repositoryRoot: root });
  const repository = discoverRepository(root);
  const binding = JSON.parse(await readFile(path.join(repository.commonDir, "agent-pipeline", "governance-events", "repository-binding.json"), "utf8"));
  fingerprint = binding.repositoryFingerprint;

  // A second access via a DIFFERENT absolute path string naming the exact
  // same physical checkout (simulating the WSL-vs-native-Windows case this
  // fix targets) must resolve to the identical bound identity -- no fresh
  // binding, no GES-CROSS-REPOSITORY.
  const appendedViaAlias = await appendPortableGovernanceEvent({ repositoryRoot: alias, repositoryFingerprint: binding.repositoryFingerprint, intent: intent() });
  assert.equal(appendedViaAlias.outcome, "appended", "the alias path must be accepted as the exact same bound identity");
  const verifiedViaRealPath = await verifyPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: binding.repositoryFingerprint, streamId: "lifecycle" });
  assert.equal(verifiedViaRealPath.eventCount, 1, "an event appended via the alias path must read back via the real path -- one shared identity, one shared store");
});

test("projection recovery requires a retained checkpoint and rebuilds a stale head without touching canonical events", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  await writeFile(path.join(root, "governance/events/heads.json"), "{\"broken\":true}\n");
  const rebuiltHeads = { schema: "pipeline.governance-event-heads.v1", repositoryFingerprint: fingerprint, streams: { human: { sequence: 0, eventDigest: null }, agent: { sequence: 0, eventDigest: null }, lifecycle: { sequence: 1, eventDigest: first.eventDigest } } };
  const recovery = { idempotencyKey: "recover-1", expectedHeadsDigest: (await import("./governance-event.mjs")).canonicalSha256({ broken: true }), requestedPostimageDigest: (await import("./governance-event.mjs")).canonicalSha256(rebuiltHeads) };
  await assert.rejects(() => recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", recovery }), (error) => error.code === "GES-RECOVERY-CHECKPOINT");
  const recovered = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: first.checkpoint, recovery });
  assert.equal(recovered.status, "projection-rebuilt");
  const replay = await recoverPortableGovernanceProjection({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: first.checkpoint, recovery });
  assert.equal(replay.status, "idempotent-replay");
  const head = JSON.parse(await readFile(path.join(root, "governance/events/heads.json"), "utf8"));
  assert.deepEqual(head.streams.lifecycle, { sequence: 1, eventDigest: first.eventDigest });
});

test("writer-owned orphan temps are invisible to reads and a dead owner lock is recovered only for a later writer", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const first = await append(root);
  const streamRoot = path.join(root, "governance/events/lifecycle");
  const orphan = path.join(streamRoot, ".2-evt-crashed.json.0123456789abcdef01234567.tmp");
  await writeFile(orphan, "partial writer bytes");
  const readable = await queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle", checkpoint: first.checkpoint });
  assert.deepEqual(readable.events.map((event) => event.sequence), [1], "unpublished writer bytes are never authority");
  const lock = path.join(streamRoot, ".lock");
  await writeFile(lock, `${canonicalizeJson({ schema: "pipeline.governance-event-stream-lock.v1", pid: process.pid })}\n`);
  await assert.rejects(() => append(root, intent({ eventId: "evt-live-lock", idempotencyKey: "idem-live-lock" })), (error) => error.code === "GES-LOCKED");
  await rm(lock);
  await writeFile(lock, `${canonicalizeJson({ schema: "pipeline.governance-event-stream-lock.v1", pid: 2147483647 })}\n`);
  const second = await append(root, intent({ eventId: "evt-2", idempotencyKey: "idem-2", payload: { ...intent().payload, eventId: "lifecycle-2", reasonCode: "RECOVERED" }, occurredAtEpochMs: 2, observedAtEpochMs: 2 }));
  assert.equal(second.outcome, "appended");
  await assert.rejects(() => stat(orphan), { code: "ENOENT" });
  await assert.rejects(() => stat(lock), { code: "ENOENT" });
});

test("competing dead-lock recovery cannot delete a newly acquired writer lock", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  await append(root);
  const streamRoot = path.join(root, "governance/events/lifecycle");
  const lock = path.join(streamRoot, ".lock");
  await writeFile(lock, `${canonicalizeJson({ schema: "pipeline.governance-event-stream-lock.v1", pid: 2147483647 })}\n`);
  const recovered = (eventId, idempotencyKey, sequence) => append(root, intent({
    eventId,
    idempotencyKey,
    payload: { ...intent().payload, eventId: `lifecycle-${sequence}`, reasonCode: "RECOVERED" },
    occurredAtEpochMs: sequence,
    observedAtEpochMs: sequence,
  }));
  const results = await Promise.allSettled([
    recovered("evt-recover-a", "idem-recover-a", 2),
    recovered("evt-recover-b", "idem-recover-b", 3),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  assert.ok(fulfilled.length > 0);
  for (const result of results.filter((entry) => entry.status === "rejected")) assert.equal(result.reason.code, "GES-LOCKED");
  const queried = await queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  assert.equal(queried.events.length, 1 + fulfilled.length, "every successful recovery writer has one durable event");
  assert.deepEqual(queried.events.map((event) => event.sequence), queried.events.map((_, index) => index + 1));
  await assert.rejects(() => stat(lock), { code: "ENOENT" });
});

test("restricted storage stays outside the repository, is owner-only encrypted, and supports exact active-store erasure", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const restrictedRoot = await mkdtemp(path.join(os.tmpdir(), "governance-restricted-")); t.after(() => cleanup(restrictedRoot));
  const key = Buffer.alloc(32, 7);
  const restricted = sealGovernanceEvent({
    ...intent({
      eventId: "restricted-1",
      idempotencyKey: "restricted-idem-1",
      classification: "restricted",
      storageProfile: "restricted-machine-local",
      retentionCompatibility: "machine-local-expiring",
      disclosureClass: "machine-local-only",
      payload: { complete: "restricted only" },
    }),
    sequence: 1,
    previousEventDigest: null,
    payloadDigest: "0".repeat(64),
    eventDigest: "0".repeat(64),
  });
  const putPlan = await planRestrictedGovernanceOperation({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: fingerprint, operation: "put", keyGeneration: "key-1", expiresAtEpochMs: Date.now() + 60_000, event: restricted, idempotencyKey: "put-plan-1" });
  assert.equal(putPlan.eventDigest, restricted.eventDigest);
  const putAuthorization = createRestrictedAuthorization({ key, repositoryFingerprint: fingerprint, operation: "put" });
  const stored = await putRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: fingerprint, authorization: putAuthorization, key, keyGeneration: "key-1", expiresAtEpochMs: Date.now() + 60_000, event: restricted });
  assert.equal(stored.status, "stored");
  const foreignFingerprint = "f".repeat(64);
  const foreignPutAuthorization = createRestrictedAuthorization({ key, repositoryFingerprint: foreignFingerprint, operation: "put" });
  await assert.rejects(() => putRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: foreignFingerprint, authorization: foreignPutAuthorization, key, keyGeneration: "key-1", expiresAtEpochMs: Date.now() + 60_000, event: restricted }), (error) => error.code === "GES-CROSS-REPOSITORY");
  const status = await inspectRestrictedGovernanceStore({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: fingerprint });
  assert.deepEqual(status.keyGenerations, [{ keyGeneration: "key-1", recordCount: 1 }]);
  const replay = await putRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: fingerprint, authorization: putAuthorization, key, keyGeneration: "key-1", expiresAtEpochMs: Date.now() + 60_000, event: restricted });
  assert.equal(replay.status, "replayed");
  assert.equal(replay.recordId, stored.recordId);
  const conflict = sealGovernanceEvent({ ...restricted, payload: { complete: "different restricted content" }, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  await assert.rejects(() => putRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: fingerprint, authorization: putAuthorization, key, keyGeneration: "key-1", expiresAtEpochMs: Date.now() + 60_000, event: conflict }), (error) => error.code === "GES-IDEMPOTENCY-CONFLICT");
  assert.ok(!stored.recordId.includes(restricted.eventId), "the local identifier must not create a portable join handle");
  assert.equal((await stat(restrictedRoot)).mode & 0o077, 0);
  const queryAuthorization = createRestrictedAuthorization({ key, repositoryFingerprint: fingerprint, operation: "query", recordId: stored.recordId });
  const queried = await queryRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: fingerprint, authorization: queryAuthorization, key, recordId: stored.recordId });
  assert.equal(queried.event.payload.complete, restricted.payload.complete);
  const foreignQueryAuthorization = createRestrictedAuthorization({ key, repositoryFingerprint: foreignFingerprint, operation: "query", recordId: stored.recordId });
  await assert.rejects(() => queryRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: foreignFingerprint, authorization: foreignQueryAuthorization, key, recordId: stored.recordId }), (error) => error.code === "GES-CROSS-REPOSITORY");
  const encrypted = JSON.parse(await readFile(path.join(restrictedRoot, "records", `${stored.recordId}.json`), "utf8"));
  const recordDigest = (await import("./governance-event.mjs")).canonicalSha256(encrypted);
  const erasePlan = await planRestrictedGovernanceOperation({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: fingerprint, operation: "erase", recordId: stored.recordId, expectedRecordDigest: recordDigest, idempotencyKey: "erase-plan-1" });
  assert.equal(erasePlan.mutation, false);
  const eraseAuthorization = createRestrictedAuthorization({ key, repositoryFingerprint: fingerprint, operation: "erase", recordId: stored.recordId, expectedRecordDigest: recordDigest });
  const foreignEraseAuthorization = createRestrictedAuthorization({ key, repositoryFingerprint: foreignFingerprint, operation: "erase", recordId: stored.recordId, expectedRecordDigest: recordDigest });
  await assert.rejects(() => eraseRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: foreignFingerprint, authorization: foreignEraseAuthorization, key, recordId: stored.recordId, expectedRecordDigest: recordDigest }), (error) => error.code === "GES-CROSS-REPOSITORY");
  const erased = await eraseRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: fingerprint, authorization: eraseAuthorization, key, recordId: stored.recordId, expectedRecordDigest: recordDigest });
  assert.deepEqual(erased, { status: "erased-active-store", recordId: stored.recordId, preimageDigest: (await import("./governance-event.mjs")).canonicalSha256(encrypted), backupDisclosure: "unknown" });
  await assert.rejects(() => queryRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: restrictedRoot, repositoryFingerprint: fingerprint, authorization: queryAuthorization, key, recordId: stored.recordId }), (error) => error.code === "GES-MISSING");
  await assert.rejects(() => putRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot: path.join(root, "restricted"), repositoryFingerprint: fingerprint, authorization: putAuthorization, key, keyGeneration: "key-1", expiresAtEpochMs: Date.now() + 60_000, event: restricted }), (error) => error.code === "GES-RESTRICTED-IN-REPOSITORY");
});

test("K-AC-10 multi-stream query preserves each stream's own origin, authority class, integrity, and assurance unflattened", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const lifecycleAppended = await append(root);
  const agentPayload = { eventId: "agent-decision-1", kind: "assumption", state: "declared", reasonCode: "ASSUMPTION.DECLARED", candidateDigest: canonicalSha256(candidate), relatedHumanDecisionId: null, supersedesEventId: null };
  const agentAppended = await append(root, intent({ payloadSchema: "pipeline.agent-decision-event.v1", eventId: "agent-event-1", idempotencyKey: "agent-idem-1", origin: "agent", authorityClass: "non-authoritative", eventType: "agent.assumption", streamId: "agent", payload: agentPayload }));

  const soloLifecycle = await queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "lifecycle" });
  const soloAgent = await queryPortableGovernanceStream({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamId: "agent" });
  const multi = await queryPortableGovernanceStreams({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamIds: ["lifecycle", "agent"] });
  assert.equal(multi.schema, "pipeline.governance-multi-stream-query.v1");
  assert.equal(multi.authority, "non-authoritative");
  assert.deepEqual(Object.keys(multi.streams), ["lifecycle", "agent"]);
  assert.deepEqual(multi.streams.lifecycle, soloLifecycle);
  assert.deepEqual(multi.streams.agent, soloAgent);
  assert.equal(multi.streams.lifecycle.events[0].origin, "lifecycle");
  assert.equal(multi.streams.lifecycle.events[0].authorityClass, "non-authoritative");
  assert.equal(multi.streams.lifecycle.events[0].timeAssurance, "locally-observed");
  assert.equal(multi.streams.agent.events[0].origin, "agent");
  assert.equal(multi.streams.agent.events[0].authorityClass, "non-authoritative");
  assert.equal(multi.streams.agent.events[0].timeAssurance, "locally-observed");
  assert.equal(multi.streams.lifecycle.integrity, "prefix-valid");
  assert.equal(multi.streams.agent.integrity, "prefix-valid");

  const checkpointed = await queryPortableGovernanceStreams({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamIds: ["lifecycle", "agent"], checkpoints: { lifecycle: lifecycleAppended.checkpoint, agent: agentAppended.checkpoint } });
  assert.equal(checkpointed.streams.lifecycle.completeness, "verified");
  assert.equal(checkpointed.streams.agent.completeness, "verified");

  await assert.rejects(() => queryPortableGovernanceStreams({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamIds: ["lifecycle", "lifecycle"] }), (error) => error instanceof GovernanceEventStoreError && error.code === "GES-MULTI-STREAM");
  await assert.rejects(() => queryPortableGovernanceStreams({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamIds: ["lifecycle", "unknown-stream"] }), (error) => error.code === "GES-MULTI-STREAM");
  await assert.rejects(() => queryPortableGovernanceStreams({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamIds: [] }), (error) => error.code === "GES-MULTI-STREAM");
  await assert.rejects(() => queryPortableGovernanceStreams({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamIds: ["lifecycle"], checkpoints: ["not-a-plain-object"] }), (error) => error.code === "GES-MULTI-STREAM");
  await assert.rejects(() => queryPortableGovernanceStreams({ repositoryRoot: root, repositoryFingerprint: fingerprint, streamIds: ["lifecycle"], checkpoints: { agent: agentAppended.checkpoint } }), (error) => error.code === "GES-MULTI-STREAM");
});

// PHX-WP-HAC11-WINACL: assertRestrictedRoot's win32 DACL-assurance branch is
// exercised with an injected `io` seam (platform + assess/harden), the same
// deterministic-on-any-host pattern afk-ledger.test.mjs uses for its own
// sibling call -- no real Windows host is required.

function secureWindowsIo(overrides = {}) {
  return { platform: "win32", assess: () => ({ status: "secure" }), harden: () => ({ status: "secure" }), ...overrides };
}

test("PHX-WP-HAC11-WINACL: a newly-created restricted root on simulated win32 is hardened, never merely assessed", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const restrictedRoot = path.join(await mkdtemp(path.join(os.tmpdir(), "governance-restricted-winacl-")), "restricted");
  t.after(() => cleanup(path.dirname(restrictedRoot)));
  let hardenCalledWith = null;
  let assessCalled = false;
  const io = secureWindowsIo({
    harden: (target) => { hardenCalledWith = target; return { status: "secure" }; },
    assess: () => { assessCalled = true; return { status: "secure" }; },
  });
  const resolved = await assertRestrictedRoot(root, restrictedRoot, { create: true }, io);
  assert.equal(resolved, restrictedRoot);
  assert.equal(hardenCalledWith, restrictedRoot);
  assert.equal(assessCalled, false);
});

test("PHX-WP-HAC11-WINACL: a pre-existing restricted root on simulated win32 is only assessed, never hardened", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const restrictedRoot = await mkdtemp(path.join(os.tmpdir(), "governance-restricted-winacl-existing-")); t.after(() => cleanup(restrictedRoot));
  let hardenCalled = false;
  let assessCalledWith = null;
  const io = secureWindowsIo({
    harden: () => { hardenCalled = true; return { status: "secure" }; },
    assess: (target) => { assessCalledWith = target; return { status: "secure" }; },
  });
  const resolved = await assertRestrictedRoot(root, restrictedRoot, { create: false }, io);
  assert.equal(resolved, restrictedRoot);
  assert.equal(assessCalledWith, restrictedRoot);
  assert.equal(hardenCalled, false);
});

test("PHX-WP-HAC11-WINACL: a non-secure simulated win32 DACL assessment fails closed", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const restrictedRoot = await mkdtemp(path.join(os.tmpdir(), "governance-restricted-winacl-insecure-")); t.after(() => cleanup(restrictedRoot));
  await assert.rejects(
    () => assertRestrictedRoot(root, restrictedRoot, { create: false }, secureWindowsIo({ assess: () => ({ status: "insecure" }) })),
    (error) => error instanceof GovernanceEventStoreError && error.code === "GES-RESTRICTED-WINDOWS-ASSURANCE",
  );
  await assert.rejects(
    () => assertRestrictedRoot(root, restrictedRoot, { create: false }, secureWindowsIo({ assess: () => ({ status: "unavailable" }) })),
    (error) => error instanceof GovernanceEventStoreError && error.code === "GES-RESTRICTED-WINDOWS-ASSURANCE",
  );
  const createRestrictedRoot = path.join(await mkdtemp(path.join(os.tmpdir(), "governance-restricted-winacl-insecure-create-")), "restricted");
  t.after(() => cleanup(path.dirname(createRestrictedRoot)));
  await assert.rejects(
    () => assertRestrictedRoot(root, createRestrictedRoot, { create: true }, secureWindowsIo({ harden: () => ({ status: "insecure" }) })),
    (error) => error instanceof GovernanceEventStoreError && error.code === "GES-RESTRICTED-WINDOWS-ASSURANCE",
  );
});

test("PHX-WP-HAC11-WINACL: non-win32 behavior is unaffected by the injectable io seam (default platform wins, POSIX checks unchanged)", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const restrictedRoot = await mkdtemp(path.join(os.tmpdir(), "governance-restricted-winacl-posix-")); t.after(() => cleanup(restrictedRoot));
  let assessCalled = false;
  let hardenCalled = false;
  const resolved = await assertRestrictedRoot(root, restrictedRoot, { create: false }, {
    platform: "linux",
    assess: () => { assessCalled = true; return { status: "insecure" }; },
    harden: () => { hardenCalled = true; return { status: "insecure" }; },
  });
  assert.equal(resolved, restrictedRoot);
  assert.equal(assessCalled, false, "the win32 assurance seam must never be consulted off win32");
  assert.equal(hardenCalled, false, "the win32 assurance seam must never be consulted off win32");
});

// PHX-WP-HAC11-WINACL-FIX2: the pre-existing POSIX mode/uid checks (lines
// 130-131) must be skipped entirely on a simulated win32 platform, exactly
// like private-boundary.mjs and afk-ledger.mjs already skip their own POSIX
// mode-bit checks on win32 -- real `stat()`-reported mode bits are not real
// DACL data there. Before the fix, these checks ran unconditionally and could
// throw GES-RESTRICTED-PERMISSIONS before execution ever reached the win32
// DACL-assurance branch, making that branch dead code on its own target
// platform.
test("PHX-WP-HAC11-WINACL-FIX2: simulated win32 ignores a real nonzero-group/other POSIX mode and relies solely on the DACL-assurance branch", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  const restrictedRoot = await mkdtemp(path.join(os.tmpdir(), "governance-restricted-winacl-posixmode-"));
  t.after(() => cleanup(restrictedRoot));
  // Real POSIX mode with nonzero group bits, deliberately irrelevant on win32:
  // this is what forces execution through the mode-bit check at line 130.
  await chmod(restrictedRoot, 0o750);
  const resolved = await assertRestrictedRoot(root, restrictedRoot, { create: false }, secureWindowsIo());
  assert.equal(resolved, restrictedRoot);
});
