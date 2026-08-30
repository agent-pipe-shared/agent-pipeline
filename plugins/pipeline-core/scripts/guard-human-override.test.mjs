#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-human-override.test.mjs — CLI-level coverage for scripts/guard-human-override.mjs.
 *
 * ADR-0059 Decision 1's `authorize-by-signature` subcommand is the only one exercised
 * here at the CLI boundary: the pre-existing `plan`/`prepare-authorization`/
 * `authorize`/`verify-audit` subcommands are already covered indirectly through every
 * `lib/human-guard-override.test.mjs` fixture that builds `scriptPath` from this same
 * file and asserts on `prepared.authorizeAction`/`planned.prepareAuthorizationAction`
 * argv shapes. This suite proves the new subcommand actually reaches
 * `authorizeHumanGuardOverrideBySignature()` and returns its JSON result on stdout,
 * exactly like the existing subcommands already do (`main()`'s own `write(...)` call),
 * plus the CLI-only concerns: flag parsing and the external-proof-file discipline
 * `--proof` shares with guard-maintenance-window.mjs's own `--proof`.
 *
 * NOVA-HGOSIG-TRUST-1: the trust anchor is NOT part of that flag surface. ADR-0059
 * Decision 1 fixes it at the committed `project/critical-human-proof.json`, so the
 * `--authority` flag this suite used to assert acceptance of is gone, and the two tests
 * below pin the property that assertion contradicted -- a trust policy the project never
 * committed cannot arm a capability, whether it arrives on the command line or not.
 */
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { main } from "./guard-human-override.mjs";
import {
  HGO_SIGNATURE_REASON,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");
const SCRIPT = join(HERE, "guard-human-override.mjs");

const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const publicKeySha256 = createHash("sha256").update(publicKey).digest("hex");
const KEY_REFERENCE = "hgo-cli-test-key";
// A second, genuine Ed25519 keypair that the fixture repository never commits an anchor
// for -- i.e. exactly what a caller able to run `generateKeyPairSync` can produce for
// itself. Every signature it makes is cryptographically valid and must still be worthless
// here, because the anchor decides whose signatures count.
const foreignPair = generateKeyPairSync("ed25519");
const foreignPublicKey = foreignPair.publicKey.export({ type: "spki", format: "pem" });
const foreignPublicKeySha256 = createHash("sha256").update(foreignPublicKey).digest("hex");
const HGO_SIGNATURE_INTENT_PLAN_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-plan.v1").digest("hex");
const HGO_SIGNATURE_INTENT_SPEC_SHA256 = createHash("sha256").update("pipeline.human-guard-override-signature-spec.v1").digest("hex");

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

/** Signature-mode fixture, committing a trust anchor bound to this suite's own test key. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "guard-human-override-cli-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: KEY_REFERENCE, publicKeySha256 },
  }));
  git(root, "add", "README.md", "pipeline.user.yaml", "project/critical-human-proof.json");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

/** External (outside the repo) directory for `--proof`/`--authority` files, mirroring guard-maintenance-window.mjs's own discipline. */
function externalDir() {
  return mkdtempSync(join(tmpdir(), "guard-human-override-cli-proof-"));
}

function io() {
  let stdout = "";
  let stderr = "";
  return {
    write: (chunk) => { stdout += chunk; return true; },
    writeError: (chunk) => { stderr += chunk; return true; },
    get stdout() { return stdout; },
    get stderr() { return stderr; },
  };
}

const COMMITTED_SIGNER = { privateKey: pair.privateKey, publicKey, keyReference: KEY_REFERENCE };
/** The forger: a real key of its own, reusing the committed anchor's key REFERENCE so only the public-key digest can tell the two apart. */
const FOREIGN_SIGNER = { privateKey: foreignPair.privateKey, publicKey: foreignPublicKey, keyReference: KEY_REFERENCE };

function armRequest(root, toolInput, signer = COMMITTED_SIGNER) {
  // Real, current timestamps throughout (never a fixed nowMs): main() below calls
  // authorizeHumanGuardOverrideBySignature() with the CLI's own real Date.now(), which
  // must land inside the request's TTL window for these fixtures to reach the CLI at
  // all -- a fixed epoch-relative nowMs (as the lib suite's own fixtures use for
  // reproducibility) would already be expired by the time this reaches main().
  const denials = [{ guard: "guard-testpath.mjs", reason: "TP-3: fixture" }];
  const recorded = recordHumanGuardDenial({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials });
  assert.equal(recorded.status, "planned");
  const plan = planHumanGuardOverride({ rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, scriptPath: SCRIPT });
  const prepared = prepareHumanGuardOverrideAuthorization({
    rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, reason: HGO_SIGNATURE_REASON, scriptPath: SCRIPT,
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
  const proof = {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256: intent.sha256,
    keyReference: signer.keyReference,
    publicKey: signer.publicKey,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), signer.privateKey).toString("base64"),
  };
  return { requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, intent };
}

test("authorize-by-signature reaches authorizeHumanGuardOverrideBySignature() and prints its JSON result on stdout", () => {
  const root = fixture();
  const proofRoot = externalDir();
  try {
    const { requestSha256, planSha256, proof } = armRequest(root, { file_path: "notes.md", content: "cli signed\n" });
    const proofPath = join(proofRoot, "proof.json");
    writeFileSync(proofPath, JSON.stringify(proof));
    const captured = io();
    const status = main([
      "authorize-by-signature",
      "--repo", root,
      "--request-sha256", requestSha256,
      "--plan-sha256", planSha256,
      "--proof", proofPath,
    ], captured);
    assert.equal(status, 0, captured.stderr);
    const value = JSON.parse(captured.stdout);
    assert.equal(value.schema, "pipeline.human-guard-override-capability.v2");
    assert.equal(value.status, "armed");
    assert.equal(value.planSha256, planSha256);
    assert.equal(value.requestSha256, requestSha256);
    assert.equal(value.mutated, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(proofRoot, { recursive: true, force: true });
  }
});

// NVA-CF-HGOCANDIDATEDRIFT (backlog/items/2026-08-30-hgo-candidate-drift-invalidates-
// ceremony-on-any-concurrent-commit.md, Bar 2): `plan` must warn on stderr BEFORE a
// signature is requested, not only after a ceremony is discarded by
// HGO-CANDIDATE-DRIFT, and that advisory must never leak into the plan's own JSON on
// stdout (still parseable/unchanged).
test("plan prints a candidate-drift advisory on stderr without altering the plan JSON on stdout", () => {
  const root = fixture();
  try {
    const denials = [{ guard: "guard-testpath.mjs", reason: "TP-3: fixture" }];
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write",
      toolInput: { file_path: "notes.md", content: "plan advisory\n" }, denials,
    });
    assert.equal(recorded.status, "planned");
    const captured = io();
    const status = main(["plan", "--repo", root, "--request-sha256", recorded.requestSha256], captured);
    assert.equal(status, 0, captured.stderr);
    const value = JSON.parse(captured.stdout);
    assert.equal(value.schema, "pipeline.human-guard-override-plan.v2");
    assert.match(captured.stderr, /^ADVISORY: this ceremony's signature will bind to the exact repository HEAD/);
    assert.ok(captured.stderr.includes(value.repository.head), "advisory should name the exact bound HEAD");
    assert.match(captured.stderr, /HGO-CANDIDATE-DRIFT/);
    assert.doesNotMatch(captured.stderr, /other git worktree\(s\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan's advisory escalates when another git worktree is present", () => {
  const root = fixture();
  const worktreeDir = join(tmpdir(), `guard-human-override-cli-wt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    git(root, "worktree", "add", "-b", "hgo-cli-advisory-wt", worktreeDir, "HEAD");
    const denials = [{ guard: "guard-testpath.mjs", reason: "TP-3: fixture" }];
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write",
      toolInput: { file_path: "notes.md", content: "plan advisory worktree\n" }, denials,
    });
    assert.equal(recorded.status, "planned");
    const captured = io();
    const status = main(["plan", "--repo", root, "--request-sha256", recorded.requestSha256], captured);
    assert.equal(status, 0, captured.stderr);
    assert.match(captured.stderr, /ADVISORY: 1 other git worktree\(s\) are present/);
    assert.match(captured.stderr, /HIGH RISK for HGO-CANDIDATE-DRIFT/);
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", worktreeDir], { cwd: root, encoding: "utf8", shell: false });
    rmSync(root, { recursive: true, force: true });
    rmSync(worktreeDir, { recursive: true, force: true });
  }
});

/**
 * NVA-SIGENTRY-1 DoD check 2. `emit-signature-digest` must print the exact digest
 * `authorizeHumanGuardOverrideBySignature()` gates arming on for the identical
 * `(repo, request, plan)` inputs -- proved two ways: (1) it equals `armRequest`'s
 * own independently-reconstructed `intent.sha256` (built the same way an external signer
 * would, without calling into any of this module's exported helpers), and (2) a proof
 * built over the CLI's printed digest actually arms via `authorize-by-signature`.
 *
 * NVA-SIGENTRY-2 F1: no `--reason` flag on this invocation -- the CLI no longer accepts
 * one at all (see the sibling "no longer accepts a --reason flag" test below), always
 * using the fixed `HGO_SIGNATURE_REASON` internally. This is the "correct/default reason"
 * half of the F1 DoD: the digest without a caller-suppliable reason still matches exactly
 * what the verifier gates arming on.
 */
test("emit-signature-digest prints the exact digest authorizeHumanGuardOverrideBySignature() gates arming on", () => {
  const root = fixture();
  const proofRoot = externalDir();
  try {
    const { requestSha256, planSha256, proof, intent } = armRequest(root, { file_path: "notes.md", content: "cli emit digest\n" });
    const captured = io();
    const status = main([
      "emit-signature-digest",
      "--repo", root,
      "--request-sha256", requestSha256,
      "--plan-sha256", planSha256,
    ], captured);
    assert.equal(status, 0, captured.stderr);
    const value = JSON.parse(captured.stdout);
    assert.equal(value.schema, "pipeline.human-guard-override-signature-digest.v1");
    assert.equal(value.requestSha256, requestSha256);
    assert.equal(value.planSha256, planSha256);
    assert.equal(value.intentSha256, intent.sha256);

    // The SAME printed digest, signed and handed back, actually arms -- not merely equal
    // by coincidence, but the same value the verifier checks.
    const proofPath = join(proofRoot, "proof.json");
    writeFileSync(proofPath, JSON.stringify(proof));
    assert.equal(proof.intentSha256, value.intentSha256);
    const armed = main([
      "authorize-by-signature",
      "--repo", root,
      "--request-sha256", requestSha256,
      "--plan-sha256", planSha256,
      "--proof", proofPath,
    ], io());
    assert.equal(armed, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(proofRoot, { recursive: true, force: true });
  }
});

test("emit-signature-digest validates its flag set like the sibling subcommands", () => {
  const captured = io();
  const status = main(["emit-signature-digest", "--repo", "/tmp/does-not-matter"], captured);
  assert.equal(status, 2);
  assert.match(captured.stderr, /HGO-USAGE/u);
});

/**
 * NVA-SIGENTRY-2 F1 (Critic blocker survived from NVA-SIGENTRY-1): `emit-signature-digest`
 * used to accept a `--reason` argument, bind it into the printed digest, and validate it
 * only for non-emptiness -- so a caller could pass any text and still get a well-formed,
 * exit-0 digest that `authorizeHumanGuardOverrideBySignature()` (which always signs
 * against the FIXED `HGO_SIGNATURE_REASON` constant internally, never a caller-supplied
 * one) would never accept. Fixed by dropping the `--reason` flag from this subcommand
 * entirely, so there is no caller-suppliable value left to get wrong: the command always
 * uses `HGO_SIGNATURE_REASON` internally now, exactly like
 * `authorizeHumanGuardOverrideBySignature()` itself. Proved here with a value that is NOT
 * `HGO_SIGNATURE_REASON` -- it must never reach the digest-printing branch (any `--reason`
 * flag, right or wrong, is now simply an unrecognised flag, refused by the same
 * `exactFlagSet()` usage check as every other unknown flag).
 */
test("emit-signature-digest no longer accepts a --reason flag; a non-canonical value never prints a digest and exits non-zero", () => {
  const root = fixture();
  try {
    const { requestSha256, planSha256 } = armRequest(root, { file_path: "notes.md", content: "cli wrong reason\n" });
    const captured = io();
    const status = main([
      "emit-signature-digest",
      "--repo", root,
      "--request-sha256", requestSha256,
      "--plan-sha256", planSha256,
      "--reason", "not the canonical HGO_SIGNATURE_REASON text",
    ], captured);
    assert.equal(status, 2);
    assert.match(captured.stderr, /HGO-USAGE/u);
    assert.equal(captured.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * NOVA-HGOSIG-TRUST-1 D2. This test REPLACES one that asserted the opposite ("accepts an
 * --authority override, mirroring the committed trust anchor path"). That assertion
 * encoded the defect: `--authority` was validated only as "a JSON file outside the
 * repository", which any caller can write, so the flag let the caller supply the trust
 * anchor its own proof would then be checked against. ADR-0059 Decision 1 fixes the anchor
 * at the committed `project/critical-human-proof.json` and calls the subcommand agent-safe
 * because it "cannot succeed without a genuine signature it is structurally incapable of
 * producing" -- a claim the flag falsified, since generating a keypair is not something a
 * caller is incapable of.
 *
 * Both directions are asserted here, because only the pair is meaningful: the flag is gone
 * (a usage error, not a trust source), AND the forged proof it would have carried is
 * refused on its merits once the committed anchor is the only thing consulted.
 */
test("authorize-by-signature refuses a caller-supplied trust anchor; the committed anchor is the only trust source", () => {
  const root = fixture();
  const proofRoot = externalDir();
  try {
    const { requestSha256, planSha256, proof } = armRequest(
      root,
      { file_path: "notes.md", content: "cli forged authority\n" },
      FOREIGN_SIGNER,
    );
    const proofPath = join(proofRoot, "proof.json");
    const authorityPath = join(proofRoot, "authority.json");
    writeFileSync(proofPath, JSON.stringify(proof));
    // A syntactically perfect trust policy naming the forger's own public key.
    writeFileSync(authorityPath, JSON.stringify({ keyReference: KEY_REFERENCE, publicKeySha256: foreignPublicKeySha256 }));

    const supplied = io();
    assert.equal(main([
      "authorize-by-signature",
      "--repo", root,
      "--request-sha256", requestSha256,
      "--plan-sha256", planSha256,
      "--proof", proofPath,
      "--authority", authorityPath,
    ], supplied), 2);
    assert.match(supplied.stderr, /HGO-USAGE/u);
    assert.doesNotMatch(supplied.stderr, /HGO-PROOF-INVALID/u); // refused before any verification
    assert.equal(supplied.stdout, "");

    // Same genuinely-signed proof, no flag to hide behind: the committed anchor decides.
    const committed = io();
    assert.equal(main([
      "authorize-by-signature",
      "--repo", root,
      "--request-sha256", requestSha256,
      "--plan-sha256", planSha256,
      "--proof", proofPath,
    ], committed), 2);
    assert.match(committed.stderr, /HGO-PROOF-INVALID: PO-APPROVAL-TRUST-MISMATCH/u);
    assert.equal(committed.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(proofRoot, { recursive: true, force: true });
  }
});

/**
 * NOVA-HGOSIG-TRUST-1 D3. `externalJson()` compared with a hard-coded POSIX separator
 * (`source.startsWith(`${root}/`)`), which `resolve()` never produces on win32 -- so only
 * exact equality with the root was caught and an in-repository, agent-writable file passed
 * as "external". ADR-0051/ADR-0057 make native Windows an implementation obligation, so
 * this is a defect on a supported platform, not a hypothetical.
 *
 * The platform is injected through `main()`'s options exactly as the sibling guard suites
 * drive `{ platform: "win32" }`, so the win32 answer is provable from either host. The
 * negative half matters as much as the positive one: a fix that simply refused everything
 * would pass the first assertion and fail the second.
 */
test("the external-path check uses the platform's own separator, so an in-repository win32 path is refused", () => {
  const digest = "a".repeat(64);
  const argv = (proofPath) => [
    "authorize-by-signature",
    "--repo", "C:\\repo",
    "--request-sha256", digest,
    "--plan-sha256", digest,
    "--proof", proofPath,
  ];

  const inside = io();
  assert.equal(main(argv("C:\\repo\\project\\proof.json"), inside, { platform: "win32" }), 2);
  assert.match(inside.stderr, /outside the repository/u);

  // Case-folded drive letter: the same directory by any Windows filesystem's reckoning.
  const insideOtherCase = io();
  assert.equal(main(argv("c:\\Repo\\proof.json"), insideOtherCase, { platform: "win32" }), 2);
  assert.match(insideOtherCase.stderr, /outside the repository/u);

  // A genuinely external win32 path clears the check (and then fails for the ordinary
  // reason that this host has no such file, which is not what is under test).
  const outside = io();
  assert.equal(main(argv("D:\\po\\proof.json"), outside, { platform: "win32" }), 2);
  assert.doesNotMatch(outside.stderr, /outside the repository/u);
});

/**
 * NVA-HGOFIX-2 (backlog/items/2026-08-17-guard-human-override-cli-and-a-second-site-
 * still-normalize-backslashes-unconditionally.md, finding 1). `externalJson()`'s
 * `platform` parameter already existed for the win32-vs-POSIX `path` API selection above,
 * but its own `.split("\\").join("/")` rewrite ran unconditionally regardless of it -- on
 * POSIX (this suite's default host), a backslash is an ordinary filename character, so an
 * in-repository proof file whose first path component literally contains one (e.g. a
 * directory named `..\secret`) got rewritten into a string starting with `../`, misreading
 * a file that is actually INSIDE the repository as external -- the fail-open direction the
 * backlog item names. No platform override is passed below: this exercises the real
 * default-platform (POSIX) path on this test host, the same way the sibling win32 test
 * above exercises win32 by injecting it.
 */
test("NVA-HGOFIX-2: the external-path check does not misread a POSIX in-repository file whose name merely contains a backslash as external", () => {
  const digest = "a".repeat(64);
  const argv = (proofPath) => [
    "authorize-by-signature",
    "--repo", "/repo",
    "--request-sha256", digest,
    "--plan-sha256", digest,
    "--proof", proofPath,
  ];

  const inside = io();
  assert.equal(main(argv("/repo/..\\secret/proof.json"), inside), 2);
  assert.match(inside.stderr, /outside the repository/u);

  // A genuinely external POSIX path still clears the check as before (and then fails for
  // the ordinary reason that this host has no such file, which is not what is under test).
  const outside = io();
  assert.equal(main(argv("/elsewhere/proof.json"), outside), 2);
  assert.doesNotMatch(outside.stderr, /outside the repository/u);
});

test("authorize-by-signature refuses an invalid proof with HGO-PROOF-INVALID on stderr and exit 2", () => {
  const root = fixture();
  const proofRoot = externalDir();
  try {
    const { requestSha256, planSha256, proof } = armRequest(root, { file_path: "notes.md", content: "cli tampered\n" });
    const tampered = { ...proof, signatureBase64: `${proof.signatureBase64.slice(0, -4)}AAAA` };
    const proofPath = join(proofRoot, "proof.json");
    writeFileSync(proofPath, JSON.stringify(tampered));
    const captured = io();
    const status = main([
      "authorize-by-signature",
      "--repo", root,
      "--request-sha256", requestSha256,
      "--plan-sha256", planSha256,
      "--proof", proofPath,
    ], captured);
    assert.equal(status, 2);
    assert.match(captured.stderr, /HGO-PROOF-INVALID/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(proofRoot, { recursive: true, force: true });
  }
});

test("authorize-by-signature rejects a --proof file supplied inside the repository", () => {
  const root = fixture();
  try {
    const { requestSha256, planSha256, proof } = armRequest(root, { file_path: "notes.md", content: "cli inside repo\n" });
    const proofPath = join(root, "proof.json");
    writeFileSync(proofPath, JSON.stringify(proof));
    const captured = io();
    const status = main([
      "authorize-by-signature",
      "--repo", root,
      "--request-sha256", requestSha256,
      "--plan-sha256", planSha256,
      "--proof", proofPath,
    ], captured);
    assert.equal(status, 2);
    assert.match(captured.stderr, /outside the repository/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("authorize-by-signature validates its flag set like the sibling subcommands", () => {
  const captured = io();
  const status = main(["authorize-by-signature", "--repo", "/tmp/does-not-matter"], captured);
  assert.equal(status, 2);
  assert.match(captured.stderr, /HGO-USAGE/u);
});

/**
 * PHX-WP-HGO-FAILCLOSED-IMPL-C, design doc §3.2/§3.3. `prepare-for-signature`
 * collapses `plan` -> `prepare-authorization` (fixed `HGO_SIGNATURE_REASON`) ->
 * digest-emission into one CLI call. This asserts the full output shape
 * verbatim from §3.3, that the two ready-to-copy command blocks resolve real
 * absolute sibling-script paths (only the two PO-local placeholders stay
 * literal), and that `intentSha256` is deterministic/reproducible for the same
 * inputs (a second call against the same persisted plan must reproduce it
 * exactly, since design doc §3.4 makes `prepare-for-signature` the normal path
 * by which the persisted plan is created and every later call just re-reads it).
 */
test("prepare-for-signature emits the exact §3.3 output shape, with real resolved script paths and a reproducible intentSha256", () => {
  const root = fixture();
  try {
    const denials = [{ guard: "guard-testpath.mjs", reason: "TP-3: fixture" }];
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write",
      toolInput: { file_path: "notes.md", content: "prepare-for-signature\n" }, denials,
    });
    assert.equal(recorded.status, "planned");

    const first = io();
    const status = main(["prepare-for-signature", "--repo", root, "--request-sha256", recorded.requestSha256], first);
    assert.equal(status, 0, first.stderr);
    const value = JSON.parse(first.stdout);

    assert.equal(value.schema, "pipeline.human-guard-override-prepare-for-signature.v1");
    assert.equal(value.status, "prepared");
    assert.equal(value.root, root);
    assert.equal(value.requestSha256, recorded.requestSha256);
    assert.match(value.planSha256, /^[a-f0-9]{64}$/u);
    assert.match(value.selectionSha256, /^[a-f0-9]{64}$/u);
    assert.equal(value.reasonSha256, createHash("sha256").update(Buffer.from(HGO_SIGNATURE_REASON, "utf8")).digest("hex"));
    assert.match(value.intentSha256, /^[a-f0-9]{64}$/u);
    assert.equal(typeof value.expiresAt, "string");
    assert.ok(!Number.isNaN(new Date(value.expiresAt).getTime()), value.expiresAt);

    assert.deepEqual(value.signIntentCommand, {
      executable: process.execPath,
      argv: [
        join(PLUGIN_ROOT, "scripts", "po-human-approval.mjs"),
        "sign-intent",
        "--repo-root", root,
        "--directory", "<external-po-material-directory>",
        "--intent-sha256", value.intentSha256,
      ],
      mutation: false,
      requiresConfirmation: true,
      executionBoundary: "attended-external-terminal",
    });
    assert.deepEqual(value.authorizeBySignatureCommand, {
      executable: process.execPath,
      argv: [
        SCRIPT,
        "authorize-by-signature",
        "--repo", root,
        "--request-sha256", recorded.requestSha256,
        "--plan-sha256", value.planSha256,
        "--proof", "<external-proof.json>",
      ],
      mutation: true,
      requiresConfirmation: true,
      executionBoundary: "local-process",
    });

    // Reproducibility: a second call against the same (requestSha256, null
    // authorSourceRoot) pair reads the same persisted plan back unchanged
    // (design doc §1.4 step 1/§3.4) and must reproduce the identical digests.
    const second = io();
    assert.equal(main(["prepare-for-signature", "--repo", root, "--request-sha256", recorded.requestSha256], second), 0, second.stderr);
    const repeat = JSON.parse(second.stdout);
    assert.equal(repeat.planSha256, value.planSha256);
    assert.equal(repeat.selectionSha256, value.selectionSha256);
    assert.equal(repeat.intentSha256, value.intentSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepare-for-signature validates its flag set like the sibling plan/prepare-authorization subcommands", () => {
  const captured = io();
  const status = main(["prepare-for-signature", "--repo", "/tmp/does-not-matter"], captured);
  assert.equal(status, 2);
  assert.match(captured.stderr, /HGO-USAGE/u);
});

/**
 * PHX-WP-HGO-FAILCLOSED-IMPL-C, design doc §3.6. `refreeze-plan` is a thin CLI
 * wrapper over the already-implemented, already-lib-tested
 * `refreezeHumanGuardOverridePlan()` -- this proves only the CLI wiring: a
 * successful refreeze reaching the library function and printing its exact
 * result, plus a failure code (`HGO-PLAN-ABSENT`) surfacing through the CLI's
 * ordinary exit-code-2 + stderr-code convention.
 */
test("refreeze-plan CLI wiring: a benign drift refreezes successfully and prints the exact §3.6 output shape", () => {
  const root = fixture();
  try {
    const denials = [{ guard: "guard-testpath.mjs", reason: "TP-3: fixture" }];
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write",
      toolInput: { file_path: "notes.md", content: "refreeze cli\n" }, denials,
    });
    assert.equal(recorded.status, "planned");
    const planned = planHumanGuardOverride({ rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, scriptPath: SCRIPT });

    // A benign commit -- changes head/tree only, not fingerprintSha256/policyIdentity.
    writeFileSync(join(root, "refreeze-cli-benign.md"), "benign\n");
    git(root, "add", "refreeze-cli-benign.md");
    git(root, "commit", "-q", "-m", "benign commit before CLI refreeze");

    const captured = io();
    const status = main(["refreeze-plan", "--repo", root, "--request-sha256", recorded.requestSha256], captured);
    assert.equal(status, 0, captured.stderr);
    const value = JSON.parse(captured.stdout);
    assert.equal(value.schema, "pipeline.human-guard-override-refreeze-plan.v1");
    assert.equal(value.status, "refrozen");
    assert.equal(value.root, root);
    assert.equal(value.requestSha256, recorded.requestSha256);
    assert.equal(value.priorPlanSha256, planned.planSha256);
    assert.notEqual(value.planSha256, planned.planSha256);
    assert.equal(value.expiresAt, planned.expiresAt);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refreeze-plan CLI wiring: HGO-PLAN-ABSENT surfaces through the ordinary exit-code-2 + stderr-code convention", () => {
  const root = fixture();
  try {
    const denials = [{ guard: "guard-testpath.mjs", reason: "TP-3: fixture" }];
    const recorded = recordHumanGuardDenial({
      rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write",
      toolInput: { file_path: "notes.md", content: "refreeze cli absent\n" }, denials,
    });
    assert.equal(recorded.status, "planned");
    // No plan created for this request -- refreeze-plan must only ever
    // overwrite an existing plan, never create the first one.
    const captured = io();
    const status = main(["refreeze-plan", "--repo", root, "--request-sha256", recorded.requestSha256], captured);
    assert.equal(status, 2);
    assert.match(captured.stderr, /HGO-PLAN-ABSENT/u);
    assert.equal(captured.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refreeze-plan validates its flag set like the sibling plan subcommand", () => {
  const captured = io();
  const status = main(["refreeze-plan", "--repo", "/tmp/does-not-matter"], captured);
  assert.equal(status, 2);
  assert.match(captured.stderr, /HGO-USAGE/u);
});
