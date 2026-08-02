#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Stateful PHX-1 tests for portable governance event storage. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalSha256, canonicalizeJson, sealGovernanceEvent } from "./governance-event.mjs";
import { derivePoGateRepositoryFingerprint } from "./po-gate-authority.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";
import {
  GovernanceEventStoreError,
  createRestrictedAuthorization,
  appendPortableGovernanceEvent,
  eraseRestrictedGovernanceEvent,
  inspectRestrictedGovernanceStore,
  loadGovernanceEventRegistry,
  putRestrictedGovernanceEvent,
  planRestrictedGovernanceOperation,
  queryRestrictedGovernanceEvent,
  queryPortableGovernanceStream,
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
  ], sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false } };
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
    payload: { eventId: "lifecycle-1", kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1" }, candidate, invalidatesEventId: null, supersedesEventId: null },
    ...overrides,
  };
}

async function append(root, event = intent()) {
  return appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint: fingerprint, intent: event });
}

async function cleanup(root) { await rm(root, { recursive: true, force: true }); }

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

test("symlink, cross-repository, and writer-owned intent fields are rejected", async (t) => {
  const root = await fixtureRoot(); t.after(() => cleanup(root));
  await assert.rejects(() => appendPortableGovernanceEvent({ repositoryRoot: root, repositoryFingerprint: "d".repeat(64), intent: intent() }), (error) => error.code === "GES-CROSS-REPOSITORY");
  await assert.rejects(() => append(root, { ...intent(), sequence: 1 }), (error) => error.code === "GES-INTENT-FIELDS");
  await mkdir(path.join(root, "outside"));
  await symlink(path.join(root, "outside"), path.join(root, "governance/events/lifecycle"));
  await assert.rejects(() => append(root), (error) => error.code === "GES-SYMLINK");
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
