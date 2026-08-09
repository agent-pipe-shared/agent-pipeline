#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

function keypair() {
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
  return { privateKey: pair.privateKey, publicKey, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
}

/** The project's committed trust-anchor policy (ADR-0055 shape), pinned to a fixture keypair. Never the real repo's key. */
function trustAnchorPolicy(keys) {
  return { schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"], trustAnchor: { keyReference: "fixture-po-key", publicKeySha256: keys.publicKeySha256 } };
}

/**
 * Fixture repository root. Mirrors `guard-git-phoenix.test.mjs`'s `fixture()`
 * pattern of writing fixture repository-root files directly into a fresh tmp
 * root (`governance/events/registry.json`, `capture-policy.json`) -- extended
 * here to also write `project/critical-human-proof.json` when `keys` is
 * supplied, since F1's fix means `install` has no other way to learn a trust
 * anchor. When `keys` is omitted, the fixture has NO committed trust anchor at
 * all (used to exercise the "no committed policy" rejection).
 */
async function fixture(keys) {
  const root = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-"));
  await writeFile(path.join(root, "plan.md"), "fixture plan\n");
  await writeFile(path.join(root, "spec.md"), "fixture spec\n");
  await writeFile(path.join(root, "artifact.txt"), "fixture artifact\n");
  if (keys) {
    await mkdir(path.join(root, "project"), { recursive: true });
    await writeFile(path.join(root, "project/critical-human-proof.json"), `${JSON.stringify(trustAnchorPolicy(keys), null, 2)}\n`);
  }
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
  const keys = keypair();
  const { root, fingerprint } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  assert.equal(prepared.ok, true);
  assert.match(prepared.digestToSign, /^[a-f0-9]{64}$/u);
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  const installed = await run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath]);
  assert.equal(installed.ok, true);
  assert.equal(installed.receipt.outcome, "appended");
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 1);
  assert.equal(events.decisions[0].decisionId, "grant-1");
  assert.equal(events.decisions[0].scope.action, "OVERRIDE.GG-07");
  assert.equal(events.decisions[0].scope.artifacts.some((a) => a.path === "artifact.txt"), true);
});

test("a tampered proof is rejected and appends nothing", async (t) => {
  const keys = keypair();
  const { root, fingerprint } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign, { corrupt: true });
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath]),
    (error) => /HAG-PROOF-INVALID/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("a proof signed by the wrong key is rejected and appends nothing", async (t) => {
  const trusted = keypair();
  const impostor = keypair();
  const { root, fingerprint } = await fixture(trusted);
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  // Signed by a key that is not the one the committed trust anchor pins -- the
  // proof's own publicKey/signature are internally consistent, but the anchor
  // rejects it.
  const proofPath = await proofFor(external, impostor, prepared.digestToSign);
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath]),
    (error) => /HAG-PROOF-INVALID/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("a missing committed trust anchor (no project/critical-human-proof.json at all) is rejected and appends nothing", async (t) => {
  const { root, fingerprint } = await fixture(null);
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const keys = keypair();
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  // This fixture repository has no project/critical-human-proof.json at all,
  // and (F1) there is no override flag of any kind to substitute one.
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath]),
    (error) => /HAG-TRUST-ANCHOR-MISSING/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("F1: --trust-anchor-file is not a recognized flag at all -- install refuses it as an unknown argument, not merely as ignored, and appends nothing", async (t) => {
  const keys = keypair();
  const { root, fingerprint } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  // A forged trust anchor an attacker fully controls (their own key pinned as
  // the anchor) -- if the flag were still honored, this alone would let the
  // attacker author their own "granted" decision with no human involved.
  const forgedAnchorPath = path.join(external, "forged-anchor.json");
  const forgedKeys = keypair();
  await writeFile(forgedAnchorPath, JSON.stringify({ keyReference: "fixture-po-key", publicKeySha256: forgedKeys.publicKeySha256 }));
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath, "--trust-anchor-file", forgedAnchorPath]),
    (error) => /^Usage: human-authority-grant\.mjs prepare/u.test(error.message) && !error.message.includes("trust-anchor-file"),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("prepare refuses to run without its required flags", async () => {
  await assert.rejects(() => run(["prepare", "--repo-root", "/nonexistent"]));
});

test("install refuses a proof file supplied from inside the repository", async (t) => {
  const keys = keypair();
  const { root } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const insideProofPath = path.join(root, "proof-inside.json");
  await writeFile(insideProofPath, JSON.stringify({ schema: "pipeline.po-approval-proof.v1", intentSha256: prepared.digestToSign, keyReference: "fixture-po-key", publicKey: keys.publicKey, signatureBase64: signDigest(keys.privateKey, prepared.digestToSign) }));
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", insideProofPath]),
    (error) => /HAG-EXTERNAL-REQUIRED/u.test(error.message),
  );
});

test("F2: a proof file at the repo root whose name literally begins with '..' is correctly refused as in-repo, not accepted as external", async (t) => {
  const keys = keypair();
  const { root } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  // `path.relative(root, root + "/..proof.json")` returns the string
  // "..proof.json", which the old `rel.startsWith("..")` heuristic misread as
  // "outside the root" even though this file never leaves it.
  const dotDotProofPath = path.join(root, "..proof.json");
  await writeFile(dotDotProofPath, JSON.stringify({ schema: "pipeline.po-approval-proof.v1", intentSha256: prepared.digestToSign, keyReference: "fixture-po-key", publicKey: keys.publicKey, signatureBase64: signDigest(keys.privateKey, prepared.digestToSign) }));
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", dotDotProofPath]),
    (error) => /HAG-EXTERNAL-REQUIRED/u.test(error.message),
  );
});

