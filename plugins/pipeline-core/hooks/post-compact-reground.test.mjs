#!/usr/bin/env node
/**
 * post-compact-reground.test.mjs — test suite for the post-/compact SessionStart hook
 * (post-compact-reground.mjs, plan `.claude/plans/2026-07-07-retro-speed.md` package G-B).
 *
 * Coverage contract (briefing DoD, "≥6 cases" -- this suite ships substantially more):
 *   - shouldActivate: source "compact" -> true; every other source/absent/malformed -> false
 *   - loadStateSafe: fail-open (absent file / malformed JSON / non-object)
 *   - buildRegroundMessage: with activeFeature (id+phase) / without / state null
 *   - decideOutput: inactive -> silent; active -> full JSON shape
 *   - CLI subprocess: source=compact + real state fixture; source=startup (silent);
 *     malformed/empty stdin (silent); source=compact + missing/malformed state (fail-open,
 *     still fires with the generic fallback line)
 *
 * Run:   node plugins/pipeline-core/hooks/post-compact-reground.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { shouldActivate, loadStateSafe, buildRegroundMessage, decideOutput } from "./post-compact-reground.mjs";

const SCRIPT = fileURLToPath(new URL("./post-compact-reground.mjs", import.meta.url));

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

const WORKDIR = mkdtempSync(join(tmpdir(), "post-compact-reground-test-"));
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

// ==========================================================================================
// shouldActivate
// ==========================================================================================
ok('shouldActivate: source "compact" -> true', shouldActivate({ source: "compact" }) === true);
ok('shouldActivate: source "startup" -> false', shouldActivate({ source: "startup" }) === false);
ok('shouldActivate: source "resume" -> false', shouldActivate({ source: "resume" }) === false);
ok('shouldActivate: source "clear" -> false', shouldActivate({ source: "clear" }) === false);
ok("shouldActivate: source absent -> false", shouldActivate({}) === false);
ok("shouldActivate: null input -> false", shouldActivate(null) === false);
ok("shouldActivate: non-object input -> false", shouldActivate("compact") === false);
ok('shouldActivate: source is a non-string "compact"-like value -> false', shouldActivate({ source: { toString: () => "compact" } }) === false);

// ==========================================================================================
// loadStateSafe (fail-open)
// ==========================================================================================
{
  const state = loadStateSafe(join(WORKDIR, "does-not-exist", "pipeline-state.json"));
  ok("loadStateSafe: missing file -> null", state === null);
}
{
  const dir = fixtureDir("state-malformed");
  const p = join(dir, "pipeline-state.json");
  writeRaw(p, "{ this is not valid JSON ][");
  ok("loadStateSafe: malformed JSON -> null", loadStateSafe(p) === null);
}
{
  const dir = fixtureDir("state-non-object");
  const p = join(dir, "pipeline-state.json");
  writeRaw(p, "[1,2,3]");
  ok("loadStateSafe: JSON array (non-object) -> null", loadStateSafe(p) === null);
}
{
  const dir = fixtureDir("state-valid");
  const p = join(dir, "pipeline-state.json");
  writeJson(p, { schema: "pipeline.state.v0", activeFeature: { id: "retro-speed", phase: "implementation" } });
  const state = loadStateSafe(p);
  ok("loadStateSafe: valid JSON -> parsed object", state !== null && state.activeFeature.id === "retro-speed", JSON.stringify(state));
}

// ==========================================================================================
// buildRegroundMessage (pure)
// ==========================================================================================
{
  const msg = buildRegroundMessage({ activeFeature: { id: "retro-speed", phase: "implementation" } });
  ok('buildRegroundMessage: mentions the active feature id + phase', msg.includes('"retro-speed"') && msg.includes("implementation"), msg);
  ok("buildRegroundMessage: mentions DEUTSCH (chat-language reminder, ADR-0011/E17)", msg.includes("DEUTSCH") && msg.includes("ADR-0011"), msg);
  ok("buildRegroundMessage: mentions the active-role reminder", msg.toLowerCase().includes("rolle"), msg);
  ok("buildRegroundMessage: points to docs/state.md", msg.includes("docs/state.md"), msg);
}
{
  const msg = buildRegroundMessage({ activeFeature: { id: "no-phase-feature" } });
  ok('buildRegroundMessage: missing phase -> "(unbekannt)" fallback, not a crash', msg.includes("(unbekannt)"), msg);
}
{
  const msg = buildRegroundMessage({ schema: "pipeline.state.v0" }); // no activeFeature at all
  ok("buildRegroundMessage: no activeFeature -> generic fallback line", msg.includes("Kein aktives Feature"), msg);
}
{
  const msg = buildRegroundMessage(null); // state entirely absent/malformed
  ok("buildRegroundMessage: null state -> generic fallback line, never throws", msg.includes("Kein aktives Feature"), msg);
  ok("buildRegroundMessage: null state -> still mentions DEUTSCH reminder", msg.includes("DEUTSCH"), msg);
}

// ==========================================================================================
// decideOutput (pure)
// ==========================================================================================
{
  const { stdout } = decideOutput({ source: "startup" }, { activeFeature: { id: "x", phase: "design" } });
  ok('decideOutput: source "startup" -> silent (empty stdout)', stdout === "", stdout);
}
{
  const { stdout } = decideOutput(null, null);
  ok("decideOutput: null input -> silent (empty stdout)", stdout === "", stdout);
}
{
  const { stdout, payload } = decideOutput({ source: "compact" }, { activeFeature: { id: "retro-speed", phase: "implementation" } });
  ok("decideOutput: source compact -> non-empty JSON stdout", stdout !== "", stdout);
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    /* asserted below */
  }
  ok("decideOutput: stdout is valid JSON", parsed !== null, stdout);
  ok("decideOutput: hookSpecificOutput.hookEventName is SessionStart", parsed?.hookSpecificOutput?.hookEventName === "SessionStart");
  ok("decideOutput: additionalContext mirrors systemMessage", parsed?.hookSpecificOutput?.additionalContext === parsed?.systemMessage);
  ok("decideOutput: payload.systemMessage matches buildRegroundMessage output", payload.systemMessage.includes("retro-speed"));
}

