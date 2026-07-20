#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const GUARD = fileURLToPath(new URL("../hooks/guard-push.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "btm-d1-linked-")), primary = join(root, "primary"), target = join(root, "target");
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
function artifact(dir, rel, value) { const path = join(dir, rel); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value)); }
function guard(command, cwd, projectDir = primary) { return spawnSync(process.execPath, [GUARD], { cwd, encoding: "utf8", input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }), env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir } }); }
try {
  mkdirSync(primary); git(primary, "init", "-q", "-b", "main"); git(primary, "config", "user.name", "Fixture"); git(primary, "config", "user.email", "fixture@example.invalid"); writeFileSync(join(primary, "README.md"), "A\n"); git(primary, "add", "README.md"); git(primary, "commit", "-q", "-m", "A");
  assert.equal(git(primary, "worktree", "add", "-q", "-b", "target", target).status, 0);
  writeFileSync(join(target, "README.md"), "B\n"); git(target, "commit", "-qam", "B"); const b = git(target, "rev-parse", "HEAD").stdout.trim(); const a = git(primary, "rev-parse", "HEAD").stdout.trim();
  const listed = git(primary, "worktree", "list", "--porcelain").stdout; assert.ok(listed.includes(primary) && listed.includes(target));
  assert.equal(git(primary, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim(), git(target, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.trim());
  assert.notEqual(git(primary, "rev-parse", "--path-format=absolute", "--git-dir").stdout.trim(), git(target, "rev-parse", "--path-format=absolute", "--git-dir").stdout.trim());
  const manifest = "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: standing-approved\n";
  artifact(primary, ".claude/pipeline.yaml", manifest); artifact(target, ".claude/pipeline.yaml", manifest);
  artifact(primary, "evidence/verify-latest.json", { exitCode: 1, commit: a }); artifact(target, "evidence/verify-latest.json", { exitCode: 0, commit: b });
  assert.equal(guard("git push origin target", target).status, 0, "target CWD must use target evidence");
  assert.equal(guard(`git -C ${target} push origin target`, primary).status, 0, "git -C target must use target evidence");
  rmSync(join(target, "evidence/verify-latest.json")); artifact(primary, "evidence/verify-latest.json", { exitCode: 0, commit: b });
  assert.equal(guard(`git -C ${target} push origin target`, primary).status, 2, "primary evidence must not satisfy target");
  artifact(target, "evidence/verify-latest.json", { exitCode: 0, commit: a });
  assert.equal(guard("git push origin target", target).status, 2, "evidence must bind pushed source OID");
  console.log("worktree-target-binding: 7 assertions passed; guard-push.mjs unchanged");
} finally { rmSync(root, { recursive: true, force: true }); }
