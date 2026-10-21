// SPDX-License-Identifier: SUL-1.0

/**
 * D73: Verify gives every suite child its OWN private 0700 TMPDIR.
 *
 * Why: Verify used to hand each suite the session's ambient TMPDIR. A world-writable ancestor of
 * that path (for example a 1777 /tmp) fails the session authority's ancestor check, so every suite
 * that builds a session-authority fixture under it threw `domain-ancestor-unsafe`, although the same
 * suite is green under a private TMPDIR.
 *
 * Shape: one 0700 per-run parent under `<real home>/pipeline-verify-tmp/` (or under the absolute
 * directory named by PIPELINE_VERIFY_TMP_ROOT), one 0700 directory per suite inside it, and
 * TMPDIR, TMP and TEMP all set to that directory. The parent is created lazily on the first suite,
 * so a run that reuses every receipt creates nothing. It is removed when the run ends, on a
 * best-effort basis that can never mask a suite's outcome.
 *
 * Fail closed: a parent that sits inside the repository checkout, or whose ancestor chain fails the
 * same check the authority applies (every segment a real directory, none group/other writable), is
 * refused with a typed error naming the offending segment. Silently falling back to the ambient
 * TMPDIR would only reproduce the original failure as many confusing red suites. On win32 the
 * parent is hardened and assessed through the existing private-state adapter (as
 * lib/test-private-tmp.mjs does); mode bits carry no meaning there, so only the real-directory part
 * of the chain check applies.
 */
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

export const VERIFY_TMP_ROOT_VARIABLE = "PIPELINE_VERIFY_TMP_ROOT";
const DEFAULT_ROOT_NAME = "pipeline-verify-tmp";
const TMP_KEYS = Object.freeze(["TMPDIR", "TMP", "TEMP"]);
const byRun = new WeakMap();

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function discard(path) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 3 });
  } catch { /* best effort: never mask a suite's own outcome */ }
}

/**
 * The POSIX part of the session authority's ancestor walk (session-authority-domain-owner.mjs,
 * `chain`): every segment from the filesystem root down is a real directory, not a symlink, and has
 * no group/other write bit.
 */
export function assertSafeAncestorChain(path, { platform = process.platform } = {}) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) throw fail("VERIFY-TMP-ROOT-PATH", "the private temp parent must be an absolute, normalised path");
  let current = parse(path).root;
  for (const segment of relative(current, path).split(sep).filter(Boolean)) {
    current = join(current, segment);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (platform !== "win32" && (stat.mode & 0o022) !== 0)) {
      throw fail("VERIFY-TMP-ANCESTOR-UNSAFE", `${current} is not a plain directory writable only by its owner; set ${VERIFY_TMP_ROOT_VARIABLE} to an absolute directory whose whole ancestor chain is`);
    }
  }
}

/** `env` with TMPDIR, TMP and TEMP replaced by `dir`; every other key kept. Win32 names are case-insensitive. */
export function privateTmpdirEnvironment(env, dir, { platform = process.platform } = {}) {
  const kept = Object.entries(env).filter(([key]) => !TMP_KEYS.includes(platform === "win32" ? key.toUpperCase() : key));
  return { ...Object.fromEntries(kept), ...Object.fromEntries(TMP_KEYS.map((key) => [key, dir])) };
}

function resolveRoot(environment, home) {
  const override = environment?.[VERIFY_TMP_ROOT_VARIABLE];
  if (typeof override === "string" && override !== "") {
    if (!isAbsolute(override)) throw fail("VERIFY-TMP-ROOT-PATH", `${VERIFY_TMP_ROOT_VARIABLE} must be an absolute path`);
    return resolve(override);
  }
  return join(realpathSync(home()), DEFAULT_ROOT_NAME);
}

/**
 * The per-run provider: `environmentFor(env)` creates one fresh private directory per call and
 * returns `env` (default: the ambient environment) with TMPDIR/TMP/TEMP pointing at it; `dispose()`
 * removes the per-run parent. `harden`/`assess`/`home` are test seams.
 */
export function createVerifySuiteTmpdirs({ repoRoot, environment = process.env, platform = process.platform, home = homedir, harden = hardenWindowsPrivateDirectory, assess = assessWindowsPrivatePath } = {}) {
  let parent = null;
  let disposed = false;
  const ensureParent = () => {
    if (parent !== null) return parent;
    const root = resolveRoot(environment, home);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const made = mkdtempSync(join(root, `run-${process.pid}-`));
    try {
      if (platform === "win32") {
        harden(made);
        const state = assess(made);
        if (state?.status !== "secure") throw fail("VERIFY-TMP-NOT-SECURE", `the Windows private temp parent is not secure (status=${state?.status ?? "unknown"})`);
      } else chmodSync(made, 0o700);
      assertSafeAncestorChain(made, { platform });
      const rel = relative(realpathSync(repoRoot), realpathSync(made));
      if (rel === "" || !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))) throw fail("VERIFY-TMP-INSIDE-CHECKOUT", `the private temp parent must not be inside the repository checkout; set ${VERIFY_TMP_ROOT_VARIABLE} to a directory outside it`);
    } catch (error) {
      discard(made);
      throw error;
    }
    parent = made;
    return parent;
  };
  return {
    environmentFor(env) {
      if (disposed) throw fail("VERIFY-TMP-DISPOSED", "the run's private temp directories were already removed");
      const dir = mkdtempSync(join(ensureParent(), "suite-"));
      if (platform !== "win32") chmodSync(dir, 0o700);
      return privateTmpdirEnvironment(env ?? process.env, dir, { platform });
    },
    dispose() {
      disposed = true;
      const doomed = parent;
      parent = null;
      if (doomed !== null) discard(doomed);
    },
  };
}

/** Per-run wiring for verify-journal.mjs: the provider is keyed on the run object and created on first use. */
export function verifySuiteChildEnvironment(run, repoRoot, env) {
  let provider = byRun.get(run);
  if (provider === undefined) {
    provider = createVerifySuiteTmpdirs({ repoRoot });
    byRun.set(run, provider);
  }
  return provider.environmentFor(env);
}

/** Remove the run's per-run parent, if one was made. Never throws; `null` (no run yet) is a no-op. */
export function disposeVerifySuiteTmpdirs(run) {
  const provider = run !== null && typeof run === "object" ? byRun.get(run) : undefined;
  if (provider === undefined) return;
  byRun.delete(run);
  provider.dispose();
}
