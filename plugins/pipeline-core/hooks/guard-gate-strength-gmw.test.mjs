#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-gate-strength-gmw.test.mjs — GMW (ADR-0058) end-to-end coverage for GS-6.
 *
 * SIBLING FILE, NOT AN EDIT TO `guard-gate-strength.test.mjs` -- that file is
 * `.claude/guard-config.json` `protectedTestPaths` rule TP-6, enforced live by
 * `guard-testpath.mjs`'s Edit/Write PreToolUse guard with no in-session override
 * available while `gates.push_approval` is `signature` (this repo's configured
 * value; confirmed empirically before writing this file). Same precedent as
 * `guard-push-external-ledger.test.mjs` (WP5-phx2-implementation) and
 * `guard-testpath-gmw.test.mjs` (this same dispatch). This filename does not match
 * TP-6's `guard-gate-strength\.test\.mjs$` regex.
 *
 * Covers GST20 from the original combined design (a real armed GS-6 window lifts
 * an ordinary plugin file but a kernel path stays refused), exercised through the
 * real `guard-gate-strength.mjs` binary end-to-end. Library-level GMW coverage
 * (scope validation, expiry, tamper detection, ...) lives in
 * `lib/guard-maintenance-window.test.mjs`.
 *
 * Run: node plugins/pipeline-core/hooks/guard-gate-strength-gmw.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { livePluginRoots } from "./guard-gate-strength.mjs";
import { installGuardMaintenanceWindow, prepareGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HOOKS, "guard-gate-strength.mjs");
const PLUGIN_ROOT = join(HOOKS, "..");
const roots = [];

function ask(root, filePath, extraEnv = {}) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root, ...extraEnv };
  for (const [key, value] of Object.entries(extraEnv)) if (value === undefined) delete env[key];
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: filePath }, cwd: root }),
    encoding: "utf8",
    cwd: root,
    env,
  });
  return { blocked: result.status !== 0, stderr: result.stderr ?? "" };
}

let passed = 0;
let failed = 0;
function check(name, callback) {
  try { callback(); console.log(`PASS ${name}`); passed += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed += 1; }
}

try {
  check("GST20 a real armed GS-6 window lifts an ordinary plugin file but a kernel path stays refused", () => {
    const root = mkdtempSync(join(tmpdir(), "gate-strength-gmw-"));
    roots.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    mkdirSync(join(root, "project"), { recursive: true });
    writeFileSync(join(root, "plan.md"), "plan\n");
    writeFileSync(join(root, "spec.md"), "spec\n");
    const pair = generateKeyPairSync("ed25519");
    const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
    const publicKeySha256 = createHash("sha256").update(publicKey).digest("hex");
    writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
      schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"],
      trustAnchor: { keyReference: "gst-e2e", publicKeySha256 },
    }));
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "gmw-fixture"], { cwd: root });
    const livePluginRoot = livePluginRoots()[0];
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: root, scopeRuleIds: ["GS-6"], ttlSeconds: 300, reason: "GST20",
      featureId: "gst20", planSha256: createHash("sha256").update("plan\n").digest("hex"),
      specSha256: createHash("sha256").update("spec\n").digest("hex"), policyRevision: "gst20-v1", livePluginRoot,
    });
    const proof = {
      schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "gst-e2e", publicKey,
      signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), pair.privateKey).toString("base64"),
    };
    installGuardMaintenanceWindow({ rootDir: root, request, trustPolicy: { keyReference: "gst-e2e", publicKeySha256 }, proof, livePluginRoot });

    const ordinary = ask(root, join(PLUGIN_ROOT, "hooks", "guard-git.mjs"));
    assert.equal(ordinary.blocked, false, "ordinary plugin file should be lifted under the active window");
    assert.match(ordinary.stderr, /guard-maintenance-window.*GS-6 lifted/u);

    const kernel = ask(root, join(PLUGIN_ROOT, "hooks", "guard-gate-strength.mjs"));
    assert.equal(kernel.blocked, true, "kernel path must stay refused under the SAME active window");
    assert.doesNotMatch(kernel.stderr, /lifted/u);
    const kernel2 = ask(root, join(PLUGIN_ROOT, "hooks", "hooks.json"));
    assert.equal(kernel2.blocked, true);
  });

  console.log(`\nguard-gate-strength-gmw: ${passed} passed, ${failed} failed`);
} finally {
  for (const entry of roots) rmSync(entry, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
