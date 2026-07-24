// SPDX-License-Identifier: SUL-1.0
/**
 * symlink-capability — shared, typed probe for real symlink-creation capability.
 *
 * WHY THIS FILE EXISTS (Sentinel #36)
 *   Native Windows without Admin/Developer Mode cannot create symlinks;
 *   `symlinkSync` throws EPERM. Roughly a dozen test files each carried their
 *   own copy of a try/probe-and-skip block for this (typically a bare
 *   catch-all around one symlinkSync call). This module consolidates that
 *   into one tested primitive so Full Verify's "no hidden skips" requirement
 *   has a single place to hold: the probe result is typed (available vs. an
 *   explicit, named reason), it is never a blanket try/catch — only EPERM and
 *   EACCES are treated as "capability unavailable"; any other error (disk
 *   full, permission-denied-for-an-unrelated-reason, etc.) is a real defect
 *   and is rethrown, not swallowed.
 *
 * USAGE
 *   import { symlinkCapability, symlinkSkip } from "../lib/symlink-capability.mjs";
 *   test("...", { skip: symlinkSkip() }, () => { ... });
 *   // or, for a manual branch instead of node:test's skip option:
 *   if (!symlinkCapability().available) { console.log("[capability: symlink unavailable] ..."); return; }
 *
 * VERIFY: node plugins/pipeline-core/lib/symlink-capability.test.mjs
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CAPABILITY_ERROR_CODES = new Set(["EPERM", "EACCES"]);

/** One real filesystem probe; never swallows an error class outside the named set. */
export function probeSymlinkCapability({
  fs = { mkdtempSync, rmSync, symlinkSync, writeFileSync },
  tmpRoot = tmpdir(),
} = {}) {
  let probeDir;
  try {
    probeDir = fs.mkdtempSync(join(tmpRoot, "symlink-capability-probe-"));
    fs.writeFileSync(join(probeDir, "target"), "x");
    fs.symlinkSync(join(probeDir, "target"), join(probeDir, "link"));
    return { available: true, reason: null };
  } catch (error) {
    if (CAPABILITY_ERROR_CODES.has(error?.code)) {
      return {
        available: false,
        reason: `symlink unavailable (${error.code}): enable Windows Developer Mode or run elevated`,
      };
    }
    throw error;
  } finally {
    if (probeDir) {
      try {
        fs.rmSync(probeDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup of a probe-only temp directory
      }
    }
  }
}

let cachedResult = null;

/** Memoized probe: one real filesystem touch per process, however many call sites ask. */
export function symlinkCapability(options) {
  if (options !== undefined) return probeSymlinkCapability(options);
  if (cachedResult === null) cachedResult = probeSymlinkCapability();
  return cachedResult;
}

/** Returns false when capable, else the skip reason string — matches node:test's `skip` option shape. */
export function symlinkSkip(capability = symlinkCapability()) {
  return capability.available ? false : capability.reason;
}

/** Reset the memoized result; test-only (fixture-driven probes must not leak across cases). */
export function resetSymlinkCapabilityCache() {
  cachedResult = null;
}
