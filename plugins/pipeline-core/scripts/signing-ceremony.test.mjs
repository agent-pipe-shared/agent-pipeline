#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * signing-ceremony.test.mjs -- coverage for the single-entry-point orchestrator
 * (backlog/items/2026-08-08-the-signing-ceremony-is-designed-for-the-verifier-not-
 * the-signer.md, Direction step 1). Exercises the real `guard-maintenance-
 * window.mjs` and `po-human-approval.mjs` CLIs together, unchanged, against a real
 * git fixture repository and a real (passphrase-protected, throwaway, test-only)
 * Ed25519 keypair -- the same fixture pattern `po-human-approval.test.mjs`'s
 * `keyFixture()` and `guard-maintenance-window.test.mjs`'s `repoFixture()` already
 * establish, so this suite proves the orchestrator against the SAME ceremony code
 * path those suites already cover, never a reimplementation of it.
 *
 * TR-S1-T3c (Rulings 78 and 124): the PO key is encrypted. `sign-intent` refuses an
 * unencrypted key (PO-KEY-UNENCRYPTED), and on an encrypted key it prints the
 * disclosure only and never asks for a typed confirmation (NVA-SIGNONCE-1): the
 * passphrase entry at OpenSSL's own prompt is the one human decision. A test cannot
 * type that passphrase, so the signing call goes through a test-side spawn seam
 * (`passphraseSigning()` below) that appends `-passin pass:<fixture passphrase>` to
 * the one `pkeyutl -sign` call that names the PO key and delegates to the real
 * `spawnSync`. Production code is untouched.
 *
 * Two properties get their own explicit tests, mirroring the backlog item's two
 * hard constraints:
 *   - exactly one human decision point (never zero): the happy-path test asserts
 *     zero typed prompts and exactly ONE observed signing spawn (the passphrase
 *     entry); the decline test proves a declined passphrase -- a signing spawn that
 *     exits non-zero -- stops the ceremony before install, leaving no window
 *     installed.
 *   - the real OpenSSL signature is never bypassed: the happy-path test verifies
 *     the produced proof cryptographically against the fixture's trust anchor.
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run as realRunGuardMaintenanceWindow } from "./guard-maintenance-window.mjs";
import { parseSigningCeremonyArgs, runSigningCeremony } from "./signing-ceremony.mjs";
import { canonicalizeJson } from "../lib/governance-event.mjs";
import { verifyPoApprovalProof } from "../lib/po-approval-proof.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";

/** The throwaway passphrase of the fixture PO key. Test-only; protects nothing real. */
const FIXTURE_PASSPHRASE = "signing-ceremony-fixture-passphrase";

/**
 * Writes a throwaway Ed25519 keypair in exactly the encodings `openssl genpkey
 * -algorithm ED25519 -aes-256-cbc` and `openssl pkey -pubout` produce --
 * passphrase-protected PKCS#8 ("ENCRYPTED PRIVATE KEY") for the private key, SPKI
 * for the public one -- using node's own crypto instead of shelling out.
 *
 * This is FIXTURE generation only. The ceremony under test still signs through
 * the real `openssl pkeyutl -sign` call in po-human-approval.mjs, and the
 * happy-path test still verifies that signature cryptographically; nothing about
 * what the production path executes changes here.
 *
 * The reason it no longer shells out: CI's "Runner-free offline Core Verify"
 * step replaces PATH with a directory holding only node/git/bash/sh, so an
 * `openssl` fixture call fails there with a bare assertion while the code it was
 * meant to exercise is fine (backlog:
 * pipeline.core-verify-cannot-pass-under-the-ci-trimmed-path).
 */
function writeEd25519KeyPair(privateKeyPath, publicKeyPath) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: FIXTURE_PASSPHRASE },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(privateKeyPath, privateKey);
  writeFileSync(publicKeyPath, publicKey);
}

/**
 * The ceremony's PRODUCTION signing path shells out to `openssl pkeyutl -sign`
 * (po-human-approval.mjs:923), deliberately: the operator's private key is
 * handed to openssl, never read into this process. That is a property worth
 * keeping, so the tests exercising the real signature are gated on openssl
 * being present rather than reimplemented against node crypto.
 *
 * Under CI's runner-free Core Verify the PATH holds only node/git/bash/sh, so
 * those tests report a typed skip naming the missing tool instead of a bare
 * assertion failure that reads like a broken ceremony. The fixture keypair
 * itself no longer needs openssl at all -- see writeEd25519KeyPair above.
 */
const opensslProbe = spawnSync("openssl", ["version"], { stdio: "pipe" });
const REQUIRES_OPENSSL = opensslProbe.error != null || opensslProbe.status !== 0
  ? "requires the openssl binary, which is not on PATH (the ceremony's production signing path shells out to it)"
  : false;

const roots = [];

