// SPDX-License-Identifier: SUL-1.0

/**
 * One shared, hardened private temp root for test fixtures (PO decision O).
 *
 * Purpose: test fixtures that exercise private-state code need a scratch
 * location that the native private-state assurance genuinely rates secure.
 * Instead of loosening that assurance for tests, every fixture is placed under
 * ONE per-process root that satisfies it as written: owner-only (0700) on
 * POSIX, and on Windows a protected, non-inheriting DACL that grants only the
 * concrete current principal, with children inheriting that same DACL.
 *
 * This module consumes the existing Windows private-state adapter
 * (`hardenWindowsPrivateDirectory` + `assessWindowsPrivatePath`) and changes
 * nothing about it: no assurance loosening, no bypass, no second policy.
 *
 * Fail-closed: if the root cannot be proven private, or it sits inside a
 * repository checkout, creation throws instead of degrading to a weaker
 * location. The root is removed on a best-effort basis when the process exits.
 */
import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";

import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

const ROOT_PREFIX = "pipeline-private-";

let memoizedRoot = null;

function fail(code, message) {
  const error = new Error(`test-private-tmp ${code}: ${message}`);
  error.code = code;
  return error;
}

function discard(path) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 3 });
  } catch { /* best effort: never mask the caller's own outcome */ }
}

/** First directory at or above `start` that contains a `.git` entry, or null. */
function enclosingGitEntry(start) {
  let cursor = start;
  for (;;) {
    if (existsSync(join(cursor, ".git"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function secureRoot(root, harden, assess) {
  if (process.platform === "win32") {
    harden(root);
    const state = assess(root);
    if (state?.status !== "secure") {
      throw fail("PRIVATE_TMP_ROOT_NOT_SECURE", `the Windows private temp root is not secure (status=${state?.status ?? "unknown"}, reason=${state?.reason ?? "none"})`);
    }
  } else {
    chmodSync(root, 0o700);
  }
  const repository = enclosingGitEntry(root);
  if (repository !== null) {
    throw fail("PRIVATE_TMP_ROOT_INSIDE_REPOSITORY", "the private temp root or one of its ancestors contains a .git entry; refusing to place fixtures inside a repository");
  }
}

/**
 * The per-process private temp root: created and hardened on first use, then
 * the same path on every later call.
 *
 * `options.harden` / `options.assess` are test seams that default to the
 * Windows private-state adapter functions; they are only consulted on win32.
 */
export function privateTempRoot(options) {
  if (memoizedRoot !== null) return memoizedRoot;
  const seams = options !== null && typeof options === "object" ? options : {};
  const harden = typeof seams.harden === "function" ? seams.harden : hardenWindowsPrivateDirectory;
  const assess = typeof seams.assess === "function" ? seams.assess : assessWindowsPrivatePath;
  const root = mkdtempSync(join(tmpdir(), ROOT_PREFIX));
  try {
    secureRoot(root, harden, assess);
  } catch (error) {
    discard(root);
    throw error;
  }
  memoizedRoot = root;
  process.on("exit", () => discard(root));
  return root;
}

/**
 * Create a fresh directory inside the private root. On Windows the child
 * inherits the root's hardened DACL.
 */
export function privateMkdtemp(prefix) {
  if (typeof prefix !== "string" || prefix.length === 0) {
    throw fail("PRIVATE_TMP_PREFIX_INVALID", "privateMkdtemp requires a non-empty string prefix");
  }
  const root = privateTempRoot();
  const target = join(root, prefix);
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw fail("PRIVATE_TMP_PREFIX_ESCAPES_ROOT", "the prefix must resolve to a path strictly inside the private temp root");
  }
  return mkdtempSync(target);
}
