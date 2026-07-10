#!/usr/bin/env node
/**
 * stop-suggest.test.mjs — test suite for the Stop-hook next-step suggester
 * (stop-suggest.mjs, task AP1-P5 "OIN").
 *
 * Coverage contract (briefing DoD case classes):
 *   - no manifest (loadManifestSafe -> null, absent file) -> silent
 *   - manifest invalid (loadManifestSafe -> null, schema/semantic violation) -> silent
 *   - no state file -> silent
 *   - no activeFeature -> silent
 *   - malformed state JSON -> silent
 *   - mid-phase -> correct next suggestion (exact English message asserted)
 *   - disabled phase skipped (never appears as "next")
 *   - condition-false phase (has_ui:false) skipped
 *   - has_ui:true includes ui-design
 *   - last phase -> completion message
 *   - planApproved:false entering implementation -> mentions missing approval
 *   - unknown mode string -> no crash
 *   - subprocess smoke (real script spawn, fixture cwd, exit 0 + JSON shape)
 *
 * Test strategy (mirrors staleness-check.test.mjs): the pure resolver functions
 * (`loadStateSafe`, `resolveSuggestion`, `decideOutput`) are imported directly and exercised
 * with plain constructed manifest/state objects (or, for the file-reading paths, tiny
 * fixture files) - no real repo state is read except in the two "real manifest.mjs
 * integration" cases (absent/invalid manifest via the real `loadManifestSafe`) and the final
 * subprocess smoke. `run()` / the full CLI is additionally verified by spawning the real
 * script as a subprocess with `CLAUDE_PROJECT_DIR` pointed at a fixture repo root (existing
 * repo convention, see guard-git.test.mjs / staleness-check.test.mjs).
 *
 * Run:   node plugins/pipeline-core/hooks/stop-suggest.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadManifestSafe } from "../lib/manifest.mjs";
import {
  PHASE_GATE_MAP,
  loadStateSafe,
  resolveSuggestion,
  decideOutput,
  resolveSessionIdFromInput,
  resolveStopHookActiveFromInput,
  usageFilePath,
  loadUsageSafe,
  resolveTotalTokensFromUsage,
  resolveUsedPctFromUsage,
  contextTier,
  absoluteContextTier,
  effectiveContextTier,
  buildContextMessage,
  resolveUpdatedAtMs,
  isUsageStale,
  buildStaleMessage,
  USAGE_STALE_THRESHOLD_MS,
  markerPath,
  loadMarkerSafe,
  writeMarkerSafe,
  decideCombinedOutput,
  applyPersistenceGuard,
  CONTEXT_REARM_STEP_TOKENS,
} from "./stop-suggest.mjs";

const SCRIPT = fileURLToPath(new URL("./stop-suggest.mjs", import.meta.url));

let pass = 0;
const failures = [];
function ok(id, condition, detail) {
  if (condition) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}${detail !== undefined ? `: ${detail}` : ""}`);
    console.log(`FAIL  ${id}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

const WORKDIR = mkdtempSync(join(tmpdir(), "stop-suggest-test-"));
function fixtureDir(name) {
  const dir = join(WORKDIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2));
}
function writeRaw(path, text) {
  writeFileSync(path, text);
}

// ---- fixture manifest builder (plain JS objects, bypasses the YAML/schema layer on
// purpose - manifest.mjs's own suite already covers that layer; here we only need
// activePhases()/gateConfig()-shaped input) --------------------------------------------------
function manifestFixture({ uiEnabled = true, hasUi = false, secScanEnabled = true, secMode = "blocking", devPlanMode = "blocking", pushMode = "blocking", profile = "full-sdlc" } = {}) {
  return {
    schema: "pipeline.manifest.v0",
    phases: [
      { name: "design", enabled: true },
      { name: "implementation", enabled: true },
      { name: "security-scan", enabled: secScanEnabled },
      { name: "ui-design", enabled: uiEnabled, condition: "has_ui" },
    ],
    gates: {
      "dev-plan": { mode: devPlanMode, type: "human" },
      push: { mode: pushMode, type: "human" },
      security: { mode: secMode, type: "automated" },
    },
    profiles: {
      active: profile,
      [profile]: { phases: ["design", "implementation", "security-scan", "ui-design"] },
    },
    flags: { has_ui: hasUi },
  };
}

function stateFixture(phase, extra = {}) {
  return { schema: "pipeline.state.v0", activeFeature: { id: "F1", phase, ...extra } };
}

// ======================================================================================
// PHASE_GATE_MAP sanity
// ======================================================================================
ok("PHASE_GATE_MAP maps implementation -> dev-plan gate, no command", PHASE_GATE_MAP.implementation.gate === "dev-plan" && PHASE_GATE_MAP.implementation.command === null);
ok(
  "PHASE_GATE_MAP maps security-scan -> security gate + scan command",
  PHASE_GATE_MAP["security-scan"].gate === "security" && PHASE_GATE_MAP["security-scan"].command === "node harness/scripts/security-scan.mjs",
);

// ======================================================================================
// no manifest / manifest invalid -> silent (real manifest.mjs integration)
// ======================================================================================
{
  const rootDir = fixtureDir("manifest-absent");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  // .claude/pipeline.yaml intentionally NOT written.
  const manifest = loadManifestSafe(rootDir);
  ok("loadManifestSafe returns null when the manifest file is absent", manifest === null);
  const { stdout } = decideOutput(manifest, stateFixture("implementation"));
  ok("decideOutput: no manifest -> silent (empty stdout)", stdout === "", stdout);
}

{
  const rootDir = fixtureDir("manifest-invalid");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeRaw(join(rootDir, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\nphases:\n  - name: design\n    enabled: not-a-boolean\n");
  const manifest = loadManifestSafe(rootDir);
  ok("loadManifestSafe returns null for a schema-invalid manifest", manifest === null);
  const { stdout } = decideOutput(manifest, stateFixture("implementation"));
  ok("decideOutput: invalid manifest -> silent (empty stdout)", stdout === "", stdout);
}

// ======================================================================================
// no state file / malformed state JSON -> silent
// ======================================================================================
{
  const state = loadStateSafe(join(WORKDIR, "does-not-exist", "pipeline-state.json"));
  ok("loadStateSafe returns null when the state file is missing", state === null);
  const { stdout } = decideOutput(manifestFixture(), state);
  ok("decideOutput: no state file -> silent (empty stdout)", stdout === "", stdout);
}

{
  const dir = fixtureDir("state-malformed");
  const statePath = join(dir, "pipeline-state.json");
  writeRaw(statePath, "{ this is not valid JSON ][");
  const state = loadStateSafe(statePath);
  ok("loadStateSafe returns null on malformed JSON", state === null);
  const { stdout } = decideOutput(manifestFixture(), state);
  ok("decideOutput: malformed state -> silent (empty stdout)", stdout === "", stdout);
}

// ======================================================================================
// no activeFeature -> silent
// ======================================================================================
{
  const state = { schema: "pipeline.state.v0" };
  const message = resolveSuggestion(manifestFixture(), state);
  ok("resolveSuggestion: no activeFeature -> null (silent)", message === null, message);
}

{
  const message = resolveSuggestion(manifestFixture(), { schema: "pipeline.state.v0", activeFeature: { id: "F1" } });
  ok("resolveSuggestion: activeFeature without phase -> null (silent)", message === null, message);
}

// ======================================================================================
// unknown / inactive phase -> silent
// ======================================================================================
{
  const message = resolveSuggestion(manifestFixture(), stateFixture("does-not-exist"));
  ok("resolveSuggestion: phase not in active-phase list -> null (silent)", message === null, message);
}

// ======================================================================================
// mid-phase -> correct next suggestion (exact English message)
// ======================================================================================
{
  const manifest = manifestFixture({ secMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("implementation"));
  const expected = 'Pipeline: phase "implementation" active → next step: "security-scan" (Gate: security, mode: blocking). Check: node harness/scripts/security-scan.mjs';
  ok("resolveSuggestion: implementation -> security-scan exact English message", message === expected, message);
}

// ======================================================================================
// disabled phase skipped (security-scan disabled -> never the "next" phase)
// ======================================================================================
{
  const manifest = manifestFixture({ secScanEnabled: false, hasUi: false });
  const message = resolveSuggestion(manifest, stateFixture("implementation"));
  ok("resolveSuggestion: disabled security-scan is skipped -> no mention of it", message !== null && !message.includes("security-scan"), message);
  ok("resolveSuggestion: disabled security-scan skipped -> implementation becomes the last active phase (completion message)", message !== null && message.includes("push gate"), message);
}

// ======================================================================================
// condition-false phase (has_ui:false) skipped
// ======================================================================================
{
  const manifest = manifestFixture({ hasUi: false });
  const message = resolveSuggestion(manifest, stateFixture("security-scan"));
  ok("resolveSuggestion: has_ui false -> ui-design skipped, security-scan is the last active phase", message !== null && message.includes("push gate") && !message.includes("ui-design"), message);
}

// ======================================================================================
// has_ui:true includes ui-design
// ======================================================================================
{
  const manifest = manifestFixture({ hasUi: true });
  const message = resolveSuggestion(manifest, stateFixture("security-scan"));
  ok("resolveSuggestion: has_ui true -> next phase after security-scan is ui-design", message === 'Pipeline: phase "security-scan" active → next step: "ui-design".', message);
}

// ======================================================================================
// last phase -> completion message
// ======================================================================================
{
  const manifest = manifestFixture({ hasUi: false, secScanEnabled: true, pushMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("security-scan"));
  const expected = 'Pipeline: all phases of profile "full-sdlc" complete — push gate (mode: blocking) is the last step.';
  ok("resolveSuggestion: last active phase -> exact completion message", message === expected, message);
}

// ======================================================================================
// planApproved:false entering implementation -> mentions missing approval
// ======================================================================================
{
  const manifest = manifestFixture({ devPlanMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("design", { planApproved: false }));
  ok("resolveSuggestion: planApproved false -> message mentions the missing approval", message !== null && message.includes("planApproved") && message.includes("missing"), message);
  ok("resolveSuggestion: planApproved false -> gate clause names dev-plan", message.includes("Gate: dev-plan"), message);
}

{
  const manifest = manifestFixture({ devPlanMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("design", { planApproved: true }));
  ok("resolveSuggestion: planApproved true -> no missing-approval hint", message !== null && !message.includes("missing"), message);
}

{
  // planApproved entirely absent (not just false) must be treated the same as false.
  const manifest = manifestFixture({ devPlanMode: "blocking" });
  const message = resolveSuggestion(manifest, stateFixture("design"));
  ok("resolveSuggestion: planApproved absent -> treated as not approved (mentions missing approval)", message.includes("missing"), message);
}

// ======================================================================================
// unknown mode string -> no crash
// ======================================================================================
{
  const manifest = manifestFixture({ secMode: "supervised" }); // not in the blocking|warn|off enum
  let message = null;
  let threw = false;
  try {
    message = resolveSuggestion(manifest, stateFixture("implementation"));
  } catch {
    threw = true;
  }
  ok("resolveSuggestion: unrecognized gate mode string does not throw", threw === false);
  ok("resolveSuggestion: unrecognized gate mode string is echoed verbatim", message !== null && message.includes("mode: supervised"), message);
}

{
  // Gate referenced by PHASE_GATE_MAP but entirely absent from manifest.gates.
  const manifest = manifestFixture();
  delete manifest.gates.security;
  let threw = false;
  let message = null;
  try {
    message = resolveSuggestion(manifest, stateFixture("implementation"));
  } catch {
    threw = true;
  }
  ok("resolveSuggestion: gate missing from manifest.gates does not throw", threw === false);
  ok("resolveSuggestion: gate missing from manifest.gates falls back to 'unknown' mode", message !== null && message.includes("mode: unknown"), message);
}

// ======================================================================================
// subprocess smoke (real script spawn, fixture repo root, exit 0 + JSON shape)
// ======================================================================================
function runCli(fakeProjectDir) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: fakeProjectDir },
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

{
  const rootDir = fixtureDir("smoke-suggestion");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeRaw(
    join(rootDir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "",
    ].join("\n"),
  );
  writeJson(join(rootDir, ".claude", "pipeline-state.json"), stateFixture("implementation"));

  const { status, stdout, stderr } = runCli(rootDir);
  ok("CLI smoke (suggestion case): exit 0", status === 0, `status=${status} stderr=${stderr}`);
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    /* leave null, asserted below */
  }
  ok("CLI smoke (suggestion case): stdout is valid JSON", parsed !== null, stdout);
  ok("CLI smoke (suggestion case): systemMessage present", typeof parsed?.systemMessage === "string" && parsed.systemMessage.length > 0, stdout);
  ok("CLI smoke (suggestion case): systemMessage names security-scan", parsed?.systemMessage?.includes("security-scan") === true, stdout);
  ok("CLI smoke (suggestion case): hookSpecificOutput.hookEventName is Stop", parsed?.hookSpecificOutput?.hookEventName === "Stop");
  ok(
    "CLI smoke (suggestion case): additionalContext mirrors systemMessage",
    parsed?.hookSpecificOutput?.additionalContext === parsed?.systemMessage,
  );
}

