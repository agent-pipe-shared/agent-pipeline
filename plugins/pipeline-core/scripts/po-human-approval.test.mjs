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
 * ONECMD-1 widened this suite to the critical-action path: the single-invocation
 * `authorize-critical` command (prepare + sign in one transaction, so no request
 * left on disk by an earlier preparation can be the thing that gets signed), the
 * disclosure it prints before the passphrase prompt, and the field-naming
 * validation errors the two-step `prepare-critical` now returns. The two-step flow
 * is characterised here too, because both halves were refactored onto the shared
 * request-construction and signing helpers the new command uses.
 *
 * GF-105 widened it further to `authorizeCriticalPushCommand`, the bounded,
 * copy-safe RENDERING of that same `authorize-critical` command for a push
 * approval -- construction and rendering only, never anything that touches key
 * material or the signing flow itself.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { authorizeCriticalPushCommand, outside, parseHumanArgs, runHumanApproval } from "./po-human-approval.mjs";
import { run as runApprovalGate } from "./po-approval-gate.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA, verifyPoApprovalProof } from "../lib/po-approval-proof.mjs";
import { criticalActionSubjectSha256, createCriticalActionApprovalRequest, verifyCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import {
  HGO_SIGNATURE_REASON,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { MACHINE_PLANE_SCHEMA, readMachinePlane, writeMachinePlane } from "../lib/machine-plane.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
// Namespace import ON PURPOSE (same reason as in lib/guard-maintenance-window.test.mjs):
// a not-yet-existing named export must fail the checks that use it, not ESM linking for
// the whole suite.
import * as gmw from "../lib/guard-maintenance-window.mjs";

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
  // `authority` stays the exact 2-key {keyReference, publicKeySha256} shape every
  // trustPolicy consumer (verifyPoApprovalProof, verifyCriticalActionApprovalRequest)
  // checks with an EXACT key match -- SETUP-1's `humanName` is added only to the LOCAL
  // trust-policy.json this fixture writes to disk (the shape po-human-approval.mjs's own
  // setup/signIntentIntoProof reads and checks), never to the object tests use as a
  // trustPolicy, mirroring the production split between the local authority record and
  // the shared proof-verification contract.
  const authority = { keyReference: "sign-intent-test-key", publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify({ ...authority, humanName: "Test Operator" }, null, 2)}\n`);
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

const PO_APPROVAL_DIRECTORY_ENV = "PIPELINE_PO_APPROVAL_DIRECTORY";

// SETUP-2b: this repository's own gitignored scratch/ tree, never system tmpdir and
// never the real $HOME -- every test that reaches the new machine-plane consultation
// (any call omitting --directory) must inject a fixture home, per the briefing's field-4
// constraint that nothing here ever reads or writes the real ~/.agent-pipeline/.
const SCRATCH_ROOT = fileURLToPath(new URL("../../../scratch/", import.meta.url));

/** A fixture home directory with no machine plane at all, so readMachinePlane()
 * resolves "absent" and the PODIR-1 (env-only) tests below observe exactly the
 * behaviour they did before this task. */
function noMachinePlaneHomeFixture() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  return mkdtempSync(join(SCRATCH_ROOT, "po-human-approval-no-plane-home-"));
}

/** A fixture home directory carrying a valid machine plane with the given
 * poKeyDirectory, written through the library's own writer (never hand-assembled
 * JSON) so the fixture matches the real on-disk contract. */
function machinePlaneHomeFixture(poKeyDirectory) {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const home = mkdtempSync(join(SCRATCH_ROOT, "po-human-approval-plane-home-"));
  writeMachinePlane({
    schema: MACHINE_PLANE_SCHEMA,
    poKeyDirectory,
    pushApprovalDefault: "chat",
    routing: null,
    language: null,
    session: null,
    usage: null,
    updatedAt: new Date().toISOString(),
  }, { homedirFn: () => home });
  return home;
}

/** Runs `fn` with PIPELINE_PO_APPROVAL_DIRECTORY set to `value` (or removed for `undefined`),
 * restoring whatever the ambient environment had before, regardless of outcome. */
function withEnvDirectory(value, fn) {
  const had = Object.hasOwn(process.env, PO_APPROVAL_DIRECTORY_ENV);
  const previous = process.env[PO_APPROVAL_DIRECTORY_ENV];
  if (value === undefined) delete process.env[PO_APPROVAL_DIRECTORY_ENV];
  else process.env[PO_APPROVAL_DIRECTORY_ENV] = value;
  try { return fn(); }
  finally {
    if (had) process.env[PO_APPROVAL_DIRECTORY_ENV] = previous;
    else delete process.env[PO_APPROVAL_DIRECTORY_ENV];
  }
}

/** Captures a thrown error instead of letting it propagate, so its message can be inspected. */
function thrown(fn) {
  try { fn(); return null; } catch (error) { return error; }
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
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(result.intentSha256, intentSha256);
    // SETUP-1: the signer is recorded on every approval -- keyReference, publicKeySha256
    // and the human-supplied name, all present in this accepting case.
    assert.equal(result.signer.keyReference, authority.keyReference);
    assert.equal(result.signer.publicKeySha256, authority.publicKeySha256);
    assert.equal(result.signer.humanName, "Test Operator");
    const signerOnDisk = JSON.parse(readFileSync(join(dirs.directory, "signer-manual.json"), "utf8"));
    assert.deepEqual(signerOnDisk, result.signer);

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

test("NVA-SIGDISCLOSE-1 Finding 3: sign-intent reports a missing --human-name specifically, distinct from a genuine key mismatch, when the trust-policy record predates --human-name but the key itself is correct", () => {
  const dirs = fixtureDirs();
  try {
    legacyKeyFixture(dirs.directory); // writes {keyReference, publicKeySha256} only, no humanName -- the SAME key sign-intent will use
    const intentSha256 = createHash("sha256").update("pipeline.sigdisclose-f3-legacy-fixture").digest("hex");
    const dependencies = { readConfirmation: () => "approve" };
    const error = thrown(() => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      dependencies,
    ));
    assert.ok(error, "a legacy-shape (no humanName) authority record must still refuse to sign");
    assert.match(error.message, /predates --human-name/u, "the message must diagnose the REAL problem (missing --human-name), not a key mismatch");
    assert.doesNotMatch(error.message, /does not match the local public key/u, "a matching key must never be reported as mismatched");
    assert.match(error.message, /setup/u, "the message must point at the real repair action");
  } finally {
    cleanup(dirs);
  }
});

test("NVA-SIGDISCLOSE-1 Finding 3: sign-intent still reports a genuine key-digest mismatch as a mismatch, not as a missing --human-name", () => {
  const dirs = fixtureDirs();
  try {
    keyFixture(dirs.directory); // writes a NAMED trust-policy.json (humanName: "Test Operator") for one key...
    const otherPrivateKey = join(dirs.directory, "po-private.pem");
    // ...but the private key on disk is now regenerated, so it no longer matches the
    // publicKeySha256 the trust-policy.json record was written against.
    openssl(["genpkey", "-algorithm", "ED25519", "-out", otherPrivateKey]);
    openssl(["pkey", "-in", otherPrivateKey, "-pubout", "-out", join(dirs.directory, "po-public.pem")]);
    const intentSha256 = createHash("sha256").update("pipeline.sigdisclose-f3-mismatch-fixture").digest("hex");
    const dependencies = { readConfirmation: () => "approve" };
    const error = thrown(() => runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      dependencies,
    ));
    assert.ok(error, "a key that no longer matches the recorded digest must still refuse to sign");
    assert.match(error.message, /does not match the local public key/u, "a genuine key-digest mismatch must keep the mismatch message");
    assert.doesNotMatch(error.message, /predates --human-name/u, "a genuine key mismatch must never be reported as a missing --human-name");
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

/* ------------------------------------------------------------------ *
 * ONECMD-1: the single-invocation critical-action ceremony.
 * ------------------------------------------------------------------ */

const CANDIDATE = Object.freeze({ commit: "a".repeat(40), tree: "b".repeat(40) });
const STALE_CANDIDATE = Object.freeze({ commit: "c".repeat(40), tree: "d".repeat(40) });
const FEATURE_ID = "nova-onecmd";
const PLAN = "plan.md";
const SPEC = "spec.md";

/** A fixture repository (plan/spec only; the candidate is injected, never observed via git). */
function criticalDirs() {
  const dirs = {
    repoRoot: mkdtempSync(join(tmpdir(), "po-authorize-critical-repo-")),
    directory: mkdtempSync(join(tmpdir(), "po-authorize-critical-external-")),
  };
  writeFileSync(join(dirs.repoRoot, PLAN), "# plan fixture\n");
  writeFileSync(join(dirs.repoRoot, SPEC), "# spec fixture\n");
  return dirs;
}

const futureExpiry = () => new Date(Date.now() + 3_600_000).toISOString();
const subjectDigest = (label) => createHash("sha256").update(label).digest("hex");

function criticalArgv(command, dirs, { kind = "push", subjectSha256, expiresAt, plan = PLAN, spec = SPEC, featureId = FEATURE_ID } = {}) {
  return [
    command, "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
    "--feature-id", featureId, "--plan", plan, "--spec", spec,
    "--kind", kind, "--subject-sha256", subjectSha256, "--expires-at", expiresAt,
  ];
}

/**
 * PO-KEYDIR-01(B): mirrors production's own fallback exactly (runHumanApproval's
 * `gitCommonDir ?? repository`) -- these fixture repositories are plain tmpdirs, not
 * real Git checkouts, so `resolveGitCommonDir` (po-human-approval.mjs) always returns
 * null for them and the fingerprint falls back to the repository root itself for
 * both `gitCommonDir` and `primaryRoot`. Never hardcodes a hex value: computed the
 * same way production computes it, from the same derivePoGateRepositoryFingerprint()
 * this script reuses.
 */
function repositoryFingerprintFor(repoRoot) {
  const repository = resolve(repoRoot);
  return derivePoGateRepositoryFingerprint({ gitCommonDir: repository, primaryRoot: repository }).slice(0, 12);
}

function criticalArtifacts(dirs, kind = "push") {
  const fp = repositoryFingerprintFor(dirs.repoRoot);
  return {
    request: join(dirs.directory, `request-${fp}-critical-${kind}.json`),
    proof: join(dirs.directory, `proof-${fp}-critical-${kind}.json`),
    intent: join(dirs.directory, `intent-${fp}-critical-${kind}.txt`),
    signature: join(dirs.directory, `signature-${fp}-critical-${kind}.bin`),
  };
}

test("authorize-critical prepares and signs in ONE invocation, and the proof is bound to the request built in that same invocation", () => {
  const dirs = criticalDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("nova-onecmd-subject");
    const action = { kind: "push", subjectSha256, expiresAt };
    const writes = []; const prompts = [];
    const dependencies = {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
      writeFile: (path, data, options) => { writes.push({ path, data }); return writeFileSync(path, data, options); },
    };

    const result = runHumanApproval(criticalArgv("authorize-critical", dirs, { subjectSha256, expiresAt }), dependencies);
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-CRITICAL-AUTHORIZATION-READY");
    assert.deepEqual(result.candidate, { ...CANDIDATE });
    assert.deepEqual(result.action, action);

    // Binding by construction: the three writes of this invocation, in order, are the
    // request, the exact digest bytes handed to OpenSSL, and the proof. The digest that
    // was signed is read from the request THIS invocation wrote -- no second file, no
    // second digest computation, no window between the two steps.
    const fp = repositoryFingerprintFor(dirs.repoRoot);
    assert.deepEqual(writes.map((entry) => basename(entry.path)), [
      `request-${fp}-critical-push.json`, `intent-${fp}-critical-push.txt`, `proof-${fp}-critical-push.json`, `signer-${fp}-critical-push.json`,
    ]);
    const request = JSON.parse(writes[0].data);
    assert.equal(writes[1].data, request.approvalIntent.sha256, "the bytes signed by OpenSSL must be this invocation's own intent digest");
    assert.equal(JSON.parse(writes[2].data).intentSha256, request.approvalIntent.sha256);
    assert.equal(result.intentSha256, request.approvalIntent.sha256);
    // SETUP-1: the signer is recorded on this critical-action approval too.
    const signerWritten = JSON.parse(writes[3].data);
    assert.equal(signerWritten.keyReference, authority.keyReference);
    assert.equal(signerWritten.publicKeySha256, authority.publicKeySha256);
    assert.equal(signerWritten.humanName, "Test Operator");
    assert.deepEqual(result.signer, signerWritten);

    // The request is the library's construction of the declared inputs, not a re-derivation.
    const rebuilt = createCriticalActionApprovalRequest({
      candidate: { ...CANDIDATE },
      featureId: FEATURE_ID,
      planBytes: readFileSync(join(dirs.repoRoot, PLAN)),
      specBytes: readFileSync(join(dirs.repoRoot, SPEC)),
      action,
    });
    assert.equal(request.approvalIntent.sha256, rebuilt.approvalIntent.sha256);

    const paths = criticalArtifacts(dirs);
    assert.deepEqual(JSON.parse(readFileSync(paths.request, "utf8")), request, "the durable request must be the signed one");
    const proof = JSON.parse(readFileSync(paths.proof, "utf8"));
    assert.equal(proof.schema, PO_APPROVAL_PROOF_SCHEMA);
    assert.equal(proof.keyReference, authority.keyReference);
    const verified = verifyCriticalActionApprovalRequest({ request, trustPolicy: authority, proof, expectedCandidate: { ...CANDIDATE }, expectedAction: action });
    assert.equal(verified.verified, true);
    assert.equal(verified.code, "CRITICAL-ACTION-PROOF-VERIFIED");

    // Temporary signing material is gone; only request + proof remain.
    assert.equal(existsSync(paths.intent), false);
    assert.equal(existsSync(paths.signature), false);

    // The artifacts are interchangeable with the two-invocation flow's: verify-critical reads them unchanged.
    const readback = runHumanApproval(["verify-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--kind", "push"], { observeCandidate: () => ({ ...CANDIDATE }) });
    assert.equal(readback.value.verified, true);
    assert.equal(readback.value.code, "CRITICAL-ACTION-PROOF-VERIFIED");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical states what it is about to authorize -- and what it does not cover -- before the passphrase prompt", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("nova-onecmd-disclosure");
    const prompts = [];
    runHumanApproval(criticalArgv("authorize-critical", dirs, { subjectSha256, expiresAt }), {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
    });
    assert.equal(prompts.length, 1, "exactly one human confirmation, per ADR-0061 Decision 1");
    const [prompt] = prompts;
    const facts = {
      "action kind": "action kind: push",
      "candidate commit": CANDIDATE.commit,
      "candidate tree": CANDIDATE.tree,
      "subject binding": subjectSha256,
      "expiry": expiresAt,
    };
    for (const [label, fact] of Object.entries(facts)) {
      assert.ok(prompt.includes(fact), `the disclosure must state the ${label}`);
    }
    assert.match(prompt, /does not cover/iu, "the disclosure must state what the approval does NOT cover");
    assert.match(prompt, /type exactly "approve"/iu, "the existing typed-token gate must still be the last thing asked");
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------ *
 * ADR-0064: release-preflight as a fourth critical-action kind, and the
 * additive --subject preimage input (kind-agnostic, but load-bearing for
 * this kind's confirmation disclosure).
 * ------------------------------------------------------------------ */

const RELEASE_PREFLIGHT_SUBJECT = Object.freeze({
  schema: "pipeline.release-preflight-consent-subject.v1",
  version: "1.4.0",
  base: { commit: "e".repeat(40), tree: "f".repeat(40) },
  lifecycle: { featureId: "nova-a6", manifestPath: "specs/nova-a6/lifecycle.json", manifestSha256: "1".repeat(64) },
  retentionPolicySha256: "2".repeat(64),
});

test("authorize-critical --kind release-preflight with --subject derives --subject-sha256 and shows the decoded subject plus the kind-specific scope sentence", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    writeFileSync(join(dirs.repoRoot, "subject.json"), `${JSON.stringify(RELEASE_PREFLIGHT_SUBJECT, null, 2)}\n`);
    const expiresAt = futureExpiry();
    const expected = criticalActionSubjectSha256({ kind: "release-preflight", candidate: CANDIDATE, subject: RELEASE_PREFLIGHT_SUBJECT });
    const prompts = [];
    const result = runHumanApproval([
      "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", FEATURE_ID, "--plan", PLAN, "--spec", SPEC,
      "--kind", "release-preflight", "--subject", "subject.json", "--expires-at", expiresAt,
    ], {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
    });
    assert.equal(result.ok, true);
    assert.equal(result.action.subjectSha256, expected, "--subject-sha256 must be DERIVED from --subject, not left unset");
    assert.equal(prompts.length, 1);
    const [prompt] = prompts;
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.version), "must decode the release version");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.base.commit), "must decode the base commit");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.lifecycle.featureId), "must decode the lifecycle feature id");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.lifecycle.manifestPath), "must decode the lifecycle manifest path");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.lifecycle.manifestSha256), "must decode the lifecycle manifest sha256");
    assert.ok(prompt.includes(RELEASE_PREFLIGHT_SUBJECT.retentionPolicySha256), "must decode the retention policy sha256");
    assert.match(prompt, /not a release, not a publication authorization/u, "must state the kind-specific scope sentence");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical --subject refuses a --subject-sha256 that disagrees with the digest it recomputes, before any prompt or write", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    writeFileSync(join(dirs.repoRoot, "subject.json"), `${JSON.stringify(RELEASE_PREFLIGHT_SUBJECT, null, 2)}\n`);
    let confirmationAsked = false;
    const dependencies = {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: () => { confirmationAsked = true; return "approve"; },
    };
    assert.throws(
      () => runHumanApproval([
        "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", FEATURE_ID, "--plan", PLAN, "--spec", SPEC,
        "--kind", "release-preflight", "--subject", "subject.json",
        "--subject-sha256", subjectDigest("wrong-subject-digest"), "--expires-at", futureExpiry(),
      ], dependencies),
      /--subject-sha256 does not match the digest computed from --subject/u,
    );
    assert.equal(confirmationAsked, false);
    assert.equal(existsSync(criticalArtifacts(dirs, "release-preflight").request), false);
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical --kind release-preflight without --subject still states the kind-specific scope sentence, undecoded", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    const expiresAt = futureExpiry();
    const prompts = [];
    runHumanApproval(criticalArgv("authorize-critical", dirs, { kind: "release-preflight", subjectSha256: subjectDigest("bare-digest-only"), expiresAt }), {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; },
    });
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /not a release, not a publication authorization/u, "the scope sentence is a fact about the KIND, shown even without a decoded preimage");
    assert.ok(!prompts[0].includes("release version:"), "nothing to decode without --subject: no field lines invented");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical --subject is kind-agnostic: it works unchanged for --kind push too", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    const pushSubject = { source: CANDIDATE.commit, remote: "origin", destination: "refs/heads/main" };
    writeFileSync(join(dirs.repoRoot, "push-subject.json"), `${JSON.stringify(pushSubject, null, 2)}\n`);
    const expected = criticalActionSubjectSha256({ kind: "push", candidate: CANDIDATE, subject: pushSubject });
    const result = runHumanApproval([
      "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
      "--feature-id", FEATURE_ID, "--plan", PLAN, "--spec", SPEC,
      "--kind", "push", "--subject", "push-subject.json", "--expires-at", futureExpiry(),
    ], { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" });
    assert.equal(result.action.subjectSha256, expected);
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical aborts on an input failure before the prompt and before any signing, writing neither artifact", () => {
  const cases = [
    // GF-080 Gap B: a non-canonical but genuinely valid ISO-8601 timestamp (e.g.
    // "2026-08-07T12:00:00Z", missing explicit milliseconds) is normalized rather than
    // rejected -- see the dedicated Gap B test -- so this table only keeps inputs that
    // stay genuinely invalid: free text, and an ISO-shaped-but-out-of-range value.
    { label: "--expires-at that is not a timestamp at all", overrides: { expiresAt: "next tuesday" }, message: /--expires-at/u },
    { label: "--expires-at that is ISO-shaped but out of range (hour 25)", overrides: { expiresAt: "2026-08-07T25:00:00.000Z" }, message: /--expires-at/u },
    { label: "unreadable --plan", overrides: { plan: "missing-plan.md" }, message: /ENOENT/u },
    { label: "unreadable --spec", overrides: { spec: "missing-spec.md" }, message: /ENOENT/u },
    { label: "malformed --subject-sha256", overrides: { subjectSha256: "not-a-sha256" }, message: /--subject-sha256/u },
  ];
  for (const scenario of cases) {
    const dirs = criticalDirs();
    try {
      keyFixture(dirs.directory);
      let spawnCalled = false; let confirmationAsked = false;
      const dependencies = {
        observeCandidate: () => ({ ...CANDIDATE }),
        readConfirmation: () => { confirmationAsked = true; return "approve"; },
        spawn: () => { spawnCalled = true; return { status: 0 }; },
      };
      const argv = criticalArgv("authorize-critical", dirs, { subjectSha256: subjectDigest("nova-onecmd-abort"), expiresAt: futureExpiry(), ...scenario.overrides });
      assert.throws(() => runHumanApproval(argv, dependencies), scenario.message, scenario.label);
      assert.equal(confirmationAsked, false, `${scenario.label}: the human must never be prompted for an invalid request`);
      assert.equal(spawnCalled, false, `${scenario.label}: OpenSSL must never be reached`);
      const paths = criticalArtifacts(dirs);
      assert.equal(existsSync(paths.request), false, `${scenario.label}: no request artifact`);
      assert.equal(existsSync(paths.proof), false, `${scenario.label}: no proof artifact`);
    } finally {
      cleanup(dirs);
    }
  }
});

test("authorize-critical never signs a stale request left in the external directory: it prepares its own and binds to that one", () => {
  const dirs = criticalDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    const paths = criticalArtifacts(dirs);
    const staleAction = { kind: "push", subjectSha256: subjectDigest("stale-subject"), expiresAt: futureExpiry() };
    const stale = createCriticalActionApprovalRequest({
      candidate: { ...STALE_CANDIDATE },
      featureId: "stale-feature",
      planBytes: Buffer.from("# stale plan\n"),
      specBytes: Buffer.from("# stale spec\n"),
      action: staleAction,
    });
    writeFileSync(paths.request, `${JSON.stringify(stale, null, 2)}\n`);

    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("nova-onecmd-fresh-subject");
    const action = { kind: "push", subjectSha256, expiresAt };
    const result = runHumanApproval(criticalArgv("authorize-critical", dirs, { subjectSha256, expiresAt }), {
      observeCandidate: () => ({ ...CANDIDATE }),
      readConfirmation: () => "approve",
    });

    const request = JSON.parse(readFileSync(paths.request, "utf8"));
    assert.deepEqual(request.candidate, { ...CANDIDATE }, "the stale request must have been replaced, not signed");
    assert.deepEqual(request.action, action);
    assert.equal(result.intentSha256, request.approvalIntent.sha256);
    assert.notEqual(result.intentSha256, stale.approvalIntent.sha256);

    const proof = JSON.parse(readFileSync(paths.proof, "utf8"));
    assert.equal(proof.intentSha256, request.approvalIntent.sha256);
    assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy: authority, proof, expectedCandidate: { ...CANDIDATE }, expectedAction: action }).verified, true);
    // The decisive assertion: the produced proof authorizes nothing about the stale request.
    const staleVerified = verifyCriticalActionApprovalRequest({ request: stale, trustPolicy: authority, proof, expectedCandidate: { ...STALE_CANDIDATE }, expectedAction: staleAction });
    assert.equal(staleVerified.verified, false);
    assert.equal(staleVerified.code, "CRITICAL-ACTION-EXTERNAL-AUTHORITY-REQUIRED");
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical still requires the literal word approve: anything else cancels before OpenSSL and writes no proof", () => {
  for (const answer of ["nope", "", "APPROVE", "yes", "approve "]) {
    const dirs = criticalDirs();
    try {
      keyFixture(dirs.directory);
      let spawnCalled = false;
      const argv = criticalArgv("authorize-critical", dirs, { subjectSha256: subjectDigest("nova-onecmd-cancel"), expiresAt: futureExpiry() });
      assert.throws(
        () => runHumanApproval(argv, { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => answer, spawn: () => { spawnCalled = true; return { status: 0 }; } }),
        /approval cancelled: explicit confirmation was not given/u,
        `answer ${JSON.stringify(answer)} must cancel`,
      );
      assert.equal(spawnCalled, false);
      const paths = criticalArtifacts(dirs);
      assert.equal(existsSync(paths.proof), false, "a cancelled ceremony must leave no proof");
      assert.equal(existsSync(paths.signature), false);
      assert.equal(existsSync(paths.intent), false);
      // The request of THIS invocation stays on disk; it is this command's own, never a
      // signature, and the next authorize-critical overwrites it before reading anything.
      assert.deepEqual(JSON.parse(readFileSync(paths.request, "utf8")).candidate, { ...CANDIDATE });
    } finally {
      cleanup(dirs);
    }
  }
});

test("authorize-critical fails closed before setup and prepares nothing when key material is absent", () => {
  const dirs = criticalDirs();
  try {
    const argv = criticalArgv("authorize-critical", dirs, { subjectSha256: subjectDigest("nova-onecmd-nokey"), expiresAt: futureExpiry() });
    assert.throws(
      () => runHumanApproval(argv, { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" }),
      /run setup before authorize-critical/u,
    );
    const paths = criticalArtifacts(dirs);
    assert.equal(existsSync(paths.request), false);
    assert.equal(existsSync(paths.proof), false);
  } finally {
    cleanup(dirs);
  }
});

test("authorize-critical requires a feature id, exactly as prepare-critical does", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    assert.throws(
      () => runHumanApproval([
        "authorize-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--plan", PLAN, "--spec", SPEC, "--kind", "push",
        "--subject-sha256", subjectDigest("nova-onecmd-nofeature"), "--expires-at", futureExpiry(),
      ], { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" }),
      /critical approval requires a feature id/u,
    );
  } finally {
    cleanup(dirs);
  }
});

test("the agent-facing approval gate cannot invoke authorize-critical: signing stays on the human terminal", () => {
  const dirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    assert.throws(
      () => runApprovalGate(criticalArgv("authorize-critical", dirs, { subjectSha256: subjectDigest("nova-onecmd-gate"), expiresAt: futureExpiry() }), {}),
      /Usage: po-approval-gate\.mjs/u,
    );
    assert.equal(existsSync(criticalArtifacts(dirs).proof), false);
  } finally {
    cleanup(dirs);
  }
});

test("prepare-critical names the offending field instead of only saying the request is invalid", () => {
  const dirs = criticalDirs();
  try {
    const base = { subjectSha256: subjectDigest("nova-onecmd-fieldnames"), expiresAt: futureExpiry() };
    const dependencies = { observeCandidate: () => ({ ...CANDIDATE }) };

    // GF-080 Gap B: parsable ISO-8601 that is not already the exact `toISOString()` round
    // trip is normalized, not rejected (see the dedicated Gap B test below) -- the
    // remaining field-naming coverage here uses inputs that stay genuinely invalid either
    // way.
    assert.throws(
      () => runApprovalGate(criticalArgv("prepare-critical", dirs, { ...base, subjectSha256: "0xdeadbeef" }), dependencies),
      /critical approval request is invalid: --subject-sha256/u,
    );
    assert.throws(
      () => runApprovalGate([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", FEATURE_ID, "--spec", SPEC, "--kind", "push",
        "--subject-sha256", base.subjectSha256, "--expires-at", base.expiresAt,
      ], dependencies),
      /critical approval request is invalid: --plan/u,
    );
    assert.throws(
      () => runApprovalGate([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", FEATURE_ID, "--plan", PLAN, "--kind", "push",
        "--subject-sha256", base.subjectSha256, "--expires-at", base.expiresAt,
      ], dependencies),
      /critical approval request is invalid: --spec/u,
    );
    assert.throws(
      () => runApprovalGate([
        "prepare-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory,
        "--feature-id", FEATURE_ID, "--plan", PLAN, "--spec", SPEC, "--kind", "push",
        "--subject-sha256", base.subjectSha256,
      ], dependencies),
      /critical approval request is invalid: --expires-at is required/u,
    );
  } finally {
    cleanup(dirs);
  }
});

test("GF-080 Gap B: --expires-at accepts any parseable ISO-8601 timestamp and normalizes it to the exact Date#toISOString() form used everywhere downstream", () => {
  const dirs = criticalDirs();
  const canonicalDirs = criticalDirs();
  try {
    keyFixture(dirs.directory);
    keyFixture(canonicalDirs.directory);
    const subjectSha256 = subjectDigest("gap-b-normalize-subject");
    // The exact input that cost a real PO round trip: valid ISO-8601, just without
    // explicit milliseconds -- previously rejected outright even though Date.parse
    // accepts it fine.
    const nonCanonical = "2026-08-10T03:00:00Z";
    const canonical = new Date(Date.parse(nonCanonical)).toISOString();
    assert.equal(canonical, "2026-08-10T03:00:00.000Z");
    const dependencies = { observeCandidate: () => ({ ...CANDIDATE }) };

    const viaNonCanonical = runApprovalGate(criticalArgv("prepare-critical", dirs, { subjectSha256, expiresAt: nonCanonical }), dependencies);
    assert.equal(viaNonCanonical.code, "PO-HUMAN-CRITICAL-REQUEST-READY");
    assert.equal(viaNonCanonical.action.expiresAt, canonical, "a non-canonical but valid timestamp must be normalized, never rejected");

    const stored = JSON.parse(readFileSync(criticalArtifacts(dirs).request, "utf8"));
    assert.equal(stored.action.expiresAt, canonical, "the stored request must carry the normalized value, not the human's original spelling");

    // Normalization happens before the digest is computed, not after: an already-canonical
    // input of the identical instant must produce the byte-identical digest.
    const viaCanonical = runApprovalGate(criticalArgv("prepare-critical", canonicalDirs, { subjectSha256, expiresAt: canonical }), dependencies);
    assert.equal(viaNonCanonical.intentSha256, viaCanonical.intentSha256, "a non-canonical and an already-canonical spelling of the same instant must bind to the identical digest");
  } finally {
    cleanup(dirs);
    cleanup(canonicalDirs);
  }
});

test("the two-invocation prepare-critical + approve-critical flow is unchanged and still yields a verifiable proof", () => {
  const dirs = criticalDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("nova-onecmd-two-step");
    const action = { kind: "push", subjectSha256, expiresAt };
    const dependencies = { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" };

    const prepared = runApprovalGate(criticalArgv("prepare-critical", dirs, { subjectSha256, expiresAt }), dependencies);
    assert.equal(prepared.code, "PO-HUMAN-CRITICAL-REQUEST-READY");
    assert.deepEqual(prepared.candidate, { ...CANDIDATE });
    assert.deepEqual(prepared.action, action);

    const approved = runHumanApproval(["approve-critical", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--kind", "push"], dependencies);
    assert.equal(approved.code, "PO-HUMAN-PROOF-READY");
    assert.equal(approved.intentSha256, prepared.intentSha256);

    const paths = criticalArtifacts(dirs);
    const request = JSON.parse(readFileSync(paths.request, "utf8"));
    const proof = JSON.parse(readFileSync(paths.proof, "utf8"));
    assert.equal(verifyCriticalActionApprovalRequest({ request, trustPolicy: authority, proof, expectedCandidate: { ...CANDIDATE }, expectedAction: action }).verified, true);
    assert.equal(existsSync(paths.intent), false);
    assert.equal(existsSync(paths.signature), false);
  } finally {
    cleanup(dirs);
  }
});

/* ------------------------------------------------------------------ *
 * CEREMONY-1: sign-intent tells the human what they are approving.
 *
 * The digest stays the only thing the signature covers. What changes is that the
 * command resolves the RECORDED request behind that digest and states its reason,
 * scope and expiry -- and, when it cannot resolve one, says exactly that instead of
 * inventing a description (ADR-0061 Decision 4).
 * ------------------------------------------------------------------ */

const WINDOW_REASON = "fix the release-preflight base-commit peel inside the live plugin tree";

/** A real git repository plus a synthetic live plugin root, the two things a GMW request binds. */
function windowFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), "po-gmw-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
  writeFileSync(join(repoRoot, "README.md"), "# fixture\n");
  execFileSync("git", ["add", "-A"], { cwd: repoRoot });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoRoot });
  const plugin = mkdtempSync(join(tmpdir(), "po-gmw-plugin-"));
  mkdirSync(join(plugin, "hooks"), { recursive: true });
  writeFileSync(join(plugin, "hooks", "guard-example.mjs"), "// example\n");
  return { repoRoot, directory: mkdtempSync(join(tmpdir(), "po-gmw-external-")), plugin };
}

function cleanupWindow(dirs) {
  cleanup(dirs);
  rmSync(dirs.plugin, { recursive: true, force: true });
}

function prepareWindow(dirs, { scopeRuleIds = ["GS-6", "TP-1"], reason = WINDOW_REASON, ttlSeconds = 900 } = {}) {
  return gmw.prepareGuardMaintenanceWindowRequest({
    rootDir: dirs.repoRoot,
    scopeRuleIds,
    ttlSeconds,
    reason,
    featureId: "sprint-nova-epic",
    planSha256: "a".repeat(64),
    specSha256: "b".repeat(64),
    policyRevision: "gmw-test-v1",
    livePluginRoot: dirs.plugin,
  });
}

/**
 * NVA-SIGENTRY-1: `sign-intent` resolving an HGO signature-mode selection, the second
 * half of the closed blind-signature gap (backlog/items/2026-08-08-the-signing-
 * ceremony-is-designed-for-the-verifier-not-the-signer.md finding 7).
 *
 * PLUGIN_ROOT here must be THIS checkout's own real `plugins/pipeline-core` directory
 * (never a synthetic fixture directory the way `windowFixture()`'s `plugin` root is for
 * GMW) -- `sign-intent`'s production code resolves its own `PLUGIN_ROOT` from
 * `import.meta.url` the same way `guard-human-override.mjs` does, so a fixture-recorded
 * HGO request must use the identical real plugin identity for pluginIdentity() to match
 * when `sign-intent` itself later re-plans the same request.
 */
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HGO_SIGNATURE_INTENT_PLAN_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-plan.v1").digest("hex");
const HGO_SIGNATURE_INTENT_SPEC_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-spec.v1").digest("hex");

/** A real git repository committing signature mode, the topology an HGO request binds. */
function hgoFixtureDirs() {
  const repoRoot = mkdtempSync(join(tmpdir(), "po-hgo-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
  writeFileSync(join(repoRoot, "README.md"), "# fixture\n");
  writeFileSync(join(repoRoot, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  execFileSync("git", ["add", "-A"], { cwd: repoRoot });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoRoot });
  return { repoRoot, directory: mkdtempSync(join(tmpdir(), "po-hgo-external-")) };
}

/** denial -> plan -> prepare-authorization (fixed HGO_SIGNATURE_REASON) -> the independently-reconstructed intent digest sign-intent must resolve, mirroring lib/human-guard-override.test.mjs's prepareSignedArming() shape without calling into any of this module's own new exports. */
function armHgoRequest(repoRoot, toolInput) {
  const denials = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-LIFECYCLE-NOT-READY" }];
  const recorded = recordHumanGuardDenial({ rootDir: repoRoot, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials });
  assert.equal(recorded.status, "planned", `HGO fixture denial not plannable: ${JSON.stringify(recorded)}`);
  const scriptPath = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
  const plan = planHumanGuardOverride({ rootDir: repoRoot, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, scriptPath });
  const prepared = prepareHumanGuardOverrideAuthorization({
    rootDir: repoRoot, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, reason: HGO_SIGNATURE_REASON, scriptPath,
  });
  const intent = createPoApprovalIntent({
    kind: "guard-override",
    featureId: "human-guard-override",
    planSha256: HGO_SIGNATURE_INTENT_PLAN_SHA256,
    specSha256: HGO_SIGNATURE_INTENT_SPEC_SHA256,
    candidate: { commit: plan.repository.head, tree: plan.repository.tree },
    policyRevision: "human-guard-override-signature-v1",
    subjectSha256: prepared.selectionSha256,
    decision: "authorize",
  });
  return { requestSha256: recorded.requestSha256, planSha256: plan.planSha256, intent };
}

test("NVA-SIGENTRY-1: sign-intent resolves an HGO signature-mode intent digest and shows its eligible paths, denying rationale and expiry", () => {
  const dirs = hgoFixtureDirs();
  try {
    keyFixture(dirs.directory);
    const armed = armHgoRequest(dirs.repoRoot, { file_path: "notes.md", content: "hgo sign-intent\n" });
    const prompts = [];
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", armed.intent.sha256],
      { readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
    );
    assert.equal(result.ok, true);
    assert.equal(result.intentSha256, armed.intent.sha256);
    assert.equal(prompts.length, 1, "still exactly one human confirmation (ADR-0061 Decision 1)");
    const [prompt] = prompts;
    assert.ok(prompt.includes(armed.intent.sha256), "the digest being signed must still be named");
    assert.ok(prompt.includes("notes.md"), "the eligible path must be shown");
    assert.ok(prompt.includes("GUARD-LIFECYCLE-NOT-READY"), "the denying guard's rationale must be shown");
    assert.match(prompt, /expires at/iu, "the recorded expiry must be shown");
    assert.doesNotMatch(prompt, /no recorded request/iu, "must not fall into the cannot-describe fallback");

    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-manual.json"), "utf8"));
    assert.equal(proof.intentSha256, armed.intent.sha256, "the signature still covers the digest, nothing the summary said");
  } finally {
    cleanup(dirs);
  }
});

test("NVA-SIGENTRY-1: a digest resolving to neither a GMW request nor an HGO request still falls into the honest fallback, unchanged", () => {
  const dirs = hgoFixtureDirs();
  try {
    keyFixture(dirs.directory);
    // A real, resolvable HGO request IS stored -- proving the new resolver is additive
    // (it enumerates a non-empty store) rather than the GMW-only-fallback case already
    // covered elsewhere, where nothing is stored at all.
    armHgoRequest(dirs.repoRoot, { file_path: "notes.md", content: "hgo present but unrelated\n" });
    const unrelated = createHash("sha256").update("neither gmw nor hgo resolves this").digest("hex");
    const prompts = [];
    runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", unrelated],
      { readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
    );
    const [prompt] = prompts;
    assert.ok(prompt.includes(unrelated), "the digest is still named");
    assert.match(prompt, /no recorded request/iu, "the absence of a record must be stated explicitly");
    assert.equal(prompt.includes("notes.md"), false, "the unrelated stored HGO request's path must never be shown");
    assert.match(prompt, /guard-lift\/guard-override/u, "the generic consequence class stays stated when nothing better is known");
  } finally {
    cleanup(dirs);
  }
});

test("sign-intent states the reason, scope and expiry of the request recorded behind the digest", () => {
  const dirs = windowFixture();
  try {
    keyFixture(dirs.directory);
    const prepared = prepareWindow(dirs);
    const prompts = [];
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", prepared.intent.sha256],
      { readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(result.intentSha256, prepared.intent.sha256);
    assert.equal(result.signer.humanName, "Test Operator");
    assert.equal(prompts.length, 1, "still exactly one human confirmation (ADR-0061 Decision 1)");
    const [prompt] = prompts;
    assert.ok(prompt.includes(prepared.intent.sha256), "the digest being signed must still be named");
    assert.ok(prompt.includes(WINDOW_REASON), "the recorded reason must be shown");
    assert.ok(prompt.includes("GS-6") && prompt.includes("TP-1"), "the recorded scope must be shown");
    assert.ok(prompt.includes(new Date(prepared.subject.expiresAtMs).toISOString()), "the recorded expiry must be shown");
    assert.ok(prompt.includes("guard-lift"), "the recorded action kind must be shown");
    assert.match(prompt, /type exactly "approve"/iu, "the typed-token gate stays the last thing asked");

    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-manual.json"), "utf8"));
    assert.equal(proof.intentSha256, prepared.intent.sha256, "the signature still covers the digest, nothing the summary said");
  } finally {
    cleanupWindow(dirs);
  }
});

test("sign-intent says so plainly when no record resolves for the digest, and invents nothing", () => {
  const dirs = windowFixture();
  try {
    keyFixture(dirs.directory);
    prepareWindow(dirs);
    const unrelated = createHash("sha256").update("some other intent entirely").digest("hex");
    const prompts = [];
    runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", unrelated],
      { readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
    );
    const [prompt] = prompts;
    assert.ok(prompt.includes(unrelated), "the digest is still named");
    assert.match(prompt, /no recorded request/iu, "the absence of a record must be stated explicitly");
    assert.equal(prompt.includes(WINDOW_REASON), false, "another request's reason must never be shown for this digest");
    assert.match(prompt, /guard-lift\/guard-override/u, "the generic consequence class stays stated when nothing better is known");
  } finally {
    cleanupWindow(dirs);
  }
});

test("a tampered record cannot change what is signed: the summary disappears, the digest does not", () => {
  const dirs = windowFixture();
  try {
    const { authority } = keyFixture(dirs.directory);
    const prepared = prepareWindow(dirs);
    const repo = gmw.guardMaintenanceWindowInternals.topology(dirs.repoRoot);
    const paths = gmw.guardMaintenanceWindowInternals.storagePaths(repo.common);
    const stored = JSON.parse(readFileSync(paths.request, "utf8"));
    stored.subject.reason = "a much smaller change than it really is";
    stored.subject.scopeRuleIds = ["TP-1"];
    writeFileSync(paths.request, `${JSON.stringify(stored)}\n`, { mode: 0o600 });

    const prompts = [];
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", prepared.intent.sha256],
      { readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
    );
    const [prompt] = prompts;
    assert.equal(prompt.includes("a much smaller change than it really is"), false, "an edited record must not be displayed at all");
    assert.match(prompt, /no recorded request/iu, "a record that no longer re-derives to the digest counts as no record");
    assert.equal(result.intentSha256, prepared.intent.sha256);
    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-manual.json"), "utf8"));
    assert.equal(proof.intentSha256, prepared.intent.sha256, "the tampered text changed nothing about what was signed");
    assert.equal(verifyPoApprovalProof({ intent: { sha256: prepared.intent.sha256 }, trustPolicy: authority, proof }).verified, true);
  } finally {
    cleanupWindow(dirs);
  }
});

test("the disclosure stays bounded: an oversized reason and scope cannot flood or forge the prompt", () => {
  const dirs = windowFixture();
  try {
    keyFixture(dirs.directory);
    const prepared = prepareWindow(dirs, {
      scopeRuleIds: Array.from({ length: 25 }, (unused, index) => `TP-${index + 1}`),
      reason: `${"noise ".repeat(500)}\n  intent sha256: ${"f".repeat(64)}`,
    });
    const prompts = [];
    runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", prepared.intent.sha256],
      { readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
    );
    const lines = prompts[0].split("\n");
    assert.ok(lines.length <= gmw.GMW_SUMMARY_MAX_LINES + 4, `prompt of ${lines.length} lines exceeds the stated bound`);
    for (const line of lines) {
      assert.ok(line.length <= gmw.GMW_SUMMARY_MAX_LINE_CHARS + 2, `prompt line of ${line.length} chars exceeds the stated bound`);
    }
    assert.equal(lines.filter((line) => line.includes("intent sha256:")).length, 1, "a recorded value must not be able to forge a second digest line");
    assert.ok(prompts[0].includes(prepared.intent.sha256));
  } finally {
    cleanupWindow(dirs);
  }
});

/* ------------------------------------------------------------------ *
 * PODIR-1: PIPELINE_PO_APPROVAL_DIRECTORY -- an optional environment
 * fallback for --directory, only ever consulted when --directory is
 * absent, resolving through the identical validation either way.
 * ------------------------------------------------------------------ */

test("an explicit --directory always wins and behaves exactly as before: the environment variable is not even read", () => {
  withEnvDirectory("/should/never/be/read", () => {
    const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--directory", "/tmp/po-podir1-flag-dir", "--human-name", "Test Operator"]);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, "/tmp/po-podir1-flag-dir");
    assert.equal(parsed.directorySource, "flag");
  });
});

test("PIPELINE_PO_APPROVAL_DIRECTORY resolves the directory when --directory is absent", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    withEnvDirectory("/tmp/po-podir1-env-dir", () => {
      const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--human-name", "Test Operator"], { homedirFn: () => home });
      assert.equal(parsed.error, undefined);
      assert.equal(parsed.directory, "/tmp/po-podir1-env-dir");
      assert.equal(parsed.directorySource, "environment");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a relative PIPELINE_PO_APPROVAL_DIRECTORY value fails the same absolute-path check as a relative --directory", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    const viaFlag = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--directory", "relative/dir"], { homedirFn: () => home });
    assert.match(viaFlag.error, /Usage:/u);

    const viaEnv = withEnvDirectory("relative/dir", () => parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo"], { homedirFn: () => home }));
    assert.match(viaEnv.error, /Usage:/u);
    assert.match(viaEnv.error, /must be an absolute path/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("NVA-SIGDISCLOSE-1 Finding 8: a bad --repo-root (e.g. '.') explains the problem and how to fix it, not only the bare usage dump", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    const dot = parseHumanArgs(["setup", "--repo-root", ".", "--directory", "/tmp/po-podir1-flag-dir"], { homedirFn: () => home });
    assert.match(dot.error, /Usage:/u);
    assert.match(dot.error, /repository root is required/u, "the error must explain WHAT is wrong, not only dump the usage string");
    assert.match(dot.error, /--repo-root/u, "the error must name the failing flag");
    assert.match(dot.error, /absolute path/u, "the error must state the valid way to supply it (an absolute path)");

    const missing = parseHumanArgs(["setup", "--directory", "/tmp/po-podir1-flag-dir"], { homedirFn: () => home });
    assert.match(missing.error, /repository root is required/u, "an entirely absent --repo-root gets the same explained message");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("when neither --directory nor the machine plane nor PIPELINE_PO_APPROVAL_DIRECTORY is present, the usage error names all three routes and prints no path", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    withEnvDirectory(undefined, () => {
      const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo"], { homedirFn: () => home });
      assert.match(parsed.error, /Usage:/u);
      assert.match(parsed.error, /--directory/u, "the usage error must name the flag");
      assert.match(parsed.error, /machine-scoped configuration plane/u, "the usage error must name the machine plane route (AC-15)");
      assert.match(parsed.error, new RegExp(PO_APPROVAL_DIRECTORY_ENV, "u"), "the usage error must name the environment variable as the alternative");
      assert.doesNotMatch(parsed.error, /\/tmp\//u, "there is nothing resolved yet, so no path may appear in the message");
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("an unsafe directory fed through PIPELINE_PO_APPROVAL_DIRECTORY is refused exactly like the same unsafe value passed via --directory, and the refusal names its own source without printing the path", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    // "unsafe": a directory inside the repository, which externalDirectory()'s outside()
    // check must reject no matter which route the path arrived by -- there is no weaker
    // route for an environment-resolved value than for a flag-supplied one.
    const insideRepo = join(dirs.repoRoot, "not-outside-the-repo");
    mkdirSync(insideRepo, { recursive: true });

    const viaFlagError = thrown(() => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", insideRepo, "--human-name", "Test Operator"], { homedirFn: () => home }));
    assert.ok(viaFlagError, "an unsafe --directory must be refused");
    assert.match(viaFlagError.message, /approval directory \(from --directory\) must be outside the repository/u);

    const viaEnvError = withEnvDirectory(insideRepo, () => thrown(() => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--human-name", "Test Operator"], { homedirFn: () => home })));
    assert.ok(viaEnvError, "the identical unsafe value must be refused when it arrives via the environment");
    assert.match(viaEnvError.message, new RegExp(`approval directory \\(from the ${PO_APPROVAL_DIRECTORY_ENV} environment variable\\) must be outside the repository`, "u"));

    // Same refusal reason either way -- the two messages differ only in which source is named.
    assert.equal(
      viaFlagError.message.replace("--directory", "SOURCE"),
      viaEnvError.message.replace(`the ${PO_APPROVAL_DIRECTORY_ENV} environment variable`, "SOURCE"),
    );
    assert.equal(viaEnvError.message.includes(insideRepo), false, "the resolved absolute path must never appear in the refusal message");
    assert.equal(viaFlagError.message.includes(insideRepo), false);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("PIPELINE_PO_APPROVAL_DIRECTORY runs a full sign-intent ceremony exactly like the same value passed via --directory", () => {
  // Deliberately NOT `setup`: that subcommand's real branch shells out to
  // `openssl genpkey -aes-256-cbc`, which blocks on an interactive passphrase
  // prompt with no dependency-injection seam in this suite (every other test in
  // this file provisions key material through the non-interactive `keyFixture()`
  // helper instead, and this one does the same for the same reason).
  const dirsFlag = fixtureDirs();
  const dirsEnv = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    const { authority: authorityFlag } = keyFixture(dirsFlag.directory);
    const { authority: authorityEnv } = keyFixture(dirsEnv.directory);
    const intentSha256Flag = createHash("sha256").update("podir-1-parity-flag-fixture").digest("hex");
    const intentSha256Env = createHash("sha256").update("podir-1-parity-env-fixture").digest("hex");
    const dependencies = { readConfirmation: () => "approve", homedirFn: () => home };

    const viaFlag = runHumanApproval(["sign-intent", "--repo-root", dirsFlag.repoRoot, "--directory", dirsFlag.directory, "--intent-sha256", intentSha256Flag], dependencies);
    assert.equal(viaFlag.ok, true);
    assert.equal(viaFlag.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(viaFlag.intentSha256, intentSha256Flag);

    const viaEnv = withEnvDirectory(dirsEnv.directory, () => runHumanApproval(["sign-intent", "--repo-root", dirsEnv.repoRoot, "--intent-sha256", intentSha256Env], dependencies));
    assert.equal(viaEnv.ok, true);
    assert.equal(viaEnv.code, "PO-HUMAN-SIGN-INTENT-READY");
    assert.equal(viaEnv.intentSha256, intentSha256Env);

    const proofFlag = JSON.parse(readFileSync(join(dirsFlag.directory, "proof-manual.json"), "utf8"));
    const proofEnv = JSON.parse(readFileSync(join(dirsEnv.directory, "proof-manual.json"), "utf8"));
    assert.equal(verifyPoApprovalProof({ intent: { sha256: intentSha256Flag }, trustPolicy: authorityFlag, proof: proofFlag }).verified, true);
    assert.equal(verifyPoApprovalProof({ intent: { sha256: intentSha256Env }, trustPolicy: authorityEnv, proof: proofEnv }).verified, true);
  } finally {
    cleanup(dirsFlag);
    cleanup(dirsEnv);
    rmSync(home, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * SETUP-2b: the machine-scoped configuration plane's poKeyDirectory,
 * resolved with the precedence AC-11 specifies -- flag, then plane, then
 * PIPELINE_PO_APPROVAL_DIRECTORY, then the "directory is required" error.
 * ------------------------------------------------------------------ */

test("AC-11: the machine plane's poKeyDirectory resolves the directory when --directory is absent, and wins over the environment variable", () => {
  const dirs = fixtureDirs();
  const home = machinePlaneHomeFixture(dirs.directory);
  try {
    const parsed = withEnvDirectory("/should/never/be/read", () => parseHumanArgs(
      ["setup", "--repo-root", dirs.repoRoot, "--human-name", "Test Operator"],
      { homedirFn: () => home },
    ));
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, dirs.directory);
    assert.equal(parsed.directorySource, "machine-plane");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-11/AC-13: an explicit --directory still wins over a present, valid machine plane", () => {
  const dirs = fixtureDirs();
  const otherDirectory = mkdtempSync(join(tmpdir(), "po-machine-plane-unused-"));
  const home = machinePlaneHomeFixture(otherDirectory);
  try {
    const parsed = parseHumanArgs(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"],
      { homedirFn: () => home },
    );
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, dirs.directory);
    assert.equal(parsed.directorySource, "flag");
  } finally {
    cleanup(dirs);
    rmSync(otherDirectory, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-12: an invalid machine plane fails closed, naming the plane as the cause, and does NOT fall through to the environment variable", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    mkdirSync(join(home, ".agent-pipeline"), { recursive: true });
    writeFileSync(join(home, ".agent-pipeline", "machine.json"), "{ not valid json");
    const parsed = withEnvDirectory("/tmp/po-podir1-env-dir-should-not-be-used", () => parseHumanArgs(
      ["setup", "--repo-root", "/tmp/po-podir1-repo", "--human-name", "Test Operator"],
      { homedirFn: () => home },
    ));
    assert.match(parsed.error, /machine-scoped configuration plane is invalid/u);
    assert.match(parsed.error, /MP-MALFORMED/u);
    assert.equal(parsed.error.includes("/tmp/po-podir1-env-dir-should-not-be-used"), false, "an invalid plane must never silently fall through to the environment variable");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-12: an unreadable machine plane (a directory at the leaf) is also reported as invalid, not silently absent", () => {
  const home = noMachinePlaneHomeFixture();
  try {
    mkdirSync(join(home, ".agent-pipeline", "machine.json"), { recursive: true });
    const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--human-name", "Test Operator"], { homedirFn: () => home });
    assert.match(parsed.error, /machine-scoped configuration plane is invalid/u);
    assert.match(parsed.error, /MP-UNREADABLE/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-11: a valid machine plane with no poKeyDirectory configured (null) falls through to the environment variable, exactly like an absent plane", () => {
  const home = machinePlaneHomeFixture(null);
  try {
    const parsed = withEnvDirectory("/tmp/po-podir1-env-dir", () => parseHumanArgs(
      ["setup", "--repo-root", "/tmp/po-podir1-repo", "--human-name", "Test Operator"],
      { homedirFn: () => home },
    ));
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, "/tmp/po-podir1-env-dir");
    assert.equal(parsed.directorySource, "environment");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-14: a plane-sourced directory runs through the identical unsafe-directory refusal as a flag- or environment-sourced one, naming the plane as its source and never printing the path", () => {
  const dirs = fixtureDirs();
  const insideRepo = join(dirs.repoRoot, "not-outside-the-repo");
  mkdirSync(insideRepo, { recursive: true });
  const home = machinePlaneHomeFixture(insideRepo);
  try {
    const viaPlaneError = thrown(() => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--human-name", "Test Operator"], { homedirFn: () => home }));
    assert.ok(viaPlaneError, "an unsafe plane-sourced directory must be refused");
    assert.match(viaPlaneError.message, /approval directory \(from the machine-scoped configuration plane \(poKeyDirectory\)\) must be outside the repository/u);
    assert.equal(viaPlaneError.message.includes(insideRepo), false, "the resolved absolute path must never appear in the refusal message");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-11/AC-14: a full sign-intent ceremony resolved entirely from the machine plane's poKeyDirectory behaves exactly like the same directory passed via --directory", () => {
  const dirs = fixtureDirs();
  const home = machinePlaneHomeFixture(dirs.directory);
  try {
    const { authority } = keyFixture(dirs.directory);
    const intentSha256 = createHash("sha256").update("setup-2b-plane-parity-fixture").digest("hex");
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--intent-sha256", intentSha256],
      { readConfirmation: () => "approve", homedirFn: () => home },
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-SIGN-INTENT-READY");
    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-manual.json"), "utf8"));
    assert.equal(verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof }).verified, true);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * PO-KEYDIR-01(A), 2026-08-11 PO decision (backlog/items/2026-08-10-po-key-
 * directory-default-should-be-repo-scoped-not-machine-wide.md): `setup`'s
 * auto-persist call now targets a NEW repo-scoped store instead of the
 * machine plane (superseding GF-080 Gap A's original tests below, which
 * asserted the OLD machine-plane write target this task deliberately
 * changes). `dependencies.gitCommonDirFn` supplies a distinct fake
 * git-common-dir per fixture repository, exactly like the production seam
 * `resolveGitCommonDir` (po-human-approval.mjs) exposes -- these fixture
 * repositories are plain tmpdirs, not real Git checkouts.
 * ------------------------------------------------------------------ */

/** A fresh, writable fake git-common-dir fixture (stands in for `.git` for the
 * repo-scoped store's own location, `<gitCommonDir>/agent-pipeline/
 * po-key-directory.json`). Never a real `.git`: injected only via
 * `dependencies.gitCommonDirFn`, which the production code never routes
 * through real `git`. */
function repoScopeCommonDirFixture() {
  return mkdtempSync(join(tmpdir(), "po-human-approval-repo-scope-common-"));
}

function repoScopeStorePath(gitCommonDir) {
  return join(gitCommonDir, "agent-pipeline", "po-key-directory.json");
}

test("PO-KEYDIR-01(A): setup with an explicit --directory persists it into the REPO-SCOPED store (not the machine plane); a later command in the SAME repo resolves it without repeating --directory; the SAME command in a DIFFERENT repo (different git-common-dir) does NOT inherit it", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  const otherRepo = mkdtempSync(join(tmpdir(), "po-gapA-other-repo-"));
  const commonA = repoScopeCommonDirFixture();
  const commonOther = repoScopeCommonDirFixture();
  try {
    keyFixture(dirs.directory);
    const repoRootA = resolve(dirs.repoRoot);
    const gitCommonDirFn = (repository) => (repository === repoRootA ? commonA : commonOther);
    const setupResult = runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory],
      { homedirFn: () => home, gitCommonDirFn },
    );
    assert.equal(setupResult.ok, true);

    // The machine plane must stay untouched: setup's auto-persist no longer targets it.
    const plane = readMachinePlane({ homedirFn: () => home });
    assert.equal(plane.status, "absent", "setup with an explicit --directory must no longer auto-persist into the machine plane");

    // Repo A's own repo-scoped store now carries it.
    const stored = JSON.parse(readFileSync(repoScopeStorePath(commonA), "utf8"));
    assert.equal(stored.poKeyDirectory, realpathSync(dirs.directory), "setup must persist its explicit --directory into THIS repository's repo-scoped store");

    // A LATER command in the SAME repo, omitting --directory, resolves it.
    const intentSha256Same = createHash("sha256").update("po-keydir-01-a-same-repo-fixture").digest("hex");
    const resultSame = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--intent-sha256", intentSha256Same],
      { readConfirmation: () => "approve", homedirFn: () => home, gitCommonDirFn },
    );
    assert.equal(resultSame.ok, true);
    assert.equal(resultSame.code, "PO-HUMAN-SIGN-INTENT-READY");

    // The SAME command in a DIFFERENT repo (its own, empty repo-scoped store; no
    // machine plane; no env) must NOT inherit it -- must fail closed instead.
    assert.equal(existsSync(repoScopeStorePath(commonOther)), false, "a different repository's repo-scoped store must never be populated by another repository's setup");
    const otherError = thrown(() => runHumanApproval(
      ["sign-intent", "--repo-root", otherRepo, "--intent-sha256", intentSha256Same],
      { homedirFn: () => home, gitCommonDirFn },
    ));
    assert.ok(otherError, "a different repository must never silently resolve another repository's remembered directory");
    assert.match(otherError.message, /approval directory is required/u);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
    rmSync(otherRepo, { recursive: true, force: true });
    rmSync(commonA, { recursive: true, force: true });
    rmSync(commonOther, { recursive: true, force: true });
  }
});

test("PO-KEYDIR-01(A): a subsequent setup --directory <other-dir> never silently overwrites an already-populated, different REPO-SCOPED poKeyDirectory", () => {
  const dirs = fixtureDirs();
  const otherDirs = fixtureDirs();
  const common = repoScopeCommonDirFixture();
  try {
    keyFixture(dirs.directory);
    const gitCommonDirFn = () => common;
    const first = runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory],
      { gitCommonDirFn },
    );
    assert.equal(first.ok, true);
    const afterFirst = JSON.parse(readFileSync(repoScopeStorePath(common), "utf8"));
    assert.equal(afterFirst.poKeyDirectory, realpathSync(dirs.directory));

    keyFixture(otherDirs.directory);
    const second = runHumanApproval(
      ["setup", "--repo-root", otherDirs.repoRoot, "--directory", otherDirs.directory],
      { gitCommonDirFn },
    );
    assert.equal(second.ok, true, "setup itself must still succeed even though the repo-scoped store write is skipped");

    const stored = JSON.parse(readFileSync(repoScopeStorePath(common), "utf8"));
    assert.equal(stored.poKeyDirectory, realpathSync(dirs.directory), "a different, already-valid repo-scoped poKeyDirectory must never be silently overwritten");
  } finally {
    cleanup(dirs);
    cleanup(otherDirs);
    rmSync(common, { recursive: true, force: true });
  }
});

test("PO-KEYDIR-01(A): a repo-scope-, plane- or environment-sourced --directory is never written back into the repo-scoped store either (nothing new to persist)", () => {
  const dirs = fixtureDirs();
  const home = machinePlaneHomeFixture(dirs.directory);
  const common = repoScopeCommonDirFixture();
  try {
    keyFixture(dirs.directory);
    const gitCommonDirFn = () => common;
    const before = readMachinePlane({ homedirFn: () => home });
    const result = runHumanApproval(["setup", "--repo-root", dirs.repoRoot], { homedirFn: () => home, gitCommonDirFn });
    assert.equal(result.ok, true);
    const after = readMachinePlane({ homedirFn: () => home });
    assert.deepEqual(after, before, "a directory resolved FROM the plane must not trigger a redundant write back to it");
    assert.equal(existsSync(repoScopeStorePath(common)), false, "a plane-sourced directory must not be written into the repo-scoped store either");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * PO-KEYDIR-01(A): precedence order, proved at each boundary --
 * --directory (flag) > repo-scope > machine plane > environment variable.
 * The last boundary (machine plane > environment) is unchanged behaviour
 * already covered above (AC-11: "the machine plane's poKeyDirectory
 * resolves ... and wins over the environment variable").
 * ------------------------------------------------------------------ */

test("PO-KEYDIR-01(A): an explicit --directory still overrides a present, valid repo-scoped value", () => {
  const dirs = fixtureDirs();
  const otherDirectory = mkdtempSync(join(tmpdir(), "po-repo-scope-unused-"));
  const common = repoScopeCommonDirFixture();
  try {
    const gitCommonDirFn = () => common;
    keyFixture(otherDirectory);
    const setupResult = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", otherDirectory], { gitCommonDirFn });
    assert.equal(setupResult.ok, true);

    const parsed = parseHumanArgs(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Test Operator"],
      { gitCommonDirFn },
    );
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, dirs.directory);
    assert.equal(parsed.directorySource, "flag");
  } finally {
    cleanup(dirs);
    rmSync(otherDirectory, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

test("PO-KEYDIR-01(A): a repo-scoped value resolves the directory when --directory is absent, and wins over a present, valid machine plane", () => {
  const dirs = fixtureDirs();
  const home = machinePlaneHomeFixture("/should/never/be/read/machine-plane-directory");
  const common = repoScopeCommonDirFixture();
  try {
    const gitCommonDirFn = () => common;
    keyFixture(dirs.directory);
    const setupResult = runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory], { homedirFn: () => home, gitCommonDirFn });
    assert.equal(setupResult.ok, true);

    const parsed = parseHumanArgs(
      ["setup", "--repo-root", dirs.repoRoot, "--human-name", "Test Operator"],
      { homedirFn: () => home, gitCommonDirFn },
    );
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, realpathSync(dirs.directory));
    assert.equal(parsed.directorySource, "repo-scope");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
    rmSync(common, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * GF-104: `setup` against an EXISTING named authority record must not
 * silently keep supplied --human-name/--key-reference values that differ
 * from the persisted record, reporting an unqualified success as if the
 * new values had been applied.
 * ------------------------------------------------------------------ */

test("GF-104: setup fails loudly when an explicit --human-name differs from an existing named authority record", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    keyFixture(dirs.directory); // writes humanName: "Test Operator", keyReference: "sign-intent-test-key"
    const error = thrown(() => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "A Different Human"],
      { homedirFn: () => home },
    ));
    assert.ok(error, "a differing --human-name against an existing record must fail, not silently succeed");
    assert.match(error.message, /already exists under a different name\/key-reference/u);
    assert.match(error.message, /not something setup does silently/u);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("GF-104: setup fails loudly when an explicit --key-reference differs from an existing named authority record", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    keyFixture(dirs.directory); // writes keyReference: "sign-intent-test-key"
    const error = thrown(() => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--key-reference", "a-different-key-reference"],
      { homedirFn: () => home },
    ));
    assert.ok(error, "a differing --key-reference against an existing record must fail, not silently succeed");
    assert.match(error.message, /already exists under a different name\/key-reference/u);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("GF-104: setup against an existing named authority record stays unchanged (idempotent) when supplied values match, or when none are supplied at all", () => {
  const dirsNoFlags = fixtureDirs();
  const dirsMatching = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    keyFixture(dirsNoFlags.directory);
    const resultNoFlags = runHumanApproval(
      ["setup", "--repo-root", dirsNoFlags.repoRoot, "--directory", dirsNoFlags.directory],
      { homedirFn: () => home },
    );
    assert.equal(resultNoFlags.ok, true);
    assert.equal(resultNoFlags.code, "PO-HUMAN-AUTHORITY-READY");

    keyFixture(dirsMatching.directory);
    const resultMatching = runHumanApproval(
      ["setup", "--repo-root", dirsMatching.repoRoot, "--directory", dirsMatching.directory, "--human-name", "Test Operator", "--key-reference", "sign-intent-test-key"],
      { homedirFn: () => home },
    );
    assert.equal(resultMatching.ok, true);
    assert.equal(resultMatching.code, "PO-HUMAN-AUTHORITY-READY");
  } finally {
    cleanup(dirsNoFlags);
    cleanup(dirsMatching);
    rmSync(home, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * GF-112: `setup` against a LEGACY-shape authority record (predates
 * --human-name -- only {keyReference, publicKeySha256} on disk, no
 * humanName field at all) -- regression coverage for dd1eb9ee, which fixed
 * this branch to actually consume a supplied --human-name and perform the
 * upgrade instead of always failing.
 * ------------------------------------------------------------------ */

/** A legacy-shape authority record: only {keyReference, publicKeySha256}, no
 * humanName field -- the exact shape localAuthority() would have produced
 * before SETUP-1 added the humanName parameter, and the shape `namedShape`
 * (po-human-approval.mjs) requires be false for the upgrade branch to run. */
function legacyKeyFixture(directory) {
  const privateKey = join(directory, "po-private.pem");
  const publicKey = join(directory, "po-public.pem");
  openssl(["genpkey", "-algorithm", "ED25519", "-out", privateKey]);
  openssl(["pkey", "-in", privateKey, "-pubout", "-out", publicKey]);
  const publicKeyPem = readFileSync(publicKey, "utf8");
  const authority = { keyReference: "legacy-test-key", publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify(authority, null, 2)}\n`);
  return { publicKeyPem, authority };
}

