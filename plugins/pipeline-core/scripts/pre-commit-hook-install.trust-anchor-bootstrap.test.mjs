#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pre-commit-hook-install.trust-anchor-bootstrap.test.mjs — NVA-CF-TRUSTANCHOR-TOFU.
 *
 * Regression coverage for the BOUNDARY the new trust-anchor bootstrap exemption
 * (`isTrustAnchorBootstrapUpgrade()`, embedded in `pre-commit-hook-install.mjs`'s
 * `renderImpl()` output, right next to `pathAlreadyTrackedInHistory()`) must NOT cross.
 * The positive case -- a fresh signature-mode project's first anchor addition committing
 * cleanly -- is covered live end-to-end by
 * `plugins/pipeline-core/lib/trust-anchor-bootstrap-circularity.repro.test.mjs`. This file
 * covers everything that must stay exactly as blocked as before: a REPLACED anchor, a
 * SECOND anchor added to a policy that already has one, an anchor addition bundled with an
 * unrelated field change, and a policy whose trustAnchors set is already non-empty (any
 * size) gaining one more entry.
 *
 * Run: node --test plugins/pipeline-core/scripts/pre-commit-hook-install.trust-anchor-bootstrap.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyInstall } from "./pre-commit-hook-install.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLUGIN_DIRS = {
  pluginLibDir: join(PLUGIN_ROOT, "lib"),
  pluginHooksDir: join(PLUGIN_ROOT, "hooks"),
  pluginScriptsDir: join(PLUGIN_ROOT, "scripts"),
};

const CRITICAL_HUMAN_PROOF_POLICY_PATH = "project/critical-human-proof.json";

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `pre-commit-hook-tofu-${prefix}-`));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 20000 });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  return { dir, git };
}

function installHook(dir) {
  const install = applyInstall({ rootDir: dir, ...PLUGIN_DIRS });
  assert.equal(install.status, "installed", `precondition: install must succeed (${JSON.stringify(install)})`);
  return install;
}

function writePolicy(dir, policy) {
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, CRITICAL_HUMAN_PROOF_POLICY_PATH), `${JSON.stringify(policy, null, 2)}\n`);
}

/** Seeds `project/critical-human-proof.json` with `policy` as an ALREADY-TRACKED commit,
 * BEFORE the hook is installed (mirrors pre-commit-hook-install.test.mjs's own convention:
 * the seed commit itself must never be gated, so the later re-write is genuinely a re-write
 * of already-tracked history). */
function seedAlreadyTracked(dir, git, policy) {
  writePolicy(dir, policy);
  git("add", CRITICAL_HUMAN_PROOF_POLICY_PATH);
  git("commit", "-q", "-m", "seed critical-human-proof.json (no hook installed yet)");
}

function commit(dir, message) {
  const result = spawnSync("git", ["commit", "-m", message], { cwd: dir, encoding: "utf8", timeout: 20000 });
  return { code: result.status, stderr: result.stderr ?? "" };
}

const ANCHOR_A = { keyReference: "po-key-a", publicKeySha256: "a".repeat(64) };
const ANCHOR_B = { keyReference: "po-key-b", publicKeySha256: "b".repeat(64) };
const ANCHOR_C = { keyReference: "po-key-c", publicKeySha256: "c".repeat(64) };

const V1_NO_ANCHOR = { schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"] };

function assertStillBlocked(result) {
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /BLOCKED \(agent-pipeline pre-commit hook\)/u);
  assert.match(result.stderr, /GS-2 project\/critical-human-proof\.json/u);
  assert.match(result.stderr, /HUMAN OPERATOR ONLY/u);
}

test("trust-anchor bootstrap exemption: (a) REPLACING an existing single anchor with a different one stays BLOCKED", () => {
  const { dir, git } = freshRepo("replace-anchor");
  seedAlreadyTracked(dir, git, {
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push"], waivedKinds: [], trustAnchors: [ANCHOR_A],
  });
  installHook(dir);
  writePolicy(dir, {
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push"], waivedKinds: [], trustAnchors: [ANCHOR_B],
  });
  git("add", CRITICAL_HUMAN_PROOF_POLICY_PATH);
  assertStillBlocked(commit(dir, "swap trust anchor"));
});

test("trust-anchor bootstrap exemption: (b) ADDING a second anchor to a policy that already has one stays BLOCKED", () => {
  const { dir, git } = freshRepo("second-anchor");
  seedAlreadyTracked(dir, git, {
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push"], waivedKinds: [], trustAnchors: [ANCHOR_A],
  });
  installHook(dir);
  writePolicy(dir, {
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push"], waivedKinds: [], trustAnchors: [ANCHOR_A, ANCHOR_B],
  });
  git("add", CRITICAL_HUMAN_PROOF_POLICY_PATH);
  assertStillBlocked(commit(dir, "add second trust anchor"));
});

test("trust-anchor bootstrap exemption: (c) an UNRELATED field change (requiredKinds) bundled alongside the first anchor addition stays BLOCKED", () => {
  const { dir, git } = freshRepo("bundled-field-change");
  seedAlreadyTracked(dir, git, V1_NO_ANCHOR);
  installHook(dir);
  writePolicy(dir, {
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push", "reconcile"], waivedKinds: [], trustAnchors: [ANCHOR_A],
  });
  git("add", CRITICAL_HUMAN_PROOF_POLICY_PATH);
  assertStillBlocked(commit(dir, "add trust anchor and change requiredKinds in the same commit"));
});

test("trust-anchor bootstrap exemption: (d) a policy whose trustAnchors set is ALREADY non-empty gaining one more entry stays BLOCKED, regardless of current set size", () => {
  const { dir, git } = freshRepo("already-nonempty-set");
  seedAlreadyTracked(dir, git, {
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push"], waivedKinds: [], trustAnchors: [ANCHOR_A, ANCHOR_B],
  });
  installHook(dir);
  writePolicy(dir, {
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push"], waivedKinds: [], trustAnchors: [ANCHOR_A, ANCHOR_B, ANCHOR_C],
  });
  git("add", CRITICAL_HUMAN_PROOF_POLICY_PATH);
  assertStillBlocked(commit(dir, "add a third trust anchor"));
});

// ---- sanity: the exemption's own true-positive shape still fires as expected here too ----

test("trust-anchor bootstrap exemption: a genuine v1(no-anchor) -> v3(one-anchor) upgrade, unrelated fields unchanged, commits ALLOWED", () => {
  const { dir, git } = freshRepo("positive-control");
  seedAlreadyTracked(dir, git, V1_NO_ANCHOR);
  installHook(dir);
  writePolicy(dir, {
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push"], waivedKinds: [], trustAnchors: [ANCHOR_A],
  });
  git("add", CRITICAL_HUMAN_PROOF_POLICY_PATH);
  const { code, stderr } = commit(dir, "add trust anchor");
  assert.equal(code, 0, stderr);
});

test("trust-anchor bootstrap exemption: v1(no-anchor) -> v3(no-anchor, empty trustAnchors) is NOT the anchor upgrade -- still blocked (no anchor actually added)", () => {
  const { dir, git } = freshRepo("v3-still-empty");
  seedAlreadyTracked(dir, git, V1_NO_ANCHOR);
  installHook(dir);
  writePolicy(dir, {
    schema: "pipeline.critical-human-proof-policy.v3",
    requiredKinds: ["push"], waivedKinds: [],
  });
  git("add", CRITICAL_HUMAN_PROOF_POLICY_PATH);
  assertStillBlocked(commit(dir, "bump schema to v3 without adding an anchor"));
});
