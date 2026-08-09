#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../lib/governance-event.mjs";
import { queryHumanGovernanceDecisions } from "../lib/human-governance-ledger.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { run } from "./human-authority-grant.mjs";

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
  const root = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-"));
  await writeFile(path.join(root, "plan.md"), "fixture plan\n");
  await writeFile(path.join(root, "spec.md"), "fixture spec\n");
  await writeFile(path.join(root, "artifact.txt"), "fixture artifact\n");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  const repository = discoverRepository(root);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const policy = capturePolicy();
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registry(fingerprint))}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(policy)}\n`);
  return { root, fingerprint };
}

function keypair() {
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
  return { privateKey: pair.privateKey, publicKey, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
}

function signDigest(privateKey, digest) {
  return sign(null, Buffer.from(digest, "utf8"), privateKey).toString("base64");
}

function prepareArgs(root, requestPath, overrides = {}) {
  const values = {
    decisionId: "grant-1", packageId: "sprint-phoenix-epic", action: "OVERRIDE.GG-07",
    plan: "plan.md", spec: "spec.md", artifacts: "artifact.txt", ttlSeconds: "60",
    reasonCode: "APPROVED", policyDigest: "a".repeat(64), ruleDigest: "f".repeat(64),
    ...overrides,
  };
  return [
    "prepare", "--repo-root", root,
    "--decision-id", values.decisionId, "--package-id", values.packageId, "--action", values.action,
    "--plan", values.plan, "--spec", values.spec, "--artifacts", values.artifacts,
    "--ttl-seconds", values.ttlSeconds, "--reason-code", values.reasonCode,
    "--policy-digest", values.policyDigest, "--rule-digest", values.ruleDigest,
    "--request", requestPath,
  ];
}

async function proofFor(external, keys, digest, { keyReference = "fixture-po-key", corrupt = false } = {}) {
  const proofPath = path.join(external, `proof-${digest.slice(0, 8)}.json`);
  const signatureBase64 = signDigest(keys.privateKey, digest);
  const bytes = corrupt ? (() => { const buf = Buffer.from(signatureBase64, "base64"); buf[0] ^= 0xff; return buf.toString("base64"); })() : signatureBase64;
  await writeFile(proofPath, JSON.stringify({ schema: "pipeline.po-approval-proof.v1", intentSha256: digest, keyReference, publicKey: keys.publicKey, signatureBase64: bytes }));
  return proofPath;
}

test("a genuine matching proof installs exactly one granted decision, and the request digest is a real sha256", async (t) => {
  const { root, fingerprint } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const keys = keypair();
  const trustAnchorPath = path.join(external, "trust-anchor.json");
  await writeFile(trustAnchorPath, JSON.stringify({ keyReference: "fixture-po-key", publicKeySha256: keys.publicKeySha256 }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  assert.equal(prepared.ok, true);
  assert.match(prepared.digestToSign, /^[a-f0-9]{64}$/u);
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  const installed = await run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath, "--trust-anchor-file", trustAnchorPath]);
  assert.equal(installed.ok, true);
  assert.equal(installed.receipt.outcome, "appended");
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 1);
  assert.equal(events.decisions[0].decisionId, "grant-1");
  assert.equal(events.decisions[0].scope.action, "OVERRIDE.GG-07");
  assert.equal(events.decisions[0].scope.artifacts.some((a) => a.path === "artifact.txt"), true);
});

test("a tampered proof is rejected and appends nothing", async (t) => {
  const { root, fingerprint } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const keys = keypair();
  const trustAnchorPath = path.join(external, "trust-anchor.json");
  await writeFile(trustAnchorPath, JSON.stringify({ keyReference: "fixture-po-key", publicKeySha256: keys.publicKeySha256 }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign, { corrupt: true });
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath, "--trust-anchor-file", trustAnchorPath]),
    (error) => /HAG-PROOF-INVALID/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("a proof signed by the wrong key is rejected and appends nothing", async (t) => {
  const { root, fingerprint } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const trusted = keypair();
  const impostor = keypair();
  const trustAnchorPath = path.join(external, "trust-anchor.json");
  await writeFile(trustAnchorPath, JSON.stringify({ keyReference: "fixture-po-key", publicKeySha256: trusted.publicKeySha256 }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  // Signed by a key that is not the one the trust anchor pins -- the proof's own
  // publicKey/signature are internally consistent, but the anchor rejects it.
  const proofPath = await proofFor(external, impostor, prepared.digestToSign);
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath, "--trust-anchor-file", trustAnchorPath]),
    (error) => /HAG-PROOF-INVALID/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("a missing trust anchor (no override, no committed policy) is rejected and appends nothing", async (t) => {
  const { root, fingerprint } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const keys = keypair();
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  // No --trust-anchor-file, and this fixture repository has no
  // project/critical-human-proof.json at all.
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath]),
    (error) => /HAG-TRUST-ANCHOR-MISSING/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("an unreadable trust-anchor-file override is rejected and appends nothing", async (t) => {
  const { root, fingerprint } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const keys = keypair();
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  const missingAnchorPath = path.join(external, "does-not-exist.json");
  await assert.rejects(() => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath, "--trust-anchor-file", missingAnchorPath]));
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("prepare refuses to run without its required flags", async () => {
  await assert.rejects(() => run(["prepare", "--repo-root", "/nonexistent"]));
});

test("install refuses a proof file supplied from inside the repository", async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const keys = keypair();
  const trustAnchorPath = path.join(external, "trust-anchor.json");
  await writeFile(trustAnchorPath, JSON.stringify({ keyReference: "fixture-po-key", publicKeySha256: keys.publicKeySha256 }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const insideProofPath = path.join(root, "proof-inside.json");
  await writeFile(insideProofPath, JSON.stringify({ schema: "pipeline.po-approval-proof.v1", intentSha256: prepared.digestToSign, keyReference: "fixture-po-key", publicKey: keys.publicKey, signatureBase64: signDigest(keys.privateKey, prepared.digestToSign) }));
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", insideProofPath, "--trust-anchor-file", trustAnchorPath]),
    (error) => /HAG-EXTERNAL-REQUIRED/u.test(error.message),
  );
});

test("a request whose payload has been tampered with after prepare is rejected before append", async (t) => {
  const { root, fingerprint } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const keys = keypair();
  const trustAnchorPath = path.join(external, "trust-anchor.json");
  await writeFile(trustAnchorPath, JSON.stringify({ keyReference: "fixture-po-key", publicKeySha256: keys.publicKeySha256 }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  const { readFile, writeFile: write } = await import("node:fs/promises");
  const stored = JSON.parse(await readFile(requestPath, "utf8"));
  stored.intent.payload.scope.action = "OVERRIDE.GG-99"; // widen the grant's scope after signing
  await write(requestPath, JSON.stringify(stored));
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath, "--trust-anchor-file", trustAnchorPath]),
    (error) => /HAG-REQUEST-INVALID/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});
