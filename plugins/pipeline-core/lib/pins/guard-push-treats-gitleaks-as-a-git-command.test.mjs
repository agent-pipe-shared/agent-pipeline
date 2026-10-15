// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin for pipeline.guard-push-treats-gitleaks-as-a-git-command (AC-196, ALF-C-P5-08).
 *
 * Original acceptance (backlog item Proposal): match the executable token exactly (`git`, not a string
 * prefix); a regression case admits `gitleaks detect ...` AND still refuses real ambiguous `git` push forms.
 *
 * Every case runs the REAL guard (hooks/guard-push.mjs) as a subprocess in a fresh fixture repository with an
 * active blocking push gate under the repository's scratch/ (never the OS temp dir), plus the real classifier
 * (lib/git-cmd.mjs commandIsGitPush). Nothing under test is mocked.
 *
 * Meaningfulness: the final suite runs the same allow-assertions against a scratch mirror of the DEFECT (a
 * string-prefix classifier) and requires that mirror to fail them (RED), proving the pin can fail.
 *
 * Host limitation: none of these cases needs directory mode bits or directory symlinks, so no case is skipped.
 * (Linux/WSL re-run, owner Coordinator, due 2026-10-19, PO decision K7, is only a platform cross-check.)
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
const AMBIGUOUS_PREFIX = "push command prefix is ambiguous";

mkdirSync(SCRATCH, { recursive: true });
const fixtureRoot = mkdtempSync(join(SCRATCH, "gpgl-pin-"));
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

// Acceptance point 1: gitleaks calls are admitted by the guard (not read as a git push).
const ALLOWED = [
  "gitleaks detect --no-banner --redact",
  "gitleaks protect --staged",
  "gitleaks detect --no-git --redact", // the observed trigger: `git` inside --no-git
  "gitleaks detect --no-git -v --source .",
  "gitleaks-wrapper detect --no-git --redact", // executable merely starts with gitleaks
  "mygitleaks detect --no-git --redact", // executable merely ends with gitleaks
];
for (const command of ALLOWED) {
  test(`AC-196 guard admits: ${command}`, () => {
    const { code, stderr } = runGuard(command);
    assert.equal(code, ALLOW, stderr.slice(0, 300));
    assert.ok(!stderr.includes(AMBIGUOUS_PREFIX), "must not report the ambiguous-prefix refusal");
    assert.equal(stderr.trim(), "");
    assert.equal(commandIsGitPush(command), false);
  });
}

// Acceptance point 2: real (ambiguous or not) git push forms are still refused.
const REFUSED = [
  ["git push origin HEAD", "BLOCKED (guard-push"],
  ["git.exe push origin HEAD:refs/heads/feat/x", AMBIGUOUS_PREFIX],
  ["env git push origin HEAD:refs/heads/feat/x", AMBIGUOUS_PREFIX],
  ["sudo git --unknown-opt push origin HEAD:refs/heads/feat/x", AMBIGUOUS_PREFIX],
  ["git --unknown-opt push origin HEAD:refs/heads/feat/x", "only git [-C <path>] push is accepted"],
  ["gitleaks detect --no-git --redact && git push origin HEAD:refs/heads/feat/x", "standalone command"],
  ["gitleaks detect --no-git --redact; git push origin HEAD:refs/heads/feat/x", "standalone command"],
  ['git pu"sh" origin HEAD:refs/heads/feat/x', "BLOCKED (guard-push"],
  ["gitleaks detect --no-git --redact\ngit push origin HEAD:refs/heads/feat/x", "BLOCKED (guard-push"],
  // fail-closed by design: a literal whitespace-separated `git` word is indistinguishable from the executable
  ["gitleaks git --redact", "BLOCKED (guard-push"],
];
for (const [command, needle] of REFUSED) {
  test(`AC-196 guard still refuses: ${JSON.stringify(command)}`, () => {
    const { code, stderr } = runGuard(command);
    assert.equal(code, BLOCK, stderr.slice(0, 300));
    assert.ok(stderr.includes(needle), `stderr lacks "${needle}": ${stderr.slice(0, 300)}`);
    assert.equal(commandIsGitPush(command), true);
  });
}

// Tokens that only resemble git are not pushes (exact-token match, not prefix).
for (const command of ["gitx push origin main", "git-foo --bar origin main"]) {
  test(`AC-196 look-alike token is not a push: ${command}`, () => {
    const { code, stderr } = runGuard(command);
    assert.equal(code, ALLOW, stderr.slice(0, 300));
    assert.equal(commandIsGitPush(command), false);
  });
}

// Meaningfulness (RED): a scratch mirror of the defect (string-prefix match on `git`) must FAIL the allow cases.
test("AC-196 pin discriminates: a string-prefix classifier mirror fails the allow cases", () => {
  const prefixMirror = (cmd) => /^\s*git/.test(cmd) || /\bgit\b/.test(cmd.replace(/^\S+/, (m) => m)) || /(^|\s)--no-git\b/.test(cmd);
  const failedAllows = ALLOWED.filter((command) => prefixMirror(command) !== commandIsGitPush(command));
  assert.ok(failedAllows.length > 0, "mirror of the defect must disagree with the real classifier on at least one allowed command");
  assert.ok(failedAllows.includes("gitleaks detect --no-git --redact"));
  // and the mirror reads a gitleaks command as a push where the real module does not
  assert.equal(prefixMirror("gitleaks detect --no-git --redact"), true);
  assert.equal(commandIsGitPush("gitleaks detect --no-git --redact"), false);
});