test("GF-112: setup upgrades a legacy-shape (no humanName) authority record when --human-name is supplied", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    legacyKeyFixture(dirs.directory);
    const result = runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Ada Lovelace"],
      { homedirFn: () => home },
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "PO-HUMAN-AUTHORITY-READY");
    assert.equal(result.recovered, true);
    assert.equal(result.authority.humanName, "Ada Lovelace");
    const onDisk = JSON.parse(readFileSync(join(dirs.directory, "trust-policy.json"), "utf8"));
    assert.equal(onDisk.humanName, "Ada Lovelace", "the upgrade must be persisted to disk, not only returned");
    assert.equal(onDisk.keyReference, "legacy-test-key");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("GF-112: setup still refuses a legacy-shape record when --human-name is supplied together with a conflicting --key-reference", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    legacyKeyFixture(dirs.directory); // writes keyReference: "legacy-test-key"
    const error = thrown(() => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--human-name", "Ada Lovelace", "--key-reference", "a-different-key-reference"],
      { homedirFn: () => home },
    ));
    assert.ok(error, "an upgrade attempt with a conflicting --key-reference must still be refused, not silently rebound");
    assert.match(error.message, /already exists under a different name\/key-reference/u);
    const onDisk = JSON.parse(readFileSync(join(dirs.directory, "trust-policy.json"), "utf8"));
    assert.equal(Object.hasOwn(onDisk, "humanName"), false, "a refused upgrade must not touch the on-disk record");
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

