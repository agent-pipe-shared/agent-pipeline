// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RECURSIVE_DELETE_RULE_ID, recursiveDeleteFinding, validThrowawayDirs } from "./recursive-delete-policy.mjs";

const hook = join(dirname(fileURLToPath(import.meta.url)), "guard-git.mjs");
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function withRoot(run) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "recursive-delete-")));
  try { mkdirSync(join(root, ".git")); mkdirSync(join(root, "scratch")); return run(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
const refused = (command, options) => recursiveDeleteFinding(command, options);

test("the measured destructive shapes are refused, each naming what it would delete", () => withRoot((root) => {
  for (const command of ["find . -delete", "find docs -delete", "find .git -delete", "find . -name x -exec rm {} +", "find . -execdir rm -f {} ;",
    "rm -rf docs", "rm -rf .", "rm -rf *", "rm -r -f src", "rm --recursive src", "rm -Rf src", "sh -c 'rm -rf *'", "bash -lc \"find docs -delete\"", "sudo rm -rf docs",
    "FOO=1 rm -rf docs", "cat list | xargs rm -rf", "xargs -n 1 rm -r", "python3 -c \"import shutil; shutil.rmtree('docs')\"", "node -e \"require('fs').rmSync('docs',{recursive:true})\"",
    "cd scratch && rm -rf ../docs", "rm -rf scratch/../docs", "Remove-Item -Recurse -Force docs", "Remove-Item docs -Rec", "rd /s /q docs", "rmdir /S docs"]) {
    const finding = refused(command, { root });
    assert.equal(finding?.id, RECURSIVE_DELETE_RULE_ID, command);
    assert.match(finding.why, /scratch\/.*throwawayDirs/su, command);
  }
  assert.match(refused("rm -rf docs src", { root }).why, /: docs, src\./u, "both targets are named");
}));

test("an unset or expanded target is refused even under scratch/", () => withRoot((root) => {
  for (const command of ["find $tmp -delete", "rm -rf $tmp/*", "rm -rf scratch/$name", "rm -rf \"scratch/$name\"", "rm -rf scratch/`id`", "rm -rf %TEMP%\\x"]) {
    assert.equal(refused(command, { root })?.id, RECURSIVE_DELETE_RULE_ID, command);
  }
}));

test("scratch/ and named throwaway folders stay open, including globs that stay inside", () => withRoot((root) => {
  mkdirSync(join(root, "dist"));
  for (const command of ["rm -rf scratch/out", "rm -rf scratch/out*", "rm -rf ./scratch/a scratch/b", "find scratch/out -delete", "find scratch -name x -exec rm {} +", "sh -c 'rm -rf scratch/out'", "Remove-Item -Recurse -Force scratch\\out", "rd /s /q scratch\\out"]) {
    assert.equal(refused(command, { root }), null, command);
  }
  assert.equal(refused("rm -rf dist/assets", { root, throwawayDirs: ["dist"] }), null);
  assert.equal(refused("rm -rf dist/assets", { root })?.id, RECURSIVE_DELETE_RULE_ID, "only a named folder opens");
  assert.equal(refused("rm -rf *", { root, cwd: join(root, "scratch") }), null, "a bare glob is judged from the working directory");
}));

test("deletes that are not recursive, and commands that only mention one, are left alone", () => withRoot((root) => {
  for (const command of ["rm docs/a.md", "rm -f docs/a.md", "git rm docs/a.md", "rmdir docs/empty", "find docs -name x", "echo rm -rf docs", "rg -n 'rm -rf docs' notes.md", "git commit -m 'rm -rf docs'", "node -e \"console.log(1)\""]) {
    assert.equal(refused(command, { root }), null, command);
  }
}));

test("a link inside scratch/ that leads elsewhere does not open its destination", () => withRoot((root) => {
  mkdirSync(join(root, "docs"));
  symlinkSync(join(root, "docs"), join(root, "scratch", "link"));
  assert.equal(refused("rm -rf scratch/link/sub", { root })?.id, RECURSIVE_DELETE_RULE_ID);
}));

test("a dispatch in its own worktree may clear that worktree's scratch/", () => withRoot((root) => {
  const worktree = join(root, ".claude", "worktrees", "w1");
  mkdirSync(join(worktree, "scratch"), { recursive: true });
  mkdirSync(join(worktree, ".git"));
  assert.equal(refused("rm -rf scratch/out", { root, cwd: worktree }), null);
  assert.equal(refused("rm -rf src", { root, cwd: worktree })?.id, RECURSIVE_DELETE_RULE_ID);
}));

test("a throwaway entry cannot name the root, a parent or Pipeline state", () => {
  assert.deepEqual(validThrowawayDirs(["dist", "build/out/", ".", "..", "../x", "/abs", "C:/x", ".git", ".git/hooks", ".claude/x", "project", "a/../b", "tmp*", "", 7]), ["dist", "build/out/"]);
  assert.deepEqual(validThrowawayDirs("dist"), []);
});

test("the git guard refuses and admits through the hook, on command text only", () => {
  const judge = (command) => spawnSync(process.execPath, [hook], { cwd: repository, env: { ...process.env, CLAUDE_PROJECT_DIR: repository },
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repository, hook_event_name: "PreToolUse" }), encoding: "utf8", timeout: 30_000 });
  const denied = judge("find docs -delete");
  assert.equal(denied.status, 2, denied.stderr);
  assert.match(denied.stderr, new RegExp(RECURSIVE_DELETE_RULE_ID, "u"));
  const admitted = judge("rm -rf scratch/never-created-by-this-test");
  assert.equal(admitted.status, 0, admitted.stderr);
});
