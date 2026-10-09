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
 *
 * TR-L / T84 (specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md section 2 row T84,
 * section 5 row 9; tranche-2 post-image, new cases TP19-TP21): "one protection decision per file
 * across hunks". The verdict for a shipped-baseline guard source (PB-GUARD-HOOKS, here
 * `lib/guard/sanctioned-args-onboarding.mjs`) must be a function of the FILE only: not of which
 * hunk is edited (including the revert of a hunk and a Write of the committed bytes), not of the
 * file's index or working-tree state, not of how its path is spelled. TR-L "makes the decision
 * consistent, never weaker" (invariant I4), so these are invariants the TR-L change must keep;
 * each case is run, not assumed, and its colour is recorded in TR-L-MANIFEST.md.
 * The restore half of T84 is a SHELL-lane decision and lives in guard-testpath-override.test.mjs
 * (OT20-OT23). NOT reproduced here: the mechanism by which the toil log (L88) saw hunk 1 admitted.
 * Nothing in this write lane reads index or working-tree state; the only per-call state is a spent
 * one-time capability, which OT20 of the sibling suite pins.
 */
import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, openSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { closeGuardMaintenanceWindow, installGuardMaintenanceWindow, prepareGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { createBriefedTestChangeAuthorization } from "../lib/human-guard-override.mjs";
import { livePluginRoots } from "./guard-gate-strength.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

const GUARD = fileURLToPath(new URL("./guard-testpath.mjs", import.meta.url));

async function* orderedCases() {
function enrollFixture(dir) {
  const hostStateRoot = join(dir, "fixture-host-state");
  const governance = createGovernanceScopeController({ hostStateRoot });
  const inactive = governance.observe({ rootDir: dir });
  assert.equal(inactive.state, "inactive");
  assert.equal(inactive.requiresEnforcement, false);
  const plan = governance.planDecision({ rootDir: dir, decision: "enroll", by: "disposable-guard-fixture" });
  const active = governance.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  assert.equal(active.state, "active");
  assert.equal(active.requiresEnforcement, true);
  assert.equal(governance.observe({ rootDir: dir }).state, "active");
}

function initAndEnrollFixture(dir) {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  enrollFixture(dir);
}

/** Run the guard exactly like Claude Code does: tool-input JSON on stdin. */
function runGuard(toolName, filePath, projectDir, extraInput = {}, env = {}) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath, ...extraInput } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, ...env },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

// Hermetic default project dir. A3 deliberately keeps the plugin baseline active
// even without project configuration.
const EMPTY_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-empty-"));
initAndEnrollFixture(EMPTY_DIR);


