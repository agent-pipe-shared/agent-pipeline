#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALF-C-W1-05 / pipeline.disjoint-signed-hgo-actions-invalidate-one-another (AC-160).
// Independently signed, disjoint native file actions (Edit, Write, apply_patch) must
// not invalidate one another when an unrelated authorized worktree edit lands between
// arming and consumption, while target, ancestry, denial-set, expiry and replay drift
// still fail closed.

import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  authorizeHumanGuardOverrideBySignature,
  consumeHumanGuardOverride,
  HGO_SIGNATURE_REASON,
  planHumanGuardOverride,
  prepareHumanGuardOverrideAuthorization,
  recordHumanGuardDenial,
} from "./human-guard-override.mjs";
import { createPoApprovalIntent, PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
const denial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DEVPLAN-SHELL" }];

const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const KEY_REFERENCE = "hgo-disjoint-test-key";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const PLAN_SENTINEL = sha("pipeline.human-guard-override-signature-plan.v1");
const SPEC_SENTINEL = sha("pipeline.human-guard-override-signature-spec.v1");

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

function fixture() {
  // The default OS tmpdir trips WIN-AUTH-ANCESTOR-MUTATION on Windows hosts; keep fixtures under scratch/.
  const base = join(PLUGIN_ROOT, "..", "..", "scratch", "hgo-tmp");
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "hgo-disjoint-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "signature"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: KEY_REFERENCE, publicKeySha256: sha(publicKey) },
  }));
  writeFileSync(join(root, "existing-a.md"), "a\n");
  writeFileSync(join(root, "existing-b.md"), "b\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

const writeInput = (file, content = "signed\n") => ({ file_path: file, content });
const patchInput = (file) => ({ command: `*** Begin Patch\n*** Update File: ${file}\n@@\n-old\n+new\n*** End Patch` });

/** denial -> plan -> prepare -> real Ed25519 proof -> armed capability. */
function signAndArm(root, { toolName, toolInput, denials = denial, nowMs = 1000, ttlMs } = {}) {
  const shared = { rootDir: root, pluginRoot: PLUGIN_ROOT, scriptPath: SCRIPT_PATH };
  const recorded = recordHumanGuardDenial({ ...shared, toolName, toolInput, denials, nowMs, ttlMs });
  assert.equal(recorded.status, "planned", JSON.stringify(recorded));
  const plan = planHumanGuardOverride({ ...shared, requestSha256: recorded.requestSha256, nowMs: nowMs + 500 });
  const prepared = prepareHumanGuardOverrideAuthorization({
    ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, reason: HGO_SIGNATURE_REASON, nowMs: nowMs + 1000,
  });
  const intent = createPoApprovalIntent({
    kind: "guard-override",
    featureId: "human-guard-override",
    planSha256: PLAN_SENTINEL,
    specSha256: SPEC_SENTINEL,
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
  const armed = authorizeHumanGuardOverrideBySignature({
    ...shared, requestSha256: recorded.requestSha256, planSha256: plan.planSha256, proof, nowMs: nowMs + 2000,
  });
  assert.equal(armed.status, "armed");
  return { recorded, plan };
}

const consume = (root, toolName, toolInput, { denials = denial, nowMs = 10_000 } = {}) =>
  consumeHumanGuardOverride({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials, nowMs });

for (const [toolName, build] of [["Write", writeInput], ["apply_patch", patchInput]]) {
  test(`${toolName}: three independently signed disjoint actions are delivered sequentially without re-signing`, () => {
    const root = fixture();
    try {
      const files = ["one.md", "two.md", "three.md"];
      for (const file of files) signAndArm(root, { toolName, toolInput: build(file) });
      for (const file of files) {
        // Each delivery changes the whole-repository status seen by the next one.
        const consumed = consume(root, toolName, build(file));
        assert.equal(consumed.status, "consumed", `${file}: ${JSON.stringify(consumed)}`);
        writeFileSync(join(root, file), "delivered\n");
      }
      // Replay: a consumed capability is single-use.
      assert.notEqual(consume(root, toolName, build(files[0])).status, "consumed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: an unrelated worktree edit between arming and consumption does not invalidate`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("target.md") });
      writeFileSync(join(root, "unrelated-untracked.md"), "other action delivered\n");
      writeFileSync(join(root, "existing-a.md"), "modified elsewhere\n");
      assert.equal(consume(root, toolName, build("target.md")).status, "consumed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: target byte, absence and ancestry drift still fail closed`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("existing-a.md") });
      signAndArm(root, { toolName, toolInput: build("absent.md") });
      signAndArm(root, { toolName, toolInput: build("sub/dir/deep.md") });
      writeFileSync(join(root, "existing-a.md"), "target bytes changed\n");
      writeFileSync(join(root, "absent.md"), "appeared\n");
      mkdirSync(join(root, "sub"), { recursive: true });
      for (const [file, label] of [["existing-a.md", "byte"], ["absent.md", "absence"], ["sub/dir/deep.md", "ancestry"]]) {
        const result = consume(root, toolName, build(file));
        assert.notEqual(result.status, "consumed", `${label} drift must not consume`);
        assert.equal(result.code, "HGO-DRIFT", label);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: symlink replacement of a signed target fails closed`, (t) => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("existing-b.md") });
      unlinkSync(join(root, "existing-b.md"));
      try { symlinkSync(join(root, "README.md"), join(root, "existing-b.md")); }
      catch { t.skip("file symlinks unavailable on this host"); return; }
      const result = consume(root, toolName, build("existing-b.md"));
      assert.notEqual(result.status, "consumed");
      assert.equal(result.code, "HGO-DRIFT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: expiry, denial-set and tool-input drift still fail closed`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("exp.md") });
      const otherDenial = [{ guard: "guard-lifecycle-ready.mjs", reason: "GUARD-DIFFERENT-REASON" }];
      assert.equal(consume(root, toolName, build("exp.md"), { denials: otherDenial }).status, "absent");
      assert.notEqual(consume(root, toolName, build("other-input.md")).status, "consumed");
      const expired = consume(root, toolName, build("exp.md"), { nowMs: 100_000_000_000_000 });
      assert.equal(expired.status, "replan");
      assert.equal(expired.code, "HGO-EXPIRED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test(`${toolName}: HEAD/tree movement after arming still fails closed`, () => {
    const root = fixture();
    try {
      signAndArm(root, { toolName, toolInput: build("headbound.md") });
      writeFileSync(join(root, "committed-later.md"), "x\n");
      git(root, "add", "committed-later.md");
      git(root, "commit", "-q", "-m", "move head");
      const result = consume(root, toolName, build("headbound.md"));
      assert.notEqual(result.status, "consumed");
      assert.equal(result.code, "HGO-DRIFT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