{
  // No manifest at all in this fixture root -> silent CLI, still exit 0.
  const rootDir = fixtureDir("smoke-silent");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  const { status, stdout, stderr } = runCli(rootDir);
  ok("CLI smoke (no manifest): exit 0", status === 0, `status=${status} stderr=${stderr}`);
  ok("CLI smoke (no manifest): empty stdout (silent)", stdout === "", stdout);
}

// ==========================================================================================
// G-B EXTENSION (`.claude/plans/2026-07-07-retro-speed.md` package G-B): context-budget
// staged mechanics + suggestion dedup + block-tier nag-cap. Everything above this marker is
// the ORIGINAL pre-G-B suite (unmodified) -- the 35 cases must all still pass, proving the
// phase-suggestion contract stayed byte-compatible.
// ==========================================================================================

// ---- resolveSessionIdFromInput (pure) ---------------------------------------------------
ok("resolveSessionIdFromInput: valid {session_id} -> the string", resolveSessionIdFromInput({ session_id: "sess-1" }) === "sess-1");
ok("resolveSessionIdFromInput: null input -> null", resolveSessionIdFromInput(null) === null);
ok("resolveSessionIdFromInput: object without session_id -> null", resolveSessionIdFromInput({}) === null);
ok("resolveSessionIdFromInput: empty-string session_id -> null", resolveSessionIdFromInput({ session_id: "" }) === null);
ok("resolveSessionIdFromInput: non-string session_id -> null", resolveSessionIdFromInput({ session_id: 123 }) === null);

// ---- contextTier boundaries (pure) -------------------------------------------------------
// P2 fix (design decision 2026-07-08): contextTier now tiers on usedPct (0-100), not on
// absolute totalTokens -- the boundaries below are chosen so a 200k window behaves BYTE-
// IDENTICALLY to the old absolute thresholds (50% = 100k, 75% = 150k, 85% = 170k).
ok('contextTier: null -> "none"', contextTier(null) === "none");
ok('contextTier: non-finite (NaN) -> "none"', contextTier(NaN) === "none");
ok('contextTier: 49 -> "none"', contextTier(49) === "none");
ok('contextTier: 50 -> "warn" (boundary; 200k-equivalent: 100k)', contextTier(50) === "warn");
ok('contextTier: 74 -> "warn"', contextTier(74) === "warn");
ok('contextTier: 75 -> "overdue" (boundary; 200k-equivalent: 150k)', contextTier(75) === "overdue");
ok('contextTier: 84 -> "overdue"', contextTier(84) === "overdue");
ok('contextTier: 85 -> "block" (boundary; 200k-equivalent: 170k, NEVER below this)', contextTier(85) === "block");
ok('contextTier: 100 -> "block"', contextTier(100) === "block");
// 1M-window correctness: 34% used on a 1M window is 340k real tokens -- old absolute logic
// would have hit "block" (>=170k) immediately; percentage-based tiering correctly stays "none".
ok('contextTier: 1M-window at 34% used -> "none" (NO spurious block; 340k real tokens)', contextTier(34) === "none");

// ---- absoluteContextTier boundaries (pure, Elephant decision 2026-07-10) ----------------
// Window-INDEPENDENT soft-nudge ladder, layered beside (NOT replacing) the percent-based
// contextTier above -- EL-04's own boundary tests above stay untouched/unmodified.
ok('absoluteContextTier: null -> "none"', absoluteContextTier(null) === "none");
ok('absoluteContextTier: non-finite (NaN) -> "none"', absoluteContextTier(NaN) === "none");
ok('absoluteContextTier: 0 -> "none"', absoluteContextTier(0) === "none");
ok('absoluteContextTier: 179999 -> "none"', absoluteContextTier(179999) === "none");
ok('absoluteContextTier: 180000 -> "warn" (boundary)', absoluteContextTier(180000) === "warn");
ok('absoluteContextTier: 199999 -> "warn"', absoluteContextTier(199999) === "warn");
ok('absoluteContextTier: 200000 -> "overdue" (boundary)', absoluteContextTier(200000) === "overdue");
ok('absoluteContextTier: 249999 -> "overdue"', absoluteContextTier(249999) === "overdue");
ok('absoluteContextTier: 250000 -> "overdue" ("strongest soft" floor, same tier)', absoluteContextTier(250000) === "overdue");
ok('absoluteContextTier: 10,000,000 -> STILL "overdue", NEVER "block"', absoluteContextTier(10_000_000) === "overdue");

// ---- effectiveContextTier: more-severe combination (pure, Elephant decision 2026-07-10) -
{
  // Percent says "block" (usedPct 85), absolute says "none" (totalTokens 50000, small window)
  // -> effective stays "block" (percent wins, EL-04's hard brake untouched).
  ok(
    "effectiveContextTier: percent block + absolute none -> block (percent wins)",
    effectiveContextTier(85, 50000) === "block",
  );
}
{
  // Percent says "none" (usedPct 10, huge window), absolute says "overdue" (totalTokens 340000)
  // -> effective becomes "overdue" (absolute adds urgency percent alone would miss) but NEVER
  // "block" -- this is the EL-04-preserving case the resolved design exists for.
  ok(
    "effectiveContextTier: percent none (10% of 1M) + absolute overdue (340k) -> overdue, NOT block",
    effectiveContextTier(10, 340000) === "overdue",
  );
}
{
  // Percent says "warn" (usedPct 60), absolute says "overdue" (totalTokens 340000) -> more
  // severe of the two ("overdue" outranks "warn") wins.
  ok(
    "effectiveContextTier: percent warn + absolute overdue -> overdue (more severe wins)",
    effectiveContextTier(60, 340000) === "overdue",
  );
}
{
  // Percent unresolvable (null usedPct, e.g. no usage snapshot) + absolute warn (190000) ->
  // absolute alone still surfaces a nudge.
  ok(
    "effectiveContextTier: percent null (contextTier -> none) + absolute warn (190k) -> warn",
    effectiveContextTier(null, 190000) === "warn",
  );
}
{
  // Both null/absent -> none.
  ok("effectiveContextTier: both null -> none", effectiveContextTier(null, null) === "none");
}
{
  // Absolute alone can NEVER push the combination into "block", however large totalTokens is,
  // as long as percent stays below its own 85% floor.
  ok(
    "effectiveContextTier: percent overdue (usedPct 80) + absolute at 10M tokens -> STILL overdue, never block",
    effectiveContextTier(80, 10_000_000) === "overdue",
  );
}

// ---- buildContextMessage wording (pure) --------------------------------------------------
ok('buildContextMessage: tier "none" -> null', buildContextMessage("none", 50000) === null);
{
  const msg = buildContextMessage("warn", 120000);
  ok('buildContextMessage: tier "warn" mentions handover window + token count', msg.includes("handover window") && msg.includes("120k"), msg);
  ok(
    "buildContextMessage: tier \"warn\" carries the copyable /compact command (Elephant decision 2026-07-10)",
    msg.includes("/compact "),
    msg,
  );
}
{
  const msg = buildContextMessage("overdue", 155000);
  ok('buildContextMessage: tier "overdue" mentions OVERDUE + token count', msg.includes("OVERDUE") && msg.includes("155k"), msg);
  ok(
    "buildContextMessage: tier \"overdue\" carries the copyable /compact command (Elephant decision 2026-07-10)",
    msg.includes("/compact "),
    msg,
  );
}
{
  const msg = buildContextMessage("block", 175000);
  ok('buildContextMessage: tier "block" mentions EMERGENCY BRAKE + token count', msg.includes("EMERGENCY BRAKE") && msg.includes("175k"), msg);
  ok(
    "buildContextMessage: tier \"block\" ALSO carries the copyable /compact command (appended unconditionally for every non-none tier)",
    msg.includes("/compact "),
    msg,
  );
}

