#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// backlog/items/2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md
// Directions 2 (granularity) and 3 (entry ownership). This dispatch (NVA-W1-6) never
// invokes `apply --activate` against a real project's `.claude/settings.json`; every
// write in this suite targets a throwaway fixture directory created and removed by the
// test itself.

import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  applySettingsAllowlistMerge,
  canonicalizeRunnerPermissionAllowlist,
  main as settingsAllowlistMergeCli,
  PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES,
  pipelineScriptsRunnerAllowlistEntries,
  planSettingsAllowlistMerge,
} from "./settings-allowlist-merge.mjs";

const ONBOARDING_PATTERN = "Bash(node plugins/pipeline-core/scripts/project-onboarding-v3.mjs *)";
const APPROVE_PUSH_PATTERN = "Bash(node plugins/pipeline-core/scripts/pipeline-state.mjs approve-push *)";

function freshDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `settings-allowlist-merge-${prefix}-`));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  return dir;
}

function settingsPath(dir) { return join(dir, ".claude", "settings.json"); }
function localSettingsPath(dir) { return join(dir, ".claude", "settings.local.json"); }
const SOURCE_SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

function installedCacheFixture(version) {
  const base = mkdtempSync(join(tmpdir(), "settings-allowlist-installed-cache-"));
  const plugin = join(base, ".claude", "plugins", "cache", "agent-pipeline", "pipeline-core", version);
  mkdirSync(join(plugin, "scripts"), { recursive: true });
  mkdirSync(join(plugin, "lib"), { recursive: true });
  copyFileSync(join(SOURCE_SCRIPTS_DIR, "settings-allowlist-merge.mjs"), join(plugin, "scripts", "settings-allowlist-merge.mjs"));
  copyFileSync(join(SOURCE_SCRIPTS_DIR, "..", "lib", "entrypoint.mjs"), join(plugin, "lib", "entrypoint.mjs"));
  return { base, plugin, script: join(plugin, "scripts", "settings-allowlist-merge.mjs") };
}

function invoke(args) {
  let output = "";
  const status = settingsAllowlistMergeCli(args, {
    write: (chunk) => { output += chunk; },
    writeError: (chunk) => { output += chunk; },
  });
  return { status, output };
}

test("candidate registry: granularity decision is encoded, not just documented", () => {
  assert.equal(PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES.length, 2);
  const onboarding = PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES.find((c) => c.id === "project-onboarding-v3");
  const approvePush = PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES.find((c) => c.id === "pipeline-state-approve-push");
  assert.equal(onboarding.pattern, ONBOARDING_PATTERN);
  assert.equal(onboarding.scope, "whole-script");
  assert.equal(approvePush.pattern, APPROVE_PUSH_PATTERN);
  assert.equal(approvePush.scope, "subcommand:approve-push");
  // The granularity decision itself: pipeline-state.mjs's entry must be scoped to the
  // approve-push subcommand, never widened to the whole script -- only approve-push was
  // verified closed by Direction 1.
  assert.ok(approvePush.pattern.includes(" approve-push "), "approve-push entry must not widen to the whole pipeline-state.mjs script");
  assert.ok(!approvePush.pattern.endsWith("pipeline-state.mjs *)"), "approve-push entry must not collapse to a whole-script prefix");
});

