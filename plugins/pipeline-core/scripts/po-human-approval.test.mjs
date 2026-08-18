#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * po-human-approval.test.mjs — first test coverage for scripts/po-human-approval.mjs,
 * scoped to the new `sign-intent` subcommand only (NOVA-PO-SIGN-HELPER-1), plus the
 * plain-language pre-signature confirmation gate added on top of it in
 * NOVA-PO-CONFIRM-1. The pre-existing setup/prepare/approve/verify branches and their
 * -critical/-all variants are intentionally left uncovered here: `sign-intent` is
 * request-shape-agnostic (no --feature-id/--kind/request-file dependency at all), so
 * this suite proves only that it signs an already-computed 64-hex-char intent digest
 * with the same OpenSSL/proof-shape discipline the existing `approve` branch already
 * uses, and that neither branch can reach OpenSSL without an explicit, injected
 * confirmation. `approve`/`approve-critical` share the exact same
 * `requireExplicitConfirmation` gate exercised below; their own request-fixture setup
 * is covered elsewhere (plugins/pipeline-core/lib/threat-model-approval-request.test.mjs).
 *
 * WP-K-AC05-REWORK1 adds a second scope to this file: the `*-fork-disposition`
 * commands (ADR-0063). Their central proof is deliberately end-to-end rather
 * than shape-level — a request this CLI builds, signed by a real OpenSSL round
 * trip, must be accepted by the store's OWN verifier (`authorizeForkDisposition`
 * via `recoverPortableGovernanceProjection`), because "the command runs" is
 * exactly what the previous, unusable `prepare-critical --kind
 * governance-fork-disposition` route could also claim. One regression test
 * pins that `push`/`deploy`/`publication` keep composing the same request from
 * the real candidate and real repository file bytes.
 *
 * WP-K-AC05-REWORK2 adds what that round left open: the OLD route
 * (`prepare-critical --kind governance-fork-disposition`) still parsed, still
 * built the unverifiable request, and wrote it over the correct command's own
 * artifact. Its refusal is proven below against a prepared, valid request — the
 * file must survive byte-identical — and the public half of the ceremony is
 * exercised through `po-approval-gate.mjs`, the script the lifecycle guard
 * allowlists as agent-executable, rather than only through the human-terminal
 * entry point.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseHumanArgs, runForkDispositionApproval, runHumanApproval } from "./po-human-approval.mjs";
