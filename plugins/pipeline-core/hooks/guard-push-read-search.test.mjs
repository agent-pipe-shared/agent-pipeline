#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * C23-SHELL-READ-TOIL (AC-108): a read-only rg/grep search whose quoted PATTERN names `git` next to ( ) { $ or a backtick is no push
 * attempt. Before, guard-push classified any command that names git beside such a marker as a push candidate and refused it with
 * "push target is not unambiguous" -- while its advice ("use rg") was exactly what had been run.
 *
 * The positive cases are the two reproductions of the live runs and their single-quote, grep, pipe and `&&` spellings. The negative
 * cases are the ones that must stay refused: a push anywhere in the command, a substitution that the shell would expand, a pipe into
 * git, and a chain that continues with a push. Every refusal is measured against an ACTIVE push gate (manifest plus verify evidence),
 * otherwise the guard would exit 0 before the classifier and a "block" expectation would be vacuous.
 *
 * Run: node --test plugins/pipeline-core/hooks/guard-push-read-search.test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { verifyEvidenceFixture } from "../lib/verify-selection-fixture.mjs";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));
const REFUSAL = "push target is not unambiguous";

function activeGateRepo() {
  const dir = mkdtempSync(join(tmpdir(), "guard-push-read-search-"));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  const controller = createGovernanceScopeController({ hostStateRoot: join(dir, ".git", "fixture-hoststate") });
  const plan = controller.planDecision({ rootDir: dir, decision: "enroll", by: "disposable-guard-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  assert.equal(active.requiresEnforcement, true, "fixture governance must be active");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "state.md"), "git-guard GIT-03 reads here\nthe (git -C|worktree) note\n");
  writeFileSync(join(dir, "docs", "a.md"), "a git {x} line\n");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md", "docs");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: required\n");
  mkdirSync(join(dir, "evidence"), { recursive: true });
  writeFileSync(join(dir, "evidence", "verify-latest.json"), JSON.stringify(verifyEvidenceFixture(head)));
  return dir;
}

function run(command, dir) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 20000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

const ALLOWED = [
  // The two reproductions, double quoted as the live runs wrote them.
  'rg -n "git-guard GIT-03.{0,700}" docs/state.md',
  'rg -n "(git -C|worktree)" docs',
  // The same with single quotes, and with grep.
  "rg -n 'git-guard GIT-03.{0,700}' docs/state.md",
  "rg -n '(git -C|worktree)' docs",
  'grep -n "(git -C|worktree)" docs/state.md',
  // A pattern that holds a dollar sign stands in single quotes and is literal there.
  "rg -n 'git$' docs/state.md",
  // The bounded pipelines and chains the shared grammar admits.
  'rg -n "(git -C|worktree)" docs/state.md | head -5',
  'rg -n "(git -C|worktree)" docs/state.md | rg -n "note"',
  'rg -n "(git" docs/state.md && rg -n "{git" docs/a.md',
];

const REFUSED = [
  // A push in any position is still a push candidate.
  "git push origin main:refs/heads/x",
  "rg -n 'git' docs && git push origin main:refs/heads/x",
  "rg -n 'git' docs ; git push origin main:refs/heads/x",
  "rg -n 'git' docs | git push origin main:refs/heads/x",
  // A substitution the shell would expand runs the push.
  "rg x $(git push origin HEAD)",
  'rg "$(git push)" docs',
  'rg "`git push`" docs',
  // The word git as the executable of any segment is not a pattern.
  "git log -1 --format=%H && rg -n '(git' docs",
];

test("a read-only search that names git only inside a quoted pattern is no push attempt", () => {
  const dir = activeGateRepo();
  try {
    for (const command of ALLOWED) {
      const { code, stderr } = run(command, dir);
      assert.equal(code, 0, `${command}\n${stderr}`);
      assert.equal(stderr.trim(), "", command);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a push anywhere in the command, or a substitution that would run one, stays refused", () => {
  const dir = activeGateRepo();
  try {
    for (const command of REFUSED) {
      const { code, stderr } = run(command, dir);
      assert.equal(code, 2, `${command}\n${stderr}`);
      assert.ok(stderr.length > 0, command);
    }
    // The classic marker refusal keeps its text for a command that is not a search.
    const marker = run("git diff $(git merge-base HEAD main)", dir);
    assert.equal(marker.code, 2);
    assert.ok(marker.stderr.includes(REFUSAL), marker.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
