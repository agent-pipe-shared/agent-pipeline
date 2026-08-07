#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-testpath-gmw.test.mjs — GMW (ADR-0058) end-to-end coverage for TP-* rules.
 *
 * SIBLING FILE, NOT AN EDIT TO `guard-testpath.test.mjs` -- that file is
 * `.claude/guard-config.json` `protectedTestPaths` rule TP-2, enforced live by
 * `guard-testpath.mjs`'s own Edit/Write PreToolUse guard with no in-session
 * override available while `gates.push_approval` is `signature` (this repo's
 * configured value; confirmed empirically before writing this file). Same
 * precedent as `guard-push-external-ledger.test.mjs` (WP5-phx2-implementation) and
 * `guard-gate-strength-gmw.test.mjs` (this same dispatch). This filename does not
 * match TP-2's `guard-testpath\.test\.mjs$` regex.
 *
 * Covers TP09 from the original combined design (a real armed GMW window scoped to
 * a TP-* rule lifts the matching Edit), exercised through the real
 * `guard-testpath.mjs` binary end-to-end. Library-level GMW coverage (scope
 * validation, expiry, tamper detection, ...) lives in
 * `lib/guard-maintenance-window.test.mjs`.
 *
 * Run: node plugins/pipeline-core/hooks/guard-testpath-gmw.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { closeGuardMaintenanceWindow, installGuardMaintenanceWindow, prepareGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { livePluginRoots } from "./guard-gate-strength.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";

const GUARD = fileURLToPath(new URL("./guard-testpath.mjs", import.meta.url));

let passed = 0;
let failed = 0;
const dirs = [];
function check(name, tool, filePath, expectExit, extra = {}) {
  const { projectDir, stderrIncludes } = extra;
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: tool, tool_input: { file_path: filePath, ...(extra.extraInput ?? {}) } }),
    encoding: "utf8",
    cwd: projectDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  const problems = [];
  if (res.status !== expectExit) problems.push(`exit ${res.status} (expected ${expectExit})`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!(res.stderr ?? "").includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${(res.stderr ?? "").trim().slice(0, 400)}`);
  }
  if (problems.length === 0) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name} -- ${problems.join("; ")}`); }
}

try {
  // ---- F4 (ADR-0058): a real armed GMW window lifts a matching TP-* rule -----------------
  const GMW_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-gmw-"));
  dirs.push(GMW_DIR);
  mkdirSync(join(GMW_DIR, ".claude"), { recursive: true });
  mkdirSync(join(GMW_DIR, "project"), { recursive: true });
  writeFileSync(join(GMW_DIR, ".claude", "guard-config.json"), JSON.stringify({
    protectedTestPaths: [{
      pattern: "plugins/pipeline-core/hooks/guard-git\\.test\\.mjs$",
      reason: "The git-guard union test suite is the implementation contract for guard-git.mjs.",
    }],
  }));
  writeFileSync(join(GMW_DIR, "plan.md"), "plan\n");
  writeFileSync(join(GMW_DIR, "spec.md"), "spec\n");
  const gmwPair = generateKeyPairSync("ed25519");
  const gmwPublicKey = gmwPair.publicKey.export({ type: "spki", format: "pem" });
  const gmwPublicKeySha256 = createHash("sha256").update(gmwPublicKey).digest("hex");
  writeFileSync(join(GMW_DIR, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"],
    trustAnchor: { keyReference: "tp-e2e", publicKeySha256: gmwPublicKeySha256 },
  }));
  execFileSync("git", ["init", "-q"], { cwd: GMW_DIR });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: GMW_DIR });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: GMW_DIR });
  execFileSync("git", ["add", "-A"], { cwd: GMW_DIR });
  execFileSync("git", ["commit", "-q", "-m", "gmw-fixture"], { cwd: GMW_DIR });

  check("TP09 real armed GMW window scoped to TP-1 lifts the matching Edit", "Edit",
    "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs", 0, (() => {
      const livePluginRoot = livePluginRoots()[0];
      const { intent, request } = prepareGuardMaintenanceWindowRequest({
        rootDir: GMW_DIR, scopeRuleIds: ["TP-1"], ttlSeconds: 300, reason: "TP09",
        featureId: "tp-gmw-e2e", planSha256: createHash("sha256").update("plan\n").digest("hex"),
        specSha256: createHash("sha256").update("spec\n").digest("hex"), policyRevision: "tp-gmw-e2e-v1", livePluginRoot,
      });
      const proof = {
        schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "tp-e2e", publicKey: gmwPublicKey,
        signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), gmwPair.privateKey).toString("base64"),
      };
      installGuardMaintenanceWindow({
        rootDir: GMW_DIR, request, trustPolicy: { keyReference: "tp-e2e", publicKeySha256: gmwPublicKeySha256 }, proof, livePluginRoot,
      });
      return { projectDir: GMW_DIR, stderrIncludes: ["pipeline-guard-maintenance-window", "TP-1 lifted"] };
    })());
  closeGuardMaintenanceWindow({ rootDir: GMW_DIR });

  console.log(`\nguard-testpath-gmw: ${passed} passed, ${failed} failed`);
} finally {
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
process.exit(failed === 0 ? 0 : 1);