// ==========================================================================================
// CLI subprocess (real stdin pipe, real state fixture)
// ==========================================================================================
function runCli(rootDir, stdinText) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: stdinText,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: rootDir },
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

{
  const rootDir = fixtureDir("cli-compact-with-state");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeJson(join(rootDir, ".claude", "pipeline-state.json"), {
    schema: "pipeline.state.v0",
    activeFeature: { id: "retro-speed", phase: "implementation" },
  });
  const { status, stdout, stderr } = runCli(rootDir, JSON.stringify({ source: "compact", session_id: "sess-1" }));
  ok("CLI: source=compact + real state -> exit 0", status === 0, `stderr=${stderr}`);
  ok("CLI: source=compact + real state -> mentions the active feature", stdout.includes("retro-speed"), stdout);
  ok("CLI: source=compact + real state -> mentions DEUTSCH reminder", stdout.includes("DEUTSCH"), stdout);
}

{
  const rootDir = fixtureDir("cli-startup-silent");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeJson(join(rootDir, ".claude", "pipeline-state.json"), { schema: "pipeline.state.v0", activeFeature: { id: "x", phase: "design" } });
  const { status, stdout } = runCli(rootDir, JSON.stringify({ source: "startup", session_id: "sess-1" }));
  ok("CLI: source=startup -> exit 0", status === 0);
  ok("CLI: source=startup -> empty stdout (silent, staleness-check.mjs owns this source)", stdout === "", stdout);
}

{
  const rootDir = fixtureDir("cli-malformed-stdin");
  const { status, stdout } = runCli(rootDir, "{ not valid JSON ][");
  ok("CLI: malformed stdin -> exit 0", status === 0);
  ok("CLI: malformed stdin -> empty stdout (fail-open, cannot confirm source)", stdout === "");
}

{
  const rootDir = fixtureDir("cli-empty-stdin");
  const { status, stdout } = runCli(rootDir, "");
  ok("CLI: empty stdin -> exit 0", status === 0);
  ok("CLI: empty stdin -> empty stdout (fail-open)", stdout === "");
}

{
  // source=compact, but the state file is entirely ABSENT -> fail-open on state, hook still
  // fires (generic fallback feature line), never silent, never crashes.
  const rootDir = fixtureDir("cli-compact-no-state");
  mkdirSync(join(rootDir, ".claude"), { recursive: true }); // .claude/ exists, state file does not
  const { status, stdout } = runCli(rootDir, JSON.stringify({ source: "compact" }));
  ok("CLI: source=compact + missing state file -> exit 0", status === 0);
  ok("CLI: source=compact + missing state file -> still fires (fail-open)", stdout !== "", stdout);
  ok("CLI: source=compact + missing state file -> generic fallback feature line", stdout.includes("Kein aktives Feature"), stdout);
}

{
  // source=compact, state file present but malformed JSON -> same fail-open contract.
  const rootDir = fixtureDir("cli-compact-malformed-state");
  mkdirSync(join(rootDir, ".claude"), { recursive: true });
  writeRaw(join(rootDir, ".claude", "pipeline-state.json"), "{ not valid JSON ][");
  const { status, stdout } = runCli(rootDir, JSON.stringify({ source: "compact" }));
  ok("CLI: source=compact + malformed state -> exit 0", status === 0);
  ok("CLI: source=compact + malformed state -> still fires (fail-open)", stdout !== "", stdout);
  ok("CLI: source=compact + malformed state -> generic fallback feature line", stdout.includes("Kein aktives Feature"), stdout);
}

// ---- cleanup + summary -------------------------------------------------------------------
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
