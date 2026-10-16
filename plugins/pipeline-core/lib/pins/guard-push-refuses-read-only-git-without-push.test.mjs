// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin for pipeline.guard-push-refuses-read-only-git-without-push (AC-195, ALF-C-P7-01).
 *
 * Original acceptance (backlog item Proposal): guard-push classifies only an actual `push` subcommand (after global
 * options) as a push; `--version`/`version` never reach it (point 1); a nested shell's non-push git verbs were meant
 * to never reach it either (point 2) -- but that second clause is SUPERSEDED by PO decision Q12 option B (the nested
 * shell fail-closed marker rule, lib/git-cmd.mjs header): a nested shell naming git stays refused, and the relief is
 * procedural text. This pin retains that accepted supersession (point 2 is pinned as a deliberate refusal) and must not
 * be read as broadening the guard to satisfy the old unconditional wording. Real pushes stay refused (point 3).
 *
 * Every case runs the REAL guard (hooks/guard-push.mjs) as a subprocess in a fresh fixture repository with an active
 * blocking push gate under the repository's scratch/ (never the OS temp dir), plus the real classifier
 * (lib/git-cmd.mjs commandIsGitPush). Nothing under test is mocked.
 *
 * Meaningfulness: a scratch mirror of the DEFECT (any `git` word is a push candidate) must fail the point-1 cases.
 *
 * Host limitation: no case needs directory mode bits or directory symlinks, so none is skipped. (Linux/WSL re-run,
 * owner Coordinator, due 2026-10-19, PO decision K7, is only a platform cross-check.)
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { commandIsGitPush } from "../git-cmd.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, "..", "..", "hooks", "guard-push.mjs");
const SCRATCH = join(HERE, "..", "..", "..", "..", "scratch");
const BLOCK = 2;
const ALLOW = 0;
const OLD_AMBIGUOUS = "only git [-C <path>] push is accepted";

mkdirSync(SCRATCH, { recursive: true });
const fixtureRoot = mkdtempSync(join(SCRATCH, "gprog-pin-"));
after(() => rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 3 }));

function gitAt(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
}

function put(dir, rel, text) {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

function gatedRepo() {
  const dir = join(fixtureRoot, "repo");
  mkdirSync(dir, { recursive: true });
  const init = gitAt(dir, "init", "-q", "-b", "main");
  if (init.status !== 0) throw new Error(`fixture git init failed: ${init.stderr}`);
  const controller = createGovernanceScopeController({ hostStateRoot: join(dir, ".git", "fixture-hoststate") });
  const plan = controller.planDecision({ rootDir: dir, decision: "enroll", by: "disposable-guard-fixture" });
  const active = controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  if (active.state !== "active" || !active.requiresEnforcement) throw new Error("fixture governance not active");
  gitAt(dir, "config", "user.email", "goldfish@example.invalid");
  gitAt(dir, "config", "user.name", "Goldfish");
  gitAt(dir, "config", "commit.gpgSign", "false");
  put(dir, "README.md", "fixture\n");
  put(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: required\n");
  gitAt(dir, "add", "README.md");
  gitAt(dir, "commit", "-q", "-m", "init");
  return dir;
}

const repo = gatedRepo();

function runGuard(command) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repo }),
    encoding: "utf8",
    cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

// Point 1: top-level information flags and non-push verbs (incl. the observed `git worktree add`) never reach push.
const ADMITTED = [
  "git --version",
  "git version",
  "git --help",
  "git -C . --version",
  "git status",
  "git log --oneline -3",
  "git -C . status",
  "git worktree add ../wt HEAD",
];
for (const command of ADMITTED) {
  test(`AC-195 point 1: read-only git is admitted: ${command}`, () => {
    const { code, stderr } = runGuard(command);
    assert.equal(code, ALLOW, stderr.slice(0, 300));
    assert.ok(!stderr.includes(OLD_AMBIGUOUS), "must not report the old ambiguous-override refusal");
    assert.equal(stderr.trim(), "");
    assert.equal(commandIsGitPush(command), false);
  });
}

// Point 3: an actual push subcommand after global options is still classified and refused.
for (const command of ["git push origin HEAD", "git -C . push origin HEAD", "git --version push origin HEAD"]) {
  test(`AC-195 point 3: a real push stays refused: ${command}`, () => {
    const { code, stderr } = runGuard(command);
    assert.equal(code, BLOCK, stderr.slice(0, 300));
    assert.ok(stderr.includes("BLOCKED (guard-push") || stderr.includes("guard-push"), stderr.slice(0, 300));
    assert.equal(commandIsGitPush(command), true);
  });
}

// Point 2 (accepted supersession, Q12 option B): nested shell text naming git, push or not, stays fail-closed.
const NESTED = [
  'wsl.exe -e bash -lc "git worktree add /tmp/x HEAD"',
  'wsl.exe -e bash -lc "git status"',
  "bash -lc 'git status'",
  'wsl.exe -e bash -lc "git push origin main"',
];
for (const command of NESTED) {
  test(`AC-195 point 2 (Q12 supersession retained): nested shell git stays refused: ${command}`, () => {
    const { code, stderr } = runGuard(command);
    assert.equal(code, BLOCK, stderr.slice(0, 300));
    assert.equal(commandIsGitPush(command), true);
  });
}

// Meaningfulness (RED): a scratch mirror of the defect (any `git` word is a push candidate) fails point 1.
test("AC-195 pin discriminates: a bare-git-word classifier mirror fails the point-1 cases", () => {
  const mirror = (cmd) => /(^|\s)git(\s|$)/.test(cmd);
  const failed = ADMITTED.filter((command) => mirror(command) !== commandIsGitPush(command));
  assert.ok(failed.includes("git --version"));
  assert.equal(failed.length, ADMITTED.length);
  assert.equal(mirror("git --version"), true);
  assert.equal(commandIsGitPush("git --version"), false);
});
