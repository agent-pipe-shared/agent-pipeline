// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

export const AGY_HOST_COMMIT_BASELINE_SCHEMA = "pipeline.agy-host-commit-baseline.v1";
const OID = /^[a-f0-9]{40,64}$/u;
const MAX_BASELINE_UNTRACKED = 64;
const MAX_BASELINE_FILE_BYTES = 4 * 1024 * 1024;

function fail(code) { return { ok: false, code }; }
function normalizedPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && !/[\\\0\r\n]/u.test(value) && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && part !== ".git");
}
/** Git's ambient repository/index controls must not redirect the pinned root. */
export function agyHostGitEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !/^GIT_/iu.test(key)));
}
function git(root, args) {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 15_000, maxBuffer: 1024 * 1024, env: agyHostGitEnvironment() });
  return run.error || run.status !== 0 ? null : run.stdout;
}
function paths(output) { return output === null ? null : output.split("\0").filter(Boolean).sort(); }
function same(left, right) { return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort()); }
function physicalRoot(root) {
  try {
    if (typeof root !== "string" || root.length === 0) return null;
    const absolute = resolve(root);
    const stat = lstatSync(absolute);
    return stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(absolute) === absolute ? absolute : null;
  } catch { return null; }
}
function resultExists(root, resultPath) {
  try { lstatSync(resolve(root, resultPath)); return true; }
  catch (error) { return error?.code !== "ENOENT"; }
}
function validBaselineUntracked(entries) {
  return entries.length <= MAX_BASELINE_UNTRACKED
    && entries.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry)
      && Object.keys(entry).sort().join(",") === "path,sha256"
      && normalizedPath(entry.path) && /^[a-f0-9]{64}$/u.test(entry.sha256))
    && new Set(entries.map((entry) => entry.path)).size === entries.length;
}
function untrackedDigests(root, untracked) {
  if (untracked.length > MAX_BASELINE_UNTRACKED) return null;
  const values = [];
  for (const path of untracked) {
    if (!normalizedPath(path)) return null;
    try {
      const file = resolve(root, path);
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BASELINE_FILE_BYTES || realpathSync(file) !== file) return null;
      values.push({ path, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") });
    } catch { return null; }
  }
  return values;
}

/** Capture immediately before the Agy launch. No stage or commit occurs. */
export function captureAgyHostCommitBaseline({ root, candidateCommit, resultPath } = {}) {
  const physical = physicalRoot(root);
  if (physical === null || !OID.test(candidateCommit ?? "") || !normalizedPath(resultPath)) return fail("AGY-HOST-BASELINE-INPUT");
  const head = git(physical, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const topLevel = git(physical, ["rev-parse", "--show-toplevel"]);
  const conflicts = git(physical, ["ls-files", "-u", "-z"]);
  const staged = paths(git(physical, ["diff", "--cached", "--name-only", "-z"]));
  const tracked = paths(git(physical, ["diff", "--no-renames", "--name-only", "-z", "HEAD"]));
  const untracked = paths(git(physical, ["ls-files", "--others", "--exclude-standard", "-z"]));
  if (head === null || topLevel === null || conflicts === null || staged === null || tracked === null || untracked === null) return fail("AGY-HOST-BASELINE-GIT");
  if (topLevel.trim() !== physical || head.trim() !== candidateCommit || conflicts.length !== 0 || staged.length !== 0 || tracked.length !== 0) return fail("AGY-HOST-BASELINE-DIRTY");
  if (resultExists(physical, resultPath)) return fail("AGY-HOST-BASELINE-RESULT-COLLISION");
  const files = untrackedDigests(physical, untracked);
  if (files === null) return fail("AGY-HOST-BASELINE-UNSAFE");
  return { ok: true, code: "AGY-HOST-BASELINE-CAPTURED", baseline: { schema: AGY_HOST_COMMIT_BASELINE_SCHEMA, root: physical, candidateCommit, resultPath, untracked: files } };
}

/** No-commit observations must not be published after an unobserved child-side commit. */
export function observeAgyHostHead({ baseline } = {}) {
  if (baseline?.schema !== AGY_HOST_COMMIT_BASELINE_SCHEMA
    || physicalRoot(baseline.root) !== baseline.root
    || !OID.test(baseline.candidateCommit ?? "")) return fail("AGY-HOST-HEAD-INPUT");
  const head = git(baseline.root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const topLevel = git(baseline.root, ["rev-parse", "--show-toplevel"]);
  if (head === null || topLevel === null) return fail("AGY-HOST-HEAD-UNAVAILABLE");
  if (topLevel.trim() !== baseline.root || head.trim() !== baseline.candidateCommit) {
    return fail("AGY-HOST-HEAD-DRIFT");
  }
  return { ok: true, code: "AGY-HOST-HEAD-UNCHANGED" };
}

/** Admit only the exact child-claimed diff and consent-bound paths. */
export function assessAgyHostCommit({ baseline, final, allowedPaths } = {}) {
  if (baseline?.schema !== AGY_HOST_COMMIT_BASELINE_SCHEMA || physicalRoot(baseline.root) !== baseline.root
    || !OID.test(baseline.candidateCommit ?? "") || !normalizedPath(baseline.resultPath)
    || !Array.isArray(baseline.untracked) || !validBaselineUntracked(baseline.untracked) || !Array.isArray(final?.changedPaths)
    || !Array.isArray(allowedPaths) || !final.changedPaths.every(normalizedPath)
    || !allowedPaths.every(normalizedPath) || new Set(final.changedPaths).size !== final.changedPaths.length
    || new Set(allowedPaths).size !== allowedPaths.length) return fail("AGY-HOST-COMMIT-INPUT");
  const head = git(baseline.root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const topLevel = git(baseline.root, ["rev-parse", "--show-toplevel"]);
  const conflicts = git(baseline.root, ["ls-files", "-u", "-z"]);
  const staged = paths(git(baseline.root, ["diff", "--cached", "--name-only", "-z"]));
  const tracked = paths(git(baseline.root, ["diff", "--no-renames", "--name-only", "-z", "HEAD"]));
  const untracked = paths(git(baseline.root, ["ls-files", "--others", "--exclude-standard", "-z"]));
  if (head === null || topLevel === null || conflicts === null || staged === null || tracked === null || untracked === null) return fail("AGY-HOST-COMMIT-GIT");
  if (topLevel.trim() !== baseline.root || head.trim() !== baseline.candidateCommit || conflicts.length !== 0 || staged.length !== 0) return fail("AGY-HOST-COMMIT-DRIFT");
  const preserved = untrackedDigests(baseline.root, baseline.untracked.map((entry) => entry.path));
  if (preserved === null || !same(preserved.map((entry) => `${entry.path}:${entry.sha256}`), baseline.untracked.map((entry) => `${entry.path}:${entry.sha256}`))) return fail("AGY-HOST-COMMIT-BASELINE-CHANGED");
  const newUntracked = untracked.filter((path) => !baseline.untracked.some((entry) => entry.path === path) && path !== baseline.resultPath);
  const actual = [...new Set([...tracked, ...newUntracked])].sort();
  if (!same(actual, final.changedPaths)) return fail("AGY-HOST-COMMIT-PATH-MISMATCH");
  if (actual.length === 0 || !actual.every((path) => allowedPaths.includes(path))) return fail("AGY-HOST-COMMIT-CONSENT-PATH");
  const admittedBlobs = [];
  for (const path of actual) {
    try {
      const stat = lstatSync(resolve(baseline.root, path));
      if (stat.isSymbolicLink() || !stat.isFile()) return fail("AGY-HOST-COMMIT-PATH-UNSAFE");
      // Match Git's clean-filtered blob, not raw file bytes: the later index
      // comparison must work for repositories with declared text filters.
      const oid = git(baseline.root, ["hash-object", `--path=${path}`, "--", path])?.trim();
      if (!OID.test(oid ?? "")) return fail("AGY-HOST-COMMIT-CONTENT-UNAVAILABLE");
      admittedBlobs.push({ path, oid });
    } catch (error) {
      if (error?.code !== "ENOENT") return fail("AGY-HOST-COMMIT-PATH-UNSAFE");
      admittedBlobs.push({ path, oid: null });
    }
  }
  return { ok: true, code: "AGY-HOST-COMMIT-ADMITTED", root: baseline.root, candidateCommit: baseline.candidateCommit, paths: actual, admittedBlobs };
}
