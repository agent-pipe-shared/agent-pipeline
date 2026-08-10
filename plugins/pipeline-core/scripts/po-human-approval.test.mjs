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
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runForkDispositionApproval, runHumanApproval } from "./po-human-approval.mjs";
import { PO_APPROVAL_PROOF_SCHEMA, verifyPoApprovalProof } from "../lib/po-approval-proof.mjs";
import { createCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
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