test("F2: pointing --repo-root at a subdirectory of the real repository still correctly treats an actually-in-repo proof file as in-repo", async (t) => {
  const keys = keypair();
  const { root, fingerprint } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const subdir = path.join(root, "subdir");
  await mkdir(subdir, { recursive: true });
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  // A file at the TRUE repo root -- genuinely in-repo -- referenced while
  // --repo-root points at a subdirectory. `discoverRepository` resolves the
  // authoritative primaryRoot from ANY starting point inside the checkout, so
  // this must still be refused as in-repo, not laundered through by pointing
  // --repo-root one level down.
  const inRepoProofPath = path.join(root, "proof-at-true-root.json");
  await writeFile(inRepoProofPath, JSON.stringify({ schema: "pipeline.po-approval-proof.v1", intentSha256: prepared.digestToSign, keyReference: "fixture-po-key", publicKey: keys.publicKey, signatureBase64: signDigest(keys.privateKey, prepared.digestToSign) }));
  await assert.rejects(
    () => run(["install", "--repo-root", subdir, "--request", requestPath, "--proof", inRepoProofPath]),
    (error) => /HAG-EXTERNAL-REQUIRED/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("N1: pointing --repo-root at an agent-writable subdirectory that itself contains a forged project/critical-human-proof.json does not cause install to verify against that forged anchor -- it still resolves and verifies against the real repository's committed anchor", async (t) => {
  const keys = keypair();
  const { root, fingerprint } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const subdir = path.join(root, "subdir");
  await mkdir(path.join(subdir, "project"), { recursive: true });
  // An attacker-controlled trust anchor, planted one level down in a
  // subdirectory of the SAME checkout (no nested .git -- this is not a
  // separate repository, just an agent-writable path inside the real one).
  const forgedKeys = keypair();
  await writeFile(path.join(subdir, "project/critical-human-proof.json"), `${JSON.stringify(trustAnchorPolicy(forgedKeys), null, 2)}\n`);
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  // Signed by the ATTACKER's own key -- this would verify successfully if
  // `install` read the forged anchor in `subdir/project/critical-human-proof.json`
  // instead of the real repository's committed one at the true root.
  const forgedProofPath = await proofFor(external, forgedKeys, prepared.digestToSign);
  await assert.rejects(
    () => run(["install", "--repo-root", subdir, "--request", requestPath, "--proof", forgedProofPath]),
    (error) => /HAG-PROOF-INVALID/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("a request whose payload has been tampered with after prepare is rejected before append", async (t) => {
  const keys = keypair();
  const { root, fingerprint } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  const stored = JSON.parse(await readFile(requestPath, "utf8"));
  stored.intent.payload.scope.action = "OVERRIDE.GG-99"; // widen the grant's scope after signing
  await writeFile(requestPath, JSON.stringify(stored));
  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath]),
    (error) => /HAG-REQUEST-INVALID/u.test(error.message),
  );
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 0);
});

test("F4: a request whose envelope-level eventId was hand-edited after prepare installs with the reconstructed eventId, never the tampered one", async (t) => {
  const keys = keypair();
  const { root, fingerprint } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  const stored = JSON.parse(await readFile(requestPath, "utf8"));
  // `eventId` is envelope-level, NOT part of the signed subject
  // (`{decision, plan, spec}` only -- human-governance-ledger.mjs), so nothing
  // cryptographic rejects this tamper. It must be silently ignored by
  // reconstruction instead.
  stored.intent.eventId = "attacker-chosen-event-id";
  await writeFile(requestPath, JSON.stringify(stored));
  const installed = await run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath]);
  assert.equal(installed.ok, true);
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.events.length, 1);
  assert.notEqual(events.events[0].eventId, "attacker-chosen-event-id");
  assert.equal(events.events[0].eventId, "grant-1-event");
});

test("F4: a request whose envelope-level candidate was hand-edited after prepare installs with the reconstructed (decision-derived) candidate, never the tampered one", async (t) => {
  const keys = keypair();
  const { root, fingerprint } = await fixture(keys);
  t.after(() => rm(root, { recursive: true, force: true }));
  const external = await mkdtemp(path.join(os.tmpdir(), "human-authority-grant-ext-"));
  t.after(() => rm(external, { recursive: true, force: true }));
  const requestPath = path.join(root, "request.json");
  const prepared = await run(prepareArgs(root, requestPath));
  const proofPath = await proofFor(external, keys, prepared.digestToSign);
  const stored = JSON.parse(await readFile(requestPath, "utf8"));
  const correctCommit = stored.intent.candidate.commit;
  const tamperedCommit = "b".repeat(40);
  // Envelope-level `intent.candidate` only -- `decision.scope.candidate`
  // (inside `payload`, part of the signed subject) is left untouched.
  stored.intent.candidate = { commit: tamperedCommit, tree: tamperedCommit };
  await writeFile(requestPath, JSON.stringify(stored));
  const installed = await run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath]);
  assert.equal(installed.ok, true);
  const events = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(events.decisions.length, 1);
  assert.notEqual(events.decisions[0].scope.candidate.commit, tamperedCommit);
  assert.equal(events.decisions[0].scope.candidate.commit, correctCommit);
});