// ---- usageFilePath / loadUsageSafe / resolveTotalTokensFromUsage ------------------------
{
  const rootDir = fixtureDir("gb-usage-path");
  ok(
    "usageFilePath: builds .claude/.usage-<session_id>.json under rootDir",
    usageFilePath(rootDir, "sess-1") === join(rootDir, ".claude", ".usage-sess-1.json"),
  );
}
{
  const usage = loadUsageSafe(join(WORKDIR, "gb-usage-absent", ".claude", ".usage-none.json"));
  ok("loadUsageSafe: missing file -> null", usage === null);
}
{
  const dir = fixtureDir("gb-usage-malformed");
  const p = join(dir, "usage.json");
  writeRaw(p, "{ not json ][");
  ok("loadUsageSafe: malformed JSON -> null", loadUsageSafe(p) === null);
}
{
  const dir = fixtureDir("gb-usage-valid");
  const p = join(dir, "usage.json");
  writeJson(p, { usedPct: 62, totalTokens: 124000, updatedAt: "2026-07-07T00:00:00.000Z" });
  const usage = loadUsageSafe(p);
  ok("loadUsageSafe: valid JSON -> parsed object", usage !== null && usage.totalTokens === 124000, JSON.stringify(usage));
}
ok("resolveTotalTokensFromUsage: valid numeric totalTokens -> the number", resolveTotalTokensFromUsage({ totalTokens: 42000 }) === 42000);
ok("resolveTotalTokensFromUsage: missing totalTokens -> null", resolveTotalTokensFromUsage({}) === null);
ok("resolveTotalTokensFromUsage: non-numeric totalTokens -> null", resolveTotalTokensFromUsage({ totalTokens: "lots" }) === null);
ok("resolveTotalTokensFromUsage: null usage -> null", resolveTotalTokensFromUsage(null) === null);

// ---- resolveUsedPctFromUsage (pure, P2 fix) ----------------------------------------------
ok("resolveUsedPctFromUsage: valid numeric usedPct -> the number", resolveUsedPctFromUsage({ usedPct: 42 }) === 42);
ok("resolveUsedPctFromUsage: missing usedPct -> null", resolveUsedPctFromUsage({}) === null);
ok("resolveUsedPctFromUsage: non-numeric usedPct -> null", resolveUsedPctFromUsage({ usedPct: "lots" }) === null);
ok("resolveUsedPctFromUsage: null usage -> null", resolveUsedPctFromUsage(null) === null);
ok("resolveUsedPctFromUsage: out-of-range usedPct (150) -> null", resolveUsedPctFromUsage({ usedPct: 150 }) === null);
ok("resolveUsedPctFromUsage: negative usedPct -> null", resolveUsedPctFromUsage({ usedPct: -5 }) === null);
ok("resolveUsedPctFromUsage: boundary 0 -> 0", resolveUsedPctFromUsage({ usedPct: 0 }) === 0);
ok("resolveUsedPctFromUsage: boundary 100 -> 100", resolveUsedPctFromUsage({ usedPct: 100 }) === 100);

// ---- markerPath / loadMarkerSafe / writeMarkerSafe --------------------------------------
{
  const rootDir = fixtureDir("gb-marker-path");
  ok(
    "markerPath: builds .claude/.stop-suggest-<session_id>.json under rootDir",
    markerPath(rootDir, "sess-1") === join(rootDir, ".claude", ".stop-suggest-sess-1.json"),
  );
}
{
  const marker = loadMarkerSafe(join(WORKDIR, "gb-marker-absent", ".claude", ".stop-suggest-none.json"));
  ok("loadMarkerSafe: missing file -> null", marker === null);
}
{
  const dir = fixtureDir("gb-marker-roundtrip");
  const p = join(dir, ".claude", ".stop-suggest-sess-1.json");
  const wrote = writeMarkerSafe(p, { lastFingerprint: "foo::warn", consecutiveBlocks: 1 });
  ok("writeMarkerSafe: reports success", wrote === true);
  const readBack = loadMarkerSafe(p);
  ok(
    "writeMarkerSafe + loadMarkerSafe: round-trips the marker shape",
    readBack !== null && readBack.lastFingerprint === "foo::warn" && readBack.consecutiveBlocks === 1,
    JSON.stringify(readBack),
  );
}
{
  // ".claude" exists as a FILE (not a directory) -> writeFileSync must fail (ENOTDIR) ->
  // writeMarkerSafe fails closed (returns false), never throws.
  const dir = fixtureDir("gb-marker-unwritable");
  writeRaw(join(dir, ".claude"), "not a directory");
  const p = join(dir, ".claude", ".stop-suggest-sess-1.json");
  let threw = false;
  let wrote = null;
  try {
    wrote = writeMarkerSafe(p, { lastFingerprint: "x", consecutiveBlocks: 0 });
  } catch {
    threw = true;
  }
  ok("writeMarkerSafe: unwritable target never throws", threw === false);
  ok("writeMarkerSafe: unwritable target reports failure", wrote === false);
}

// ---- decideCombinedOutput (pure) -- the dedup + nag-cap decision core -------------------
{
  const { stdout, marker } = decideCombinedOutput({ phaseMessage: null, tier: "none", contextMessage: null, priorMarker: null });
  ok('decideCombinedOutput: nothing to say, no prior marker -> silent, marker null', stdout === "" && marker === null);
}
{
  const { stdout, marker } = decideCombinedOutput({
    phaseMessage: null,
    tier: "none",
    contextMessage: null,
    priorMarker: { lastFingerprint: "stale::warn", consecutiveBlocks: 2 },
  });
  ok(
    "decideCombinedOutput: nothing to say but a stale marker exists -> silent, nag counter reset to 0",
    stdout === "" && marker !== null && marker.consecutiveBlocks === 0,
    JSON.stringify(marker),
  );
}
{
  // First turn ever (no prior marker): a phase suggestion with tier "none" always emits.
  const { stdout, marker } = decideCombinedOutput({
    phaseMessage: "Pipeline: Phase X",
    tier: "none",
    contextMessage: null,
    priorMarker: null,
  });
  ok("decideCombinedOutput: first turn, phase message only -> emits", stdout !== "" && stdout.includes("Pipeline: Phase X"), stdout);
  ok(
    'decideCombinedOutput: first turn -> marker fingerprint is "<phase>::none"',
    marker.lastFingerprint === "Pipeline: Phase X::none" && marker.consecutiveBlocks === 0,
    JSON.stringify(marker),
  );
}
{
  // Second turn, IDENTICAL phase message + tier as the prior marker -> dedup silences it.
  const priorMarker = { lastFingerprint: "Pipeline: Phase X::none", consecutiveBlocks: 0 };
  const { stdout, marker } = decideCombinedOutput({ phaseMessage: "Pipeline: Phase X", tier: "none", contextMessage: null, priorMarker });
  ok("decideCombinedOutput: identical phase+tier as last turn -> silent (dedup)", stdout === "", stdout);
  ok("decideCombinedOutput: dedup case still refreshes the marker (same fingerprint)", marker.lastFingerprint === priorMarker.lastFingerprint);
}
{
  // Phase message CHANGES (pipeline-state changed) -> re-emits despite an existing marker.
  const priorMarker = { lastFingerprint: "Pipeline: Phase X::none", consecutiveBlocks: 0 };
  const { stdout } = decideCombinedOutput({ phaseMessage: "Pipeline: Phase Y", tier: "none", contextMessage: null, priorMarker });
  ok("decideCombinedOutput: phase message change -> re-emits", stdout !== "" && stdout.includes("Pipeline: Phase Y"), stdout);
}
{
  // Tier CHANGES (none -> warn), same phase message -> re-emits.
  const priorMarker = { lastFingerprint: "Pipeline: Phase X::none", consecutiveBlocks: 0 };
  const { stdout } = decideCombinedOutput({
    phaseMessage: "Pipeline: Phase X",
    tier: "warn",
    contextMessage: buildContextMessage("warn", 120000),
    priorMarker,
  });
  ok("decideCombinedOutput: tier change (none -> warn) -> re-emits", stdout !== "" && stdout.includes("handover window"), stdout);
}
{
  // First consecutive block turn (priorMarker null) -> decision:"block" present.
  const { stdout, marker } = decideCombinedOutput({
    phaseMessage: null,
    tier: "block",
    contextMessage: buildContextMessage("block", 175000),
    priorMarker: null,
  });
  const parsed = JSON.parse(stdout);
  ok('decideCombinedOutput: 1st consecutive block turn -> decision "block"', parsed.decision === "block", stdout);
  ok("decideCombinedOutput: 1st consecutive block turn -> reason present", typeof parsed.reason === "string" && parsed.reason.includes("EMERGENCY BRAKE"));
  ok("decideCombinedOutput: 1st consecutive block turn -> marker.consecutiveBlocks 1", marker.consecutiveBlocks === 1, JSON.stringify(marker));
}
{
  // Second consecutive block turn -> STILL decision:"block" (nag-cap allows 2).
  const priorMarker = { lastFingerprint: "∅::block", consecutiveBlocks: 1 };
  const { stdout, marker } = decideCombinedOutput({
    phaseMessage: null,
    tier: "block",
    contextMessage: buildContextMessage("block", 176000),
    priorMarker,
  });
  const parsed = JSON.parse(stdout);
  ok('decideCombinedOutput: 2nd consecutive block turn -> STILL decision "block"', parsed.decision === "block", stdout);
  ok("decideCombinedOutput: 2nd consecutive block turn -> marker.consecutiveBlocks 2", marker.consecutiveBlocks === 2, JSON.stringify(marker));
}
{
  // Second consecutive block turn bypasses dedup EVEN THOUGH the fingerprint would match
  // (same phaseMessage=null, same tier "block") -- the emergency brake must be felt every
  // one of its allotted consecutive turns, never silently deduped away.
  const priorMarker = { lastFingerprint: "∅::block", consecutiveBlocks: 1 };
  const { stdout } = decideCombinedOutput({ phaseMessage: null, tier: "block", contextMessage: buildContextMessage("block", 175500), priorMarker });
  ok("decideCombinedOutput: active block turn is NEVER deduped, even with a matching fingerprint", stdout !== "", stdout);
}
{
  // Third consecutive block turn -> CAPPED: downgraded, no `decision` field, downgrade note present.
  const priorMarker = { lastFingerprint: "∅::block", consecutiveBlocks: 2 };
  const { stdout, marker } = decideCombinedOutput({
    phaseMessage: null,
    tier: "block",
    contextMessage: buildContextMessage("block", 177000),
    priorMarker,
  });
  const parsed = JSON.parse(stdout);
  ok("decideCombinedOutput: 3rd consecutive block turn -> NO decision field (downgraded)", parsed.decision === undefined, stdout);
  ok(
    "decideCombinedOutput: 3rd consecutive block turn -> downgrade note present",
    parsed.systemMessage.includes("Downgraded"),
    parsed.systemMessage,
  );
  ok("decideCombinedOutput: 3rd consecutive block turn -> marker.consecutiveBlocks 3", marker.consecutiveBlocks === 3, JSON.stringify(marker));
}
{
  // The downgraded (capped) block turn IS subject to normal dedup: a FOURTH consecutive
  // turn with the identical phase message + tier, whose prior marker already carries the
  // "block-downgraded" fingerprint from the 3rd turn, goes silent.
  const priorMarker = { lastFingerprint: "∅::block-downgraded", consecutiveBlocks: 3 };
  const { stdout, marker } = decideCombinedOutput({
    phaseMessage: null,
    tier: "block",
    contextMessage: buildContextMessage("block", 178000),
    priorMarker,
  });
  ok("decideCombinedOutput: downgraded block turn IS deduped once its fingerprint repeats", stdout === "", stdout);
  ok("decideCombinedOutput: downgraded+deduped turn still counts toward consecutiveBlocks", marker.consecutiveBlocks === 4, JSON.stringify(marker));
}
{
  // Tier drops out of "block" (context got cut) -> consecutiveBlocks resets to 0.
  const priorMarker = { lastFingerprint: "∅::block-downgraded", consecutiveBlocks: 4 };
  const { marker } = decideCombinedOutput({
    phaseMessage: null,
    tier: "overdue",
    contextMessage: buildContextMessage("overdue", 155000),
    priorMarker,
  });
  ok("decideCombinedOutput: tier drops below block -> consecutiveBlocks resets to 0", marker.consecutiveBlocks === 0, JSON.stringify(marker));
}
{
  // NEVER block below 170k: tier "overdue", regardless of any prior consecutiveBlocks value,
  // must never carry a `decision` field.
  const priorMarker = { lastFingerprint: "∅::block", consecutiveBlocks: 9 };
  const { stdout } = decideCombinedOutput({
    phaseMessage: null,
    tier: "overdue",
    contextMessage: buildContextMessage("overdue", 155000),
    priorMarker,
  });
  const parsed = JSON.parse(stdout);
  ok("decideCombinedOutput: tier overdue NEVER carries decision:block", parsed.decision === undefined, stdout);
}

