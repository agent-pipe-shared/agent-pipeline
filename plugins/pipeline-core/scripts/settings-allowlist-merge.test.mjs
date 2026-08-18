#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// backlog/items/2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md
// Directions 2 (granularity) and 3 (entry ownership). This dispatch (NVA-W1-6) never
// invokes `apply --activate` against a real project's `.claude/settings.json`; every
// write in this suite targets a throwaway fixture directory created and removed by the
// test itself.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applySettingsAllowlistMerge,
  main as settingsAllowlistMergeCli,
  PIPELINE_CLI_SETTINGS_ALLOWLIST_CANDIDATES,
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
