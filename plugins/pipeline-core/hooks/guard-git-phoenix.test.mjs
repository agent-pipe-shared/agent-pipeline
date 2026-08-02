#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalSha256, canonicalizeJson } from "../lib/governance-event.mjs";
import { appendHumanGovernanceDecision } from "../lib/human-governance-ledger.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";

const guard = path.resolve("plugins/pipeline-core/hooks/guard-git.mjs");
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

function runGuard(root, command) {
  return spawnSync(process.execPath, [guard], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "guard-git-phoenix-"));
  execFileSync("git", ["init", "-q", root]);
  await writeFile(path.join(root, "fixture.txt"), "fixture\n");
  execFileSync("git", ["-C", root, "add", "fixture.txt"]);
  execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  await mkdir(path.join(root, ".claude"), { recursive: true });
  const repository = discoverRepository(root);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const policy = capturePolicy();
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registry(fingerprint))}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(policy)}\n`);
  const [commit, tree] = execFileSync("git", ["-C", root, "rev-parse", "HEAD", "HEAD^{tree}"], { encoding: "utf8" }).trim().split("\n");
  return { root, fingerprint, candidate: { commit, tree }, capturePolicyDigest: canonicalSha256(policy) };
}

async function authorityReference(values) {
  const guardDigest = createHash("sha256").update(await readFile(guard)).digest("hex");
  const decision = { decisionId: "guard-override-grant", event: "granted", outcome: "granted", authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed", scope: { repositoryFingerprint: values.fingerprint, candidate: values.candidate, packageId: "sprint-phoenix-epic", action: "OVERRIDE.GG-07", environment: "local", artifacts: [{ path: "plugins/pipeline-core/hooks/guard-git.mjs", sha256: guardDigest }] }, reasonCode: "APPROVED", policyDigest: "a".repeat(64), ruleDigest: "f".repeat(64), validity: { notBeforeEpochMs: 1, expiresAtEpochMs: Date.now() + 60_000, singleUse: true }, links: { requestDecisionId: "request-1", consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } };
  const intent = { schema: "pipeline.governance-event-envelope.v1", payloadSchema: "pipeline.human-governance-decision.v1", canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventId: "human-event-1", idempotencyKey: "human-idempotency-1", origin: "human", authorityClass: "human-authority", eventType: "human.granted", occurredAtEpochMs: 2, observedAtEpochMs: 2, timeAssurance: "locally-observed", repositoryFingerprint: values.fingerprint, sourceUri: `urn:pipeline:repository:${values.fingerprint}`, streamId: "human", correlation: { featureId: unavailable, packageId: unavailable, requestId: unavailable, sessionId: unavailable, dispatchId: unavailable, traceId: unavailable }, candidate: values.candidate, artifacts: [unavailable], policy: { policyDigest: unavailable, configurationDigest: unavailable, capturePolicyDigest: values.capturePolicyDigest, redactionPolicyDigest: unavailable }, classification: "repository-public-safe", storageProfile: "repository-public-safe", retentionCompatibility: "repository-retained", disclosureClass: "repository-visible", payload: decision };
  const receipt = await appendHumanGovernanceDecision({ repositoryRoot: values.root, repositoryFingerprint: values.fingerprint, intent });
  const reference = { schema: "pipeline.git-override-authority-reference.v1", authorityRequest: { schema: "pipeline.governance-authority-request.v1", repositoryFingerprint: values.fingerprint, decisionId: decision.decisionId, candidate: values.candidate, checkpoint: receipt.checkpoint, nowEpochMs: Date.now() }, consumption: { decisionId: "guard-override-consumed", eventId: "guard-override-consumption-event", idempotencyKey: "guard-override-consumption-key", observedAtEpochMs: Date.now() } };
  const referencePath = path.join(values.root, "authority-reference.json");
  await writeFile(referencePath, `${canonicalizeJson(reference)}\n`);
  return referencePath;
}

test("Phoenix Git override requires and single-consumes checkpoint-bound human authority", async (t) => {
  const values = await fixture();
  t.after(() => rm(values.root, { recursive: true, force: true }));
  const missing = runGuard(values.root, "PIPELINE_GUARD_OVERRIDE='GG-07|missing|reason' git reset --hard HEAD~1");
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /closed Phoenix authority reference is required/u);
  const referencePath = await authorityReference(values);
  const command = `PIPELINE_GUARD_OVERRIDE='GG-07|bound|${referencePath}|authorized fixture' git reset --hard HEAD~1`;
  const allowed = runGuard(values.root, command);
  assert.equal(allowed.status, 1, allowed.stderr);
  assert.match(allowed.stderr, /canonical human-governance decision consumed/u);
  const replay = runGuard(values.root, command);
  assert.equal(replay.status, 2);
  assert.match(replay.stderr, /canonical human-governance decision/u);
});