// ---- decideCombinedOutput: re-arm bypass (pure, Elephant decision 2026-07-10) -----------
{
  // Fingerprint UNCHANGED, but usage grew by exactly >= CONTEXT_REARM_STEP_TOKENS since the
  // last EMISSION -> dedup bypassed, re-emits, and the marker's lastEmittedTotalTokens is
  // stamped with the NEW totalTokens (this turn IS an emission).
  const priorMarker = { lastFingerprint: "∅::overdue", consecutiveBlocks: 0, lastEmittedTotalTokens: 340000 };
  const { stdout, marker } = decideCombinedOutput({
    phaseMessage: null,
    tier: "overdue",
    contextMessage: buildContextMessage("overdue", 395000),
    priorMarker,
    totalTokens: 395000, // +55k since lastEmittedTotalTokens (340000) -- above the 50k step
  });
  ok("decideCombinedOutput re-arm: +55k since last emission -> bypasses dedup, re-emits", stdout !== "" && stdout.includes("395k"), stdout);
  ok("decideCombinedOutput re-arm: emission stamps lastEmittedTotalTokens with the NEW total", marker.lastEmittedTotalTokens === 395000, JSON.stringify(marker));
}
{
  // Same fingerprint, usage grew by LESS than the re-arm step -> dedup still applies (anti-spam
  // cap holds within one arming); lastEmittedTotalTokens carries over UNCHANGED (not an emission).
  const priorMarker = { lastFingerprint: "∅::overdue", consecutiveBlocks: 0, lastEmittedTotalTokens: 340000 };
  const { stdout, marker } = decideCombinedOutput({
    phaseMessage: null,
    tier: "overdue",
    contextMessage: buildContextMessage("overdue", 360000),
    priorMarker,
    totalTokens: 360000, // +20k since lastEmittedTotalTokens -- below the 50k step
  });
  ok("decideCombinedOutput re-arm: +20k since last emission (< 50k) -> STILL deduped", stdout === "", stdout);
  ok("decideCombinedOutput re-arm: deduped turn leaves lastEmittedTotalTokens UNCHANGED", marker.lastEmittedTotalTokens === 340000, JSON.stringify(marker));
}
{
  // Boundary: delta exactly === CONTEXT_REARM_STEP_TOKENS -> re-arm DUE (>=, not strictly >).
  const priorMarker = { lastFingerprint: "∅::overdue", consecutiveBlocks: 0, lastEmittedTotalTokens: 300000 };
  const { stdout } = decideCombinedOutput({
    phaseMessage: null,
    tier: "overdue",
    contextMessage: buildContextMessage("overdue", 300000 + CONTEXT_REARM_STEP_TOKENS),
    priorMarker,
    totalTokens: 300000 + CONTEXT_REARM_STEP_TOKENS,
  });
  ok("decideCombinedOutput re-arm: delta exactly == CONTEXT_REARM_STEP_TOKENS -> re-arm due (boundary, >=)", stdout !== "", stdout);
}
{
  // Boundary: delta one token under the step -> NOT due.
  const priorMarker = { lastFingerprint: "∅::overdue", consecutiveBlocks: 0, lastEmittedTotalTokens: 300000 };
  const { stdout } = decideCombinedOutput({
    phaseMessage: null,
    tier: "overdue",
    contextMessage: buildContextMessage("overdue", 300000 + CONTEXT_REARM_STEP_TOKENS - 1),
    priorMarker,
    totalTokens: 300000 + CONTEXT_REARM_STEP_TOKENS - 1,
  });
  ok("decideCombinedOutput re-arm: delta one token under the step -> NOT due (still deduped)", stdout === "", stdout);
}
{
  // Re-arm never fires while the effective tier is "none", however far totalTokens grew --
  // guarded explicitly by `tier !== "none"` in the implementation.
  const priorMarker = { lastFingerprint: "Pipeline: Phase X::none", consecutiveBlocks: 0, lastEmittedTotalTokens: 100000 };
  const { stdout } = decideCombinedOutput({
    phaseMessage: "Pipeline: Phase X",
    tier: "none",
    contextMessage: null,
    priorMarker,
    totalTokens: 999999, // huge delta, but tier "none" -> must not matter
  });
  ok('decideCombinedOutput re-arm: tier "none" never re-arms, regardless of totalTokens delta', stdout === "", stdout);
}
{
  // Pre-fix callers (no totalTokens passed at all) -> rearmDue structurally false, byte-
  // identical pre-fix dedup behaviour preserved.
  const priorMarker = { lastFingerprint: "∅::overdue", consecutiveBlocks: 0, lastEmittedTotalTokens: 100000 };
  const { stdout } = decideCombinedOutput({ phaseMessage: null, tier: "overdue", contextMessage: buildContextMessage("overdue", 155000), priorMarker });
  ok("decideCombinedOutput re-arm: totalTokens omitted (pre-fix caller) -> normal dedup applies, no re-arm", stdout === "", stdout);
}
{
  // A brand-new emission (no prior marker at all) stamps lastEmittedTotalTokens with the
  // current totalTokens -- establishing the baseline for future re-arm checks.
  const { marker } = decideCombinedOutput({ phaseMessage: null, tier: "warn", contextMessage: buildContextMessage("warn", 190000), priorMarker: null, totalTokens: 190000 });
  ok("decideCombinedOutput re-arm: first-ever emission stamps lastEmittedTotalTokens with the current total", marker.lastEmittedTotalTokens === 190000, JSON.stringify(marker));
}
{
  // Emission where totalTokens itself is unresolvable this turn -> lastEmittedTotalTokens is
  // stamped `null` (never throws, never fabricates a number).
  const { marker } = decideCombinedOutput({ phaseMessage: "Pipeline: Phase X", tier: "none", contextMessage: null, priorMarker: null });
  ok("decideCombinedOutput re-arm: emission with unresolvable totalTokens -> lastEmittedTotalTokens null", marker.lastEmittedTotalTokens === null, JSON.stringify(marker));
}

// ---- G-B CLI end-to-end (real subprocess, real usage/marker files on disk) -------------
function runCliWithStdin(fakeProjectDir, inputObj) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(inputObj),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: fakeProjectDir },
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function writeGbFixture(rootDir, { phase = "implementation" } = {}) {
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeRaw(
    join(rootDir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "",
    ].join("\n"),
  );
  writeJson(join(rootDir, ".claude", "pipeline-state.json"), stateFixture(phase));
}

