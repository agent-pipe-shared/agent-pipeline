#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * setup-check.test.mjs — test suite for the SessionStart setup-completion reminder hook
 * (setup-check.mjs, AP2 P3a completion wave).
 *
 * Coverage contract (briefing DoD field 3, item 3):
 *   - isStillDefault: unconfigured intent -> true, configured intent -> false,
 *     missing/empty setup block -> false, null -> false
 *   - buildSetupIncompleteMessage: "missing" vs "default-markers" wording
 *   - decideOutput: missing file -> active JSON, default markers -> active JSON, fully
 *     set-up -> silent empty, unparseable/ambiguous -> silent empty
 *
 * Plus a real-CLI-subprocess section (mirrors staleness-check.test.mjs /
 * post-compact-reground.test.mjs's pattern) exercising run()'s CLAUDE_PROJECT_DIR-relative
 * file read against OS-tmpdir fixtures -- never this repo's real pipeline.user.yaml.
 *
 * Run:   node plugins/pipeline-core/hooks/setup-check.test.mjs
 * Exit:  0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_SETUP_INTENT, isStillDefault, buildSetupIncompleteMessage, decideOutput, decideFromProjectDir } from "./setup-check.mjs";

const SCRIPT = fileURLToPath(new URL("./setup-check.mjs", import.meta.url));

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

const WORKDIR = mkdtempSync(join(tmpdir(), "setup-check-test-"));
function fixtureDir(name) {
  const dir = join(WORKDIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function writeRaw(path, text) {
  writeFileSync(path, text);
}

// ======================================================================================
// isStillDefault
// ======================================================================================
ok(
  "isStillDefault: unconfigured setup intent -> true",
  isStillDefault({ setup: { intent: DEFAULT_SETUP_INTENT } }) === true,
);
ok(
  "isStillDefault: consumer setup intent -> false",
  isStillDefault({ setup: { intent: "consumer" } }) === false,
);
ok("isStillDefault: setup block missing entirely -> false", isStillDefault({ language: { human_facing: "de" } }) === false);
ok("isStillDefault: setup block empty object -> false", isStillDefault({ setup: {} }) === false);
ok("isStillDefault: setup not an object (string) -> false", isStillDefault({ setup: "not an object" }) === false);
ok("isStillDefault: parsed is null -> false", isStillDefault(null) === false);
ok("isStillDefault: parsed is a non-object (array) -> false", isStillDefault([]) === false);
ok("isStillDefault: parsed is undefined -> false", isStillDefault(undefined) === false);

// ======================================================================================
// buildSetupIncompleteMessage — "missing" vs "default-markers" wording
// ======================================================================================
{
  const msg = buildSetupIncompleteMessage("missing");
  ok("buildSetupIncompleteMessage missing: names the setup.mjs command", msg.includes("setup.mjs"), msg);
  ok("buildSetupIncompleteMessage missing: mentions the file is absent (fresh clone)", msg.includes("is still missing"), msg);
  ok(
    "buildSetupIncompleteMessage missing: does NOT use the default-markers wording",
    !msg.includes("default markers"),
    msg,
  );
}
{
  const msg = buildSetupIncompleteMessage("default-markers");
  ok("buildSetupIncompleteMessage default-markers: names the setup.mjs command", msg.includes("setup.mjs"), msg);
  ok("buildSetupIncompleteMessage default-markers: names the unconfigured intent", msg.includes("unconfigured setup intent"), msg);
  ok(
    "buildSetupIncompleteMessage default-markers: does NOT use the 'is still missing' missing-file wording",
    !msg.includes("is still missing"),
    msg,
  );
}
ok(
  "buildSetupIncompleteMessage: missing vs default-markers produce genuinely different text",
  buildSetupIncompleteMessage("missing") !== buildSetupIncompleteMessage("default-markers"),
);

// ======================================================================================
// decideOutput
// ======================================================================================
{
  const { stdout, json, payload } = decideOutput({ fileExists: false, parsed: null });
  ok("decideOutput missing file: non-empty stdout (active)", stdout !== "", stdout);
  ok("decideOutput missing file: json=true", json === true);
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    /* asserted below */
  }
  ok("decideOutput missing file: stdout is valid JSON", parsed !== null, stdout);
  ok("decideOutput missing file: hookSpecificOutput.hookEventName is SessionStart", parsed?.hookSpecificOutput?.hookEventName === "SessionStart");
  ok("decideOutput missing file: systemMessage matches the 'missing' wording", parsed?.systemMessage === buildSetupIncompleteMessage("missing"));
  ok("decideOutput missing file: additionalContext mirrors systemMessage", parsed?.hookSpecificOutput?.additionalContext === parsed?.systemMessage);
  ok("decideOutput missing file: payload matches the parsed stdout", JSON.stringify(payload) === stdout.trim());
}
{
  const { stdout, json } = decideOutput({ fileExists: true, parsed: { setup: { intent: DEFAULT_SETUP_INTENT } } });
  ok("decideOutput default markers: non-empty stdout (active)", stdout !== "", stdout);
  ok("decideOutput default markers: json=true", json === true);
  const parsed = JSON.parse(stdout);
  ok(
    "decideOutput default markers: systemMessage matches the 'default-markers' wording",
    parsed.systemMessage === buildSetupIncompleteMessage("default-markers"),
  );
}
{
  const { stdout, json } = decideOutput({
    fileExists: true,
    parsed: { setup: { intent: "maintainer" } },
  });
  ok("decideOutput fully set-up: silent (empty stdout)", stdout === "", stdout);
  ok("decideOutput fully set-up: json=false", json === false);
}
{
  // Unparseable/ambiguous: caller already resolved this to `parsed: null` while
  // `fileExists: true` (setup-check.mjs's own run() does this on any read/parse error) --
  // fail-open, never a guess-based nag.
  const { stdout, json } = decideOutput({ fileExists: true, parsed: null });
  ok("decideOutput unparseable (file exists, parsed null): silent (empty stdout)", stdout === "", stdout);
  ok("decideOutput unparseable: json=false", json === false);
}
{
  // Ambiguous shape: parsed is a non-object (e.g. a bare YAML scalar document) -- isStillDefault
  // returns false (no identity block to read), so this is silent too.
  const { stdout } = decideOutput({ fileExists: true, parsed: "just a string" });
  ok("decideOutput ambiguous non-object parsed: silent (empty stdout)", stdout === "", stdout);
}

// ======================================================================================
// Full CLI process (spawns the real script; CLAUDE_PROJECT_DIR points at tmp fixtures)
// ======================================================================================
function runCli(rootDir) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: rootDir },
  });
  // Some restricted runners disallow subprocess creation (EPERM). Exercise the
  // same filesystem resolver in that case; normal CI still validates the real
  // executable entrypoint above.
  if (res.error?.code === "EPERM") {
    const { stdout } = decideFromProjectDir(rootDir);
    return { status: 0, stdout, stderr: "" };
  }
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

