// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.claude-session-start-emits-codex-transcript-recovery-hint (AC-126).
// Original acceptance (item Description/Proposal): a Claude SessionStart must not inject a
// Codex-specific transcript recovery hint. Either the runner is derived from the hosting runner or
// the wiring is removed, and a test asserts the Claude SessionStart output never names another
// runner. The injected text must also not embed absolute host paths of the plugin or repository.
// The real hook CLI is run exactly as the shipped hooks.json wires it; no behaviour is mocked.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";

import { createGovernanceScopeController } from "../governance-scope.mjs";
import { buildAvailabilityContext } from "../../hooks/staleness-check.mjs";

const pluginRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const hookScript = join(pluginRoot, "hooks", "codex-session-start-hint.mjs");
const hooksJson = JSON.parse(readFileSync(join(pluginRoot, "hooks", "hooks.json"), "utf8"));
const scratchParent = resolve(fileURLToPath(new URL("../../../../scratch/", import.meta.url)));
mkdirSync(scratchParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(scratchParent, "claude-ss-hint-pin-"));
after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function enrolled(name) {
  const dir = join(fixtureRoot, name);
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const init = spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8", shell: false });
  assert.equal(init.status, 0, init.stderr);
  writeFileSync(join(dir, ".claude", "pipeline.json"), "{}\n");
  const controller = createGovernanceScopeController({ hostStateRoot: join(dir, ".git", "fixture-host-state") });
  const plan = controller.planDecision({ rootDir: dir, decision: "enroll", by: "claude-ss-hint-pin" });
  assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  return dir;
}

/** Run the real hook the way Claude Code does: node <script> <configured args>, JSON on stdin. */
function runHook(cwd, args, input) {
  const result = spawnSync(process.execPath, [hookScript, ...args], {
    cwd, input: JSON.stringify(input), encoding: "utf8", shell: false, timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 1, "exactly one JSON line");
  return JSON.parse(lines[0]);
}

/** The args the shipped Claude wiring passes after the script path. */
function configuredClaudeArgs(matcher = "startup|resume|clear") {
  const entries = hooksJson.hooks.SessionStart.filter((row) => row.matcher === matcher)
    .flatMap((row) => row.hooks).filter((row) => row.command.includes("codex-session-start-hint.mjs"));
  assert.equal(entries.length, 1, "exactly one shared hint entry in the Claude matcher");
  const tail = entries[0].command.split("codex-session-start-hint.mjs\"")[1];
  return tail.trim().split(/\s+/u).filter(Boolean);
}

const OTHER_RUNNER = /codex|antigravity|gemini|\$CODEX_HOME|~\/\.codex|runner-transcript-recovery|--runner\s+(?!claude)/iu;

test("A1 wiring: the Claude SessionStart hint entry declares the claude runner explicitly", () => {
  assert.deepEqual(configuredClaudeArgs(), ["--runner", "claude"]);
});

test("A1b wiring: the compact matcher does not carry the hint script (no second runner-blind path)", () => {
  const compact = hooksJson.hooks.SessionStart.filter((row) => row.matcher === "compact").flatMap((row) => row.hooks);
  assert.ok(compact.length > 0);
  for (const row of compact) assert.doesNotMatch(row.command, /codex-session-start-hint/u);
});

for (const source of ["startup", "resume", "clear"]) {
  test(`A2 real CLI as configured (${source}): Claude output never names another runner`, () => {
    const dir = enrolled(`governed-${source}`);
    const output = runHook(dir, configuredClaudeArgs(), {
      hook_event_name: "SessionStart", source, session_id: `claude-session-${source}`, cwd: dir,
    });
    const context = output.hookSpecificOutput.additionalContext;
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(context, /Agent Pipeline is active for this repository/u);
    assert.doesNotMatch(context, OTHER_RUNNER);
    assert.doesNotMatch(output.systemMessage, OTHER_RUNNER);
    assert.match(context, /Transcript recovery is unavailable for this runner/u);
  });
}

test("A3 no absolute host paths of the plugin or repository are embedded for Claude", () => {
  const dir = enrolled("governed-paths");
  const output = runHook(dir, configuredClaudeArgs(), {
    hook_event_name: "SessionStart", source: "startup", session_id: "claude-session-paths", cwd: dir,
  });
  const text = JSON.stringify(output);
  for (const forbidden of [pluginRoot, dir, fixtureRoot]) {
    for (const form of [forbidden, forbidden.replaceAll("\\", "/"), JSON.stringify(forbidden).slice(1, -1)]) {
      assert.ok(!text.includes(form), `output must not embed ${form === forbidden ? "path" : "path spelling"}`);
    }
  }
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/u, "no drive-letter absolute path");
});