// P2 fix (design decision 2026-07-08): usedPct now drives the tier -- callers must pass the
// pct explicitly (no longer hardcoded to 50, which silently drove every old caller's tier
// through totalTokens instead). totalTokens stays real/independent -- it only feeds the
// DISPLAY text (Context {k}k), never the tier decision.
// STALE-DETECTION fixture fix (context-counter hardening, PO-directive 2026-07-08): `updatedAt`
// now defaults to the REAL current time (`new Date().toISOString()`), not a hardcoded past
// literal -- every pre-existing caller of this helper writes a snapshot meant to simulate a
// FRESH usage file (that was always the implicit intent; `updatedAt` was previously present
// only as boilerplate schema shape, never asserted on). A fixed past literal would grow stale
// relative to the real `Date.now()` `run()` reads with every day that passes after it was
// written, silently colliding with the new staleness feature this suite now also covers.
// Callers that WANT a stale fixture pass an explicit old `updatedAt` (see the dedicated
// stale-detection section below), which is exactly why this stays an optional 5th parameter
// rather than removing the field.
function writeGbUsage(rootDir, sessionId, totalTokens, usedPct, updatedAt = new Date().toISOString()) {
  writeJson(join(rootDir, ".claude", `.usage-${sessionId}.json`), { usedPct, totalTokens, updatedAt });
}

{
  const rootDir = fixtureDir("gb-cli-full-flow");
  writeGbFixture(rootDir);
  writeGbUsage(rootDir, "sess-1", 50000, 25); // 25% used -> tier "none" -> no context clause

  const r1 = runCliWithStdin(rootDir, { session_id: "sess-1" });
  ok("G-B CLI: 1st turn (tier none) exits 0", r1.status === 0, `stderr=${r1.stderr}`);
  ok("G-B CLI: 1st turn (tier none) emits the phase suggestion", r1.stdout.includes("security-scan"), r1.stdout);
  ok("G-B CLI: 1st turn (tier none) has no decision field", !r1.stdout.includes('"decision"'), r1.stdout);

  const r2 = runCliWithStdin(rootDir, { session_id: "sess-1" });
  ok("G-B CLI: 2nd turn, unchanged state+tier -> deduped to silence", r2.status === 0 && r2.stdout === "", `status=${r2.status} stdout=${r2.stdout}`);

  writeGbUsage(rootDir, "sess-1", 120000, 60); // 60% used -> tier "warn"
  const r3 = runCliWithStdin(rootDir, { session_id: "sess-1" });
  ok(
    "G-B CLI: 3rd turn, context tier changed to warn -> re-emits with handover window",
    r3.stdout.includes("handover window") && r3.stdout.includes("security-scan"),
    r3.stdout,
  );
}

{
  // P2 fix proof (design decision 2026-07-08, EL-04), LAYERED (Elephant decision, 2026-07-10,
  // absolute soft-nudge layer -- see stop-suggest.mjs header "ABSOLUTE SOFT-NUDGE LAYER"): a
  // 1M-context session at 34% used is 340k REAL tokens. EL-04's core assertion (a) STILL holds
  // unmodified below: the OLD absolute-token contextTier (>=170k -> block) would have fired a
  // spurious emergency brake here; percentage-based tiering correctly keeps the HARD "block"
  // tier out of it. What CHANGES (b) is the soft layer: 340k real tokens is >= the new
  // window-independent 250k absolute-overdue floor (`absoluteContextTier`), so
  // `effectiveContextTier` now surfaces a SOFT "overdue" nudge (with the copyable /compact
  // command) even though the percent ladder alone would have said "none" -- this is the
  // resolved design's whole point (compact-checkpoint-pacing intent: a session carrying 340k
  // real tokens of live context is worth a proactive nudge, however large its window is), NOT
  // a regression of EL-04, which only ever governed the HARD brake.
  const rootDir = fixtureDir("gb-cli-1m-window-no-spurious-block");
  writeGbFixture(rootDir);
  writeGbUsage(rootDir, "sess-1m", 340000, 34); // 1M window, 34% used, 340k real tokens

  const r1 = runCliWithStdin(rootDir, { session_id: "sess-1m" });
  ok("G-B CLI: 1M-window at 34% used -> exit 0", r1.status === 0, `stderr=${r1.stderr}`);
  // (a) EL-04's core assertion, UNCHANGED: never a spurious hard emergency brake.
  ok("G-B CLI: 1M-window at 34% used -> NO decision:block (no spurious emergency brake, EL-04 preserved)", !r1.stdout.includes('"decision"'), r1.stdout);
  // (b) CHANGED (2026-07-10 absolute soft-nudge layer): a soft "overdue" nudge now fires,
  // carrying the real token count and the copyable /compact command.
  ok("G-B CLI: 1M-window at 34% used -> soft OVERDUE nudge fires (absolute layer, 340k >= 250k floor)", r1.stdout.includes("OVERDUE") && r1.stdout.includes("340k"), r1.stdout);
  ok("G-B CLI: 1M-window at 34% used -> nudge carries the copyable /compact command", r1.stdout.includes("/compact "), r1.stdout);

  writeGbUsage(rootDir, "sess-1m", 850000, 85); // same 1M window, now 85% used -> tier "block"
  const r2 = runCliWithStdin(rootDir, { session_id: "sess-1m" });
  const p2 = JSON.parse(r2.stdout);
  ok("G-B CLI: 1M-window at 85% used -> decision:block correctly fires", p2.decision === "block", r2.stdout);
  ok("G-B CLI: 1M-window at 85% used -> DISPLAY shows real tokens (850k)", r2.stdout.includes("850k"), r2.stdout);
}

{
  // NEW regression (this task, 2026-07-10): preserves EL-04's spirit at a token count BELOW
  // the new absolute soft-nudge floor (180k) -- a session genuinely lightly used on a huge
  // window (100k real tokens = 10% of a 1M window) must stay completely quiet: no soft nudge,
  // no hard block. Without this guard, an overly aggressive absolute floor could reintroduce
  // exactly the kind of spurious noise EL-04 was written to eliminate, just one layer up (soft
  // instead of hard).
  const rootDir = fixtureDir("gb-cli-1m-window-genuinely-light-usage");
  writeGbFixture(rootDir);
  writeGbUsage(rootDir, "sess-1m-light", 100000, 10); // 1M window, 10% used, 100k real tokens

  const r = runCliWithStdin(rootDir, { session_id: "sess-1m-light" });
  ok("G-B CLI: 1M-window at 10% used (100k tokens, below the 180k absolute floor) -> exit 0", r.status === 0, `stderr=${r.stderr}`);
  ok("G-B CLI: 1M-window at 10% used -> NO decision:block", !r.stdout.includes('"decision"'), r.stdout);
  ok("G-B CLI: 1M-window at 10% used -> NO context clause at all (tier none, no spurious soft nudge either)", !r.stdout.includes("Context "), r.stdout);
}

{
  // Interaction regression (this task, 2026-07-10): a 200k-window-sized session that already
  // hard-blocks via PERCENT (85% used) ALSO happens to sit above the absolute overdue floor
  // (210000 >= 200000) -- proves the hard block still fires exactly as before (percent wins,
  // "block" outranks "overdue") and that the absolute layer never downgrades or interferes
  // with an already-active percent-driven emergency brake.
  const rootDir = fixtureDir("gb-cli-200k-window-hard-block-plus-absolute-overdue");
  writeGbFixture(rootDir);
  writeGbUsage(rootDir, "sess-200k-block", 210000, 85); // 85% used AND >=200k absolute overdue floor

  const r = runCliWithStdin(rootDir, { session_id: "sess-200k-block" });
  const parsed = JSON.parse(r.stdout);
  ok(
    "G-B CLI: 200k-ish window at 85% used (also >=200k absolute) -> decision:block STILL fires (percent wins over absolute)",
    parsed.decision === "block",
    r.stdout,
  );
  ok("G-B CLI: 200k-ish window hard block -> wording is EMERGENCY BRAKE, not the absolute-only OVERDUE wording", r.stdout.includes("EMERGENCY BRAKE"), r.stdout);
}

{
  // Absolute ladder soft-nudge boundaries on a 1M window (this task, 2026-07-10 DoD): 180k ->
  // warn, 200k -> overdue, 250k -> overdue, all with NO decision:block.
  const cases = [
    { totalTokens: 180000, usedPct: 18, label: "180k/1M (warn floor)", expectSubstr: "handover window" },
    { totalTokens: 200000, usedPct: 20, label: "200k/1M (overdue floor)", expectSubstr: "OVERDUE" },
    { totalTokens: 250000, usedPct: 25, label: "250k/1M (strongest-soft overdue floor)", expectSubstr: "OVERDUE" },
  ];
  for (const [i, c] of cases.entries()) {
    const rootDir = fixtureDir(`gb-cli-1m-window-absolute-ladder-${i}`);
    writeGbFixture(rootDir);
    writeGbUsage(rootDir, `sess-ladder-${i}`, c.totalTokens, c.usedPct);
    const r = runCliWithStdin(rootDir, { session_id: `sess-ladder-${i}` });
    ok(`G-B CLI absolute ladder ${c.label}: exit 0`, r.status === 0, `stderr=${r.stderr}`);
    ok(`G-B CLI absolute ladder ${c.label}: NO decision:block`, !r.stdout.includes('"decision"'), r.stdout);
    ok(`G-B CLI absolute ladder ${c.label}: expected wording (${c.expectSubstr}) present`, r.stdout.includes(c.expectSubstr), r.stdout);
    ok(`G-B CLI absolute ladder ${c.label}: copyable /compact command present`, r.stdout.includes("/compact "), r.stdout);
  }
}

{
  // Recurring RE-ARM (this task, 2026-07-10, DoD): a soft nudge sitting at the same effective
  // tier for another >=50k real tokens re-emits despite an unchanged phase+tier fingerprint;
  // less than 50k growth stays deduped (anti-spam cap still limits repeats within one arming).
  const rootDir = fixtureDir("gb-cli-context-rearm");
  writeGbFixture(rootDir, { phase: "does-not-exist" }); // no phase suggestion -> isolates the context-nudge fingerprint
  writeGbUsage(rootDir, "sess-rearm", 340000, 34); // 1M window, absolute "overdue" (>=250k)

  const r1 = runCliWithStdin(rootDir, { session_id: "sess-rearm" });
  ok("G-B CLI re-arm: turn 1 (340k) emits the soft nudge", r1.stdout.includes("OVERDUE"), r1.stdout);

  writeGbUsage(rootDir, "sess-rearm", 360000, 36); // +20k, same tier, well under the 50k re-arm step
  const r2 = runCliWithStdin(rootDir, { session_id: "sess-rearm" });
  ok(
    `G-B CLI re-arm: turn 2 (+20k, < ${CONTEXT_REARM_STEP_TOKENS}) -> STILL deduped to silence (anti-spam cap holds within one arming)`,
    r2.status === 0 && r2.stdout === "",
    `status=${r2.status} stdout=${r2.stdout}`,
  );

  writeGbUsage(rootDir, "sess-rearm", 395000, 39); // +55k since the LAST EMISSION (340k) -> re-arm due
  const r3 = runCliWithStdin(rootDir, { session_id: "sess-rearm" });
  ok(
    `G-B CLI re-arm: turn 3 (+55k since last emission, >= ${CONTEXT_REARM_STEP_TOKENS}) -> re-emits despite unchanged fingerprint`,
    r3.stdout.includes("OVERDUE") && r3.stdout.includes("395k"),
    r3.stdout,
  );
}

