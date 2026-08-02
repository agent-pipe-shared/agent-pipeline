#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalSha256, canonicalizeJson } from "../lib/governance-event.mjs";
import { appendHumanGovernanceDecision } from "../lib/human-governance-ledger.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { main } from "./governance-authority.mjs";

const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
const unavailable = { state: "not-applicable" };

function registry(fingerprint) {
  return { schema: "pipeline.governance-stream-registry.v1", repositoryFingerprint: fingerprint, canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventDigestDomain: "pipeline.governance-event.v1\0", storageRoot: "governance/events", streams: [
    { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
    { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
    { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
  ] };
}

function capturePolicy() {
  return { schema: "pipeline.governance-capture-policy.v1", policyId: "fixture", revision: "d".repeat(64), defaultAction: "deny", streams: [
    { origin: "human", purpose: "authority-history", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    { origin: "agent", purpose: "declared-assumption", materiality: "policy-selected", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    { origin: "lifecycle", purpose: "deterministic-lifecycle", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
  ], sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false } };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "governance-authority-"));
  execFileSync("git", ["init", "-q", root]);
  const repository = discoverRepository(root);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const policy = capturePolicy();
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registry(fingerprint))}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(policy)}\n`);
  return { root, fingerprint, capturePolicyDigest: canonicalSha256(policy) };
}

function decision(fingerprint) {
  return { decisionId: "grant-1", event: "granted", outcome: "granted", authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed", scope: { repositoryFingerprint: fingerprint, candidate, packageId: "phoenix-2", action: "APPROVE_PLAN", environment: "local", artifacts: [{ path: "specs/sprint-phoenix-epic/spec.md", sha256: "e".repeat(64) }] }, reasonCode: "APPROVED", policyDigest: "a".repeat(64), ruleDigest: "f".repeat(64), validity: { notBeforeEpochMs: 1, expiresAtEpochMs: 2_000, singleUse: true }, links: { requestDecisionId: "request-1", consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } };
}

function intent(fingerprint, capturePolicyDigest) {
  return { schema: "pipeline.governance-event-envelope.v1", payloadSchema: "pipeline.human-governance-decision.v1", canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventId: "human-event-1", idempotencyKey: "human-idempotency-1", origin: "human", authorityClass: "human-authority", eventType: "human.granted", occurredAtEpochMs: 2, observedAtEpochMs: 2, timeAssurance: "locally-observed", repositoryFingerprint: fingerprint, sourceUri: `urn:pipeline:repository:${fingerprint}`, streamId: "human", correlation: { featureId: unavailable, packageId: unavailable, requestId: unavailable, sessionId: unavailable, dispatchId: unavailable, traceId: unavailable }, candidate, artifacts: [unavailable], policy: { policyDigest: unavailable, configurationDigest: unavailable, capturePolicyDigest, redactionPolicyDigest: unavailable }, classification: "repository-public-safe", storageProfile: "repository-public-safe", retentionCompatibility: "repository-retained", disclosureClass: "repository-visible", payload: decision(fingerprint) };
}

test("authority CLI rejects malformed arguments before repository access", async () => {
  await assert.rejects(() => main([]), (error) => error.code === "GAC-ARGUMENT");
});

test("authority CLI grants only a verified checkpoint-bound human decision", async (t) => {
  const values = await fixture();
  t.after(() => rm(values.root, { recursive: true, force: true }));
  const receipt = await appendHumanGovernanceDecision({ repositoryRoot: values.root, repositoryFingerprint: values.fingerprint, intent: intent(values.fingerprint, values.capturePolicyDigest) });
  const requestFile = path.join(values.root, "request.json");
  const request = { schema: "pipeline.governance-authority-request.v1", repositoryFingerprint: values.fingerprint, decisionId: "grant-1", candidate, checkpoint: receipt.checkpoint, nowEpochMs: 1_000 };
  await writeFile(requestFile, `${canonicalizeJson(request)}\n`);
  const granted = await main(["--repo", values.root, "--request-file", requestFile]);
  assert.deepEqual(granted, { schema: "pipeline.governance-authority-readback.v1", granted: true, decisionId: "grant-1", decisionDigest: canonicalSha256(decision(values.fingerprint)), singleUse: true, scope: decision(values.fingerprint).scope });
  await writeFile(requestFile, `${canonicalizeJson({ ...request, checkpoint: null })}\n`);
  assert.deepEqual(await main(["--repo", values.root, "--request-file", requestFile]), { schema: "pipeline.governance-authority-readback.v1", granted: false, reason: "checkpoint-unverified" });
  assert.deepEqual(await main(["--repo", values.root, "--request-json", canonicalizeJson(request)]), granted);
});

test("authority CLI consumes a checkpoint-bound single-use grant idempotently", async (t) => {
  const values = await fixture();
  t.after(() => rm(values.root, { recursive: true, force: true }));
  const receipt = await appendHumanGovernanceDecision({ repositoryRoot: values.root, repositoryFingerprint: values.fingerprint, intent: intent(values.fingerprint, values.capturePolicyDigest) });
  const request = {
    schema: "pipeline.governance-authority-consume-request.v1",
    repositoryFingerprint: values.fingerprint,
    decisionId: "grant-1",
    decisionDigest: canonicalSha256(decision(values.fingerprint)),
    candidate,
    checkpoint: receipt.checkpoint,
    observedAtEpochMs: 1_000,
    consumption: { decisionId: "consumed-1", eventId: "consumed-event-1", idempotencyKey: "consumed-idempotency-1" },
  };
  const consumed = await main(["--repo", values.root, "--consume-request-json", canonicalizeJson(request)]);
  assert.equal(consumed.consumed, true);
  assert.equal(consumed.outcome, "appended");
  assert.equal(consumed.consumptionDecisionId, "consumed-1");
  assert.equal((await main(["--repo", values.root, "--consume-request-json", canonicalizeJson(request)])).outcome, "idempotent-replay");
  await assert.rejects(() => main(["--repo", values.root, "--consume-request-json", canonicalizeJson({ ...request, consumption: { decisionId: "consumed-2", eventId: "consumed-event-2", idempotencyKey: "consumed-idempotency-2" } })]), (error) => error.code === "HGL-CONSUME-NOT-LIVE");
});