test("GF-112: setup still fails with the original message for a legacy-shape record when no --human-name is supplied", () => {
  const dirs = fixtureDirs();
  const home = noMachinePlaneHomeFixture();
  try {
    legacyKeyFixture(dirs.directory);
    const error = thrown(() => runHumanApproval(
      ["setup", "--repo-root", dirs.repoRoot, "--directory", dirs.directory],
      { homedirFn: () => home },
    ));
    assert.ok(error, "a legacy-shape record with no --human-name supplied must still fail");
    assert.match(error.message, /predates --human-name/u);
  } finally {
    cleanup(dirs);
    rmSync(home, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * PO-KEYDIR-01(B), 2026-08-11 PO decision (backlog/items/2026-08-11-shared-
 * external-po-signing-directory-lets-an-unrelated-project-overwrite-a-proof.md):
 * two DIFFERENT repositories sharing one external directory (the actual
 * incident) must get DISJOINT request/proof/signature/intent/signer filenames,
 * while the shared private/public key and trust-policy filenames stay
 * unsuffixed.
 * ------------------------------------------------------------------ */

test("PO-KEYDIR-01(B): two repositories sharing one external directory and the same feature id get DISJOINT request/proof/signer filenames (repository-fingerprint segment), while the shared key/authority filenames stay UNCHANGED and usable by both", () => {
  const directory = mkdtempSync(join(tmpdir(), "po-fingerprint-shared-external-"));
  const dirsA = { repoRoot: mkdtempSync(join(tmpdir(), "po-fingerprint-repo-a-")), directory };
  const dirsB = { repoRoot: mkdtempSync(join(tmpdir(), "po-fingerprint-repo-b-")), directory };
  writeFileSync(join(dirsA.repoRoot, PLAN), "# plan A\n");
  writeFileSync(join(dirsA.repoRoot, SPEC), "# spec A\n");
  writeFileSync(join(dirsB.repoRoot, PLAN), "# plan B\n");
  writeFileSync(join(dirsB.repoRoot, SPEC), "# spec B\n");
  try {
    const { authority } = keyFixture(directory); // ONE shared key pair for both repositories
    const expiresAt = futureExpiry();
    const subjectSha256 = subjectDigest("po-keydir-01-b-fixture");
    const dependencies = { observeCandidate: () => ({ ...CANDIDATE }), readConfirmation: () => "approve" };

    const resultA = runHumanApproval(criticalArgv("authorize-critical", dirsA, { subjectSha256, expiresAt }), dependencies);
    const resultB = runHumanApproval(criticalArgv("authorize-critical", dirsB, { subjectSha256, expiresAt }), dependencies);
    assert.equal(resultA.ok, true);
    assert.equal(resultB.ok, true);

    const fpA = repositoryFingerprintFor(dirsA.repoRoot);
    const fpB = repositoryFingerprintFor(dirsB.repoRoot);
    assert.notEqual(fpA, fpB, "two different repository roots must fingerprint differently");

    for (const name of ["request", "proof", "signer"]) {
      const pathA = join(directory, `${name}-${fpA}-critical-push.json`);
      const pathB = join(directory, `${name}-${fpB}-critical-push.json`);
      assert.notEqual(pathA, pathB);
      assert.equal(existsSync(pathA), true, `${name} for repo A must exist at its fingerprinted path`);
      assert.equal(existsSync(pathB), true, `${name} for repo B must exist at its fingerprinted path`);
    }
    // Both authorize-critical calls above ran end to end without the second
    // overwriting the first's request/intent mid-flight -- proving no collision.
    const requestA = JSON.parse(readFileSync(join(directory, `request-${fpA}-critical-push.json`), "utf8"));
    const requestB = JSON.parse(readFileSync(join(directory, `request-${fpB}-critical-push.json`), "utf8"));
    assert.notEqual(requestA.approvalIntent.sha256, requestB.approvalIntent.sha256);

    // The shared private/public key and trust-policy filenames carry NO fingerprint
    // segment and are the SAME, single key pair both repositories just used.
    assert.equal(existsSync(join(directory, "po-private.pem")), true);
    assert.equal(existsSync(join(directory, "po-public.pem")), true);
    assert.equal(existsSync(join(directory, "trust-policy.json")), true);
    assert.equal(resultA.signer.publicKeySha256, authority.publicKeySha256);
    assert.equal(resultB.signer.publicKeySha256, authority.publicKeySha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(dirsA.repoRoot, { recursive: true, force: true });
    rmSync(dirsB.repoRoot, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * GF-105: authorizeCriticalPushCommand -- a bounded, copy-safe RENDERING of
 * the human's one authorize-critical push-approval command
 * (references/push-approval.md, "The human's one command (current shape)"),
 * so the constructing agent relays it VERBATIM instead of hand-formatting a
 * long, multi-flag, hash-bearing command itself. Construction and rendering
 * only -- never anything that touches the private key or the signing flow.
 * ------------------------------------------------------------------ */

const OWN_SCRIPT_PATH = fileURLToPath(new URL("./po-human-approval.mjs", import.meta.url));

/** A value with a space AND a value with non-ASCII characters -- the same
 * class of case that broke the earlier (already-fixed) kickoff bug this
 * session (Codex's own re-quoting of a multi-word, non-ASCII value). */
function pushCommandFixture(overrides = {}) {
  return {
    repoRoot: "/repo root",
    directory: "/ext/dir üöä",
    featureId: "cyb-6",
    plan: "specs/x y/prd.md",
    spec: "specs/x/spec.md",
    subjectSha256: "a".repeat(64),
    expiresAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

test("GF-105: authorizeCriticalPushCommand assembles the exact authorize-critical argv, defaulting launcher to this script's own resolved path", () => {
  const built = authorizeCriticalPushCommand(pushCommandFixture());
  assert.equal(built.executable, "node");
  assert.equal(built.argv[0], OWN_SCRIPT_PATH,
    "launcher must default to this script's own resolved path, never a value the caller could get wrong");
  assert.deepEqual(built.argv.slice(1), [
    "authorize-critical",
    "--repo-root", "/repo root",
    "--directory", "/ext/dir üöä",
    "--feature-id", "cyb-6",
    "--plan", "specs/x y/prd.md",
    "--spec", "specs/x/spec.md",
    "--kind", "push",
    "--subject-sha256", "a".repeat(64),
    "--expires-at", "2026-08-10T12:00:00.000Z",
  ]);
  assert.equal(typeof built.command, "string");
  assert.ok(built.copyCommand);
});

test("GF-105: authorizeCriticalPushCommand refuses a missing/empty named value instead of silently rendering a broken command", () => {
  for (const field of ["launcher", "repoRoot", "directory", "featureId", "plan", "spec", "subjectSha256", "expiresAt"]) {
    assert.throws(
      () => authorizeCriticalPushCommand(pushCommandFixture({ [field]: "" })),
      new RegExp(`requires a non-empty ${field}`),
      field,
    );
  }
});

test("GF-105: the copyCommand rendering is bounded on every shell, and the posix rendering round-trips through a real bash eval to the exact intended argv -- including a value with a space and a value with non-ASCII characters", () => {
  const built = authorizeCriticalPushCommand(pushCommandFixture());
  const copy = built.copyCommand;
  assert.deepEqual(Object.keys(copy).sort(), ["cmd", "maxColumns", "posix", "powershell"]);
  assert.equal(copy.maxColumns, 72);
  for (const [label, rendered, lineSep] of [
    ["posix", copy.posix, "\n"],
    ["powershell", copy.powershell, "\n"],
    ["cmd", copy.cmd, "\r\n"],
  ]) {
    // A per-shell rendering may legitimately be null (that shell cannot safely
    // represent this value at all) rather than thrown -- never required to be
    // non-null, but whichever renders must stay within the shared bound.
    if (rendered === null) continue;
    assert.equal(typeof rendered, "string", label);
    assert.equal(rendered.split(lineSep).every((line) => line.length <= copy.maxColumns), true,
      `${label} rendering exceeds ${copy.maxColumns} columns`);
  }
  if (process.platform === "win32") return;
  assert.ok(copy.posix, "posix rendering must succeed for this input");
  const lines = copy.posix.split("\n");
  assert.equal(lines.at(-1), 'eval "$CMD"');
  const assignments = lines.slice(0, -1).join("\n");
  // A shell FUNCTION named "node" shadows the real binary for an unqualified
  // call in bash, so this proves the exact argv a real shell reconstructs
  // from the bounded rendering WITHOUT ever invoking po-human-approval.mjs
  // for real -- this is a signing-adjacent command, so the round-trip proof
  // must never risk actually running it (no key material, no passphrase
  // prompt, no OpenSSL call reachable from this test).
  const script = `node() { printf '%s\\0' "$@"; }\n${assignments}\neval "$CMD"`;
  const probe = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const tokens = probe.stdout.split("\0");
  assert.equal(tokens.pop(), "");
  assert.deepEqual(tokens, built.argv,
    "the posix copyCommand rendering does not reconstruct the exact intended argv");
});

/* ------------------------------------------------------------------ *
 * NVA-BL-74: the confirmation PROMPT speaks the configured human-facing
 * language; the confirmation TOKEN does not.
 *
 * Additive only. Every assertion above stays exactly as it was, and keeps
 * passing for the same reason a real unconfigured checkout does: a fixture
 * repository with no project-state artifact resolves to English.
 * ------------------------------------------------------------------ */

/** Writes the neutral project-state artifact (`project/pipeline-state.json`, the
 * path lib/project-authority.mjs resolves) carrying exactly the continuity key
 * chain the resolver reads: continuity.runtime.humanFacingLanguage. `raw` writes
 * arbitrary bytes instead, for the malformed-file case. */
function stateFixture(repoRoot, { language, raw } = {}) {
  mkdirSync(join(repoRoot, "project"), { recursive: true });
  const body = raw ?? `${JSON.stringify({
    schema: "pipeline.state.v0",
    continuity: { schema: "pipeline.continuity.v0", runtime: { humanFacingLanguage: language, activeDuty: "Elephant", sessionCleanup: null } },
  }, null, 2)}\n`;
  writeFileSync(join(repoRoot, "project", "pipeline-state.json"), body);
}

const GERMAN_FRAME = /PO-FREIGABE BESTÄTIGEN/u;
const ENGLISH_FRAME = /PO APPROVAL CONFIRMATION/u;

test("NVA-BL-74: a repository configured for `de` gets the German prompt frame, while the typed token stays the English constant and the signature is produced exactly as before", () => {
  const dirs = fixtureDirs();
  try {
    const { authority } = keyFixture(dirs.directory);
    stateFixture(dirs.repoRoot, { language: "de" });
    const intentSha256 = createHash("sha256").update("nva-bl-74-de-fixture").digest("hex");
    const prompts = [];
    const result = runHumanApproval(
      ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
      { readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
    );
    assert.equal(result.ok, true);
    assert.equal(prompts.length, 1, "still exactly one human confirmation, in any language");
    assert.match(prompts[0], GERMAN_FRAME, "the configured language must select the German prompt frame");
    assert.doesNotMatch(prompts[0], ENGLISH_FRAME, "the English frame must not also be printed");
    assert.match(prompts[0], /Passphrase/u, "the German frame must still warn before the passphrase prompt");
    assert.match(prompts[0], /nicht mehr rückgängig/u, "the German frame must still state the irreversible consequence");
    // The token itself is NOT translated: the German instruction quotes the exact
    // English word the human types, and nothing else is offered as an alternative.
    assert.match(prompts[0], /Tippen Sie exakt "approve"/u, "the German prompt must quote the stable English token verbatim");
    // The summary lines are caller-supplied data and stay language-independent.
    assert.match(prompts[0], new RegExp(intentSha256, "u"), "the digest must be named in every language");
    assert.match(prompts[0], /guard-lift\/guard-override/u, "the data lines are untranslated by design");
    // ... and the ceremony itself is unchanged: a real proof, verifiable as before.
    const proof = JSON.parse(readFileSync(join(dirs.directory, "proof-manual.json"), "utf8"));
    assert.equal(verifyPoApprovalProof({ intent: { sha256: intentSha256 }, trustPolicy: authority, proof }).verified, true);
  } finally {
    cleanup(dirs);
  }
});

test("NVA-BL-74: cancellation semantics are unchanged under the German prompt -- every non-token answer, including a plausible German translation of the token, cancels before OpenSSL and before any artifact exists", () => {
  for (const answer of ["nope", "", "genehmigen", "Genehmigen", "bestätigen", "ja", "APPROVE", "approved", " approve"]) {
    const dirs = fixtureDirs();
    try {
      keyFixture(dirs.directory);
      stateFixture(dirs.repoRoot, { language: "de" });
      const intentSha256 = createHash("sha256").update(`nva-bl-74-cancel-${answer}`).digest("hex");
      let spawnCalled = false;
      assert.throws(
        () => runHumanApproval(
          ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
          { readConfirmation: () => answer, spawn: () => { spawnCalled = true; return { status: 0 }; } },
        ),
        /approval cancelled: explicit confirmation was not given/u,
        `${JSON.stringify(answer)} must cancel under the German prompt`,
      );
      assert.equal(spawnCalled, false, `${JSON.stringify(answer)}: OpenSSL must never be invoked once confirmation is cancelled`);
      for (const artifact of ["proof-manual.json", "signature-manual.bin", "intent-manual.txt"]) {
        assert.equal(existsSync(join(dirs.directory, artifact)), false, `${JSON.stringify(answer)}: no ${artifact} may exist after a cancelled confirmation`);
      }
    } finally {
      cleanup(dirs);
    }
  }
});

test("NVA-BL-74: English is the hard fallback -- an absent, unrecognised, malformed or unreadable language value still produces a complete English prompt, never no prompt", () => {
  const scenarios = [
    { label: "no project-state artifact at all", prepare: () => {} },
    { label: "an unrecognised language value", prepare: (repoRoot) => stateFixture(repoRoot, { language: "fr" }) },
    { label: "a null language value", prepare: (repoRoot) => stateFixture(repoRoot, { language: null }) },
    { label: "a non-string language value", prepare: (repoRoot) => stateFixture(repoRoot, { language: 42 }) },
    { label: "a malformed state file", prepare: (repoRoot) => stateFixture(repoRoot, { raw: "{ not json" }) },
    { label: "a state file with no continuity block", prepare: (repoRoot) => stateFixture(repoRoot, { raw: `${JSON.stringify({ schema: "pipeline.state.v0" })}\n` }) },
    // The resolution itself failing (any reason at all) must land on English too,
    // rather than propagating and skipping the gate.
    { label: "a resolver that throws", prepare: () => {}, dependencies: { resolveHumanFacingLanguageFn: () => { throw new Error("locale lookup exploded"); } } },
    { label: "a resolver returning a language with no translation", prepare: () => {}, dependencies: { resolveHumanFacingLanguageFn: () => "xx" } },
  ];
  for (const scenario of scenarios) {
    const dirs = fixtureDirs();
    try {
      keyFixture(dirs.directory);
      scenario.prepare(dirs.repoRoot);
      const intentSha256 = createHash("sha256").update(`nva-bl-74-fallback-${scenario.label}`).digest("hex");
      const prompts = [];
      const result = runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", intentSha256],
        { ...(scenario.dependencies ?? {}), readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
      );
      assert.equal(result.ok, true, scenario.label);
      assert.equal(prompts.length, 1, `${scenario.label}: the gate must still ask exactly once`);
      assert.match(prompts[0], ENGLISH_FRAME, `${scenario.label}: must fall back to the English frame`);
      assert.match(prompts[0], /type exactly "approve"/iu, `${scenario.label}: the English frame must be complete, not truncated`);
      assert.match(prompts[0], new RegExp(intentSha256, "u"), `${scenario.label}: the digest must still be named`);
    } finally {
      cleanup(dirs);
    }
  }
});

test("NVA-BL-74: the language selects only the frame -- the `de` and `en` prompts carry identical summary data lines and identical accepted-token semantics", () => {
  const rendered = {};
  for (const language of ["de", "en"]) {
    const dirs = fixtureDirs();
    try {
      keyFixture(dirs.directory);
      stateFixture(dirs.repoRoot, { language });
      const prompts = [];
      runHumanApproval(
        ["sign-intent", "--repo-root", dirs.repoRoot, "--directory", dirs.directory, "--intent-sha256", "c".repeat(64)],
        { readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
      );
      rendered[language] = prompts[0];
    } finally {
      cleanup(dirs);
    }
  }
  // Everything between the first line and the last two frame lines is data: identical
  // in both languages, byte for byte.
  const dataLines = (prompt) => prompt.split("\n").slice(1, -2);
  assert.deepEqual(dataLines(rendered.de), dataLines(rendered.en),
    "the translated frame must not alter, reorder or drop a single summary line");
  assert.match(rendered.de, GERMAN_FRAME);
  assert.match(rendered.en, ENGLISH_FRAME);
  for (const prompt of Object.values(rendered)) {
    assert.match(prompt, /"approve"/u, "every language must instruct the same English token");
  }
});

/**
 * NVA-WINPATH-1 (backlog/items/2026-08-17-po-human-approval-outside-check-uses-a-posix-only-
 * separator-on-windows.md): outside()'s previous POSIX-only `rel.startsWith("../")` check
 * relied on the default (host-platform) node:path export, whose relative() returns
 * backslash-separated paths on win32 -- so a genuinely external, same-drive-letter path was
 * silently misclassified as "inside" there. `platform` is injected exactly as the sibling
 * guard-human-override.mjs `externalJson()` fix's own test does, so the win32 answer is
 * provable from either host.
 */
test("NVA-WINPATH-1: outside() classifies a same-drive external win32 path as outside, not as inside", () => {
  // A genuinely external, same-drive-letter path: this is the case the POSIX-only check
  // (`rel.startsWith("../")` against a backslash-separated relative()) silently misclassified
  // as "inside" -- before the fix this assertion fails (`false` instead of `true`).
  assert.equal(outside("C:\\Repo", "C:\\OtherDir", "win32"), true);
  // A genuine subdirectory of the root must still classify as NOT outside.
  assert.equal(outside("C:\\Repo", "C:\\Repo\\po-directory", "win32"), false);
  // A case-folded drive/root spelling of the very same directory is not outside either --
  // win32 path resolution folds case, exactly like guard-human-override.mjs's own fix.
  assert.equal(outside("C:\\Repo", "c:\\repo", "win32"), false);
  // An absolute cross-drive path is outside.
  assert.equal(outside("C:\\Repo", "D:\\po\\directory", "win32"), true);
});

test("NVA-WINPATH-1: outside() behavior on POSIX hosts is unchanged by the platform-selection fix", () => {
  const dirs = fixtureDirs();
  try {
    assert.equal(outside(dirs.repoRoot, dirs.directory, "linux"), true);
    assert.equal(outside(dirs.repoRoot, join(dirs.repoRoot, "sub"), "linux"), false);
    assert.equal(outside(dirs.repoRoot, dirs.repoRoot, "linux"), false);
    assert.equal(outside(dirs.repoRoot, "/some/other/absolute/dir", "linux"), true);
    // NVA-WINPATH-2 (Critic round-1 F1, backlog/items/2026-08-17-po-human-approval-outside-
    // check-uses-a-posix-only-separator-on-windows.md): a backslash is an ORDINARY filename
    // character on POSIX, never a path separator -- a directory literally named `..\keys`
    // directly under the repo root is a genuine child of the repo, not outside it. The
    // pre-fix code unconditionally normalized backslashes to forward slashes on BOTH the
    // win32 AND posix branches, so this legal POSIX name was rewritten to `../keys` and then
    // misclassified as "outside" -- a fail-open regression in the exact check that keeps
    // private Ed25519 signing-key material out of the repository working tree. This is the
    // property the test's own name claims ("unchanged by the platform-selection fix") but,
    // before this assertion, never actually exercised.
    const backslashNamedChild = `${dirs.repoRoot}/..\\keys`;
    assert.equal(outside(dirs.repoRoot, backslashNamedChild, "linux"), false,
      "a POSIX directory literally named '..\\keys' is a child of the repo root, not outside it");
  } finally {
    cleanup(dirs);
  }
});