{
  const rootDir = fixtureDir("gb-cli-block-nag-cap");
  writeGbFixture(rootDir);
  writeGbUsage(rootDir, "sess-block", 175000, 90); // 90% used -> tier "block" from turn 1

  const r1 = runCliWithStdin(rootDir, { session_id: "sess-block" });
  const p1 = JSON.parse(r1.stdout);
  ok("G-B CLI block-nag-cap: turn 1 -> decision block", p1.decision === "block", r1.stdout);

  const r2 = runCliWithStdin(rootDir, { session_id: "sess-block" });
  const p2 = JSON.parse(r2.stdout);
  ok("G-B CLI block-nag-cap: turn 2 -> STILL decision block", p2.decision === "block", r2.stdout);

  const r3 = runCliWithStdin(rootDir, { session_id: "sess-block" });
  let p3 = null;
  let p3Parsed = true;
  try {
    p3 = JSON.parse(r3.stdout);
  } catch {
    p3Parsed = false;
  }
  ok("G-B CLI block-nag-cap: turn 3 -> stdout still valid JSON (downgraded, not silent)", p3Parsed, r3.stdout);
  ok("G-B CLI block-nag-cap: turn 3 -> NO decision field (nag-cap downgrade)", p3Parsed && p3.decision === undefined, r3.stdout);
  ok(
    "G-B CLI block-nag-cap: turn 3 -> downgrade note present in systemMessage",
    p3Parsed && p3.systemMessage.includes("Downgraded"),
    r3.stdout,
  );

  const r4 = runCliWithStdin(rootDir, { session_id: "sess-block" });
  ok(
    "G-B CLI block-nag-cap: turn 4 -> silent (dedup on the downgraded fingerprint, primary-path regression)",
    r4.status === 0 && r4.stdout === "",
    `status=${r4.status} stdout=${r4.stdout}`,
  );
}

{
  // Usage file absent entirely -> tier stays "none", context part silently skipped; the
  // phase suggestion (if any) still fires normally.
  const rootDir = fixtureDir("gb-cli-usage-absent");
  writeGbFixture(rootDir);
  const r = runCliWithStdin(rootDir, { session_id: "sess-no-usage" });
  ok("G-B CLI: usage file absent -> exit 0", r.status === 0);
  ok("G-B CLI: usage file absent -> phase suggestion still present, no context clause", r.stdout.includes("security-scan") && !r.stdout.includes("Context "), r.stdout);
}

{
  // Usage file present but malformed JSON -> fail-open, same as absent.
  const rootDir = fixtureDir("gb-cli-usage-malformed");
  writeGbFixture(rootDir);
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeRaw(join(rootDir, ".claude", ".usage-sess-malformed.json"), "{ not json ][");
  const r = runCliWithStdin(rootDir, { session_id: "sess-malformed" }); // deliberately a DIFFERENT session id than the malformed file's -- proves a mismatched/absent usage file for THIS session is equally silently skipped
  ok("G-B CLI: malformed usage file (different session) -> fail-open, no context clause", r.status === 0 && !r.stdout.includes("Context "), r.stdout);

  const rSame = runCliWithStdin(rootDir, { session_id: "sess-malformed-samefile" });
  writeRaw(join(rootDir, ".claude", ".usage-sess-malformed-samefile.json"), "{ not json ][");
  const rSame2 = runCliWithStdin(rootDir, { session_id: "sess-malformed-samefile" });
  ok("G-B CLI: malformed usage file for THIS session -> fail-open, no context clause", rSame2.status === 0 && !rSame2.stdout.includes("Context "), rSame2.stdout);
}

{
  // No session_id resolvable (stdin has no session_id field) -> dedup/nag-cap structurally
  // impossible -> the hook ALWAYS emits (matches every pre-G-B smoke test's behavior).
  const rootDir = fixtureDir("gb-cli-no-session-id");
  writeGbFixture(rootDir);
  const r1 = runCliWithStdin(rootDir, {});
  const r2 = runCliWithStdin(rootDir, {});
  ok("G-B CLI: no session_id -> turn 1 emits", r1.stdout.includes("security-scan"), r1.stdout);
  ok("G-B CLI: no session_id -> turn 2 (identical state) ALSO emits (no dedup possible)", r2.stdout.includes("security-scan"), r2.stdout);
  ok("G-B CLI: no session_id -> both turns byte-identical (no marker to diverge on)", r1.stdout === r2.stdout, `r1=${r1.stdout} r2=${r2.stdout}`);
}

{
  // Malformed stdin entirely (not valid JSON) -> never crashes, degrades to "no session_id".
  const rootDir = fixtureDir("gb-cli-malformed-stdin");
  writeGbFixture(rootDir);
  const res = spawnSync(process.execPath, [SCRIPT], { input: "{ not json at all ][", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: rootDir } });
  ok("G-B CLI: malformed stdin -> exit 0 (never crashes)", res.status === 0, `stderr=${res.stderr}`);
  ok("G-B CLI: malformed stdin -> phase suggestion still emitted (fail-open)", (res.stdout ?? "").includes("security-scan"), res.stdout);
}

// ==========================================================================================
// MAJOR-1 FIX (T1 critic, 2026-07-08): nag-cap fail-closed defect -- write-then-emit guard +
// belt-and-suspenders stop_hook_active check. Also NIT-1 (k-rendering rounding). Everything
// above this marker is the pre-fix G-B suite (unmodified except the additive `isActiveBlock`
// field and the turn-4 dedup extension on the block-nag-cap CLI test above).
// ==========================================================================================

// ---- NIT-1: k-rendering must never round UP into the block threshold (Math.floor) -------
{
  const msg = buildContextMessage("overdue", 169999);
  ok(
    'buildContextMessage: NIT-1 -- 169999 tokens (tier "overdue") renders "169k", NEVER "170k" (Math.floor, not Math.round)',
    msg.includes("169k") && !msg.includes("170k"),
    msg,
  );
}

// ---- resolveStopHookActiveFromInput (pure) -----------------------------------------------
ok("resolveStopHookActiveFromInput: {stop_hook_active:true} -> true", resolveStopHookActiveFromInput({ stop_hook_active: true }) === true);
ok("resolveStopHookActiveFromInput: {stop_hook_active:false} -> false", resolveStopHookActiveFromInput({ stop_hook_active: false }) === false);
ok("resolveStopHookActiveFromInput: field absent -> false", resolveStopHookActiveFromInput({}) === false);
ok("resolveStopHookActiveFromInput: null input -> false", resolveStopHookActiveFromInput(null) === false);
ok("resolveStopHookActiveFromInput: non-boolean value -> false", resolveStopHookActiveFromInput({ stop_hook_active: "true" }) === false);

// ---- decideCombinedOutput: forceCapped (belt-and-suspenders) -----------------------------
{
  // 1st-ever block turn (no prior marker) but forceCapped -> downgraded, NOT decision:block.
  const { stdout, marker } = decideCombinedOutput({
    phaseMessage: null,
    tier: "block",
    contextMessage: buildContextMessage("block", 175000),
    priorMarker: null,
    forceCapped: true,
  });
  const parsed = JSON.parse(stdout);
  ok("decideCombinedOutput: forceCapped on 1st block turn -> NO decision field", parsed.decision === undefined, stdout);
  ok(
    "decideCombinedOutput: forceCapped on 1st block turn -> downgrade note present",
    parsed.systemMessage.includes("Downgraded"),
    parsed.systemMessage,
  );
  ok("decideCombinedOutput: forceCapped on 1st block turn -> marker.consecutiveBlocks 1", marker.consecutiveBlocks === 1, JSON.stringify(marker));
}
{
  // forceCapped absent/false (default) preserves pre-fix behaviour: 1st block turn blocks.
  const { stdout } = decideCombinedOutput({ phaseMessage: null, tier: "block", contextMessage: buildContextMessage("block", 175000), priorMarker: null });
  const parsed = JSON.parse(stdout);
  ok("decideCombinedOutput: forceCapped defaults to false -> 1st block turn still blocks", parsed.decision === "block", stdout);
}
{
  // isActiveBlock field: exposed correctly for both the active and capped case.
  const active = decideCombinedOutput({ phaseMessage: null, tier: "block", contextMessage: buildContextMessage("block", 175000), priorMarker: null });
  const cappedCase = decideCombinedOutput({
    phaseMessage: null,
    tier: "block",
    contextMessage: buildContextMessage("block", 175000),
    priorMarker: { lastFingerprint: "∅::block", consecutiveBlocks: 2 },
  });
  ok("decideCombinedOutput: isActiveBlock true on an un-capped block turn", active.isActiveBlock === true);
  ok("decideCombinedOutput: isActiveBlock false on a capped/downgraded block turn", cappedCase.isActiveBlock === false);
}

