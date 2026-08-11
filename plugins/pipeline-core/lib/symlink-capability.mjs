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
 *   EACCES from the actual symlink operation are treated as capability
 *   unavailable. Temporary-directory setup and target writes always surface
 *   their real error, including EPERM/EACCES, rather than suppressing a broken
 *   fixture environment as a missing symlink capability.
 *
 * LINK TYPE (NVA-BL-20)
 *   `symlinkSync`'s third argument is a Windows-only link TYPE, and the types
 *   are not one capability. Native Windows without Developer Mode refuses an
 *   ordinary file/directory symlink with EPERM but still creates a DIRECTORY
 *   JUNCTION unelevated -- so an untyped probe answers a different question
 *   than a caller who goes on to create junctions is asking, and can report
 *   "incapable" where that caller would in fact have succeeded (or the reverse).
 *   Pass `type` to probe the exact link type you will create. A junction is a
 *   directory-only link type, so a typed directory probe links a directory
 *   target rather than the file the untyped probe uses; the untyped default is
 *   unchanged, so existing callers keep today's behaviour byte for byte.
 *
 * USAGE
 *   import { symlinkCapability, symlinkSkip } from "../lib/symlink-capability.mjs";
 *   test("...", { skip: symlinkSkip() }, () => { ... });
 *   // for a caller that creates directory junctions (hoist it: a typed probe
 *   // is not memoized, unlike the no-argument call below):
 *   const junction = symlinkCapability({ type: "junction" });
 *   test("...", { skip: symlinkSkip(junction) }, () => { ... });
 *   // or, for a manual branch instead of node:test's skip option:
 *   if (!symlinkCapability().available) { console.log("[capability: symlink unavailable] ..."); return; }
 *
 * VERIFY: node plugins/pipeline-core/lib/symlink-capability.test.mjs
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CAPABILITY_ERROR_CODES = new Set(["EPERM", "EACCES"]);
// The link types Windows can only point at a directory. Probing one with a file
// target fails for a reason unrelated to the privilege being probed.
const DIRECTORY_LINK_TYPES = new Set(["dir", "junction"]);

/**
 * One real filesystem probe; never swallows an error class outside the named set.
 * `type` is the link type to probe (`"junction"`, `"dir"`, `"file"`); the default
 * `null` probes an untyped symlink, exactly as this function always has.
 */
export function probeSymlinkCapability({
  fs = { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync },
  tmpRoot = tmpdir(),
  type = null,
} = {}) {
  let probeDir;
  try {
    probeDir = fs.mkdtempSync(join(tmpRoot, "symlink-capability-probe-"));
    const target = join(probeDir, "target");
    if (DIRECTORY_LINK_TYPES.has(type)) fs.mkdirSync(target);
    else fs.writeFileSync(target, "x");
    try {
      fs.symlinkSync(target, join(probeDir, "link"), type ?? undefined);
      return { available: true, reason: null };
    } catch (error) {
      if (CAPABILITY_ERROR_CODES.has(error?.code)) {
        return {
          available: false,
          reason: `symlink${type === null ? "" : ` (type=${type})`} unavailable (${error.code}): `
            + "enable Windows Developer Mode or run elevated",
        };
      }
      throw error;
    }
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

/**
 * Memoized probe: one real filesystem touch per process, however many call sites
 * ask. Only the NO-ARGUMENT call is memoized -- any explicit options object
 * (including `{ type }`) probes fresh, so a typed caller should hoist its result.
 */
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
