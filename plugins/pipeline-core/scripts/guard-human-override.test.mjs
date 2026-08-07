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
 * `--proof`/`--authority` share with guard-maintenance-window.mjs's own `--proof`.
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

function armRequest(root, toolInput) {
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
    keyReference: KEY_REFERENCE,
    publicKey,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
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

test("authorize-by-signature accepts an --authority override, mirroring the committed trust anchor path", () => {
  const root = fixture();
  const proofRoot = externalDir();
  try {
    const { requestSha256, planSha256, proof } = armRequest(root, { file_path: "notes.md", content: "cli signed authority\n" });
    const proofPath = join(proofRoot, "proof.json");
    const authorityPath = join(proofRoot, "authority.json");
    writeFileSync(proofPath, JSON.stringify(proof));
    writeFileSync(authorityPath, JSON.stringify({ keyReference: KEY_REFERENCE, publicKeySha256 }));
    const captured = io();
    const status = main([
      "authorize-by-signature",
      "--repo", root,
      "--request-sha256", requestSha256,
      "--plan-sha256", planSha256,
      "--proof", proofPath,
      "--authority", authorityPath,
    ], captured);
    assert.equal(status, 0, captured.stderr);
    assert.equal(JSON.parse(captured.stdout).status, "armed");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(proofRoot, { recursive: true, force: true });
  }
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
