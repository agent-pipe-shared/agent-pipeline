#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Read-only exact-checkout final Verify/consumed-Critic qualification. */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectCriticBoundVerify } from "../lib/critic-verify-readiness.mjs";

/**
 * Whether two spellings name the same checkout root. Git prints `D:/Dev/repo` on Windows and Node's realpath prints
 * `D:\Dev\repo`, so the two must be compared as paths, not as text (N11). On Windows the separator, a trailing separator
 * and the letter case (file names are case-insensitive there) do not distinguish roots; elsewhere the comparison is
 * exact and a backslash stays an ordinary file name character.
 */
export function sameCheckoutRoot(gitTopLevel, physicalRoot, platform = process.platform) {
  if (typeof gitTopLevel !== "string" || typeof physicalRoot !== "string") return false;
  if (platform !== "win32") return posix.normalize(gitTopLevel) === posix.normalize(physicalRoot);
  const canonical = (value) => win32.normalize(value).replace(/[\\/]+$/u, "").toLowerCase();
  return canonical(gitTopLevel) === canonical(physicalRoot);
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000,
  }).trim();
}

export function checkCurrentCriticBoundVerify(rootDir) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)) {
    return { ok: false, code: "CBV-ROOT", currentCheckoutOk: false };
  }
  let root;
  try {
    root = realpathSync(rootDir);
    if (!sameCheckoutRoot(realpathSync(git(root, ["rev-parse", "--show-toplevel"])), root)) throw new Error("not-root");
  } catch { return { ok: false, code: "CBV-ROOT", currentCheckoutOk: false }; }
  let head, tree, gitCommonDir, worktreeState;
  try {
    head = git(root, ["rev-parse", "HEAD"]);
    tree = git(root, ["rev-parse", "HEAD^{tree}"]);
    gitCommonDir = realpathSync(resolve(root, git(root, ["rev-parse", "--git-common-dir"])));
    worktreeState = git(root, ["status", "--porcelain=v1"]) === "" ? "clean" : "dirty";
  } catch { return { ok: false, code: "CBV-GIT", currentCheckoutOk: false }; }
  const evidencePath = "evidence/verify-latest.json";
  let evidence = null;
  try {
    const target = join(root, evidencePath);
    const info = lstatSync(target);
    if (info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size <= 1024 * 1024) {
      evidence = JSON.parse(readFileSync(target, "utf8"));
    }
  } catch { /* Missing, malformed or non-physical evidence is not admission. */ }
  const result = inspectCriticBoundVerify({ repoRoot: root, gitCommonDir, head, tree,
    worktreeState, evidencePath, evidence });
  return { ok: result.currentCheckoutOk, code: result.code,
    currentCheckoutOk: result.currentCheckoutOk,
    candidate: { commit: head, tree }, evidencePath,
    privateLifecycleBound: result.privateLifecycleBound,
    receiptId: result.receiptId };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--root") {
    process.stderr.write("Usage: check-critic-bound-verify.mjs --root <absolute-repo>\n");
    process.exitCode = 64;
  } else {
    const result = checkCurrentCriticBoundVerify(args[1]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
}