{
  const rootDir = fixtureDir("cli-missing-file");
  // pipeline.user.yaml intentionally not written.
  const { status, stdout } = runCli(rootDir);
  ok("CLI: missing pipeline.user.yaml -> exit 0", status === 0);
  ok("CLI: missing pipeline.user.yaml -> active JSON on stdout", stdout.trim() !== "" && JSON.parse(stdout).systemMessage.includes("setup.mjs"), stdout);
}

{
  const rootDir = fixtureDir("cli-default-markers");
  writeRaw(
    join(rootDir, "pipeline.user.yaml"),
    `setup:\n  intent: "${DEFAULT_SETUP_INTENT}"\n`,
  );
  const { status, stdout } = runCli(rootDir);
  ok("CLI: default markers -> exit 0", status === 0);
  const parsed = JSON.parse(stdout);
  ok("CLI: default markers -> active JSON, unconfigured-intent wording", parsed.systemMessage.includes("unconfigured setup intent"), stdout);
}

{
  const rootDir = fixtureDir("cli-fully-set-up");
  writeRaw(
    join(rootDir, "pipeline.user.yaml"),
    `setup:\n  intent: "maintainer"\n`,
  );
  const { status, stdout } = runCli(rootDir);
  ok("CLI: fully set up -> exit 0", status === 0);
  ok("CLI: fully set up -> silent (empty stdout)", stdout === "", stdout);
}

{
  const rootDir = fixtureDir("cli-malformed-yaml");
  // Flow-style mapping is OUTSIDE yaml-lite's strict subset -> parseYaml throws -> fail-open.
  writeRaw(join(rootDir, "pipeline.user.yaml"), `setup: { intent: "consumer" }\n`);
  const { status, stdout } = runCli(rootDir);
  ok("CLI: malformed/unsupported YAML -> exit 0 (fail-open, never blocks)", status === 0);
  ok("CLI: malformed/unsupported YAML -> silent (empty stdout)", stdout === "", stdout);
}

{
  const rootDir = fixtureDir("cli-yaml-array-document");
  // A well-formed yaml-lite document whose top-level value is an array, not an object --
  // run()'s own `!Array.isArray(value)` guard treats this as parsed=null (ambiguous).
  writeRaw(join(rootDir, "pipeline.user.yaml"), `- one\n- two\n`);
  const { status, stdout } = runCli(rootDir);
  ok("CLI: top-level YAML array (non-object document) -> exit 0", status === 0);
  ok("CLI: top-level YAML array (non-object document) -> silent (ambiguous, fail-open)", stdout === "", stdout);
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
