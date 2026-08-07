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
  return { requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof };
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