/**
 * Throwaway, passphrase-protected, test-only Ed25519 keypair placed directly in the
 * fixture's external directory -- encrypted because the ceremony refuses any other
 * PO key (Ruling 78). A test cannot answer OpenSSL's interactive passphrase prompt,
 * so `passphraseSigning()` supplies it through `-passin` on the signing spawn only;
 * this does not change what the real `setup` command generates or accepts. Mirrors
 * po-human-approval.test.mjs's own `keyFixture()`.
 */
function keyFixture(directory) {
  const privateKey = join(directory, "po-private.pem");
  const publicKey = join(directory, "po-public.pem");
  writeEd25519KeyPair(privateKey, publicKey);
  const publicKeyPem = readFileSync(publicKey, "utf8");
  const authority = { keyReference: "signing-ceremony-test-key", publicKeySha256: createHash("sha256").update(publicKeyPem).digest("hex") };
  writeFileSync(join(directory, "trust-policy.json"), `${JSON.stringify({ ...authority, humanName: "Test Operator" }, null, 2)}\n`);
  return { publicKeyPem, authority };
}

/**
 * The test-side seam for signing with the encrypted fixture key (Ruling 124). Returns
 * `{ signDependencies, signingSpawns, prompts }`:
 *  - `signDependencies` is what `runSigningCeremony` forwards verbatim to `sign-intent`
 *    (signing-ceremony.mjs `dependencies.signDependencies`): `isTTY: true` satisfies
 *    `assertAttendedTerminalWhenPassphraseKey`, and `spawn` replaces the `spawnSync`
 *    that po-human-approval.mjs `spawnOpenssl` would use.
 *  - `spawn` delegates EVERY call to the real `spawnSync` (so the real OpenSSL runs and
 *    the real signature is produced), appending `-passin pass:<passphrase>` to exactly
 *    one call: the `pkeyutl -sign` whose `-inkey` is the PO key (`po-private.pem`). The
 *    toolchain readiness probe also runs a `pkeyutl -sign`, with its own throwaway
 *    `probe-private.pem`; keying on the PO key name keeps that one out of the count.
 *  - `signingSpawns` records each such call with its arguments and exit status: the
 *    passphrase entry is the single human decision, so this is where it is observed.
 *  - `prompts` records any typed confirmation the ceremony asks for. On an encrypted
 *    key it must stay empty; the stub exists so a regression is counted instead of
 *    hanging on a real terminal read.
 */
function passphraseSigning(passphrase = FIXTURE_PASSPHRASE) {
  const signingSpawns = [];
  const prompts = [];
  const spawn = (executable, args, options) => {
    const list = Array.isArray(args) ? args : [];
    const inkey = list.indexOf("-inkey");
    const signsWithPoKey = list[0] === "pkeyutl" && list.includes("-sign") && inkey >= 0
      && /po-private\.pem$/u.test(String(list[inkey + 1]));
    if (!signsWithPoKey) return spawnSync(executable, args, options);
    const withPassphrase = [...list, "-passin", `pass:${passphrase}`];
    const result = spawnSync(executable, withPassphrase, options);
    signingSpawns.push({ args: withPassphrase, status: result.status });
    return result;
  };
  return {
    signDependencies: { isTTY: true, spawn, readConfirmation: (prompt) => { prompts.push(prompt); return "approve"; } },
    signingSpawns,
    prompts,
  };
}

/** A real git repository committing a trust anchor matching `keyFixture()`'s key. */
function repoFixture(prefix, trustAnchor) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "README.md"), "# fixture\n");
  writeFileSync(join(root, "plan.md"), "plan\n");
  writeFileSync(join(root, "spec.md"), "spec\n");
  writeFileSync(
    join(root, "project", "critical-human-proof.json"),
    JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"], trustAnchor }),
  );
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  // PHX-WP-GMW-LEDGER-EMISSION: `install` now reads/writes the portable governance
  // ledger, which requires both governance/events/registry.json AND
  // governance/events/capture-policy.json to exist (loadRegistry ->
  // GovernanceEventStoreError GES-MISSING; capturePolicyDigestFor ->
  // GMW-CAPTURE-POLICY-MISSING). Mirrors guard-maintenance-window.test.mjs's own
  // `fixture()`/`registry()`/`capturePolicy()` helpers exactly (same schema/shape),
  // the established fixture pattern a peer suite already relies on.
  mkdirSync(join(root, "governance", "events"), { recursive: true });
  const repository = discoverRepository(root);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
  writeFileSync(
    join(root, "governance", "events", "registry.json"),
    `${canonicalizeJson({
      schema: "pipeline.governance-stream-registry.v1", repositoryFingerprint: fingerprint,
      canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventDigestDomain: "pipeline.governance-event.v1\0",
      storageRoot: "governance/events",
      streams: [
        { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
        { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
        { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      ],
    })}\n`,
  );
  writeFileSync(
    join(root, "governance", "events", "capture-policy.json"),
    `${canonicalizeJson({
      schema: "pipeline.governance-capture-policy.v1", policyId: "fixture", revision: "d".repeat(64), defaultAction: "deny",
      streams: [
        { origin: "human", purpose: "authority-history", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
        { origin: "agent", purpose: "declared-assumption", materiality: "policy-selected", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
        { origin: "lifecycle", purpose: "deterministic-lifecycle", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
      ],
      sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false },
      mandatoryEventClasses: [],
    })}\n`,
  );
  return root;
}

