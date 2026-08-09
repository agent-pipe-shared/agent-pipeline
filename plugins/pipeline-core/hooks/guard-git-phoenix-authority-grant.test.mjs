#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * A-AC-04 end-to-end proof (specs/sprint-phoenix-epic/acceptance.md:243-244): a
 * grant produced by the REAL `human-authority-grant.mjs prepare -> sign -> install`
 * ceremony (the CLI added by this work package, spawned as its own process, not
 * imported and called in-process) is exactly what `guard-git.mjs`'s ACTUAL Phoenix
 * override consumption path (`consumePhoenixOverrideAuthority`) accepts, consumes
 * once, and refuses on replay.
 *
 * `guard-git-phoenix.test.mjs` proves the correlate-and-cannot-replay half by
 * manufacturing its ledger grant with a direct `appendHumanGovernanceDecision`
 * fixture call. This test replaces that fixture call with the production
 * `human-authority-grant.mjs` entry point end to end, so the CREATE half of the
 * clause is proven against the same real consumer, not merely against its own
 * isolated unit tests.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../lib/governance-event.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";

const guard = path.resolve("plugins/pipeline-core/hooks/guard-git.mjs");
const grantCli = path.resolve("plugins/pipeline-core/scripts/human-authority-grant.mjs");

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

function runGrantCli(args) {
  return spawnSync(process.execPath, [grantCli, ...args], { encoding: "utf8" });
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "guard-git-phoenix-authority-grant-"));
  // A copy of the REAL guard-git.mjs bytes at the same repo-relative path the
  // guard checks (`plugins/pipeline-core/hooks/guard-git.mjs`), so that
  // `human-authority-grant.mjs prepare --artifacts` (which reads artifact
  // digests off the repo it is granting authority over) computes exactly the
  // same sha256 the real, running guard computes over its own module file.
  await mkdir(path.join(root, "plugins/pipeline-core/hooks"), { recursive: true });
  await copyFile(guard, path.join(root, "plugins/pipeline-core/hooks/guard-git.mjs"));
  await writeFile(path.join(root, "plan.md"), "fixture plan\n");
  await writeFile(path.join(root, "spec.md"), "fixture spec\n");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  await mkdir(path.join(root, ".claude"), { recursive: true });
  const repository = discoverRepository(root);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const policy = capturePolicy();
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registry(fingerprint))}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(policy)}\n`);
  const [commit, tree] = execFileSync("git", ["-C", root, "rev-parse", "HEAD", "HEAD^{tree}"], { encoding: "utf8" }).trim().split("\n");
  return { root, fingerprint, candidate: { commit, tree } };
}

test("A-AC-04 end-to-end: a real human-authority-grant.mjs prepare/sign/install grant is what guard-git.mjs's Phoenix override path actually consumes", async (t) => {
  const values = await fixture();
  t.after(() => rm(values.root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "guard-git-phoenix-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));

  // Fixture-local Ed25519 keypair, generated in-memory for this test run only.
  // Never the real PO key, never `project/critical-human-proof.json`.
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const publicKeySha256 = createHash("sha256").update(publicKey).digest("hex");
  const trustAnchorPath = path.join(external, "trust-anchor.json");
  await writeFile(trustAnchorPath, JSON.stringify({ keyReference: "fixture-po-key", publicKeySha256 }));

  // 1) prepare — the real CLI, spawned as its own process.
  const requestPath = path.join(external, "request.json");
  const prepared = runGrantCli([
    "prepare", "--repo-root", values.root,
    "--decision-id", "guard-override-grant", "--package-id", "sprint-phoenix-epic",
    "--action", "OVERRIDE.GG-07", "--environment", "local",
    "--plan", "plan.md", "--spec", "spec.md",
    "--artifacts", "plugins/pipeline-core/hooks/guard-git.mjs",
    "--ttl-seconds", "3600", "--reason-code", "APPROVED",
    "--policy-digest", "a".repeat(64), "--rule-digest", "f".repeat(64),
    "--request", requestPath,
  ]);
  assert.equal(prepared.status, 0, prepared.stderr);
  const preparedValue = JSON.parse(prepared.stdout);
  assert.match(preparedValue.digestToSign, /^[a-f0-9]{64}$/u);

  // 2) sign the printed digest, entirely outside the CLI — it contains no signer.
  const signatureBase64 = sign(null, Buffer.from(preparedValue.digestToSign, "utf8"), keys.privateKey).toString("base64");
  const proofPath = path.join(external, "proof.json");
  await writeFile(proofPath, JSON.stringify({
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: preparedValue.digestToSign,
    keyReference: "fixture-po-key",
    publicKey,
    signatureBase64,
  }));

  // 3) install — the real CLI, spawned as its own process; only now does the
  // grant actually land in the on-disk ledger.
  const installed = runGrantCli([
    "install", "--repo-root", values.root,
    "--request", requestPath, "--proof", proofPath, "--trust-anchor-file", trustAnchorPath,
  ]);
  assert.equal(installed.status, 0, installed.stderr);
  const installedValue = JSON.parse(installed.stdout);
  assert.equal(installedValue.receipt.outcome, "appended");

  // 4) feed the resulting real, on-disk ledger state into guard-git.mjs's ACTUAL
  // override consumption path — same reference shape and same runGuard/command
  // construction pattern guard-git-phoenix.test.mjs already uses.
  const reference = {
    schema: "pipeline.git-override-authority-reference.v1",
    authorityRequest: {
      schema: "pipeline.governance-authority-request.v1",
      repositoryFingerprint: values.fingerprint,
      decisionId: "guard-override-grant",
      candidate: values.candidate,
      checkpoint: installedValue.receipt.checkpoint,
      nowEpochMs: Date.now(),
    },
    consumption: {
      decisionId: "guard-override-consumed",
      eventId: "guard-override-consumption-event",
      idempotencyKey: "guard-override-consumption-key",
      observedAtEpochMs: Date.now(),
    },
  };
  const referencePath = path.join(values.root, "authority-reference.json");
  await writeFile(referencePath, `${canonicalizeJson(reference)}\n`);

  const command = `PIPELINE_GUARD_OVERRIDE='GG-07|bound|${referencePath}|authorized fixture' git reset --hard HEAD~1`;
  const allowed = runGuard(values.root, command);
  assert.equal(allowed.status, 1, allowed.stderr);
  assert.match(allowed.stderr, /canonical human-governance decision consumed/u);

  const replay = runGuard(values.root, command);
  assert.equal(replay.status, 2);
  assert.match(replay.stderr, /canonical human-governance decision/u);
});
