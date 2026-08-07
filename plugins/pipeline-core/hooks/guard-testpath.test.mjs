#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-testpath.test.mjs — test suite for the test-path PreToolUse guard (guard-testpath.mjs).
 *
 * Canon: guardrails/quality-gates.md QG-04, roles/goldfish.md GF-04,
 * harness/definition-of-done.md A4. Backlog: backlog/items/2026-07-03-testpfad-pretooluse-schutz.md.
 *
 * Coverage contract (AC-G4-1): >= 1 BLOCK case + >= 1 ALLOW case for a configured
 * protected path; no-config no-op case; broken-config WARN case; Write tool coverage
 * alongside Edit; explicit rule-id-in-message case (mirrors guard-git.mjs's OV-AC7).
 *
 * Run:   node plugins/pipeline-core/hooks/guard-testpath.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Hermetics: every spawn sets CLAUDE_PROJECT_DIR to a temp dir so a real project
 * guard-config on the machine can never leak into these cases.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { closeGuardMaintenanceWindow, installGuardMaintenanceWindow, prepareGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { livePluginRoots } from "./guard-gate-strength.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";

const GUARD = fileURLToPath(new URL("./guard-testpath.mjs", import.meta.url));

/** Run the guard exactly like Claude Code does: tool-input JSON on stdin. */
function runGuard(toolName, filePath, projectDir, extraInput = {}) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath, ...extraInput } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

// Hermetic default project dir (no guard-config -> pure no-op).
const EMPTY_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-empty-"));

let pass = 0;
const failures = [];
function check(id, toolName, filePath, expectExit, { projectDir = EMPTY_DIR, stderrIncludes, stderrEmpty, extraInput } = {}) {
  const { code, stderr } = runGuard(toolName, filePath, projectDir, extraInput);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit})`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 120)}`);
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")} — file: ${filePath}`);
    console.log(`FAIL  ${id} — ${problems.join("; ")}`);
  }
}
const BLOCK = 2,
  ALLOW = 0,
  WARN = 1;

// ---- Config case: protected path configured -------------------------------------------
const CFG_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-cfg-"));
mkdirSync(join(CFG_DIR, ".claude"), { recursive: true });
writeFileSync(
  join(CFG_DIR, ".claude", "guard-config.json"),
  JSON.stringify({
    protectedTestPaths: [
      {
        pattern: "plugins/pipeline-core/hooks/guard-git\\.test\\.mjs$",
        reason: "The git-guard union test suite is the implementation contract for guard-git.mjs.",
      },
    ],
  }),
);

check(
  "TP01 block  Edit on configured protected test file",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  BLOCK,
  {
    projectDir: CFG_DIR,
    stderrIncludes: ["TP-1", "guard-git.test.mjs", "GF-04"],
    extraInput: { old_string: "a", new_string: "b" },
  },
);
check(
  "TP02 allow  Edit on an unrelated file with the same config loaded",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.mjs",
  ALLOW,
  { projectDir: CFG_DIR, stderrEmpty: true, extraInput: { old_string: "a", new_string: "b" } },
);
check(
  "TP03 block  Write on configured protected test file (Write tool, not just Edit)",
  "Write",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  BLOCK,
  { projectDir: CFG_DIR, stderrIncludes: ["TP-1"], extraInput: { content: "// rewritten" } },
);
check(
  "TP04 block  path with backslashes (Windows) still matches (normalization)",
  "Edit",
  "D:\\repo\\plugins\\pipeline-core\\hooks\\guard-git.test.mjs",
  BLOCK,
  { projectDir: CFG_DIR, stderrIncludes: ["TP-1"], extraInput: { old_string: "a", new_string: "b" } },
);

// ---- No-config case: fail-open, silent (the normal case) ------------------------------
check(
  "TP05 allow  missing config is silent no-op (fail-open)",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  ALLOW,
  { projectDir: EMPTY_DIR, stderrEmpty: true, extraInput: { old_string: "a", new_string: "b" } },
);

// ---- Broken config: exit 1 WARN, nothing blocked ---------------------------------------
const BROKEN_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-broken-"));
mkdirSync(join(BROKEN_DIR, ".claude"), { recursive: true });
writeFileSync(join(BROKEN_DIR, ".claude", "guard-config.json"), '{ "protectedTestPaths": [ THIS IS NOT JSON');
check(
  "TP06 warn   broken JSON surfaces as exit 1 WARN, nothing blocked",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  WARN,
  { projectDir: BROKEN_DIR, stderrIncludes: ["WARN", "unparseable JSON"], extraInput: { old_string: "a", new_string: "b" } },
);

// ---- Non-matching tool / empty file_path stays fail-open -------------------------------
check("TP07 allow  no file_path at all", "Edit", "", ALLOW, { projectDir: CFG_DIR, extraInput: { old_string: "a", new_string: "b" } });

// ---- Custom rule id from config ---------------------------------------------------------
const CFG_ID_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-cfgid-"));
mkdirSync(join(CFG_ID_DIR, ".claude"), { recursive: true });
writeFileSync(
  join(CFG_ID_DIR, ".claude", "guard-config.json"),
  JSON.stringify({
    protectedTestPaths: [{ pattern: "guard-git\\.test\\.mjs$", id: "CUSTOM-01" }],
  }),
);
check(
  "TP08 block  explicit config id is used in the block message",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  BLOCK,
  { projectDir: CFG_ID_DIR, stderrIncludes: ["CUSTOM-01"], extraInput: { old_string: "a", new_string: "b" } },
);

// ---- F4 (ADR-0058): a real armed GMW window lifts a matching TP-* rule -----------------
const GMW_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-gmw-"));
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
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs", ALLOW, (() => {
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

// ---- Summary -----------------------------------------------------------------------------
for (const dir of [EMPTY_DIR, CFG_DIR, BROKEN_DIR, CFG_ID_DIR, GMW_DIR]) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
