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
 * ADR-0059 Decision 4: a denial in CHAT mode names its own next step (`authorize ...
 * --activate`) and never signature's (`authorize-by-signature`) (TP10/TP11, absolute and
 * relative file_path). Signature mode's equivalent property is already pinned in depth by
 * guard-testpath-override.test.mjs (OT02/OT03/OT13/OT15/OT17) and is not repeated here. The
 * override ROUTES themselves (arming, consuming, eligibility, committed-vs-working-tree) are
 * that sibling suite's job too, not duplicated here.
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
function check(id, toolName, filePath, expectExit, { projectDir = EMPTY_DIR, stderrIncludes, stderrExcludes, stderrEmpty, extraInput } = {}) {
  const { code, stderr } = runGuard(toolName, filePath, projectDir, extraInput);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit})`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  for (const needle of [].concat(stderrExcludes ?? [])) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
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

// ---- ADR-0059 Decision 4: every denial names the mode-appropriate next step -----------
// None of TP01-TP09 above ever reads gates.push_approval or the override-guidance section
// of a denial: their fixture paths all live under plugins/pipeline-core, where HGO
// eligibility classifies every write as "pipeline-author-repair" (needs an explicit
// --author-source-root) and so never reaches "planned" -- guard-testpath-override.test.mjs's
// own OT14 pins exactly that boundary, which is why no guidance text ever appears for those
// cases either way. guard-testpath-override.test.mjs (as of 058190f) covers the SIGNATURE
// side of Decision 4 in depth: OT02/OT03/OT13/OT15/OT17 all pin that a denial in signature
// mode names the resolved mode, refuses the in-session `--activate` continuation, and offers
// `authorize-by-signature` instead. It does not carry the equivalent pin for CHAT mode --
// OT04/OT05 only assert that SOME route is offered and that it says "attribution, not
// proof", never that the printed continuation is specifically chat's `--activate` step and
// specifically NOT signature's `authorize-by-signature`. TP10/TP11 below close exactly that
// gap, from a fixture outside plugins/pipeline-core so a route is actually offered.
function gitCommitAll(dir) {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "mode-fixture"], { cwd: dir });
}
const MODE_PATTERN = "src/domain/important\\.test\\.mjs$";

const MODE_CHAT_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-mode-chat-"));
mkdirSync(join(MODE_CHAT_DIR, ".claude"), { recursive: true });
writeFileSync(
  join(MODE_CHAT_DIR, ".claude", "guard-config.json"),
  JSON.stringify({ protectedTestPaths: [{ id: "TP-MODE", pattern: MODE_PATTERN, reason: "example protected project test" }] }),
);
// `chat` must be COMMITTED, not just written: an uncommitted copy reads as unverified and
// falls back to the strongest mode (signature) regardless of its content.
writeFileSync(join(MODE_CHAT_DIR, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
gitCommitAll(MODE_CHAT_DIR);
// A real, resolvable ABSOLUTE path built from the fixture root -- mirrors the actual harness
// contract (Claude Code always sends an absolute file_path). TP01-TP09 above only ever use a
// synthetic "D:/repo/..." placeholder, never a path that actually resolves under the project.
const MODE_CHAT_ABS_FILE = join(MODE_CHAT_DIR, "src/domain/important.test.mjs");

check(
  "TP10 block  chat mode names its own next step (authorize --activate), not signature's",
  "Edit",
  MODE_CHAT_ABS_FILE,
  BLOCK,
  {
    projectDir: MODE_CHAT_DIR,
    stderrIncludes: [
      'Clearance: gates.push_approval is "chat"',
      "attribution, not proof",
      "--request-sha256", // a next-step command is actually named, not merely implied
      "--activate",
    ],
    stderrExcludes: ["authorize-by-signature"],
    extraInput: { old_string: "a", new_string: "b" },
  },
);

// A genuinely RELATIVE file_path this time (no absolute prefix at all, same fixture dir) --
// fixtures must mirror the real contract with absolute paths ALONGSIDE relative ones, and
// TP01-TP09 above never exercise a plain relative file_path (only the "D:/repo/..."
// placeholder style). Signature mode's own equivalent of this differentiator (mode resolved,
// `--activate` refused, `authorize-by-signature` offered) is NOT repeated here: since
// f650164/058190f it is already pinned in depth by guard-testpath-override.test.mjs's OT02,
// OT03, OT13, OT15 and OT17 -- a second copy of the same property would be padding, not
// coverage. This case instead confirms the CHAT differentiator TP10 established still holds
// when the guard is handed a relative rather than an absolute path.
const MODE_CHAT_REL_FILE = "src/domain/important.test.mjs";

check(
  "TP11 block  chat mode's own next step still names authorize --activate given a relative path",
  "Edit",
  MODE_CHAT_REL_FILE,
  BLOCK,
  {
    projectDir: MODE_CHAT_DIR,
    stderrIncludes: [
      'Clearance: gates.push_approval is "chat"',
      "attribution, not proof",
      "--request-sha256",
      "--activate",
    ],
    stderrExcludes: ["authorize-by-signature"],
    extraInput: { old_string: "a", new_string: "b" },
  },
);

// ---- Summary -----------------------------------------------------------------------------
for (const dir of [EMPTY_DIR, CFG_DIR, BROKEN_DIR, CFG_ID_DIR, GMW_DIR, MODE_CHAT_DIR]) {
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