// ---- applyPersistenceGuard (pure) --------------------------------------------------------
{
  const decided = decideCombinedOutput({ phaseMessage: null, tier: "block", contextMessage: buildContextMessage("block", 175000), priorMarker: null });
  const guarded = applyPersistenceGuard({ decided, writeSucceeded: true, phaseMessage: null, tier: "block", totalTokens: 175000 });
  ok("applyPersistenceGuard: write succeeded -> stdout unchanged (still decision:block)", guarded === decided.stdout, guarded);
}
{
  // MAJOR-1: write FAILED on an active block turn -> block stripped, downgraded to overdue wording.
  const decided = decideCombinedOutput({ phaseMessage: null, tier: "block", contextMessage: buildContextMessage("block", 175000), priorMarker: null });
  const guarded = applyPersistenceGuard({ decided, writeSucceeded: false, phaseMessage: null, tier: "block", totalTokens: 175000 });
  const parsed = JSON.parse(guarded);
  ok("applyPersistenceGuard: write failed on active block -> NO decision field", parsed.decision === undefined, guarded);
  ok("applyPersistenceGuard: write failed on active block -> reason field also absent", parsed.reason === undefined, guarded);
  ok(
    "applyPersistenceGuard: write failed on active block -> downgrades to overdue wording (OVERDUE), not EMERGENCY BRAKE",
    parsed.systemMessage.includes("OVERDUE") && !parsed.systemMessage.includes("EMERGENCY BRAKE"),
    parsed.systemMessage,
  );
}
{
  // write failed but this was never an active block (e.g. already capped) -> no-op, unchanged.
  const decided = decideCombinedOutput({
    phaseMessage: null,
    tier: "block",
    contextMessage: buildContextMessage("block", 175000),
    priorMarker: { lastFingerprint: "∅::block", consecutiveBlocks: 2 },
  });
  const guarded = applyPersistenceGuard({ decided, writeSucceeded: false, phaseMessage: null, tier: "block", totalTokens: 175000 });
  ok("applyPersistenceGuard: write failed on an already-downgraded turn -> no-op (unchanged stdout)", guarded === decided.stdout, guarded);
}

// ---- CLI end-to-end: unwritable marker path (directory collision) + usage >=170k over ----
// >=4 simulated turns -> NEVER decision:"block" (T1 critic repro case (a); realistic fixture:
// absolute mkdtemp-rooted paths, real subprocess pipes, real directory-collision I/O error).
{
  const rootDir = fixtureDir("gb-cli-marker-unwritable-block");
  writeGbFixture(rootDir);
  writeGbUsage(rootDir, "sess-unwritable", 175000, 90); // 90% used -> tier "block" throughout

  // Directory collision: create a REAL DIRECTORY at the exact marker file path -> writeFileSync
  // (EISDIR) and readFileSync (EISDIR) both fail on every turn -- the marker can neither be
  // written NOR read back, exactly the "unwritable marker path" repro class (the manifest/
  // state/usage files stay normal files under the same `.claude/`, so only the marker itself
  // is broken -- unlike the pre-existing "gb-marker-unwritable" pure-function fixture, which
  // makes the whole `.claude` a file and would also blind the usage-file read).
  const markerCollisionPath = join(rootDir, ".claude", ".stop-suggest-sess-unwritable.json");
  mkdirSync(markerCollisionPath, { recursive: true });

  const turns = [];
  for (let i = 0; i < 4; i++) {
    turns.push(runCliWithStdin(rootDir, { session_id: "sess-unwritable" }));
  }
  for (let i = 0; i < turns.length; i++) {
    ok(`gb-cli marker-unwritable: turn ${i + 1} exits 0`, turns[i].status === 0, `stderr=${turns[i].stderr}`);
    ok(`gb-cli marker-unwritable: turn ${i + 1} NEVER carries decision:"block"`, !turns[i].stdout.includes('"decision"'), turns[i].stdout);
  }
  ok(
    "gb-cli marker-unwritable: at least one turn still surfaces the overdue wording (fail-open, not silently swallowed)",
    turns.some((t) => t.stdout.includes("OVERDUE")),
    JSON.stringify(turns.map((t) => t.stdout)),
  );
}

// ---- CLI end-to-end: stop_hook_active=true + missing marker + >=170k -> no block ---------
// (T1 critic repro case (b): belt-and-suspenders guard, first-ever turn, no marker file yet).
{
  const rootDir = fixtureDir("gb-cli-stop-hook-active-no-marker");
  writeGbFixture(rootDir);
  writeGbUsage(rootDir, "sess-stopactive", 175000, 90); // 90% used -> tier "block"

  const r = runCliWithStdin(rootDir, { session_id: "sess-stopactive", stop_hook_active: true });
  ok("gb-cli stop_hook_active+missing-marker: exits 0", r.status === 0, `stderr=${r.stderr}`);
  ok('gb-cli stop_hook_active+missing-marker: NO decision:"block" (belt-and-suspenders)', !r.stdout.includes('"decision"'), r.stdout);
  // N1 non-silence pin (re-critic follow-up, 2026-07-08): the downgrade must be FELT, not
  // swallowed -- absence of a `decision` field alone doesn't prove the warning still surfaced.
  // Asserts both the tier-block wording (EMERGENCY BRAKE, carried through from the un-downgraded
  // contextMessage) and the downgrade note itself (`Downgraded`, NAG_DOWNGRADE_NOTE) are
  // present on stdout, mirroring the pure-function assertion style at the 3rd-consecutive-turn
  // case above.
  ok(
    "gb-cli stop_hook_active+missing-marker: downgrade output is NOT silent (EMERGENCY BRAKE + downgrade-note wording present)",
    r.stdout.includes("EMERGENCY BRAKE") && r.stdout.includes("Downgraded"),
    r.stdout,
  );
}

// ---- CLI end-to-end: stop_hook_active=true + READABLE fresh marker + >=170k -> STILL blocks --
// (M1 mutation pin, re-critic follow-up, 2026-07-08: pins the `&& priorMarker === null` half of
// `run()`'s `forceCapped: stopHookActive && priorMarker === null` composition. With an intact,
// readable marker present -- consecutiveBlocks 0, i.e. this is only the 1st consecutive block
// turn, well under NAG_CAP_TURNS (2) -- the counter logic must win over the belt-and-suspenders
// override: decision:"block" MUST still fire. The belt is only supposed to force the cap when
// the prior marker is missing/unreadable (the case the test above covers); a one-token
// regression that drops the `&& priorMarker === null` clause (i.e. `forceCapped: stopHookActive`
// alone) would silently downgrade this turn too -- this test fails the suite if that happens.)
{
  const rootDir = fixtureDir("gb-cli-stop-hook-active-fresh-marker");
  writeGbFixture(rootDir);
  writeGbUsage(rootDir, "sess-stopactive-freshmarker", 175000, 90); // 90% used -> tier "block"
  // Pre-seed an intact, readable marker file directly (real fs write, same shape
  // `writeMarkerSafe` produces) -- fresh dedup state, as if this were genuinely the session's
  // first tracked turn, distinct from the "missing/unreadable marker" repro class above.
  writeJson(markerPath(rootDir, "sess-stopactive-freshmarker"), { lastFingerprint: "seed::none", consecutiveBlocks: 0 });

  const r = runCliWithStdin(rootDir, { session_id: "sess-stopactive-freshmarker", stop_hook_active: true });
  ok("gb-cli stop_hook_active+fresh-marker: exits 0", r.status === 0, `stderr=${r.stderr}`);
  ok(
    'gb-cli stop_hook_active+fresh-marker: decision:"block" STILL fires (counter logic wins over the belt)',
    r.stdout.includes('"decision":"block"'),
    r.stdout,
  );
}

// ==========================================================================================
// STALE-DETECTION (context-counter hardening, PO-directive 2026-07-08): the usage snapshot
// only refreshes when the statusLine renders -- a snapshot untouched for more than
// USAGE_STALE_THRESHOLD_MS now gets an explicit warning instead of being silently
// trusted. Everything below is additive; nothing above this marker changes meaning (proven by
// the fixed fixture default above: `writeGbUsage` now defaults `updatedAt` to the real "now").
// ==========================================================================================

// ---- resolveUpdatedAtMs (pure) ----------------------------------------------------------
{
  const iso = "2026-07-08T12:00:00.000Z";
  ok("resolveUpdatedAtMs: valid ISO updatedAt -> matching ms timestamp", resolveUpdatedAtMs({ updatedAt: iso }) === Date.parse(iso));
}
ok("resolveUpdatedAtMs: missing updatedAt -> null", resolveUpdatedAtMs({}) === null);
ok("resolveUpdatedAtMs: null usage -> null", resolveUpdatedAtMs(null) === null);
ok("resolveUpdatedAtMs: empty-string updatedAt -> null", resolveUpdatedAtMs({ updatedAt: "" }) === null);
ok("resolveUpdatedAtMs: non-string updatedAt -> null", resolveUpdatedAtMs({ updatedAt: 12345 }) === null);
ok("resolveUpdatedAtMs: unparsable updatedAt string -> null", resolveUpdatedAtMs({ updatedAt: "not a date at all" }) === null);

// ---- isUsageStale (pure) ------------------------------------------------------------------
{
  const nowMs = Date.parse("2026-07-08T12:20:00.000Z");
  const fresh = { updatedAt: "2026-07-08T12:10:00.000Z" }; // 10 min old
  const staleUsage = { updatedAt: "2026-07-08T12:00:00.000Z" }; // 20 min old
  ok("isUsageStale: 10 min old vs 15 min threshold -> fresh (false)", isUsageStale(fresh, nowMs, USAGE_STALE_THRESHOLD_MS) === false);
  ok("isUsageStale: 20 min old vs 15 min threshold -> stale (true)", isUsageStale(staleUsage, nowMs, USAGE_STALE_THRESHOLD_MS) === true);
}
{
  // Boundary: age === thresholdMs exactly -> NOT stale (strictly-greater-than only).
  const updatedAt = "2026-07-08T12:00:00.000Z";
  const boundaryNowMs = Date.parse(updatedAt) + USAGE_STALE_THRESHOLD_MS;
  ok("isUsageStale: age exactly == threshold -> false (boundary, strict >)", isUsageStale({ updatedAt }, boundaryNowMs, USAGE_STALE_THRESHOLD_MS) === false);
  ok("isUsageStale: age one ms over threshold -> true", isUsageStale({ updatedAt }, boundaryNowMs + 1, USAGE_STALE_THRESHOLD_MS) === true);
}
ok("isUsageStale: no updatedAt at all -> false (no stale-claim without evidence)", isUsageStale({}, Date.now(), USAGE_STALE_THRESHOLD_MS) === false);
ok("isUsageStale: null usage -> false", isUsageStale(null, Date.now(), USAGE_STALE_THRESHOLD_MS) === false);
ok("isUsageStale: malformed updatedAt -> false", isUsageStale({ updatedAt: "garbage" }, Date.now(), USAGE_STALE_THRESHOLD_MS) === false);
ok("isUsageStale: non-finite nowMs -> false", isUsageStale({ updatedAt: "2026-07-08T12:00:00.000Z" }, NaN, USAGE_STALE_THRESHOLD_MS) === false);
ok("isUsageStale: non-finite thresholdMs -> false", isUsageStale({ updatedAt: "2026-07-08T12:00:00.000Z" }, Date.now(), NaN) === false);