test("A4 a session identity does not unlock a list/read command for Claude", () => {
  const dir = enrolled("governed-identity");
  const withId = runHook(dir, ["--runner", "claude"], { hook_event_name: "SessionStart", source: "startup", session_id: "abc", cwd: dir });
  const withoutId = runHook(dir, ["--runner", "claude"], { hook_event_name: "SessionStart", source: "startup", cwd: dir });
  for (const output of [withId, withoutId]) {
    assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /\blist\b.*--exclude-session|--session-id/u);
    assert.doesNotMatch(output.hookSpecificOutput.additionalContext, OTHER_RUNNER);
  }
});

test("A5 fail-closed runner handling: missing, unknown or malformed runner argument never falls back to Codex", () => {
  const dir = enrolled("governed-runner-args");
  for (const args of [[], ["--runner", "bogus"], ["--runner"], ["--runner", "claude", "extra"], ["--runner", "CODEX"]]) {
    const output = runHook(dir, args, { hook_event_name: "SessionStart", source: "startup", session_id: "abc", cwd: dir });
    const context = output.hookSpecificOutput.additionalContext;
    assert.doesNotMatch(context, OTHER_RUNNER, `args ${JSON.stringify(args)}`);
    assert.match(context, /Transcript recovery is unavailable for this runner/u);
  }
});

test("A6 positive control: the Codex runner still gets the Codex-scoped list (the guard above can fail)", () => {
  const dir = enrolled("governed-codex");
  const output = runHook(dir, ["--runner", "codex"], { hook_event_name: "SessionStart", source: "startup", session_id: "codex-current", cwd: dir });
  const context = output.hookSpecificOutput.additionalContext;
  assert.match(context, /--runner codex --exclude-session "codex-current"/u);
  assert.match(context, OTHER_RUNNER, "the detector used in A2-A5 recognises the Codex hint");
  assert.match(context, /[A-Za-z]:[\\/]/u, "the drive-letter path detector used in A3 recognises the embedded host path");
});

test("A7 optional (not enrolled) folder: the Claude output also names no other runner", () => {
  const dir = join(fixtureRoot, "not-governed");
  mkdirSync(dir, { recursive: true });
  const init = spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf8", shell: false });
  assert.equal(init.status, 0, init.stderr);
  const result = spawnSync(process.execPath, [hookScript, ...configuredClaudeArgs()], {
    cwd: dir, input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup", session_id: "x", cwd: dir }),
    encoding: "utf8", shell: false, timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, OTHER_RUNNER);
});

test("A9 per-channel ref (PO decision #25): the staleness context line names a configured ref and its source", () => {
  const line = buildAvailabilityContext({
    status: "current", channel: "alpha", channelSource: "project-config",
    ref: "refs/heads/feat/x", refSource: "configured", reason: null,
  });
  assert.match(line, /ref=refs\/heads\/feat\/x · refSource=configured/u);
  assert.doesNotMatch(line, OTHER_RUNNER);
  assert.doesNotMatch(line, /refs\/heads\/main/u);
});

test("A8 staleness-check ref question is outside this hint script: the hint wiring carries no ref/channel claim", () => {
  assert.ok(existsSync(hookScript));
  const source = readFileSync(hookScript, "utf8");
  assert.doesNotMatch(source, /refs\/heads\/main/u);
});
