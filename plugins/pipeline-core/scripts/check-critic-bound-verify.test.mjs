#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-critic-bound-verify.test.mjs -- pins for the checkout-root comparison of the Critic-bound Verify gate (N11).
 *
 * THE DEFECT. The gate compared `git rev-parse --show-toplevel` with the physical root as TEXT. On Windows Git prints
 * `D:/Dev/Web/Toolbox` and Node's realpath prints `D:\Dev\Web\Toolbox`: never equal, so the gate stopped with CBV-ROOT
 * before it read any Critic state, for every project, and its repair text ("finish the Critic review") was wrong.
 *
 * Run:   node --test plugins/pipeline-core/scripts/check-critic-bound-verify.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { checkCurrentCriticBoundVerify, sameCheckoutRoot } from "./check-critic-bound-verify.mjs";

test("N11 on Windows, Git's forward-slash root and Node's backslash root are the same checkout", () => {
  assert.equal(sameCheckoutRoot("D:/Dev/Web/Toolbox", "D:\\Dev\\Web\\Toolbox", "win32"), true);
});

test("N11 on Windows, the drive letter case and a trailing separator do not make two roots different", () => {
  assert.equal(sameCheckoutRoot("d:/Dev/Web/Toolbox", "D:\\Dev\\Web\\Toolbox", "win32"), true);
  assert.equal(sameCheckoutRoot("D:/Dev/Web/Toolbox/", "D:\\Dev\\Web\\Toolbox", "win32"), true);
});

test("N11 on Windows, a different directory is still a different checkout", () => {
  assert.equal(sameCheckoutRoot("D:/Dev/Web/Toolbox", "D:\\Dev\\Web\\Other", "win32"), false);
  assert.equal(sameCheckoutRoot("D:/Dev/Web/Toolbox", "E:\\Dev\\Web\\Toolbox", "win32"), false);
  assert.equal(sameCheckoutRoot("D:/Dev/Web/Toolbox/sub", "D:\\Dev\\Web\\Toolbox", "win32"), false);
});

test("N11 on POSIX, a backslash is an ordinary file name character and the comparison stays exact", () => {
  assert.equal(sameCheckoutRoot("/home/u/repo", "/home/u/repo", "linux"), true);
  assert.equal(sameCheckoutRoot("/home/u/repo", "/home/u/Repo", "linux"), false);
  assert.equal(sameCheckoutRoot("/home/u/a\\b", "/home/u/a/b", "linux"), false);
});

test("N11 a real repository root is not refused as CBV-ROOT (the gate reaches the Critic state)", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "cbv-root-")));
  try {
    const git = (...args) => {
      const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", shell: false });
      assert.equal(r.status, 0, r.stderr);
    };
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "commit.gpgsign", "false");
    writeFileSync(join(dir, "a.txt"), "a\n");
    git("add", "-A");
    git("commit", "-qm", "fixture");
    const result = checkCurrentCriticBoundVerify(dir);
    assert.notEqual(result.code, "CBV-ROOT");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("N11 a subdirectory and a relative path are still refused as CBV-ROOT", () => {
  assert.equal(checkCurrentCriticBoundVerify("relative/path").code, "CBV-ROOT");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "cbv-root-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir, shell: false });
    spawnSync("mkdir", ["sub"], { cwd: dir, shell: false });
    assert.equal(checkCurrentCriticBoundVerify(join(dir, "sub")).code, "CBV-ROOT");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
