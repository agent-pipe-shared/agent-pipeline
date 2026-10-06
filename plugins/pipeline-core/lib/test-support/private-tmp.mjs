// SPDX-License-Identifier: SUL-1.0

/**
 * A hardened, process-private temp root for test fixtures.
 *
 * On native Windows the OS temp root carries a DACL that grants non-owner
 * principals (SYSTEM, Administrators), so every fixture created directly under
 * `os.tmpdir()` fails the private-state assurance for a reason that has nothing
 * to do with the code under test. The assurance is deliberately strict and is
 * not relaxed here. Instead this helper creates ONE root per process below the
 * OS temp directory with `ensureHardenedPrivateDirectory` - owner-only,
 * non-inheriting DACL on win32, mode 0o700 elsewhere - and `mkdtemp`-style
 * fixtures are created beneath it. A child of the hardened root inherits the
 * owner-only entry, so a fixture and everything created inside it pass the same
 * assessment production state does. The private-tmp test proves that
 * on a real Windows host rather than assuming it.
 *
 * The root is removed when the process exits, or earlier by `cleanupPrivateTmp`.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureHardenedPrivateDirectory } from "../hardened-private-directory.mjs";

const ROOT_PREFIX = "agent-pipeline-test-";
const ROOT_ATTEMPTS = 5;

let root = null;
let exitHookInstalled = false;

/** Remove the private root and every fixture in it. Returns whether a root existed. */
export function cleanupPrivateTmp() {
  if (root === null) return false;
  const target = root;
  root = null;
  rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  return true;
}

function cleanupAtExit() {
  try { cleanupPrivateTmp(); } catch { /* best effort: never turn a finished run into a failure */ }
}

/** The process's private temp root, created (hardened) on first use and reused afterwards. */
export function privateTmpRoot() {
  if (root !== null) return root;
  const anchor = tmpdir();
  for (let attempt = 0; attempt < ROOT_ATTEMPTS; attempt += 1) {
    const candidate = join(anchor, `${ROOT_PREFIX}${process.pid}-${randomBytes(6).toString("hex")}`);
    // ensureHardenedPrivateDirectory only assesses a pre-existing segment, so a
    // name that is somehow taken is skipped rather than adopted.
    if (existsSync(candidate)) continue;
    try {
      root = ensureHardenedPrivateDirectory(anchor, candidate);
    } catch (error) {
      rmSync(candidate, { recursive: true, force: true });
      throw error;
    }
    if (!exitHookInstalled) {
      process.once("exit", cleanupAtExit);
      exitHookInstalled = true;
    }
    return root;
  }
  throw new Error("private temp root: could not find an unused name");
}

/**
 * `fs.mkdtempSync` beneath the private root. `prefix` is a bare name prefix and
 * must not contain a path separator or be able to leave the root.
 */
export function privateMkdtempSync(prefix = "fixture-") {
  if (typeof prefix !== "string" || prefix.length === 0 || /[\\/]/.test(prefix) || prefix.includes("..")) {
    throw new TypeError("private temp fixture prefix must be a non-empty bare name without path separators");
  }
  return mkdtempSync(join(privateTmpRoot(), prefix));
}