import { run as runApprovalGate } from "./po-approval-gate.mjs";
import { PO_APPROVAL_PROOF_SCHEMA, verifyPoApprovalProof } from "../lib/po-approval-proof.mjs";
import { CRITICAL_ACTION_KINDS, createCriticalActionApprovalRequest, verifyCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import { canonicalSha256, canonicalizeJson, sealGovernanceEvent } from "../lib/governance-event.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { appendPortableGovernanceEvent, recoverPortableGovernanceProjection } from "../lib/governance-event-store.mjs";

function openssl(args) {
  const result = spawnSync("openssl", args, { stdio: "pipe" });
  assert.equal(result.status, 0, `openssl ${args.join(" ")} failed: ${result.stderr?.toString() ?? ""}`);
}

/**
 * Throwaway, unencrypted, test-only Ed25519 keypair placed directly in the fixture's
 * external directory. This is fine for a test fixture only because a test cannot
 * supply an interactive passphrase; it does not change what the real `setup`
 * command (untouched by this task) generates or accepts.
 */
function keyFixture(directory) {
  const privateKey = join(directory, "po-private.pem");
  const publicKey = join(directory, "po-public.pem");
  openssl(["genpkey", "-algorithm", "ED25519", "-out", privateKey]);
  openssl(["pkey", "-in", privateKey, "-pubout", "-out", publicKey]);
  const publicKeyPem = readFileSync(publicKey, "utf8");
  const authority = { keyReference: "sign-intent-test-key", publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify(authority, null, 2)}\n`);
  return { publicKeyPem, authority };
}

function fixtureDirs() {
  return {
    repoRoot: mkdtempSync(join(tmpdir(), "po-sign-intent-repo-")),
    directory: mkdtempSync(join(tmpdir(), "po-sign-intent-external-")),
  };
}

function cleanup({ repoRoot, directory }) {
  rmSync(repoRoot, { recursive: true, force: true });
  rmSync(directory, { recursive: true, force: true });
}

/**
 * `setup`'s fresh-key-creation branch shells out to a real, interactive
 * `openssl genpkey -aes-256-cbc` that blocks on a passphrase this test cannot
 * supply. This fake `spawn` dependency intercepts only that one call and
 * generates an unencrypted key at the same `-out` path instead (fine for a
 * test-only key that is discarded with the fixture directory); the following
 * `pkey -pubout` call needs no passphrase and runs through unmodified.
 */
function fakeSetupSpawn(executable, args) {
  if (executable === "openssl" && args[0] === "genpkey") {
    const outIndex = args.indexOf("-out");
    const result = spawnSync("openssl", ["genpkey", "-algorithm", "ED25519", "-out", args[outIndex + 1]], { stdio: "pipe" });
    return { status: result.status };
  }
  const result = spawnSync(executable, args, { stdio: "pipe" });
  return { status: result.status };
}

function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  let captured = "";
  process.stdout.write = (chunk, ...rest) => { captured += chunk; return original(chunk, ...rest); };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return captured;
}

test("setup fresh-key creation with a custom --key-reference prints the H-AC-11 O-4 privacy nudge", () => {
  const dirs = fixtureDirs();
  try {
    const output = captureStdout(() => {
      const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "roa-full-name"], { spawn: fakeSetupSpawn });
      assert.equal(result.ok, true);
      assert.equal(result.authority.keyReference, "roa-full-name");
      assert.equal("recovered" in result, false);
    });
    assert.match(output, /--key-reference/u);
    assert.match(output, /H-AC-11 O-4/u);
  } finally {
    cleanup(dirs);
  }
});

test("setup fresh-key creation with the default --key-reference (local-po-key) does not print the nudge", () => {
  const dirs = fixtureDirs();
  try {
    const output = captureStdout(() => {
      const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], { spawn: fakeSetupSpawn });
      assert.equal(result.ok, true);
      assert.equal(result.authority.keyReference, "local-po-key");
    });
    assert.equal(output, "");
  } finally {
    cleanup(dirs);
  }
});

test("setup's recovered branch (private+public key exist, no authority yet) does not print the nudge even with a custom --key-reference", () => {
  const dirs = fixtureDirs();
  try {
    // First run creates the key pair with the default reference; drop the
    // authority file it wrote so the next `setup` call takes the "recovered"
    // branch (privateKey && publicKey && !authority).
    runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], { spawn: fakeSetupSpawn });
    rmSync(join(dirs.directory, "trust-policy.json"), { force: true });
    const output = captureStdout(() => {
      const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "roa-full-name"], { spawn: fakeSetupSpawn });
      assert.equal(result.ok, true);
      assert.equal(result.recovered, true);
      assert.equal(result.authority.keyReference, "roa-full-name");
    });
    assert.equal(output, "");
  } finally {
    cleanup(dirs);
  }
});

test("setup's already-exists branch (matching trust policy already present) does not print the nudge even with a custom --key-reference", () => {
  const dirs = fixtureDirs();
  try {
    // First run creates the key pair and an authority bound to a custom
    // reference; a second `setup` call with the SAME reference must take the
    // "already exists" branch (all three present, values match).
    runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "roa-full-name"], { spawn: fakeSetupSpawn });
    const output = captureStdout(() => {
      const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "roa-full-name"], { spawn: fakeSetupSpawn });
      assert.equal(result.ok, true);
      assert.equal(result.recovered, false);
      assert.equal(result.authority.keyReference, "roa-full-name");
    });
    assert.equal(output, "");
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent fails closed before setup (no key material present)", () => {
  const dirs = fixtureDirs();
  try {
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "a".repeat(64)], {}),
      /run setup before sign-intent/,
    );
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent rejects an invalid --intent-sha256 (wrong length / non-hex)", () => {
  const dirs = fixtureDirs();
  try {
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "z".repeat(64)], {}),
      /Usage:/,
      "non-hex characters must be rejected",
    );
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "a".repeat(63)], {}),
      /Usage:/,
      "wrong length must be rejected",
    );
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent signs a digest end-to-end with a real OpenSSL round trip and the proof verifies, after an accepted confirmation naming the digest", () => {
  const dirs = fixtureDirs();
  try {
    const { publicKeyPem, authority } = keyFixture(dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-fixture").digest("hex");
    const confirmationPrompts = [];
    const dependencies = { readConfirmation: (prompt) => { confirmationPrompts.push(prompt); return "approve"; } };
    const result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies);
    assert.deepEqual(result, { ok: true, code: "PO-HUMAN-SIGN-INTENT-READY", intentSha256 });

    assert.equal(confirmationPrompts.length, 1, "sign-intent must ask for exactly one explicit confirmation before signing");
    assert.match(confirmationPrompts[0], new RegExp(intentSha256, "u"), "the confirmation prompt must name the exact digest being authorized");
    assert.match(confirmationPrompts[0], /guard-lift\/guard-override/u, "the confirmation prompt must state the generic consequence class");
    assert.match(confirmationPrompts[0], /type exactly "approve"/iu, "the confirmation prompt must require an explicit typed token, not a bare y/n");

    const proofPath = join(dirs.directory, "proof-manual.json");
    assert.equal(existsSync(proofPath), true);
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    assert.equal(proof.schema, PO_APPROVAL_PROOF_SCHEMA);
    assert.equal(proof.intentSha256, intentSha256);
    assert.equal(proof.keyReference, authority.keyReference);
    assert.equal(proof.publicKey, publicKeyPem);
    assert.equal(typeof proof.signatureBase64, "string");

    const verified = verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof });
    assert.equal(verified.verified, true);
    assert.equal(verified.code, "PO-APPROVAL-PROOF-VERIFIED");

    // Temp signing artifacts are cleaned up in a `finally`; only the durable proof remains.
    assert.equal(existsSync(join(dirs.directory, "intent-manual.txt")), false);
    assert.equal(existsSync(join(dirs.directory, "signature-manual.bin")), false);

    // A second, distinct digest re-signs cleanly into the same fixed artifact name and
    // does not disturb the shared key material this run already produced.
    const otherIntentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-fixture-2").digest("hex");
    runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", otherIntentSha256], dependencies);
    const secondProof = JSON.parse(readFileSync(proofPath, "utf8"));
    assert.equal(secondProof.intentSha256, otherIntentSha256);
    const secondVerified = verifyPoApprovalProof({ intent: { sha256: otherIntentSha256 }, trustPolicy: authority, proof: secondProof });
    assert.equal(secondVerified.verified, true);
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent cancels on a mismatched confirmation: OpenSSL is never invoked and no artifact is written", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-cancel-fixture").digest("hex");
    let spawnCalled = false;
    const dependencies = {
      readConfirmation: () => "nope",
      spawn: () => { spawnCalled = true; return { status: 0 }; },
    };
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies),
      /approval cancelled: explicit confirmation was not given/,
    );
    assert.equal(spawnCalled, false, "OpenSSL must never be invoked once confirmation is cancelled");
    assert.equal(existsSync(join(dirs.directory, "proof-manual.json")), false);
    assert.equal(existsSync(join(dirs.directory, "signature-manual.bin")), false);
    assert.equal(existsSync(join(dirs.directory, "intent-manual.txt")), false);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------------- *
 * WP-K-AC05-REWORK1 — fork-disposition ceremony fixtures.
 *
 * The forked-stream fixture is rebuilt here rather than imported from
 * lib/governance-event-store.test.mjs: importing a `node:test` file registers
 * its whole suite a second time. It reproduces that file's technique exactly —
 * two genuine appends, then a rogue `sealGovernanceEvent` written straight into
 * the canonical directory at an already-occupied sequence.
 * ------------------------------------------------------------------------- */
const CANDIDATE = { commit: "b".repeat(40), tree: "c".repeat(40) };
const UNAVAILABLE = { state: "not-applicable" };
const FAR_FUTURE = "2999-01-01T00:00:00.000Z";

function registryFixture(fingerprint) {
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

function envelope(fingerprint, capturePolicyDigest, overrides = {}) {
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
    correlation: { featureId: UNAVAILABLE, packageId: "phoenix-3", requestId: UNAVAILABLE, sessionId: UNAVAILABLE, dispatchId: "dispatch-1", traceId: UNAVAILABLE },
    candidate: CANDIDATE,
    artifacts: [UNAVAILABLE],
    policy: { policyDigest: UNAVAILABLE, configurationDigest: UNAVAILABLE, capturePolicyDigest, redactionPolicyDigest: UNAVAILABLE },
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payload: { eventId: "lifecycle-1", kind: "dispatch", status: "active", reasonCode: "DISPATCHED", correlation: { packageId: "phoenix-3", dispatchId: "dispatch-1", attemptId: "attempt-1", workerId: "worker-1", correlationId: "correlation-1", queueRevision: 0 }, candidate: CANDIDATE, invalidatesEventId: null, supersedesEventId: null },
    ...overrides,
  };
}

async function forkedRepositoryFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), "po-fork-disposition-repo-"));
  execFileSync("git", ["init", "-q", repoRoot]);
  const repository = discoverRepository(repoRoot);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  const capturePolicy = capturePolicyFixture();
  const capturePolicyDigest = canonicalSha256(capturePolicy);
  mkdirSync(join(repoRoot, "governance/events"), { recursive: true });
  writeFileSync(join(repoRoot, "governance/events/registry.json"), `${canonicalizeJson(registryFixture(fingerprint))}\n`);
  writeFileSync(join(repoRoot, "governance/events/capture-policy.json"), `${canonicalizeJson(capturePolicy)}\n`);
  const intent = (overrides = {}) => envelope(fingerprint, capturePolicyDigest, overrides);
  const first = await appendPortableGovernanceEvent({ repositoryRoot: repoRoot, repositoryFingerprint: fingerprint, intent: intent() });
  await appendPortableGovernanceEvent({ repositoryRoot: repoRoot, repositoryFingerprint: fingerprint, intent: intent({ eventId: "evt-2", idempotencyKey: "idem-2", occurredAtEpochMs: 2, observedAtEpochMs: 2, payload: { ...intent().payload, eventId: "lifecycle-2", reasonCode: "CONTINUED" } }) });
  const fork = sealGovernanceEvent({ ...intent({ eventId: "evt-fork", idempotencyKey: "idem-fork" }), sequence: 2, previousEventDigest: first.eventDigest, payloadDigest: "0".repeat(64), eventDigest: "0".repeat(64) });
  writeFileSync(join(repoRoot, "governance/events/lifecycle/2-evt-fork.json"), `${canonicalizeJson(fork)}\n`);
  const directory = mkdtempSync(join(tmpdir(), "po-fork-disposition-external-"));
  return { repoRoot, directory, fingerprint };
}

/** Declares the fixture's own throwaway key as the repository's trust anchor — the
 * store accepts no caller-supplied one, exactly as the library tests establish. */
function declareTrustAnchor(repoRoot, authority) {
  mkdirSync(join(repoRoot, "project"), { recursive: true });
  writeFileSync(join(repoRoot, "project/critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["governance-fork-disposition"],
    trustAnchor: { keyReference: authority.keyReference, publicKeySha256: authority.publicKeySha256 },
  }));
}

const forkArgs = (dirs, extra = []) => [
  "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
  "--repository-fingerprint", dirs.fingerprint, "--stream-id", "lifecycle", "--sequence", "2",
  ...extra,
];

test("a fork-disposition request built by the CLI, signed with the PO key, is accepted by the store's own verifier", async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    const { authority } = keyFixture(dirs.directory);
    declareTrustAnchor(dirs.repoRoot, authority);

    const prepared = await runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    assert.equal(prepared.code, "PO-HUMAN-FORK-DISPOSITION-REQUEST-READY");
    assert.deepEqual([...prepared.acknowledgedEventIds].sort(), ["evt-2", "evt-fork"], "the acknowledged identifiers must come from the observed fork, not from the caller");
    assert.equal(prepared.forkedEventDigests.length, 2);
    assert.notDeepEqual(prepared.candidate, CANDIDATE, "the candidate must be the derived one, never a repository commit/tree");

    const written = JSON.parse(readFileSync(join(dirs.directory, "request-critical-governance-fork-disposition.json"), "utf8"));
    assert.equal(written.action.kind, "governance-fork-disposition");
    assert.equal(written.action.subjectSha256, prepared.subjectSha256);

    const confirmations = [];
    const dependencies = { readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; } };
    const approved = await runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], dependencies);
    assert.equal(approved.code, "PO-HUMAN-PROOF-READY", "signing must run through the existing critical-approval branch, unchanged");
    assert.equal(confirmations.length, 1, "the human must confirm exactly once before OpenSSL is reached");
    assert.match(confirmations[0], new RegExp(prepared.subjectSha256, "u"), "the confirmation must name the exact subject being authorized");

    const verified = await runForkDispositionApproval(["verify-fork-disposition", ...forkArgs(dirs)], {});
    assert.equal(verified.code, "PO-HUMAN-FORK-DISPOSITION-VERIFIED");
    assert.equal(verified.value.verified, true);

    // THE central proof: the store's own path, not this CLI's readback.
    const recovered = await recoverPortableGovernanceProjection({
      repositoryRoot: dirs.repoRoot,
      repositoryFingerprint: dirs.fingerprint,
      streamId: "lifecycle",
      disposition: {
        idempotencyKey: "fork-disp-cli",
        sequence: 2,
        acknowledgedEventIds: prepared.acknowledgedEventIds,
        reasonCode: "GOVERNED_ACK",
        disposedAtEpochMs: 1,
        approval: verified.approval,
      },
    });
    assert.equal(recovered.status, "fork-disposition-recorded", "authorizeForkDisposition must accept a request this CLI built and this key signed");
  } finally {
    cleanup(dirs);
  }
});

test("the fork-disposition commands refuse every self-minting shortcut", async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    // A bare subject digest or a caller-chosen kind is exactly what ADR-0063 closes.
    for (const extra of [["--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE], ["--kind", "push", "--expires-at", FAR_FUTURE]]) {
      await assert.rejects(() => runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, extra)], {}), /Usage:/u);
    }
    // A sequence that is not actually forked cannot be prepared at all.
    await assert.rejects(
      () => runForkDispositionApproval(["prepare-fork-disposition", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--repository-fingerprint", dirs.fingerprint, "--stream-id", "lifecycle", "--sequence", "7", "--expires-at", FAR_FUTURE], {}),
      /no forked position at sequence 7/u,
    );
    // Verification is against the repository's declared anchor, so an undeclared key cannot self-verify.
    const { authority } = keyFixture(dirs.directory);
    await runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    await runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: () => "approve" });
    await assert.rejects(() => runForkDispositionApproval(["verify-fork-disposition", ...forkArgs(dirs)], {}), /no usable trustAnchor/u);
    declareTrustAnchor(dirs.repoRoot, authority);
    assert.equal((await runForkDispositionApproval(["verify-fork-disposition", ...forkArgs(dirs)], {})).value.verified, true, "the rejections above must not be a fixture that could never verify");
    // A synchronous caller must not silently reach a wrong branch.
    assert.throws(() => runHumanApproval(["verify-fork-disposition", ...forkArgs(dirs)], {}), /runForkDispositionApproval/u);
  } finally {
    cleanup(dirs);
  }
});

test("approve-fork-disposition refuses a tampered approvalIntent before any signing side effect (F2)", async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    const { authority } = keyFixture(dirs.directory);
    declareTrustAnchor(dirs.repoRoot, authority);
    await runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    const requestPath = join(dirs.directory, "request-critical-governance-fork-disposition.json");
    const request = JSON.parse(readFileSync(requestPath, "utf8"));
    // action.kind/action.subjectSha256 stay correct (they pass the earlier
    // check at :419-421); only the approvalIntent's own authority field is
    // tampered, exactly the gap F2 closes.
    request.approvalIntent.value.featureId = "tampered-feature-id";
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);

    const confirmations = [];
    await assert.rejects(
      () => runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; } }),
      /not issued for the fork-disposition authority/u,
    );
    assert.equal(confirmations.length, 0, "the confirmation prompt -- and therefore OpenSSL -- must never be reached once the intent is tampered");
    assert.equal(existsSync(join(dirs.directory, "proof-critical-governance-fork-disposition.json")), false, "no signature may be produced for a request with a tampered approvalIntent");
  } finally {
    cleanup(dirs);
  }
});

test("prepare-critical keeps composing push/deploy/publication requests exactly as before", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };
    const subjectSha256 = "a".repeat(64);
    for (const kind of ["push", "deploy", "publication"]) {
      const result = runHumanApproval([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
        "--kind", kind, "--subject-sha256", subjectSha256, "--expires-at", FAR_FUTURE,
      ], { observeCandidate: () => observed });
      assert.equal(result.code, "PO-HUMAN-CRITICAL-REQUEST-READY");
      assert.deepEqual(result.candidate, observed, "the three original kinds still bind the observed git candidate");
      const expected = createCriticalActionApprovalRequest({
        candidate: observed,
        featureId: "cyb-4",
        planBytes: Buffer.from("plan bytes\n", "utf8"),
        specBytes: Buffer.from("spec bytes\n", "utf8"),
        action: { kind, subjectSha256, expiresAt: FAR_FUTURE },
      });
      assert.deepEqual(JSON.parse(readFileSync(join(dirs.directory, `request-critical-${kind}.json`), "utf8")), expected, "real repository file bytes and the caller-supplied subject digest, unchanged");
    }
    // The fork-locating flags stay unknown to every pre-existing command.
    assert.throws(() => runHumanApproval([
      "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "push", "--subject-sha256", subjectSha256, "--expires-at", FAR_FUTURE, "--stream-id", "lifecycle",
    ], {}), /Usage:/u);
  } finally {
    cleanup(dirs);
  }
});

test("the -critical trio refuses the fork-disposition kind, so no operator route can build the unverifiable request or overwrite the correct one", async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const prepared = await runForkDispositionApproval(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    const requestPath = join(dirs.directory, "request-critical-governance-fork-disposition.json");
    const before = readFileSync(requestPath, "utf8");

    // The exact escape route: the CORRECT receipt's subject digest, copied into
    // prepare-critical. The request that produced used to satisfy
    // approve-fork-disposition's kind/subject re-check while still carrying a
    // git candidate and repository plan/spec bytes, so the whole signing
    // ceremony ran before anything noticed.
    assert.throws(() => runHumanApproval([
      "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "governance-fork-disposition", "--subject-sha256", prepared.subjectSha256, "--expires-at", FAR_FUTURE,
    ], { observeCandidate: () => ({ commit: "d".repeat(40), tree: "e".repeat(40) }) }), /Usage:/u);
    assert.equal(readFileSync(requestPath, "utf8"), before, "a refused prepare-critical cannot clobber the prepared fork-disposition request");

    // Signing and readback are refused at the same point, so that re-check is no
    // longer the only thing standing between a copied digest and OpenSSL.
    for (const command of ["approve-critical", "verify-critical"]) {
      assert.throws(() => runHumanApproval([command, "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--kind", "governance-fork-disposition"], {}), /Usage:/u, `${command} must refuse the kind outright`);
    }

    // Whatever the shared family grows next has to be an explicit decision for
    // these three commands too, not automatic membership — which is exactly how
    // the fourth kind arrived here unnoticed. `feature-package-reconcile` was
    // added to CRITICAL_COMMAND_KINDS deliberately (PHX-WP-POHUMAN-SIGNING-ERGO
    // fix 2, 2026-08-18) and is exercised by its own positive-path test below,
    // so it is excluded from this negative loop.
    for (const kind of CRITICAL_ACTION_KINDS.filter((entry) => !["push", "deploy", "publication", "feature-package-reconcile"].includes(entry))) {
      assert.throws(() => runHumanApproval([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
        "--kind", kind, "--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE,
      ], {}), /Usage:/u, `${kind} is not one of the three kinds these commands can compose`);
    }

    // The fork-disposition ceremony itself still works after the narrowing: its
    // approve step reaches the same signing branch the refused argv named.
    const { authority } = keyFixture(dirs.directory);
    declareTrustAnchor(dirs.repoRoot, authority);
    const approved = await runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: () => "approve" });
    assert.equal(approved.code, "PO-HUMAN-PROOF-READY");
    assert.equal((await runForkDispositionApproval(["verify-fork-disposition", ...forkArgs(dirs)], {})).value.verified, true);
  } finally {
    cleanup(dirs);
  }
});

test("po-approval-gate.mjs drives the public half of the fork-disposition ceremony, and only the public half", async () => {
  const dirs = await forkedRepositoryFixture();
  try {
    const { authority } = keyFixture(dirs.directory);
    declareTrustAnchor(dirs.repoRoot, authority);

    const prepared = await runApprovalGate(["prepare-fork-disposition", ...forkArgs(dirs, ["--expires-at", FAR_FUTURE])], {});
    assert.equal(prepared.code, "PO-HUMAN-FORK-DISPOSITION-REQUEST-READY", "the agent-executable control plane must be able to prepare the request");

    // The signing half is not the control plane's to run: it delegates to the
    // approve-critical branch and therefore reads the private key.
    assert.throws(() => runApprovalGate(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: () => "approve", spawn: () => ({ status: 0 }) }), /Usage:/u);
    assert.equal(existsSync(join(dirs.directory, "proof-critical-governance-fork-disposition.json")), false, "no proof may exist before the human has signed");

    await runForkDispositionApproval(["approve-fork-disposition", ...forkArgs(dirs)], { readConfirmation: () => "approve" });
    const verified = await runApprovalGate(["verify-fork-disposition", ...forkArgs(dirs)], {});
    assert.equal(verified.code, "PO-HUMAN-FORK-DISPOSITION-VERIFIED");
    assert.equal(verified.value.verified, true);
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent cancels on an empty confirmation answer the same way as a mismatched one", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-empty-fixture").digest("hex");
    let spawnCalled = false;
    const dependencies = {
      readConfirmation: () => "",
      spawn: () => { spawnCalled = true; return { status: 0 }; },
    };
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], dependencies),
      /approval cancelled: explicit confirmation was not given/,
    );
    assert.equal(spawnCalled, false);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------------- *
 * PHX-WP-POHUMAN-SIGNING-ERGO fix 1 — the 3-key trustPolicy/authority shape
 * (`{keyReference, publicKeySha256, humanName}`) must pass all three local
 * `own()`-gated call sites (`setup`'s already-exists branch, `sign-intent`,
 * `approve`/`approve-critical`), mirroring `po-approval-proof.mjs`'s already-
 * fixed and tested `ownTrustPolicy()` pattern.
 * ------------------------------------------------------------------------- */

test("setup's already-exists branch accepts a 3-key trust policy carrying humanName", () => {
  const dirs = fixtureDirs();
  try {
    runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], { spawn: fakeSetupSpawn });
    const authorityPath = join(dirs.directory, "trust-policy.json");
    const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
    writeFileSync(authorityPath, `${JSON.stringify({ ...authority, humanName: "Nova the PO" }, null, 2)}\n`);
    const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], { spawn: fakeSetupSpawn });
    assert.equal(result.ok, true);
    assert.equal(result.recovered, false);
    assert.equal(result.authority.humanName, "Nova the PO");
  } finally {
    cleanup(dirs);
  }
});

test("setup's already-exists branch still fails closed on an unrelated extra field (not humanName)", () => {
  const dirs = fixtureDirs();
  try {
    runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], { spawn: fakeSetupSpawn });
    const authorityPath = join(dirs.directory, "trust-policy.json");
    const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
    writeFileSync(authorityPath, `${JSON.stringify({ ...authority, unexpectedField: "x" }, null, 2)}\n`);
    assert.throws(
      () => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], { spawn: fakeSetupSpawn }),
      /existing trust policy does not match the local public key/,
    );
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent accepts a 3-key trust policy carrying humanName", () => {
  const dirs = fixtureDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    writeFileSync(join(dirs.directory, "trust-policy.json"), `${JSON.stringify({ ...authority, humanName: "Nova the PO" }, null, 2)}\n`);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-humanname-fixture").digest("hex");
    const result = runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], { readConfirmation: () => "approve" });
    assert.equal(result.ok, true);
    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-manual.json"), "utf8"));
    assert.equal(proof.keyReference, authority.keyReference);
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent still fails closed on an unrelated extra field (not humanName)", () => {
  const dirs = fixtureDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    writeFileSync(join(dirs.directory, "trust-policy.json"), `${JSON.stringify({ ...authority, unexpectedField: "x" }, null, 2)}\n`);
    const intentSha256 = createHash("sha256").update("pipeline.guard-lift-intent-badfield-fixture").digest("hex");
    assert.throws(
      () => runHumanApproval(["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256], { readConfirmation: () => "approve" }),
      /external trust policy does not match the local public key/,
    );
  } finally {
    cleanup(dirs);
  }
});

test("approve-critical accepts a 3-key trust policy carrying humanName and the confirmation summary names the intent digest (fix 3)", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };
    const subjectSha256 = "a".repeat(64);
    const prepared = runHumanApproval([
      "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "push", "--subject-sha256", subjectSha256, "--expires-at", FAR_FUTURE,
    ], { observeCandidate: () => observed });
    const { authority } = keyFixture(dirs.directory);
    writeFileSync(join(dirs.directory, "trust-policy.json"), `${JSON.stringify({ ...authority, humanName: "Nova the PO" }, null, 2)}\n`);
    const confirmations = [];
    const result = runHumanApproval([
      "approve-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--kind", "push",
    ], { readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; } });
    assert.equal(result.ok, true);
    assert.equal(confirmations.length, 1);
    assert.match(confirmations[0], new RegExp(`intent sha256: ${prepared.intentSha256}`, "u"), "the confirmation must name the intent digest actually signed");
    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-critical-push.json"), "utf8"));
    assert.equal(proof.keyReference, authority.keyReference);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------------- *
 * PHX-WP-POHUMAN-SIGNING-ERGO fix 2 — `feature-package-reconcile` is now an
 * accepted `--kind` for the `-critical` trio at the parser level;
 * `governance-fork-disposition` stays refused (regression guard).
 * ------------------------------------------------------------------------- */

test("parseHumanArgs accepts --kind feature-package-reconcile on the -critical commands", () => {
  for (const command of ["prepare-critical", "approve-critical", "verify-critical"]) {
    const parsed = parseHumanArgs([
      command, "--repo-root", "/repo", "--directory", "/external",
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "feature-package-reconcile", "--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE,
    ]);
    assert.equal(parsed.error, undefined, `${command} --kind feature-package-reconcile must pass the parser gate`);
    assert.equal(parsed.kind, "feature-package-reconcile");
  }
});

test("parseHumanArgs still refuses --kind governance-fork-disposition on the -critical commands (regression guard)", () => {
  for (const command of ["prepare-critical", "approve-critical", "verify-critical"]) {
    const parsed = parseHumanArgs([
      command, "--repo-root", "/repo", "--directory", "/external",
      "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
      "--kind", "governance-fork-disposition", "--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE,
    ]);
    assert.match(parsed.error ?? "", /Usage:/u, `${command} --kind governance-fork-disposition must still be refused`);
  }
});

/* ------------------------------------------------------------------------- *
 * PHX-WP-PORT-ADR0061-AUTHORIZE-CRITICAL — porting origin/main's ADR-0061
 * single-command critical-action ceremony (`authorize-critical`), replacing
 * the two-step `prepare-critical`/`approve-critical` split for the human's
 * own act. The central proof, mirrored from origin/main's own regression
 * suite: a request left on disk by an earlier, DIFFERENT preparation (the
 * "stale request" failure mode that motivated ADR-0061 -- a failed
 * `prepare-critical` leaving a stale request that `approve-critical` then
 * silently signs) can never be the thing `authorize-critical` signs, because
 * it always writes and binds to the request it just built in the same call.
 * ------------------------------------------------------------------------- */

function criticalRequestArgs(dirs, { kind = "push", subjectSha256 = "a".repeat(64), expiresAt = FAR_FUTURE } = {}) {
  return [
    "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
    "--feature-id", "cyb-4", "--plan", "plan.md", "--spec", "spec.md",
    "--kind", kind, "--subject-sha256", subjectSha256, "--expires-at", expiresAt,
  ];
}

test("authorize-critical fails closed before setup and prepares nothing when key material is absent", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    assert.throws(
      () => runHumanApproval(["authorize-critical", ...criticalRequestArgs(dirs)], {}),
      /run setup before authorize-critical/u,
    );
    assert.equal(existsSync(join(dirs.directory, "request-critical-push.json")), false, "no request may be written before key material is confirmed present");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical requires a feature id, exactly as prepare-critical does", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory);
    assert.throws(
      () => runHumanApproval([
        "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--plan", "plan.md", "--spec", "spec.md",
        "--kind", "push", "--subject-sha256", "a".repeat(64), "--expires-at", FAR_FUTURE,
      ], {}),
      /critical approval requires a feature id/u,
    );
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical prepares and signs in ONE invocation, and the resulting proof verifies against the request built in that same invocation", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const { authority } = keyFixture(dirs.directory);
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };
    const subjectSha256 = "a".repeat(64);
    const confirmations = [];
    const dependencies = {
      observeCandidate: () => observed,
      readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; },
    };
    const result = runHumanApproval(["authorize-critical", ...criticalRequestArgs(dirs, { subjectSha256 })], dependencies);
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
    assert.deepEqual(result.candidate, observed);
    assert.equal(result.action.kind, "push");
    assert.equal(result.action.subjectSha256, subjectSha256);

    assert.equal(confirmations.length, 1, "authorize-critical must ask for exactly one explicit confirmation before signing");
    assert.match(confirmations[0], new RegExp(subjectSha256, "u"), "the confirmation must state the exact subject being authorized");
    assert.match(confirmations[0], /does NOT cover/u, "the confirmation must state the approval's bounds (ADR-0061 Decision 4)");

    const request = JSON.parse(readFileSync(join(dirs.directory, "request-critical-push.json"), "utf8"));
    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-critical-push.json"), "utf8"));
    assert.equal(proof.keyReference, authority.keyReference);
    const verified = verifyCriticalActionApprovalRequest({
      request, trustPolicy: authority, proof, expectedCandidate: observed, expectedAction: request.action,
    });
    assert.equal(verified.verified, true, "the proof produced by authorize-critical must verify against the request it built in the same call");

    // Temp signing artifacts are cleaned up; only the durable request/proof remain.
    assert.equal(existsSync(join(dirs.directory, "intent-critical-push.txt")), false);
    assert.equal(existsSync(join(dirs.directory, "signature-critical-push.bin")), false);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------------- *
 * PHX-WP-PUBLICATION-UNIFICATION -- ADR-0056 named publication's non-migration
 * onto the shared `pipeline.po-approval-proof.v1` contract as its own recorded
 * follow-up ("two shapes now exist where one would be better"). At THIS layer
 * -- the human-terminal signing ceremony `po-human-approval.mjs` owns -- kind
 * "publication" was already composed by the exact same `criticalApprovalRequest`
 * call site as "push"/"deploy" (see `CRITICAL_COMMAND_KINDS` and the "prepare-critical
 * keeps composing push/deploy/publication requests exactly as before" test above);
 * nothing here special-cases the kind. What was missing was proof that the FULL
 * sign+verify round trip -- not just request composition -- is byte-identical for
 * "publication": this test is the "publication" twin of "authorize-critical prepares
 * and signs in ONE invocation..." above, same assertions, same shape.
 * ------------------------------------------------------------------------- */
test("authorize-critical round-trips kind publication exactly like push: one invocation prepares and signs, and the proof verifies against the request built in that same call", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const { authority } = keyFixture(dirs.directory);
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };
    const subjectSha256 = "a".repeat(64);
    const confirmations = [];
    const dependencies = {
      observeCandidate: () => observed,
      readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; },
    };
    const result = runHumanApproval(["authorize-critical", ...criticalRequestArgs(dirs, { kind: "publication", subjectSha256 })], dependencies);
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
    assert.deepEqual(result.candidate, observed);
    assert.equal(result.action.kind, "publication");
    assert.equal(result.action.subjectSha256, subjectSha256);

    assert.equal(confirmations.length, 1, "authorize-critical must ask for exactly one explicit confirmation before signing");
    assert.match(confirmations[0], new RegExp(subjectSha256, "u"), "the confirmation must state the exact subject being authorized");
    assert.match(confirmations[0], /does NOT cover/u, "the confirmation must state the approval's bounds (ADR-0061 Decision 4)");

    const request = JSON.parse(readFileSync(join(dirs.directory, "request-critical-publication.json"), "utf8"));
    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-critical-publication.json"), "utf8"));
    assert.equal(proof.schema, "pipeline.po-approval-proof.v1", "publication's proof uses the exact same shared schema as push/deploy");
    assert.equal(proof.keyReference, authority.keyReference);
    const verified = verifyCriticalActionApprovalRequest({
      request, trustPolicy: authority, proof, expectedCandidate: observed, expectedAction: request.action,
    });
    assert.equal(verified.verified, true, "the proof produced by authorize-critical for kind publication must verify against the request it built in the same call");

    // Temp signing artifacts are cleaned up; only the durable request/proof remain.
    assert.equal(existsSync(join(dirs.directory, "intent-critical-publication.txt")), false);
    assert.equal(existsSync(join(dirs.directory, "signature-critical-publication.bin")), false);
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical never signs a stale request left in the external directory: it overwrites it with the request it just built and signs THAT one (the failure mode ADR-0061 removes)", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    const { authority } = keyFixture(dirs.directory);
    const observed = { commit: "d".repeat(40), tree: "e".repeat(40) };

    // Simulate exactly the failure mode ADR-0061's backlog item describes: an
    // EARLIER, unrelated preparation (a different subject/expiry -- as if for a
    // different push) left a stale request sitting at the fixed artifact path.
    const staleSubjectSha256 = "b".repeat(64);
    const staleRequest = runHumanApproval([
      "prepare-critical", ...criticalRequestArgs(dirs, { subjectSha256: staleSubjectSha256, expiresAt: "2030-01-01T00:00:00.000Z" }),
    ], { observeCandidate: () => observed });
    assert.equal(readFileSync(join(dirs.directory, "request-critical-push.json"), "utf8").includes(staleSubjectSha256), true, "the stale request must actually be on disk before authorize-critical runs");

    // Now authorize-critical runs for the REAL, current subject. It must bind
    // to and sign ONLY the request it builds in this call -- never the stale
    // one already sitting at the same path.
    const currentSubjectSha256 = "c".repeat(64);
    const confirmations = [];
    const result = runHumanApproval([
      "authorize-critical", ...criticalRequestArgs(dirs, { subjectSha256: currentSubjectSha256 }),
    ], {
      observeCandidate: () => observed,
      readConfirmation: (prompt) => { confirmations.push(prompt); return "approve"; },
    });
    assert.equal(result.action.subjectSha256, currentSubjectSha256, "the signed action must be the current call's subject, never the stale one");
    assert.match(confirmations[0], new RegExp(currentSubjectSha256, "u"), "the human must be shown the CURRENT subject, not the stale one");
    assert.doesNotMatch(confirmations[0], new RegExp(staleSubjectSha256, "u"), "the stale subject must never appear in what the human is asked to confirm");

    const request = JSON.parse(readFileSync(join(dirs.directory, "request-critical-push.json"), "utf8"));
    assert.equal(request.action.subjectSha256, currentSubjectSha256, "the request file on disk must have been overwritten with the current call's request");
    assert.notEqual(request.approvalIntent.sha256, staleRequest.intentSha256, "the signed intent digest must differ from the stale request's own digest");

    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-critical-push.json"), "utf8"));
    const verifiedCurrent = verifyCriticalActionApprovalRequest({
      request, trustPolicy: authority, proof, expectedCandidate: observed, expectedAction: request.action,
    });
    assert.equal(verifiedCurrent.verified, true, "the proof must verify against the CURRENT request");

    // The decisive negative check: the proof must NOT verify against the stale
    // subject -- if it did, authorize-critical would have reproduced exactly
    // the bug ADR-0061 exists to remove (a stale request silently signed).
    const staleAction = { ...request.action, subjectSha256: staleSubjectSha256 };
    const verifiedStale = verifyCriticalActionApprovalRequest({
      request: { ...request, action: staleAction }, trustPolicy: authority, proof, expectedCandidate: observed, expectedAction: staleAction,
    });
    assert.equal(verifiedStale.verified, false, "the proof must not verify against the stale request's subject");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical still requires the literal word approve: anything else cancels before OpenSSL and writes no proof", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    keyFixture(dirs.directory);
    let spawnCalled = false;
    const dependencies = {
      observeCandidate: () => ({ commit: "d".repeat(40), tree: "e".repeat(40) }),
      readConfirmation: () => "nope",
      spawn: () => { spawnCalled = true; return { status: 0 }; },
    };
    assert.throws(
      () => runHumanApproval(["authorize-critical", ...criticalRequestArgs(dirs)], dependencies),
      /approval cancelled: explicit confirmation was not given/,
    );
    assert.equal(spawnCalled, false, "OpenSSL must never be invoked once confirmation is cancelled");
    assert.equal(existsSync(join(dirs.directory, "proof-critical-push.json")), false);
    assert.equal(existsSync(join(dirs.directory, "intent-critical-push.txt")), false);
    // The request itself IS written before the prompt (it must exist for the
    // confirmation to describe it), but no signature/proof follows a refusal.
    assert.equal(existsSync(join(dirs.directory, "request-critical-push.json")), true);
  } finally {
    cleanup(dirs);
  }
});

test("the agent-facing approval gate cannot invoke authorize-critical: signing stays on the human terminal", () => {
  const dirs = fixtureDirs();
  try {
    writeFileSync(join(dirs.repoRoot, "plan.md"), "plan bytes\n");
    writeFileSync(join(dirs.repoRoot, "spec.md"), "spec bytes\n");
    assert.throws(
      () => runApprovalGate(["authorize-critical", ...criticalRequestArgs(dirs)], {}),
      /Usage:/u,
    );
    assert.equal(existsSync(join(dirs.directory, "request-critical-push.json")), false, "the public control plane must not be able to reach authorize-critical at all");
  } finally {
    cleanup(dirs);
  }
});