function externalDirFixture(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("maintenance-window ceremony runs prepare, present+sign, install, verify end to end with exactly one human decision (the passphrase entry, no typed confirmation), and the installed window reads back active", { skip: REQUIRES_OPENSSL }, async () => {
  const directory = externalDirFixture("signing-ceremony-external-");
  const { publicKeyPem, authority } = keyFixture(directory);
  const repoRoot = repoFixture("signing-ceremony-repo-", authority);

  const { signDependencies, signingSpawns, prompts } = passphraseSigning();
  const narration = [];
  const result = await runSigningCeremony(
    [
      "maintenance-window",
      "--repo-root", repoRoot,
      "--directory", directory,
      "--scope", "GS-6",
      "--ttl-seconds", "900",
      "--reason", "signing-ceremony orchestrator end-to-end test",
      "--plan", "plan.md",
      "--spec", "spec.md",
      "--authorship-mode", "goldfish-dispatch",
    ],
    {
      write: (line) => narration.push(line),
      signDependencies,
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "SIGNING-CEREMONY-MAINTENANCE-WINDOW-READY");
  assert.equal(result.installed.status, "active");
  assert.equal(result.status.status, "active");
  assert.deepEqual(result.status.scopeRuleIds, ["GS-6"]);
  assert.equal(result.signer.humanName, "Test Operator");

  // Exactly one human decision point (backlog item constraint 2). On an encrypted key
  // sign-intent prints the disclosure only and asks for no typed confirmation
  // (NVA-SIGNONCE-1, Ruling 124), so the single decision across all four steps is the
  // passphrase entry at the signing call: one observed `pkeyutl -sign ... -passin`
  // spawn, which succeeded.
  assert.equal(prompts.length, 0, "an encrypted key must reach no typed confirmation: the passphrase entry is the decision");
  assert.equal(signingSpawns.length, 1, "the ceremony must reach exactly one signing spawn (the passphrase decision)");
  assert.ok(signingSpawns[0].args.includes("-passin"), "the signing spawn carries the passphrase supply");
  assert.equal(signingSpawns[0].status, 0, "the one signing spawn must succeed");

  // Narration names all four steps, in order, so a human walking the ceremony can
  // tell where they are.
  assert.ok(narration.some((line) => line.includes("STEP 1/4")));
  assert.ok(narration.some((line) => line.includes("STEP 2/4")));
  assert.ok(narration.some((line) => line.includes("STEP 3/4")));
  assert.ok(narration.some((line) => line.includes("STEP 4/4")));
  assert.ok(narration.some((line) => line.includes("MAINTENANCE WINDOW OPEN")));

  // The real OpenSSL signature is never bypassed (backlog item constraint 1): the
  // proof left in the external directory verifies cryptographically against the
  // fixture's own trust anchor.
  const proofPath = join(directory, `proof-${result.prepared.intent.sha256}.json`);
  const proof = JSON.parse(readFileSync(proofPath, "utf8"));
  assert.equal(proof.intentSha256, result.prepared.intent.sha256);
  assert.equal(proof.publicKey, publicKeyPem);
  const verified = verifyPoApprovalProof({
    intent: { sha256: proof.intentSha256 },
    trustPolicy: authority,
    proof,
  });
  assert.equal(verified.verified, true);
});

test("maintenance-window ceremony aborts before install when the human declines the passphrase entry (the signing spawn exits non-zero): no window is installed", { skip: REQUIRES_OPENSSL }, async () => {
  const directory = externalDirFixture("signing-ceremony-external-decline-");
  const { authority } = keyFixture(directory);
  const repoRoot = repoFixture("signing-ceremony-repo-decline-", authority);

  // A declined passphrase entry is a signing spawn that exits non-zero (Ruling 124):
  // the real OpenSSL is handed a passphrase that does not open the fixture key.
  const { signDependencies, signingSpawns, prompts } = passphraseSigning("not-the-fixture-passphrase");
  await assert.rejects(
    () => runSigningCeremony(
      [
        "maintenance-window",
        "--repo-root", repoRoot,
        "--directory", directory,
        "--scope", "GS-6",
        "--ttl-seconds", "900",
        "--reason", "decline path",
        "--plan", "plan.md",
        "--spec", "spec.md",
        "--authorship-mode", "goldfish-dispatch",
      ],
      {
        write: () => {},
        signDependencies,
      },
    ),
    /openssl failed with exit code [1-9]/,
  );
  assert.equal(prompts.length, 0, "an encrypted key must reach no typed confirmation, even on decline");
  assert.equal(signingSpawns.length, 1, "still exactly one decision point even on decline: the one signing spawn");
  assert.notEqual(signingSpawns[0].status, 0, "the declined passphrase entry must exit non-zero");

  const status = spawnSync(
    process.execPath,
    [join(new URL("./guard-maintenance-window.mjs", import.meta.url).pathname), "status", "--repo-root", repoRoot],
    { encoding: "utf8" },
  );
  assert.equal(status.status, 0);
  assert.equal(JSON.parse(status.stdout).value.status, "absent", "a declined confirmation must never result in an installed window");
});

test("maintenance-window ceremony surfaces GMW-CANDIDATE-COMMIT-MISMATCH plainly when an unrelated commit lands between prepare and install", { skip: REQUIRES_OPENSSL }, async () => {
  const directory = externalDirFixture("signing-ceremony-external-drift-");
  const { authority } = keyFixture(directory);
  const repoRoot = repoFixture("signing-ceremony-repo-drift-", authority);

  const { signDependencies } = passphraseSigning();
  let prepareArgsSeen = null;
  const runGmwWithDriftAfterPrepare = (argv) => {
    const outcome = realRunGuardMaintenanceWindow(argv);
    if (argv[0] === "prepare" && prepareArgsSeen === null) {
      prepareArgsSeen = argv;
      // Land an unrelated, out-of-scope commit right after prepare, before install --
      // exactly the live incident finding 1 describes (a commit landing between the
      // two steps kills the signature the human is about to produce).
      writeFileSync(join(repoRoot, "unrelated.txt"), "drift\n");
      execFileSync("git", ["add", "-A"], { cwd: repoRoot });
      execFileSync("git", ["commit", "-q", "-m", "unrelated drift commit"], { cwd: repoRoot });
    }
    return outcome;
  };

  await assert.rejects(
    () => runSigningCeremony(
      [
        "maintenance-window",
        "--repo-root", repoRoot,
        "--directory", directory,
        "--scope", "GS-6",
        "--ttl-seconds", "900",
        "--reason", "drift path",
        "--plan", "plan.md",
        "--spec", "spec.md",
        "--authorship-mode", "goldfish-dispatch",
      ],
      {
        write: () => {},
        runGuardMaintenanceWindow: runGmwWithDriftAfterPrepare,
        signDependencies,
      },
    ),
    (error) => {
      assert.equal(error.code, "GMW-CANDIDATE-COMMIT-MISMATCH");
      return true;
    },
  );
  assert.notEqual(prepareArgsSeen, null, "the fixture must actually have reached prepare");
});

test("parseSigningCeremonyArgs rejects a missing required flag, an unknown flag and a duplicate flag", () => {
  assert.equal(parseSigningCeremonyArgs(["--repo-root", "/r", "--directory", "/d"]), null, "missing --scope/--ttl-seconds/--reason/--plan/--spec/--authorship-mode must fail closed");
  // Both cases below supply every OTHER required flag (including --plan/--spec/
  // --authorship-mode, PHX-WP-GMW-PREPARE-AUTHORSHIP/PHX-WP-GMW-LEDGER-EMISSION)
  // so that null can only be explained by the unknown/duplicate flag itself --
  // without this, both calls would already return null from the missing-required-
  // flags check alone, and the assertion would pass even if the unknown-flag/
  // duplicate-flag rejection logic were silently deleted.
  assert.equal(
    parseSigningCeremonyArgs(["--repo-root", "/r", "--directory", "/d", "--scope", "GS-6", "--ttl-seconds", "60", "--reason", "r", "--plan", "plan.md", "--spec", "spec.md", "--authorship-mode", "goldfish-dispatch", "--bogus", "x"]),
    null,
    "an unrecognised flag must fail closed even when every other required flag is present",
  );
  assert.equal(
    parseSigningCeremonyArgs(["--repo-root", "/r", "--repo-root", "/other", "--directory", "/d", "--scope", "GS-6", "--ttl-seconds", "60", "--reason", "r", "--plan", "plan.md", "--spec", "spec.md", "--authorship-mode", "goldfish-dispatch"]),
    null,
    "a duplicate flag must fail closed even when every other required flag is present",
  );
});

test("runSigningCeremony rejects an unknown command and an incomplete argument set with the usage message", async () => {
  await assert.rejects(() => runSigningCeremony(["bogus-command"], {}), /Usage:/);
  await assert.rejects(() => runSigningCeremony(["maintenance-window", "--repo-root", "/r"], {}), /Usage:/);
});