// `stderrMatches` (regex list) is additive alongside the substring channels: some
// properties are shapes rather than literals -- "a real 64-hex request digest was offered"
// is not the same claim as "the string --request-sha256 appears somewhere". Existing cases
// pass none and are unaffected.
function check(id, toolName, filePath, expectExit, { projectDir = EMPTY_DIR, stderrIncludes, stderrExcludes, stderrMatches, stderrEmpty, extraInput, env } = {}) {
  const { code, stderr } = runGuard(toolName, filePath, projectDir, extraInput, env);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit})`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  for (const needle of [].concat(stderrExcludes ?? [])) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
  }
  for (const pattern of [].concat(stderrMatches ?? [])) {
    if (!pattern.test(stderr)) problems.push(`stderr does not match ${String(pattern)}`);
  }
  if (stderrEmpty && stderr.trim() !== "") problems.push(`stderr not empty: ${stderr.trim().slice(0, 120)}`);
  if (problems.length > 0) throw new Error(`${id}: ${problems.join("; ")} — file: ${filePath}`);
  console.log(`PASS  ${id}`);
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
initAndEnrollFixture(CFG_DIR);

yield { id: "TPC001", name: "TP01 block  Edit on configured protected test file", run: () => check(
  "TP01 block  Edit on configured protected test file",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  BLOCK,
  {
    projectDir: CFG_DIR,
    stderrIncludes: ["TP-1", "guard-git.test.mjs", "GF-04"],
    extraInput: { old_string: "a", new_string: "b" },
  },
) };
yield { id: "TPC002", name: "TP02 block  Edit on a shipped baseline guard hook", run: () => check(
  "TP02 block  Edit on a shipped baseline guard hook",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.mjs",
  BLOCK,
  { projectDir: CFG_DIR, stderrIncludes: ["PB-GUARD-HOOKS"], extraInput: { old_string: "a", new_string: "b" } },
) };
yield { id: "TPC003", name: "TP03 block  Write on configured protected test file (Write tool, not just Edit)", run: () => check(
  "TP03 block  Write on configured protected test file (Write tool, not just Edit)",
  "Write",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  BLOCK,
  { projectDir: CFG_DIR, stderrIncludes: ["TP-1"], extraInput: { content: "// rewritten" } },
) };
yield { id: "TPC004", name: "TP04 block  path with backslashes (Windows) still matches (normalization)", run: () => check(
  "TP04 block  path with backslashes (Windows) still matches (normalization)",
  "Edit",
  "D:\\repo\\plugins\\pipeline-core\\hooks\\guard-git.test.mjs",
  BLOCK,
  { projectDir: CFG_DIR, stderrIncludes: ["TP-1"], extraInput: { old_string: "a", new_string: "b" } },
) };

// ---- No-config case: immutable plugin baseline remains active ---------------------------
yield { id: "TPC005", name: "TP05 block  missing project config still keeps the shipped minimum active", run: () => check(
  "TP05 block  missing project config still keeps the shipped minimum active",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  BLOCK,
  { projectDir: EMPTY_DIR, stderrIncludes: ["PB-CONTRACT-TESTS"], extraInput: { old_string: "a", new_string: "b" } },
) };

// ---- Broken config: baseline-only, therefore the shipped minimum still blocks -----------
const BROKEN_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-broken-"));
mkdirSync(join(BROKEN_DIR, ".claude"), { recursive: true });
writeFileSync(join(BROKEN_DIR, ".claude", "guard-config.json"), '{ "protectedTestPaths": [ THIS IS NOT JSON');
initAndEnrollFixture(BROKEN_DIR);
yield { id: "TPC006", name: "TP06 block  broken JSON is baseline-only and cannot remove static protection", run: () => check(
  "TP06 block  broken JSON is baseline-only and cannot remove static protection",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  BLOCK,
  { projectDir: BROKEN_DIR, stderrIncludes: ["PB-CONTRACT-TESTS"], extraInput: { old_string: "a", new_string: "b" } },
) };

// ---- Non-matching tool / empty file_path stays fail-open -------------------------------
yield { id: "TPC007", name: "TP07 allow  no file_path at all", run: () => check("TP07 allow  no file_path at all", "Edit", "", ALLOW, { projectDir: CFG_DIR, extraInput: { old_string: "a", new_string: "b" } }) };

// ---- Custom rule id from config ---------------------------------------------------------
const CFG_ID_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-cfgid-"));
mkdirSync(join(CFG_ID_DIR, ".claude"), { recursive: true });
writeFileSync(
  join(CFG_ID_DIR, ".claude", "guard-config.json"),
  JSON.stringify({
    protectedTestPaths: [{ pattern: "guard-git\\.test\\.mjs$", id: "CUSTOM-01" }],
  }),
);
initAndEnrollFixture(CFG_ID_DIR);
yield { id: "TPC008", name: "TP08 block  explicit config id is used in the block message", run: () => check(
  "TP08 block  explicit config id is used in the block message",
  "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs",
  BLOCK,
  { projectDir: CFG_ID_DIR, stderrIncludes: ["CUSTOM-01"], extraInput: { old_string: "a", new_string: "b" } },
) };

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
enrollFixture(GMW_DIR);

yield { id: "TPC009", name: "TP09 real armed GMW window scoped to TP-1 lifts the matching Edit", run: () => check("TP09 real armed GMW window scoped to TP-1 lifts the matching Edit", "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-git.test.mjs", ALLOW, (() => {
    const livePluginRoot = livePluginRoots()[0];
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: GMW_DIR, scopeRuleIds: ["TP-1"], ttlSeconds: 300, reason: "TP09",
      featureId: "tp-gmw-e2e", planSha256: createHash("sha256").update("plan\n").digest("hex"),
      specSha256: createHash("sha256").update("spec\n").digest("hex"), policyRevision: "tp-gmw-e2e-v1", livePluginRoot,
      authorshipMode: "goldfish-dispatch",
    });
    const proof = {
      schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "tp-e2e", publicKey: gmwPublicKey,
      signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), gmwPair.privateKey).toString("base64"),
    };
    installGuardMaintenanceWindow({
      rootDir: GMW_DIR, request, anchors: [{ keyReference: "tp-e2e", publicKeySha256: gmwPublicKeySha256 }], proof, livePluginRoot,
    });
    return { projectDir: GMW_DIR, stderrIncludes: ["pipeline-guard-maintenance-window", "TP-1 lifted"] };
  })()) };
closeGuardMaintenanceWindow({ rootDir: GMW_DIR });

// ---- selectivity (backlog: 2026-08-07-maintenance-window-selectivity-is-untested-at-both-levels):
// TP09 above only ever queries the ONE TP rule its own window names, so it cannot tell a
// correctly-scoped lift from a window that (by regression) opened every protected test path.
// This fixture configures TWO liftable TP rules, arms a real signed window scoped to TP-1
// only, and drives an Edit matching TP-2 -- the structural analogue of GST20's kernel-path
// negative, adapted to this hook: one window, two rules, only the named one opens.
const GMW_SEL_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-gmw-sel-"));
mkdirSync(join(GMW_SEL_DIR, ".claude"), { recursive: true });
mkdirSync(join(GMW_SEL_DIR, "project"), { recursive: true });
writeFileSync(join(GMW_SEL_DIR, ".claude", "guard-config.json"), JSON.stringify({
  protectedTestPaths: [
    {
      pattern: "plugins/pipeline-core/hooks/guard-git\\.test\\.mjs$",
      reason: "The git-guard union test suite is the implementation contract for guard-git.mjs.",
    },
    {
      pattern: "plugins/pipeline-core/hooks/guard-gate-strength\\.test\\.mjs$",
      reason: "The gate-strength test suite is the implementation contract for guard-gate-strength.mjs.",
    },
  ],
}));
writeFileSync(join(GMW_SEL_DIR, "plan.md"), "plan\n");
writeFileSync(join(GMW_SEL_DIR, "spec.md"), "spec\n");
const gmwSelPair = generateKeyPairSync("ed25519");
const gmwSelPublicKey = gmwSelPair.publicKey.export({ type: "spki", format: "pem" });
const gmwSelPublicKeySha256 = createHash("sha256").update(gmwSelPublicKey).digest("hex");
writeFileSync(join(GMW_SEL_DIR, "project", "critical-human-proof.json"), JSON.stringify({
  schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"],
  trustAnchor: { keyReference: "tp-sel-e2e", publicKeySha256: gmwSelPublicKeySha256 },
}));
execFileSync("git", ["init", "-q"], { cwd: GMW_SEL_DIR });
execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: GMW_SEL_DIR });
execFileSync("git", ["config", "user.name", "Test"], { cwd: GMW_SEL_DIR });
execFileSync("git", ["add", "-A"], { cwd: GMW_SEL_DIR });
execFileSync("git", ["commit", "-q", "-m", "gmw-sel-fixture"], { cwd: GMW_SEL_DIR });
enrollFixture(GMW_SEL_DIR);

yield { id: "TPC010", name: "TP14 block  a real armed window scoped to TP-1 does NOT lift a different in-scope-file TP-2 rule", run: () => check("TP14 block  a real armed window scoped to TP-1 does NOT lift a different in-scope-file TP-2 rule", "Edit",
  "D:/repo/plugins/pipeline-core/hooks/guard-gate-strength.test.mjs", BLOCK, (() => {
    const livePluginRoot = livePluginRoots()[0];
    const { intent, request } = prepareGuardMaintenanceWindowRequest({
      rootDir: GMW_SEL_DIR, scopeRuleIds: ["TP-1"], ttlSeconds: 300, reason: "TP14",
      featureId: "tp-sel-gmw-e2e", planSha256: createHash("sha256").update("plan\n").digest("hex"),
      specSha256: createHash("sha256").update("spec\n").digest("hex"), policyRevision: "tp-sel-gmw-e2e-v1", livePluginRoot,
      authorshipMode: "goldfish-dispatch",
    });
    const proof = {
      schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: "tp-sel-e2e", publicKey: gmwSelPublicKey,
      signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), gmwSelPair.privateKey).toString("base64"),
    };
    installGuardMaintenanceWindow({
      rootDir: GMW_SEL_DIR, request, anchors: [{ keyReference: "tp-sel-e2e", publicKeySha256: gmwSelPublicKeySha256 }], proof, livePluginRoot,
    });
    return { projectDir: GMW_SEL_DIR, stderrIncludes: ["Rule ID: TP-2"], stderrExcludes: ["lifted"] };
  })()) };
closeGuardMaintenanceWindow({ rootDir: GMW_SEL_DIR });

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
  enrollFixture(dir);
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

yield { id: "TPC011", name: "TP10 block  chat mode names its own next step (authorize --activate), not signature's", run: () => check(
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
) };

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

yield { id: "TPC012", name: "TP11 block  chat mode's own next step still names authorize --activate given a relative path", run: () => check(
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
) };

// ---- ADR-0059 Decision 4: a denial with NO route says why, instead of printing nothing --
// Moved here from lib/human-guard-override.test.mjs, which hosted it only because this suite
// is TP-2 protected and no maintenance window was open when NOVA-HGOSIG-ROUTE-1 landed it.
// It spawns this guard end to end, so it belongs beside the guard it describes; the library
// suite keeps the renderer's own direct unit cases.
//
// The exact case observed in this repository: every write under `plugins/pipeline-core/**` is
// classified as Pipeline-author repair, which needs an explicit author source root the guard
// cannot choose on the human's behalf -- so recordHumanGuardDenial() answers
// `author-repair-required`, the denial never reaches `planned`, and the refusal used to print
// no route AND no hint that one had been attempted, byte-identical to a rule with no override
// at all. TP12 pins the reason; TP13 is its differential half -- same fixture, same store,
// same committed mode, only the path differs -- because without it "reported a reason" could
// equally mean "this fixture never plans anything", and TP12 would pass for the wrong reason.
const ROUTE_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-route-"));
mkdirSync(join(ROUTE_DIR, ".claude"), { recursive: true });
writeFileSync(
  join(ROUTE_DIR, ".claude", "guard-config.json"),
  JSON.stringify({
    protectedTestPaths: [
      { id: "TP-X", pattern: "plugins/pipeline-core/hooks/.*\\.test\\.mjs$", reason: "fixture: a Pipeline-source test path" },
      { id: "TP-Y", pattern: "harness/scripts/verify\\.mjs$", reason: "fixture: an ordinary protected path" },
    ],
  }),
);
// Committed, and with a real HEAD: the override's repository observation degrades to "no
// route offered" without one, which would make TP13 vacuous and TP12 meaningless.
writeFileSync(join(ROUTE_DIR, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
gitCommitAll(ROUTE_DIR);

yield { id: "TPC013", name: "TP12 block  a route-less denial (Pipeline source) names the planner status it actually got", run: () => check(
  "TP12 block  a route-less denial (Pipeline source) names the planner status it actually got",
  "Write",
  "plugins/pipeline-core/hooks/probe.test.mjs",
  BLOCK,
  {
    projectDir: ROUTE_DIR,
    stderrIncludes: [
      "Rule ID: TP-X",
      "No human override route is offered for this exact edit; the guard attempted to plan one.",
      "Reason: the override planner returned status=author-repair-required (",
    ],
    // A route for a Pipeline-source path would mean the guard picked an author source root
    // itself; the reason is offered INSTEAD of a route, never alongside one.
    stderrExcludes: ["--request-sha256"],
    extraInput: { content: "x\n" },
  },
) };

yield { id: "TPC014", name: "TP13 block  the same fixture still offers a real route for an ordinary protected path", run: () => check(
  "TP13 block  the same fixture still offers a real route for an ordinary protected path",
  "Write",
  "harness/scripts/verify.mjs",
  BLOCK,
  {
    projectDir: ROUTE_DIR,
    stderrIncludes: ["Rule ID: TP-Y", "Human override available for this exact edit"],
    stderrExcludes: ["No human override route is offered"],
    stderrMatches: [/--request-sha256 [a-f0-9]{64}\b/u],
    extraInput: { content: "x\n" },
  },
) };


// ---- WP-B2-1: Briefed test-change authorization and refusal differentiation --------
yield { id: "TPC015", name: "TP15 block  test path refusal clearly states route-available-via-briefed-authorization", run: () => check(
  "TP15 block  test path refusal clearly states route-available-via-briefed-authorization",
  "Edit",
  "plugins/pipeline-core/hooks/guard-git.test.mjs",
  BLOCK,
  {
    projectDir: CFG_DIR,
    stderrIncludes: ["route-available-via-briefed-authorization"],
    extraInput: { old_string: "a", new_string: "b" },
  },
) };

yield { id: "TPC016", name: "TP16 block  non-test path refusal clearly states no-route-for-this-target", run: () => check(
  "TP16 block  non-test path refusal clearly states no-route-for-this-target",
  "Write",
  "harness/scripts/verify.mjs",
  BLOCK,
  {
    projectDir: ROUTE_DIR,
    stderrIncludes: ["no-route-for-this-target"],
    extraInput: { content: "x\n" },
  },
) };

const BRIEFED_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-briefed-"));
mkdirSync(join(BRIEFED_DIR, ".claude"), { recursive: true });
writeFileSync(
  join(BRIEFED_DIR, ".claude", "guard-config.json"),
  JSON.stringify({
    protectedTestPaths: [
      { id: "TP-1", pattern: "plugins/pipeline-core/hooks/guard-git\\.test\\.mjs$", reason: "test suite" },
    ],
  }),
);
// The briefed grant must use the repository's committed human approval mode.
writeFileSync(join(BRIEFED_DIR, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
gitCommitAll(BRIEFED_DIR);

const testTarget = "plugins/pipeline-core/hooks/guard-git.test.mjs";
const matchingDigest = "c".repeat(64);
const mismatchDigest = "d".repeat(64);

createBriefedTestChangeAuthorization({
  rootDir: BRIEFED_DIR,
  targetPath: testTarget,
  briefingDigest: matchingDigest,
  expiry: Date.now() + 600000,
  mode: "chat",
  reason: "briefed test change for TP17",
});

yield { id: "TPC017", name: "TP17 allow  briefed test-change authorization admits exact target with matching digest", run: () => check(
  "TP17 allow  briefed test-change authorization admits exact target with matching digest",
  "Edit",
  testTarget,
  ALLOW,
  {
    projectDir: BRIEFED_DIR,
    env: { PIPELINE_BRIEFING_DIGEST: matchingDigest },
    extraInput: { old_string: "a", new_string: "b" },
  },
) };

yield { id: "TPC018", name: "TP18 block  briefed test-change authorization blocks when presenting mismatching digest", run: () => check(
  "TP18 block  briefed test-change authorization blocks when presenting mismatching digest",
  "Edit",
  testTarget,
  BLOCK,
  {
    projectDir: BRIEFED_DIR,
    env: { PIPELINE_BRIEFING_DIGEST: mismatchDigest },
    stderrIncludes: ["route-available-via-briefed-authorization"],
    extraInput: { old_string: "a", new_string: "b" },
  },
) };

// ---- T84 (TR-L): ONE protection decision per file, whatever the hunk, index state or spelling --
// A real git repository with the guard source committed, enrolled like every fixture above, and
// ABSOLUTE file_path values built from the fixture root (the harness contract; TP01-TP09 use a
// synthetic "D:/repo/..." placeholder that a state-dependent mechanism would never see). The
// project config is absent on purpose: the verdict comes from the shipped baseline alone.
// `File:` is left out of the compared lines because it echoes the spelling under test.
const T84_REL = "plugins/pipeline-core/lib/guard/sanctioned-args-onboarding.mjs";
const T84_V0 = "export const ONBOARDING = 1;\nexport const SECOND = 2;\n";
const T84_DIR = mkdtempSync(join(tmpdir(), "guard-testpath-t84-"));
mkdirSync(join(T84_DIR, "plugins", "pipeline-core", "lib", "guard"), { recursive: true });
writeFileSync(join(T84_DIR, T84_REL), T84_V0);
writeFileSync(join(T84_DIR, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
gitCommitAll(T84_DIR);
const T84_ABS = join(T84_DIR, T84_REL);
const T84_STABLE = /^(BLOCKED \(guard-testpath|Rule ID:|Briefed test-change route:|Clearance:)/u;
function t84Decision(toolName, filePath, extraInput) {
  const { code, stderr } = runGuard(toolName, filePath, T84_DIR, extraInput);
  return { code, decision: stderr.split("\n").filter((line) => T84_STABLE.test(line)) };
}
function t84Reference(label) {
  const reference = t84Decision("Edit", T84_ABS, { old_string: "ONBOARDING = 1", new_string: "ONBOARDING = 11" });
  assert.equal(reference.code, 2, `${label}: the shipped baseline did not refuse the guard source at all (exit ${reference.code})`);
  assert.ok(reference.decision.some((line) => line === "Rule ID: PB-GUARD-HOOKS"),
    `${label}: expected Rule ID: PB-GUARD-HOOKS, got ${JSON.stringify(reference.decision)}`);
  return reference;
}

const T84_HUNKS_NAME = "TP19 block  T84 one decision per file across hunks (two hunks, the revert of a hunk, a Write of the committed bytes)";
yield { id: "TPC019", name: T84_HUNKS_NAME, run: () => {
  const reference = t84Reference("TP19");
  const calls = [
    ["a second hunk", "Edit", { old_string: "SECOND = 2", new_string: "SECOND = 22" }],
    ["the revert of the first hunk", "Edit", { old_string: "ONBOARDING = 11", new_string: "ONBOARDING = 1" }],
    ["a Write of the committed bytes", "Write", { content: T84_V0 }],
  ];
  for (const [label, toolName, input] of calls) {
    assert.deepEqual(t84Decision(toolName, T84_ABS, input), reference, `T84: ${label} was decided differently from the first hunk of the same file`);
  }
  console.log(`PASS  ${T84_HUNKS_NAME}`);
} };

const T84_STATE_NAME = "TP20 block  T84 the decision for the file does not move when it is dirtied, staged, or staged and edited again";
yield { id: "TPC020", name: T84_STATE_NAME, run: () => {
  const reference = t84Reference("TP20");
  const hunk = { old_string: "SECOND = 2", new_string: "SECOND = 22" };
  assert.deepEqual(t84Decision("Edit", T84_ABS, hunk), reference, "T84: clean file");
  writeFileSync(T84_ABS, "export const ONBOARDING = 1;\nexport const SECOND = 22;\n");
  assert.deepEqual(t84Decision("Edit", T84_ABS, hunk), reference, "T84: the file is dirty in the working tree");
  execFileSync("git", ["add", "--", T84_REL], { cwd: T84_DIR });
  assert.deepEqual(t84Decision("Edit", T84_ABS, hunk), reference, "T84: the same change is staged");
  writeFileSync(T84_ABS, "export const ONBOARDING = 1;\nexport const SECOND = 222;\n");
  assert.deepEqual(
    t84Decision("Edit", T84_ABS, { old_string: "SECOND = 222", new_string: "SECOND = 2" }),
    reference,
    "T84: the file is staged and edited again, and the hunk is a revert towards the committed bytes",
  );
  console.log(`PASS  ${T84_STATE_NAME}`);
} };

const T84_SPELLING_NAME = "TP21 block  T84 the decision for the file does not depend on how its path is spelled";
yield { id: "TPC021", name: T84_SPELLING_NAME, run: () => {
  const reference = t84Reference("TP21");
  const hunk = { old_string: "SECOND = 2", new_string: "SECOND = 22" };
  const spellings = [
    ["relative", T84_REL],
    ["dot-relative", `./${T84_REL}`],
    ["absolute with backslashes", T84_ABS.split("/").join("\\")],
  ];
  for (const [label, spelling] of spellings) {
    assert.deepEqual(t84Decision("Edit", spelling, hunk), reference, `T84: the ${label} spelling of the same file was decided differently from the absolute one`);
  }
  console.log(`PASS  ${T84_SPELLING_NAME}`);
} };

for (const dir of [EMPTY_DIR, CFG_DIR, BROKEN_DIR, CFG_ID_DIR, GMW_DIR, GMW_SEL_DIR, MODE_CHAT_DIR, ROUTE_DIR, BRIEFED_DIR, T84_DIR]) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp cleanup is best-effort */
  }
}
}

