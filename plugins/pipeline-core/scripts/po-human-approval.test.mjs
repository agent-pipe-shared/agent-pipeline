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
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import { parseHumanArgs, runHumanApproval } from "./po-human-approval.mjs";
import { run as runApprovalGate } from "./po-approval-gate.mjs";
import { PO_APPROVAL_PROOF_SCHEMA, verifyPoApprovalProof } from "../lib/po-approval-proof.mjs";
import { createCriticalActionApprovalRequest, verifyCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
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

function criticalArtifacts(dirs, kind = "push") {
  return {
    request: join(dirs.directory, `request-critical-${kind}.json`),
    proof: join(dirs.directory, `proof-critical-${kind}.json`),
    intent: join(dirs.directory, `intent-critical-${kind}.txt`),
    signature: join(dirs.directory, `signature-critical-${kind}.bin`),
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
    assert.deepEqual(writes.map((entry) => basename(entry.path)), [
      "request-critical-push.json", "intent-critical-push.txt", "proof-critical-push.json", "signer-critical-push.json",
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

test("authorize-critical aborts on an input failure before the prompt and before any signing, writing neither artifact", () => {
  const cases = [
    { label: "--expires-at that is not an exact toISOString() round trip", overrides: { expiresAt: "2026-08-07T12:00:00Z" }, message: /--expires-at/u },
    { label: "--expires-at that is not a timestamp at all", overrides: { expiresAt: "next tuesday" }, message: /--expires-at/u },
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

    // The exact input that silently failed in a real session: parsable ISO-8601, but not
    // the `toISOString()` round trip the digest binds. The message must name the field and
    // hand back the accepted spelling.
    assert.throws(
      () => runApprovalGate(criticalArgv("prepare-critical", dirs, { ...base, expiresAt: "2026-08-07T12:00:00Z" }), dependencies),
      (error) => {
        assert.match(error.message, /^critical approval request is invalid: --expires-at/u);
        assert.match(error.message, /toISOString/u);
        assert.ok(error.message.includes("2026-08-07T12:00:00.000Z"), "the message must show the accepted spelling of the value supplied");
        return true;
      },
    );
    assert.equal(existsSync(criticalArtifacts(dirs).request), false, "a rejected request must not be written");

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
  withEnvDirectory("/tmp/po-podir1-env-dir", () => {
    const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--human-name", "Test Operator"]);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.directory, "/tmp/po-podir1-env-dir");
    assert.equal(parsed.directorySource, "environment");
  });
});

test("a relative PIPELINE_PO_APPROVAL_DIRECTORY value fails the same absolute-path check as a relative --directory", () => {
  const viaFlag = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo", "--directory", "relative/dir"]);
  assert.match(viaFlag.error, /Usage:/u);

  const viaEnv = withEnvDirectory("relative/dir", () => parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo"]));
  assert.match(viaEnv.error, /Usage:/u);
  assert.match(viaEnv.error, /must be an absolute path/u);
});

test("when neither --directory nor PIPELINE_PO_APPROVAL_DIRECTORY is present, the usage error names the variable and prints no path", () => {
  withEnvDirectory(undefined, () => {
    const parsed = parseHumanArgs(["setup", "--repo-root", "/tmp/po-podir1-repo"]);
    assert.match(parsed.error, /Usage:/u);
    assert.match(parsed.error, new RegExp(PO_APPROVAL_DIRECTORY_ENV, "u"), "the usage error must name the environment variable as the alternative");
    assert.doesNotMatch(parsed.error, /\/tmp\//u, "there is nothing resolved yet, so no path may appear in the message");
  });
});

test("an unsafe directory fed through PIPELINE_PO_APPROVAL_DIRECTORY is refused exactly like the same unsafe value passed via --directory, and the refusal names its own source without printing the path", () => {
  const dirs = fixtureDirs();
  try {
    // "unsafe": a directory inside the repository, which externalDirectory()'s outside()
    // check must reject no matter which route the path arrived by -- there is no weaker
    // route for an environment-resolved value than for a flag-supplied one.
    const insideRepo = join(dirs.repoRoot, "not-outside-the-repo");
    mkdirSync(insideRepo, { recursive: true });

    const viaFlagError = thrown(() => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--directory", insideRepo, "--human-name", "Test Operator"], {}));
    assert.ok(viaFlagError, "an unsafe --directory must be refused");
    assert.match(viaFlagError.message, /approval directory \(from --directory\) must be outside the repository/u);

    const viaEnvError = withEnvDirectory(insideRepo, () => thrown(() => runHumanApproval(["setup", "--repo-root", dirs.repoRoot, "--human-name", "Test Operator"], {})));
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
  try {
    const { authority: authorityFlag } = keyFixture(dirsFlag.directory);
    const { authority: authorityEnv } = keyFixture(dirsEnv.directory);
    const intentSha256Flag = createHash("sha256").update("podir-1-parity-flag-fixture").digest("hex");
    const intentSha256Env = createHash("sha256").update("podir-1-parity-env-fixture").digest("hex");
    const dependencies = { readConfirmation: () => "approve" };

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
  }
});