test("plan on a project with no settings.json proposes both candidates without writing", () => {
  const dir = freshDir("fresh");
  try {
    const plan = planSettingsAllowlistMerge({ rootDir: dir });
    assert.equal(plan.status, "ready");
    assert.deepEqual(plan.added.sort(), ["pipeline-state-approve-push", "project-onboarding-v3"]);
    assert.deepEqual(plan.skipped, []);
    assert.equal(plan.before.present, false);
    assert.ok(!existsSync(settingsPath(dir)), "plan must never write");
    const afterParsed = JSON.parse(plan.after.bytes);
    assert.deepEqual(afterParsed.permissions.allow.sort(), [APPROVE_PUSH_PATTERN, ONBOARDING_PATTERN].sort());
    assert.match(plan.planSha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan is deterministic across repeated calls on an unchanged fixture", () => {
  const dir = freshDir("deterministic");
  try {
    const first = planSettingsAllowlistMerge({ rootDir: dir });
    const second = planSettingsAllowlistMerge({ rootDir: dir });
    assert.equal(first.planSha256, second.planSha256);
    assert.equal(first.after.sha256, second.after.sha256);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan preserves unrelated existing settings.json content and only adds the missing candidate", () => {
  const dir = freshDir("partial");
  try {
    const existing = {
      statusLine: { type: "command", command: "node plugins/pipeline-core/scripts/statusline-context.mjs" },
      permissions: { allow: ["Bash(git push *)", ONBOARDING_PATTERN] },
      enabledPlugins: { "pipeline-core@agent-pipeline": true },
    };
    writeFileSync(settingsPath(dir), `${JSON.stringify(existing, null, 2)}\n`, "utf8");
    const plan = planSettingsAllowlistMerge({ rootDir: dir });
    assert.equal(plan.status, "ready");
    assert.deepEqual(plan.added, ["pipeline-state-approve-push"]);
    assert.deepEqual(plan.skipped, ["project-onboarding-v3"]);
    const afterParsed = JSON.parse(plan.after.bytes);
    assert.equal(afterParsed.statusLine.command, existing.statusLine.command);
    assert.equal(afterParsed.enabledPlugins["pipeline-core@agent-pipeline"], true);
    assert.deepEqual(afterParsed.permissions.allow, ["Bash(git push *)", ONBOARDING_PATTERN, APPROVE_PUSH_PATTERN]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan reports no-op once both candidates are already present", () => {
  const dir = freshDir("both-present");
  try {
    const existing = { permissions: { allow: [ONBOARDING_PATTERN, APPROVE_PUSH_PATTERN] } };
    writeFileSync(settingsPath(dir), `${JSON.stringify(existing, null, 2)}\n`, "utf8");
    const plan = planSettingsAllowlistMerge({ rootDir: dir });
    assert.equal(plan.status, "no-op");
    assert.deepEqual(plan.added, []);
    assert.deepEqual(plan.skipped.sort(), ["pipeline-state-approve-push", "project-onboarding-v3"]);
    assert.equal(plan.after, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("installed cache version A to B canonically replaces only the complete historical family", () => {
  const oldScripts = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.6.0/scripts";
  const newScripts = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.7.0/scripts";
  const oldEntries = pipelineScriptsRunnerAllowlistEntries(oldScripts);
  const newEntries = pipelineScriptsRunnerAllowlistEntries(newScripts);
  const unrelated = "Bash(node user-tool.mjs *)";
  const result = canonicalizeRunnerPermissionAllowlist([unrelated, ...oldEntries], newScripts);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.canonicalizedFamilies, ["0.6.0"]);
  assert.deepEqual(result.removed, oldEntries);
  assert.deepEqual(result.added, newEntries);
  assert.deepEqual(result.mergedAllow, [unrelated, ...newEntries]);
  assert.equal(result.mergedAllow.some((entry) => entry.includes("/pipeline-core/*")), false);
});

test("canonical runner permission replacement remains bounded across repeated cache upgrades", () => {
  const scriptsA = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.6.0/scripts";
  const scriptsB = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.7.0/scripts";
  const scriptsC = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.7.1/scripts";
  const unrelated = "PowerShell(node user-tool.mjs *)";
  const first = canonicalizeRunnerPermissionAllowlist([unrelated, ...pipelineScriptsRunnerAllowlistEntries(scriptsA)], scriptsB);
  const second = canonicalizeRunnerPermissionAllowlist(first.mergedAllow, scriptsC);
  assert.equal(second.status, "ready");
  assert.deepEqual(second.canonicalizedFamilies, ["0.7.0"]);
  assert.deepEqual(second.mergedAllow, [unrelated, ...pipelineScriptsRunnerAllowlistEntries(scriptsC)]);
  assert.equal(second.mergedAllow.length, 5, "each upgrade retains one current four-entry family only");
});

test("canonical runner permission replacement prunes a complete stale family when current entries already exist", () => {
  const oldScripts = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.6.0/scripts";
  const currentScripts = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.7.0/scripts";
  const oldEntries = pipelineScriptsRunnerAllowlistEntries(oldScripts);
  const currentEntries = pipelineScriptsRunnerAllowlistEntries(currentScripts);
  const result = canonicalizeRunnerPermissionAllowlist(["Bash(git status)", ...currentEntries, ...oldEntries], currentScripts);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.removed, oldEntries);
  assert.deepEqual(result.mergedAllow, ["Bash(git status)", ...currentEntries]);
});

test("partial current or historical cache families fail closed without a proposed replacement", () => {
  const oldScripts = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.6.0/scripts";
  const currentScripts = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.7.0/scripts";
  for (const entries of [
    pipelineScriptsRunnerAllowlistEntries(oldScripts).slice(0, 3),
    [...pipelineScriptsRunnerAllowlistEntries(oldScripts), pipelineScriptsRunnerAllowlistEntries(currentScripts)[0]],
  ]) {
    const result = canonicalizeRunnerPermissionAllowlist(entries, currentScripts);
    assert.equal(result.status, "unrepairable");
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.removed, []);
  }
});

test("foreign-lineage and broadened lookalike grants are retained and never classified as historical Pipeline entries", () => {
  const currentScripts = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.7.0/scripts";
  const foreignScripts = "/home/user/.claude/plugins/cache/another-marketplace/pipeline-core/0.6.0/scripts";
  const foreign = pipelineScriptsRunnerAllowlistEntries(foreignScripts);
  const broad = 'Bash(node "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/*")';
  const nonString = { customPermission: true };
  const result = canonicalizeRunnerPermissionAllowlist([...foreign, broad, nonString], currentScripts);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.mergedAllow, [...foreign, broad, nonString, ...pipelineScriptsRunnerAllowlistEntries(currentScripts)]);
});

test("a source checkout has no cache lineage and never retires cache-looking entries", () => {
  const sourceScripts = "/work/agent-pipeline/plugins/pipeline-core/scripts";
  const oldScripts = "/home/user/.claude/plugins/cache/agent-pipeline/pipeline-core/0.6.0/scripts";
  const oldEntries = pipelineScriptsRunnerAllowlistEntries(oldScripts);
  const result = canonicalizeRunnerPermissionAllowlist(oldEntries, sourceScripts);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.mergedAllow, [...oldEntries, ...pipelineScriptsRunnerAllowlistEntries(sourceScripts)]);
});

test("installed-cache fixture replaces an old permission family through the closed plan/apply contract", async () => {
  const fixture = installedCacheFixture("0.7.0-test");
  const project = freshDir("installed-cache-cli");
  try {
    const oldScripts = join(dirname(fixture.plugin), "0.6.0-test", "scripts");
    const currentScripts = join(fixture.plugin, "scripts");
    const oldEntries = pipelineScriptsRunnerAllowlistEntries(oldScripts);
    const unrelated = "Bash(node user-tool.mjs *)";
    writeFileSync(localSettingsPath(project), `${JSON.stringify({ permissions: { allow: [unrelated, ...oldEntries] } }, null, 2)}\n`);
    const installed = await import(pathToFileURL(fixture.script).href);
    let output = "";
    const planStatus = installed.main(["plan-runner-permissions", "--root", project], { write: (chunk) => { output += chunk; } });
    assert.equal(planStatus, 0);
    const plan = JSON.parse(output);
    assert.equal(plan.status, "ready");
    assert.deepEqual(plan.canonicalizedFamilies, ["0.6.0-test"]);
    assert.deepEqual(plan.removed, oldEntries);
    output = "";
    const applyStatus = installed.main(["apply-runner-permissions", "--root", project, "--plan-sha256", plan.planSha256, "--activate"], { write: (chunk) => { output += chunk; } });
    assert.equal(applyStatus, 0);
    const after = JSON.parse(readFileSync(localSettingsPath(project), "utf8"));
    assert.deepEqual(after.permissions.allow, [unrelated, ...pipelineScriptsRunnerAllowlistEntries(currentScripts)]);
    output = "";
    assert.equal(installed.main(["plan-runner-permissions", "--root", project], { write: (chunk) => { output += chunk; } }), 0);
    assert.equal(JSON.parse(output).status, "no-op");
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(fixture.base, { recursive: true, force: true });
  }
});

test("plan refuses to propose a merge over invalid JSON rather than blind-overwriting it", () => {
  const dir = freshDir("invalid-json");
  try {
    writeFileSync(settingsPath(dir), "{ not valid json", "utf8");
    const plan = planSettingsAllowlistMerge({ rootDir: dir });
    assert.equal(plan.status, "unrepairable");
    assert.equal(plan.diagnostics[0].code, "target_invalid_json");
    assert.equal(readFileSync(settingsPath(dir), "utf8"), "{ not valid json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan refuses a settings.json that is valid JSON but not an object", () => {
  const dir = freshDir("wrong-shape");
  try {
    writeFileSync(settingsPath(dir), "[]", "utf8");
    const plan = planSettingsAllowlistMerge({ rootDir: dir });
    assert.equal(plan.status, "unrepairable");
    assert.equal(plan.diagnostics[0].code, "target_invalid_shape");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plan and apply preserve present non-object permissions and non-array permissions.allow byte-for-byte", () => {
  const cases = [
    { label: "permissions-string", value: { permissions: "allow everything" }, code: "permissions_invalid_shape" },
    { label: "permissions-null", value: { permissions: null }, code: "permissions_invalid_shape" },
    { label: "allow-string", value: { permissions: { allow: "Bash(node *)" } }, code: "permissions_allow_invalid_shape" },
  ];
  for (const fixture of cases) {
    const dir = freshDir(fixture.label);
    try {
      const bytes = `${JSON.stringify({ unrelated: true, ...fixture.value }, null, 2)}\n`;
      writeFileSync(localSettingsPath(dir), bytes, "utf8");
      const plan = planSettingsAllowlistMerge({ rootDir: dir, candidateSet: "runner-permissions" });
      assert.equal(plan.status, "unrepairable", fixture.label);
      assert.equal(plan.diagnostics[0].code, fixture.code, fixture.label);
      assert.equal(readFileSync(localSettingsPath(dir), "utf8"), bytes, `${fixture.label}: plan changed bytes`);
      const applied = applySettingsAllowlistMerge({
        rootDir: dir,
        candidateSet: "runner-permissions",
        planSha256: "0".repeat(64),
        activate: true,
      });
      assert.equal(applied.status, "unrepairable", fixture.label);
      assert.equal(applied.diagnostics[0].code, fixture.code, fixture.label);
      assert.equal(readFileSync(localSettingsPath(dir), "utf8"), bytes, `${fixture.label}: apply changed bytes`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("runner permissions are written only to ignored local settings and never dirty project policy", () => {
  const dir = freshDir("runner-local-target");
  try {
    const committedBytes = `${JSON.stringify({ permissions: { allow: ["Bash(git push *)"] } }, null, 2)}\n`;
    writeFileSync(settingsPath(dir), committedBytes, "utf8");
    const plan = planSettingsAllowlistMerge({ rootDir: dir, candidateSet: "runner-permissions" });
    assert.equal(plan.status, "ready");
    assert.equal(plan.target, ".claude/settings.local.json");
    const applied = applySettingsAllowlistMerge({
      rootDir: dir,
      candidateSet: "runner-permissions",
      planSha256: plan.planSha256,
      activate: true,
    });
    assert.equal(applied.status, "ready");
    assert.equal(readFileSync(settingsPath(dir), "utf8"), committedBytes);
    assert.equal(readFileSync(localSettingsPath(dir), "utf8"), plan.after.bytes);
    assert.equal(planSettingsAllowlistMerge({ rootDir: dir, candidateSet: "runner-permissions" }).status, "no-op");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply without --activate never writes", () => {
  const dir = freshDir("no-activate");
  try {
    const plan = planSettingsAllowlistMerge({ rootDir: dir });
    const result = applySettingsAllowlistMerge({ rootDir: dir, planSha256: plan.planSha256, activate: false });
    assert.equal(result.status, "activation-required");
    assert.ok(!existsSync(settingsPath(dir)), "apply without --activate must never write");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply refuses a stale or mismatched plan digest and never writes", () => {
  const dir = freshDir("stale-digest");
  try {
    const result = applySettingsAllowlistMerge({ rootDir: dir, planSha256: "0".repeat(64), activate: true });
    assert.equal(result.status, "invalid-plan");
    assert.ok(!existsSync(settingsPath(dir)), "apply with a mismatched plan digest must never write");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply with a correct plan digest and --activate writes exactly the planned bytes, then is idempotent", () => {
  const dir = freshDir("activate");
  try {
    const plan = planSettingsAllowlistMerge({ rootDir: dir });
    const result = applySettingsAllowlistMerge({ rootDir: dir, planSha256: plan.planSha256, activate: true });
    assert.equal(result.status, "ready");
    assert.equal(readFileSync(settingsPath(dir), "utf8"), plan.after.bytes);

    const replanned = planSettingsAllowlistMerge({ rootDir: dir });
    assert.equal(replanned.status, "no-op", "re-planning after a successful apply must find nothing left to add");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply detects the target changed since planning and refuses rather than clobbering it", () => {
  const dir = freshDir("changed-since-plan");
  try {
    const plan = planSettingsAllowlistMerge({ rootDir: dir });
    // Simulate a concurrent writer between plan and apply.
    writeFileSync(settingsPath(dir), `${JSON.stringify({ permissions: { allow: ["Bash(git push *)"] } }, null, 2)}\n`, "utf8");
    const result = applySettingsAllowlistMerge({ rootDir: dir, planSha256: plan.planSha256, activate: true });
    assert.equal(result.status, "invalid-plan");
    const onDisk = JSON.parse(readFileSync(settingsPath(dir), "utf8"));
    assert.deepEqual(onDisk.permissions.allow, ["Bash(git push *)"], "apply must not overwrite a target that changed since planning");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apply on a project missing the .claude directory itself fails closed without crashing", () => {
  const dir = mkdtempSync(join(tmpdir(), "settings-allowlist-merge-no-claude-dir-"));
  try {
    const plan = planSettingsAllowlistMerge({ rootDir: dir });
    assert.equal(plan.status, "ready");
    const result = applySettingsAllowlistMerge({ rootDir: dir, planSha256: plan.planSha256, activate: true });
    assert.equal(result.status, "write-failed");
    assert.ok(!existsSync(settingsPath(dir)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: plan exits 0 and prints the proposed diff without writing", () => {
  const dir = freshDir("cli-plan");
  try {
    const { status, output } = invoke(["plan", "--root", dir]);
    assert.equal(status, 0);
    const parsed = JSON.parse(output);
    assert.equal(parsed.status, "ready");
    assert.ok(!existsSync(settingsPath(dir)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: apply without --plan-sha256 is refused by the CLI's own closed parser", () => {
  const dir = freshDir("cli-apply-missing-digest");
  try {
    const { status, output } = invoke(["apply", "--root", dir, "--activate"]);
    assert.equal(status, 2);
    assert.match(output, /apply requires --plan-sha256/);
    assert.ok(!existsSync(settingsPath(dir)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: unrecognized subcommand and unrecognized flag are refused (closed set, not open)", () => {
  const dir = freshDir("cli-closed-set");
  try {
    const bad = invoke(["definitely-not-a-real-command", "--root", dir]);
    assert.equal(bad.status, 2);
    assert.match(bad.output, /unknown argument: definitely-not-a-real-command/);
    const badFlag = invoke(["plan", "--root", dir, "--smuggled-flag", "value"]);
    assert.equal(badFlag.status, 2);
    assert.match(badFlag.output, /unknown argument: --smuggled-flag/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: plan then apply --activate round-trips end to end through argv, not just the library functions", () => {
  const dir = freshDir("cli-round-trip");
  try {
    const planned = invoke(["plan", "--root", dir]);
    const plan = JSON.parse(planned.output);
    const applied = invoke(["apply", "--root", dir, "--plan-sha256", plan.planSha256, "--activate"]);
    assert.equal(applied.status, 0);
    const appliedResult = JSON.parse(applied.output);
    assert.equal(appliedResult.status, "ready");
    assert.equal(readFileSync(settingsPath(dir), "utf8"), plan.after.bytes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