const iterator = orderedCases();
const names = [
  "TP01 block  Edit on configured protected test file",
  "TP02 block  Edit on a shipped baseline guard hook",
  "TP03 block  Write on configured protected test file (Write tool, not just Edit)",
  "TP04 block  path with backslashes (Windows) still matches (normalization)",
  "TP05 block  missing project config still keeps the shipped minimum active",
  "TP06 block  broken JSON is baseline-only and cannot remove static protection",
  "TP07 allow  no file_path at all",
  "TP08 block  explicit config id is used in the block message",
  "TP09 real armed GMW window scoped to TP-1 lifts the matching Edit",
  "TP14 block  a real armed window scoped to TP-1 does NOT lift a different in-scope-file TP-2 rule",
  "TP10 block  chat mode names its own next step (authorize --activate), not signature's",
  "TP11 block  chat mode's own next step still names authorize --activate given a relative path",
  "TP12 block  a route-less denial (Pipeline source) names the planner status it actually got",
  "TP13 block  the same fixture still offers a real route for an ordinary protected path",
  "TP15 block  test path refusal clearly states route-available-via-briefed-authorization",
  "TP16 block  non-test path refusal clearly states no-route-for-this-target",
  "TP17 allow  briefed test-change authorization admits exact target with matching digest",
  "TP18 block  briefed test-change authorization blocks when presenting mismatching digest",
  "TP19 block  T84 one decision per file across hunks (two hunks, the revert of a hunk, a Write of the committed bytes)",
  "TP20 block  T84 the decision for the file does not move when it is dirtied, staged, or staged and edited again",
  "TP21 block  T84 the decision for the file does not depend on how its path is spelled"
];
const cases = names.map((name, index) => {
  const id = `TPC${String(index + 1).padStart(3, "0")}`;
  return { id, name, run: async () => {
    const step = await iterator.next();
    if (step.done || step.value.id !== id) throw new Error(`case sequence mismatch at ${id}`);
    let callbackError;
    try { await step.value.run(); } catch (error) { callbackError = error; }
    if (index === names.length - 1) {
      const tail = await iterator.next();
      if (!tail.done && callbackError === undefined) callbackError = new Error("case generator did not finish after final callback");
    }
    if (callbackError !== undefined) throw callbackError;
  } };
});
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
const completionMaxBytes = Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536");
registerTestCaseCompletion({ cases, fd: completionFd, maxBytes: completionMaxBytes });
