#!/usr/bin/env node
/**
 * statusline-context.test.mjs — test suite for the statusLine command
 * (statusline-context.mjs).
 *
 * Coverage contract (target ≥8 cases incl. malformed input -- this suite ships
 * substantially more, one per extractor/branch):
 *   - resolveUsedPct: primary field, alternate-spelling fields, computed-from-tokens
 *     fallback, unresolvable -> null
 *   - resolveTotalTokens: primary/alternate/cost-nested fallbacks, unresolvable -> null
 *   - resolveModelName: object form (display_name/id), bare-string form, unresolvable
 *   - resolveSessionId: present/absent/non-string
 *   - buildStatus: full valid input -> exact line format; missing pct/model -> null
 *   - writeUsageFile: round-trip write + no-op without a session id
 *   - CLI subprocess: valid stdin -> line + side-write; malformed/empty stdin -> silent;
 *     valid-JSON-but-incomplete stdin -> silent, no side-write
 *
 * Run:   node plugins/pipeline-core/scripts/statusline-context.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveUsedPct, resolveTotalTokens, resolveContextWindowSize, resolveModelName, resolveSessionId, buildStatus, usageFilePath, writeUsageFile } from "./statusline-context.mjs";

const SCRIPT = fileURLToPath(new URL("./statusline-context.mjs", import.meta.url));

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

const WORKDIR = mkdtempSync(join(tmpdir(), "statusline-context-test-"));
function fixtureDir(name) {
  const dir = join(WORKDIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ==========================================================================================
// resolveUsedPct
// ==========================================================================================
ok("resolveUsedPct: primary field context_window.used_percentage", resolveUsedPct({ context_window: { used_percentage: 42 } }) === 42);
ok("resolveUsedPct: alternate spelling percentage_used", resolveUsedPct({ context_window: { percentage_used: 55 } }) === 55);
ok("resolveUsedPct: alternate spelling usedPercentage", resolveUsedPct({ context_window: { usedPercentage: 60 } }) === 60);
ok(
  "resolveUsedPct: computed from used_tokens/max_tokens when no direct pct field",
  resolveUsedPct({ context_window: { used_tokens: 50000, max_tokens: 200000 } }) === 25,
);
ok("resolveUsedPct: top-level used_percentage fallback", resolveUsedPct({ used_percentage: 30 }) === 30);
ok("resolveUsedPct: clamps above 100 to 100", resolveUsedPct({ context_window: { used_percentage: 142 } }) === 100);
ok("resolveUsedPct: clamps below 0 to 0", resolveUsedPct({ context_window: { used_percentage: -5 } }) === 0);
ok("resolveUsedPct: null input -> null", resolveUsedPct(null) === null);
ok("resolveUsedPct: empty object -> null", resolveUsedPct({}) === null);
ok("resolveUsedPct: non-numeric pct field -> null", resolveUsedPct({ context_window: { used_percentage: "lots" } }) === null);

// ==========================================================================================
// resolveTotalTokens
// ==========================================================================================
// PRIMARY (real schema): context_window.total_input_tokens
// (+ total_output_tokens, additive when both present).
ok("resolveTotalTokens: PRIMARY context_window.total_input_tokens", resolveTotalTokens({ context_window: { total_input_tokens: 91000 } }) === 91000);
ok(
  "resolveTotalTokens: PRIMARY total_input_tokens + total_output_tokens (additive)",
  resolveTotalTokens({ context_window: { total_input_tokens: 91000, total_output_tokens: 500 } }) === 91500,
);
ok(
  "resolveTotalTokens: PRIMARY takes precedence over the legacy context_window.used_tokens fallback",
  resolveTotalTokens({ context_window: { total_input_tokens: 91000, used_tokens: 1 } }) === 91000,
);
// Defensive fallbacks (kept; real schema never triggers these).
ok("resolveTotalTokens: fallback context_window.used_tokens", resolveTotalTokens({ context_window: { used_tokens: 84000 } }) === 84000);
ok("resolveTotalTokens: fallback top-level total_input_tokens", resolveTotalTokens({ total_input_tokens: 91000 }) === 91000);
ok("resolveTotalTokens: fallback top-level total_tokens", resolveTotalTokens({ total_tokens: 12000 }) === 12000);
ok("resolveTotalTokens: fallback cost.total_tokens", resolveTotalTokens({ cost: { total_tokens: 7000 } }) === 7000);
ok("resolveTotalTokens: null input -> null", resolveTotalTokens(null) === null);
ok("resolveTotalTokens: unresolvable -> null", resolveTotalTokens({ foo: "bar" }) === null);
// Display-robustness fallback: no token field at all, but
// used_percentage + context_window_size are both present -> derive an approximate total.
ok(
  "resolveTotalTokens: display-robustness fallback from used_percentage + context_window_size (1M window)",
  resolveTotalTokens({ context_window: { used_percentage: 34, context_window_size: 1000000 } }) === 340000,
);
ok(
  "resolveTotalTokens: display-robustness fallback from used_percentage + context_window_size (200k window)",
  resolveTotalTokens({ context_window: { used_percentage: 50, context_window_size: 200000 } }) === 100000,
);
ok(
  "resolveTotalTokens: display-robustness fallback not triggered when only used_percentage present (no size)",
  resolveTotalTokens({ context_window: { used_percentage: 34 } }) === null,
);

// ==========================================================================================
// resolveContextWindowSize
// ==========================================================================================
ok("resolveContextWindowSize: context_window.context_window_size (200k)", resolveContextWindowSize({ context_window: { context_window_size: 200000 } }) === 200000);
ok("resolveContextWindowSize: context_window.context_window_size (1M)", resolveContextWindowSize({ context_window: { context_window_size: 1000000 } }) === 1000000);
ok("resolveContextWindowSize: alternate spelling contextWindowSize", resolveContextWindowSize({ context_window: { contextWindowSize: 1000000 } }) === 1000000);
ok("resolveContextWindowSize: absent -> null", resolveContextWindowSize({ context_window: {} }) === null);
ok("resolveContextWindowSize: null input -> null", resolveContextWindowSize(null) === null);

// ==========================================================================================
// resolveModelName
// ==========================================================================================
ok("resolveModelName: model.display_name", resolveModelName({ model: { display_name: "Claude Sonnet 5" } }) === "Claude Sonnet 5");
ok("resolveModelName: model.id fallback when display_name absent", resolveModelName({ model: { id: "claude-sonnet-5" } }) === "claude-sonnet-5");
ok("resolveModelName: model as bare string", resolveModelName({ model: "Claude Haiku 4.5" }) === "Claude Haiku 4.5");
ok("resolveModelName: null input -> null", resolveModelName(null) === null);
ok("resolveModelName: empty object -> null", resolveModelName({}) === null);
ok("resolveModelName: model object with neither field -> null", resolveModelName({ model: {} }) === null);

// ==========================================================================================
// resolveSessionId
// ==========================================================================================
ok("resolveSessionId: present", resolveSessionId({ session_id: "sess-1" }) === "sess-1");
ok("resolveSessionId: absent -> null", resolveSessionId({}) === null);
ok("resolveSessionId: non-string -> null", resolveSessionId({ session_id: 5 }) === null);
ok("resolveSessionId: null input -> null", resolveSessionId(null) === null);

// ==========================================================================================
// buildStatus
// ==========================================================================================
{
  // REAL statusLine schema (Fixture-Blindness lesson): total_input_tokens lives NESTED under
  // context_window, never at top level.
  const input = {
    context_window: { used_percentage: 42.6, total_input_tokens: 84200, context_window_size: 200000 },
    model: { display_name: "Claude Sonnet 5" },
    session_id: "sess-1",
  };
  const status = buildStatus(input);
  ok(
    "buildStatus: full valid input (real schema) -> exact line format",
    status !== null && status.line === "Claude Sonnet 5 · Kontext 43% (84k)",
    JSON.stringify(status),
  );
  ok("buildStatus: usedPct rounded", status.usedPct === 43);
  ok("buildStatus: totalTokens preserved", status.totalTokens === 84200);
  ok("buildStatus: contextWindowSize resolved", status.contextWindowSize === 200000);
  ok("buildStatus: sessionId resolved", status.sessionId === "sess-1");
}
{
  // 1M-window fixture: display shows real tokens, not a naive 200k-scaled value.
  const input = {
    context_window: { used_percentage: 85, total_input_tokens: 850000, context_window_size: 1000000 },
    model: { display_name: "Claude Sonnet 5" },
    session_id: "sess-1m",
  };
  const status = buildStatus(input);
  ok(
    "buildStatus: 1M-window fixture -> DISPLAY shows real tokens (850k), not a 200k assumption",
    status !== null && status.line === "Claude Sonnet 5 · Kontext 85% (850k)",
    JSON.stringify(status),
  );
  ok("buildStatus: 1M-window fixture -> contextWindowSize 1000000", status.contextWindowSize === 1000000);
}
{
  const status = buildStatus({ context_window: { used_percentage: 10 }, model: { display_name: "X" } });
  ok("buildStatus: missing token field defaults to 0k", status.line === "X · Kontext 10% (0k)", status.line);
  ok("buildStatus: missing context_window_size -> contextWindowSize null", status.contextWindowSize === null);
}
ok("buildStatus: missing pct -> null (fail-open)", buildStatus({ model: { display_name: "X" }, total_input_tokens: 1000 }) === null);
ok("buildStatus: missing model -> null (fail-open)", buildStatus({ context_window: { used_percentage: 10 } }) === null);
ok("buildStatus: null input -> null (fail-open)", buildStatus(null) === null);

// ==========================================================================================
// usageFilePath / writeUsageFile
// ==========================================================================================
{
  const rootDir = fixtureDir("usage-path");
  ok("usageFilePath: builds .claude/.usage-<session_id>.json", usageFilePath(rootDir, "sess-1") === join(rootDir, ".claude", ".usage-sess-1.json"));
}
{
  const rootDir = fixtureDir("usage-write-roundtrip");
  const wrote = writeUsageFile(rootDir, "sess-1", 42, 84000, "2026-07-07T00:00:00.000Z");
  ok("writeUsageFile: reports success", wrote === true);
  const raw = readFileSync(usageFilePath(rootDir, "sess-1"), "utf8");
  const parsed = JSON.parse(raw);
  ok(
    "writeUsageFile: writes the {usedPct, totalTokens, updatedAt} shape",
    parsed.usedPct === 42 && parsed.totalTokens === 84000 && parsed.updatedAt === "2026-07-07T00:00:00.000Z",
    raw,
  );
  ok("writeUsageFile: omits contextWindowSize when not passed (unchanged shape)", !("contextWindowSize" in parsed), raw);
}
{
  // Additive contextWindowSize param -- written only when it resolves to a finite number.
  const rootDir = fixtureDir("usage-write-with-window-size");
  const wrote = writeUsageFile(rootDir, "sess-1m", 34, 340000, "2026-07-08T00:00:00.000Z", 1000000);
  ok("writeUsageFile: reports success (with contextWindowSize)", wrote === true);
  const parsed = JSON.parse(readFileSync(usageFilePath(rootDir, "sess-1m"), "utf8"));
  ok(
    "writeUsageFile: contextWindowSize additively present when passed",
    parsed.usedPct === 34 && parsed.totalTokens === 340000 && parsed.contextWindowSize === 1000000,
    JSON.stringify(parsed),
  );
}
{
  const rootDir = fixtureDir("usage-write-no-session");
  const wrote = writeUsageFile(rootDir, null, 10, 1000, "2026-07-07T00:00:00.000Z");
  ok("writeUsageFile: no-op (returns false) without a session id", wrote === false);
  ok("writeUsageFile: no-op leaves .claude/ untouched", !existsSync(join(rootDir, ".claude")));
}
{
  // ".claude" exists as a FILE (not a directory) -> writeFileSync must fail -> fail-closed.
  const rootDir = fixtureDir("usage-write-unwritable");
  writeFileSync(join(rootDir, ".claude"), "not a directory");
  let threw = false;
  let wrote = null;
  try {
    wrote = writeUsageFile(rootDir, "sess-1", 10, 1000, "2026-07-07T00:00:00.000Z");
  } catch {
    threw = true;
  }
  ok("writeUsageFile: unwritable target never throws", threw === false);
  ok("writeUsageFile: unwritable target reports failure", wrote === false);
}

// ==========================================================================================
// CLI subprocess (real stdin pipe, real side-write)
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
  // REAL schema (Fixture-Blindness lesson): total_input_tokens NESTED under context_window.
  const rootDir = fixtureDir("cli-valid");
  const stdin = JSON.stringify({
    context_window: { used_percentage: 61.4, total_input_tokens: 122000, context_window_size: 200000 },
    model: { display_name: "Claude Sonnet 5" },
    session_id: "sess-cli-1",
  });
  const { status, stdout, stderr } = runCli(rootDir, stdin);
  ok("CLI: valid input -> exit 0", status === 0, `stderr=${stderr}`);
  ok("CLI: valid input -> exact status line on stdout", stdout === "Claude Sonnet 5 · Kontext 61% (122k)\n", JSON.stringify(stdout));
  const usagePath = join(rootDir, ".claude", ".usage-sess-cli-1.json");
  ok("CLI: valid input -> side-write exists", existsSync(usagePath));
  const usage = JSON.parse(readFileSync(usagePath, "utf8"));
  ok("CLI: side-write has correct usedPct/totalTokens", usage.usedPct === 61 && usage.totalTokens === 122000, JSON.stringify(usage));
  ok("CLI: side-write has an updatedAt timestamp", typeof usage.updatedAt === "string" && usage.updatedAt.length > 0);
  ok("CLI: side-write carries contextWindowSize (additive)", usage.contextWindowSize === 200000, JSON.stringify(usage));
}

{
  // 1M-context-window fixture, real schema: proves the fix populates totalTokens correctly
  // AND the DISPLAY shows the real token count (not a 200k-scaled approximation).
  const rootDir = fixtureDir("cli-valid-1m");
  const stdin = JSON.stringify({
    context_window: { used_percentage: 85, total_input_tokens: 850000, context_window_size: 1000000 },
    model: { display_name: "Claude Sonnet 5" },
    session_id: "sess-cli-1m",
  });
  const { status, stdout, stderr } = runCli(rootDir, stdin);
  ok("CLI: 1M-window input -> exit 0", status === 0, `stderr=${stderr}`);
  ok("CLI: 1M-window input -> DISPLAY shows real tokens (850k)", stdout === "Claude Sonnet 5 · Kontext 85% (850k)\n", JSON.stringify(stdout));
  const usage = JSON.parse(readFileSync(join(rootDir, ".claude", ".usage-sess-cli-1m.json"), "utf8"));
  ok(
    "CLI: 1M-window input -> side-write has real totalTokens + contextWindowSize",
    usage.usedPct === 85 && usage.totalTokens === 850000 && usage.contextWindowSize === 1000000,
    JSON.stringify(usage),
  );
}

{
  const rootDir = fixtureDir("cli-malformed-stdin");
  const { status, stdout } = runCli(rootDir, "{ this is not valid JSON ][");
  ok("CLI: malformed stdin -> exit 0", status === 0);
  ok("CLI: malformed stdin -> empty stdout (fail-open)", stdout === "");
}

{
  const rootDir = fixtureDir("cli-empty-stdin");
  const { status, stdout } = runCli(rootDir, "");
  ok("CLI: empty stdin -> exit 0", status === 0);
  ok("CLI: empty stdin -> empty stdout (fail-open)", stdout === "");
}

{
  // Valid JSON, but missing both pct and model -> buildStatus returns null -> silent.
  const rootDir = fixtureDir("cli-incomplete");
  const { status, stdout } = runCli(rootDir, JSON.stringify({ session_id: "sess-incomplete" }));
  ok("CLI: valid-but-incomplete stdin -> exit 0", status === 0);
  ok("CLI: valid-but-incomplete stdin -> empty stdout (fail-open)", stdout === "");
  ok("CLI: valid-but-incomplete stdin -> no side-write happened", !existsSync(join(rootDir, ".claude", ".usage-sess-incomplete.json")));
}

{
  // Valid pct+model but NO session_id -> line still prints, side-write silently skipped.
  const rootDir = fixtureDir("cli-no-session-id");
  const { status, stdout } = runCli(rootDir, JSON.stringify({ context_window: { used_percentage: 5 }, model: { display_name: "X" } }));
  ok("CLI: no session_id -> exit 0", status === 0);
  ok("CLI: no session_id -> status line still printed", stdout === "X · Kontext 5% (0k)\n", JSON.stringify(stdout));
  ok("CLI: no session_id -> .claude/ never created (no side-write target)", !existsSync(join(rootDir, ".claude")));
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
