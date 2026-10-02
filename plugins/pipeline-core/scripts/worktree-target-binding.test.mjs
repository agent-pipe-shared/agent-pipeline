#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after } from "node:test";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
function enrollFixtureGovernance(root) {
  const initialized = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  if (initialized.status !== 0) throw new Error("fixture git init failed: " + initialized.stderr);
  const controller = createGovernanceScopeController({ hostStateRoot: join(root, ".git", "fixture-hoststate") });
  const inactive = controller.observe({ rootDir: root });
  if (inactive.state !== "inactive" || inactive.requiresEnforcement) throw new Error("fixture scope was not initially inactive");
  const plan = controller.planDecision({ rootDir: root, decision: "enroll", by: "disposable-smoke-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  if (active.state !== "active" || !active.requiresEnforcement) throw new Error("fixture enrollment did not activate enforcement");
}
import { verifyEvidenceFixture } from "../lib/verify-selection-fixture.mjs";
const GUARD = fileURLToPath(new URL("../hooks/guard-push.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "btm-d1-linked-")), primary = join(root, "primary"), target = join(root, "target");
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
function artifact(dir, rel, value) { const path = join(dir, rel); mkdirSync(join(path, ".."), { recursive: true }); if (rel === "evidence/verify-latest.json" && value?.exitCode === 0 && !value.selection) value = verifyEvidenceFixture(value.commit); writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value)); }
function guard(command, cwd, projectDir = primary) { return spawnSync(process.execPath, [GUARD], { cwd, encoding: "utf8", input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }), env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir } }); }
let a, b;
after(() => rmSync(root, { recursive: true, force: true }));
const completionCases = [
{ id: "WTB001", name: "Linked target has its own Git directory and shared enrolled common directory", run: () => {
  mkdirSync(primary); const initialized = git(primary, "init", "-q", "-b", "main"); if (initialized.status !== 0) throw new Error("fixture git init failed: " + initialized.stderr); git(primary, "config", "user.name", "Fixture"); git(primary, "config", "user.email", "fixture@example.invalid"); writeFileSync(join(primary, "README.md"), "A\n"); git(primary, "add", "README.md"); git(primary, "commit", "-q", "-m", "A");
  assert.equal(git(primary, "worktree", "add", "-q", "-b", "target", target).status, 0);
  enrollFixtureGovernance(primary);
  const common = git(target, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim();
  const targetController = createGovernanceScopeController({ hostStateRoot: join(common, "fixture-hoststate-target") });
  assert.equal(targetController.observe({ rootDir: target }).state, "inactive");
  const targetPlan = targetController.planDecision({ rootDir: target, decision: "enroll", by: "disposable-linked-fixture" });
  const targetActive = targetController.applyDecision(targetPlan, { activate: true, planSha256: targetPlan.planSha256 });
  assert.equal(targetActive.state, "active");
  assert.equal(targetActive.requiresEnforcement, true);
  writeFileSync(join(target, "README.md"), "B\n"); git(target, "commit", "-qam", "B"); b = git(target, "rev-parse", "HEAD").stdout.trim(); a = git(primary, "rev-parse", "HEAD").stdout.trim();
  const listed = git(primary, "worktree", "list", "--porcelain").stdout; assert.ok(listed.includes(primary) && listed.includes(target));
  assert.equal(git(primary, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim(), git(target, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim());
  assert.notEqual(git(primary, "rev-parse", "--path-format=absolute", "--git-dir").stdout.trim(), git(target, "rev-parse", "--path-format=absolute", "--git-dir").stdout.trim());
  const manifest = "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n";
  artifact(primary, ".claude/pipeline.yaml", manifest); artifact(target, ".claude/pipeline.yaml", manifest);
  artifact(primary, "evidence/verify-latest.json", { exitCode: 1, commit: a }); artifact(target, "evidence/verify-latest.json", { exitCode: 0, commit: b });
} },
{ id: "WTB002", name: "Target CWD uses target evidence", run: () => {
  assert.equal(guard("git push origin target", target).status, 0, "target CWD must use target evidence");
} },
{ id: "WTB003", name: "Git target option uses target evidence", run: () => {
  assert.equal(guard(`git -C ${target} push origin target`, primary).status, 0, "git -C target must use target evidence");
} },
{ id: "WTB004", name: "Primary evidence cannot satisfy target", run: () => {
  rmSync(join(target, "evidence/verify-latest.json")); artifact(primary, "evidence/verify-latest.json", { exitCode: 0, commit: b });
  assert.equal(guard(`git -C ${target} push origin target`, primary).status, 2, "primary evidence must not satisfy target");
} },
{ id: "WTB005", name: "Target evidence binds the pushed source OID", run: () => {
  artifact(target, "evidence/verify-latest.json", { exitCode: 0, commit: a });
  assert.equal(guard("git push origin target", target).status, 2, "evidence must bind pushed source OID");
  console.log("worktree-target-binding: 7 assertions passed; guard-push.mjs unchanged");
} },
];
registerTestCaseCompletion({ cases: completionCases, fd: 3, maxBytes: 65536 });