// ---- buildStaleMessage (pure, format) -----------------------------------------------------
{
  const updatedAt = "2026-07-08T09:05:00.000Z";
  const updatedAtMs = Date.parse(updatedAt);
  const nowMsFixed = updatedAtMs + 23 * 60000; // exactly 23 minutes later, deterministic
  const msg = buildStaleMessage({ updatedAt }, nowMsFixed);
  const d = new Date(updatedAtMs);
  const expectedHHMM = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  ok("buildStaleMessage: mentions 'stale'", msg !== null && msg.includes("stale"), msg);
  ok("buildStaleMessage: mentions the derived HH:MM timestamp", msg.includes(expectedHHMM), msg);
  ok("buildStaleMessage: mentions age in minutes ('23m ago')", msg.includes("23m ago"), msg);
  ok("buildStaleMessage: mentions /context and /compact", msg.includes("/context") && msg.includes("/compact"), msg);
}
ok("buildStaleMessage: missing updatedAt -> null", buildStaleMessage({}, Date.now()) === null);
ok("buildStaleMessage: null usage -> null", buildStaleMessage(null, Date.now()) === null);
ok("buildStaleMessage: non-finite nowMs -> null", buildStaleMessage({ updatedAt: "2026-07-08T09:05:00.000Z" }, NaN) === null);

// ---- decideCombinedOutput: staleMessage integration (pure) -------------------------------
{
  // staleMessage present, everything else null (tier "none", no phase message) -> still
  // emits standalone -- the "nothing to say" fast path now also checks staleMessage.
  const { stdout, marker } = decideCombinedOutput({ phaseMessage: null, tier: "none", contextMessage: null, priorMarker: null, staleMessage: "STALE-TEXT" });
  ok("decideCombinedOutput: staleMessage alone (tier none, no phase) -> emits standalone", stdout !== "" && stdout.includes("STALE-TEXT"), stdout);
  ok("decideCombinedOutput: staleMessage alone -> fingerprint carries ::stale suffix", marker.lastFingerprint === "∅::none::stale", JSON.stringify(marker));
}
{
  // Backward-compat: staleMessage omitted (defaults to null) -> fingerprint format UNCHANGED,
  // no "::stale" suffix -- byte-identical to every pre-existing fingerprint assertion above.
  const { marker } = decideCombinedOutput({ phaseMessage: "Pipeline: Phase X", tier: "none", contextMessage: null, priorMarker: null });
  ok("decideCombinedOutput: staleMessage omitted -> fingerprint has no ::stale suffix", marker.lastFingerprint === "Pipeline: Phase X::none", JSON.stringify(marker));
}
{
  // Same stale episode two turns in a row -> dedup silences the second (episode-dedup, not
  // per-turn spam -- the requirement is "once per stale episode").
  const priorMarker = { lastFingerprint: "∅::none::stale", consecutiveBlocks: 0 };
  const { stdout } = decideCombinedOutput({ phaseMessage: null, tier: "none", contextMessage: null, priorMarker, staleMessage: "STALE-TEXT" });
  ok("decideCombinedOutput: identical stale episode as last turn -> silent (dedup)", stdout === "", stdout);
}
{
  // Transition fresh -> stale (same phase/tier) re-emits despite an existing marker.
  const priorMarker = { lastFingerprint: "∅::none", consecutiveBlocks: 0 };
  const { stdout } = decideCombinedOutput({ phaseMessage: null, tier: "none", contextMessage: null, priorMarker, staleMessage: "STALE-TEXT" });
  ok("decideCombinedOutput: fresh -> stale transition re-emits", stdout !== "" && stdout.includes("STALE-TEXT"), stdout);
}
{
  // contextMessage AND staleMessage both present at once (tier "warn") -> both survive into
  // the combined message.
  const { stdout } = decideCombinedOutput({
    phaseMessage: null,
    tier: "warn",
    contextMessage: buildContextMessage("warn", 120000),
    priorMarker: null,
    staleMessage: "STALE-TEXT",
  });
  ok("decideCombinedOutput: contextMessage + staleMessage both present -> both appear", stdout.includes("handover window") && stdout.includes("STALE-TEXT"), stdout);
}

// ---- applyPersistenceGuard: staleMessage survives a nag-cap write-failure downgrade ------
{
  const decided = decideCombinedOutput({
    phaseMessage: null,
    tier: "block",
    contextMessage: buildContextMessage("block", 175000),
    priorMarker: null,
    staleMessage: "STALE-TEXT",
  });
  const guarded = applyPersistenceGuard({ decided, writeSucceeded: false, phaseMessage: null, tier: "block", totalTokens: 175000, staleMessage: "STALE-TEXT" });
  const parsed = JSON.parse(guarded);
  ok(
    "applyPersistenceGuard: write failed on active block WITH staleMessage -> stale text survives the downgrade",
    parsed.systemMessage.includes("STALE-TEXT") && parsed.systemMessage.includes("OVERDUE"),
    guarded,
  );
}

// ---- CLI end-to-end: stale usage snapshot (real subprocess, real files, real Date.now()) -
{
  // Standalone emission: no active phase (state file removed after writeGbFixture) + a usage
  // file whose updatedAt is far in the past -> the stale warning STILL fires, proving the
  // "emits standalone when tier would otherwise be none" requirement.
  const rootDir = fixtureDir("gb-cli-stale-standalone");
  writeGbFixture(rootDir);
  rmSync(join(rootDir, ".claude", "pipeline-state.json"));
  const staleUpdatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
  writeGbUsage(rootDir, "sess-stale-standalone", 50000, 25, staleUpdatedAt); // tier "none"
  const r = runCliWithStdin(rootDir, { session_id: "sess-stale-standalone" });
  ok("gb-cli stale standalone: exit 0", r.status === 0, `stderr=${r.stderr}`);
  ok("gb-cli stale standalone: no phase suggestion (state file removed)", !r.stdout.includes("security-scan"), r.stdout);
  ok("gb-cli stale standalone: stale warning fires standalone (tier none, no phase message)", r.stdout.includes("stale"), r.stdout);
}
{
  // Fresh usage file (default `writeGbUsage` updatedAt = real now) -> no stale warning at all.
  const rootDir = fixtureDir("gb-cli-stale-fresh-no-warning");
  writeGbFixture(rootDir);
  writeGbUsage(rootDir, "sess-fresh", 50000, 25); // tier "none", fresh
  const r = runCliWithStdin(rootDir, { session_id: "sess-fresh" });
  ok("gb-cli fresh usage: exit 0", r.status === 0, `stderr=${r.stderr}`);
  ok("gb-cli fresh usage: no stale warning", !r.stdout.includes("stale"), r.stdout);
}
{
  // Episode-dedup at the CLI level: turn 1 (stale) emits, turn 2 (same still-stale file,
  // unchanged phase) goes silent -- proves "once per episode", not once per turn.
  const rootDir = fixtureDir("gb-cli-stale-dedup-episode");
  writeGbFixture(rootDir); // phase "implementation" -> a phase message is present too
  const staleUpdatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  writeGbUsage(rootDir, "sess-stale-dedup", 50000, 25, staleUpdatedAt); // tier "none", stale
  const r1 = runCliWithStdin(rootDir, { session_id: "sess-stale-dedup" });
  ok("gb-cli stale dedup: turn 1 exit 0", r1.status === 0, `stderr=${r1.stderr}`);
  ok("gb-cli stale dedup: turn 1 emits the stale warning", r1.stdout.includes("stale"), r1.stdout);
  const r2 = runCliWithStdin(rootDir, { session_id: "sess-stale-dedup" });
  ok("gb-cli stale dedup: turn 2 (same stale episode, unchanged phase) -> silent", r2.status === 0 && r2.stdout === "", `status=${r2.status} stdout=${r2.stdout}`);
}
{
  // Transition stale -> fresh mid-session (usage file refreshed between turns) -> re-emits
  // (fingerprint changed) and the stale wording is gone.
  const rootDir = fixtureDir("gb-cli-stale-to-fresh-transition");
  writeGbFixture(rootDir);
  const staleUpdatedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  writeGbUsage(rootDir, "sess-stale-transition", 50000, 25, staleUpdatedAt);
  const r1 = runCliWithStdin(rootDir, { session_id: "sess-stale-transition" });
  ok("gb-cli stale->fresh: turn 1 stale warning present", r1.stdout.includes("stale"), r1.stdout);

  writeGbUsage(rootDir, "sess-stale-transition", 50000, 25); // refresh -> now fresh
  const r2 = runCliWithStdin(rootDir, { session_id: "sess-stale-transition" });
  ok(
    "gb-cli stale->fresh: turn 2 re-emits (fingerprint changed), no stale warning anymore",
    r2.stdout.includes("security-scan") && !r2.stdout.includes("stale"),
    r2.stdout,
  );
}
{
  // Malformed updatedAt inside an otherwise-valid usage file -> fail-open, NO stale claim
  // (no evidence to prove staleness), matching the pure-function contract at the CLI level.
  const rootDir = fixtureDir("gb-cli-stale-malformed-updatedat");
  writeGbFixture(rootDir);
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeJson(join(rootDir, ".claude", ".usage-sess-badupdated.json"), { usedPct: 25, totalTokens: 50000, updatedAt: "not-a-date" });
  const r = runCliWithStdin(rootDir, { session_id: "sess-badupdated" });
  ok("gb-cli malformed updatedAt: exit 0", r.status === 0, `stderr=${r.stderr}`);
  ok("gb-cli malformed updatedAt: no stale claim (fail-open, no evidence)", !r.stdout.includes("stale"), r.stdout);
}

// ---- cleanup + summary -----------------------------------------------------------------
try {
  rmSync(WORKDIR, { recursive: true, force: true });
} catch {
  // best-effort cleanup; leftover temp dirs never fail the suite
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
