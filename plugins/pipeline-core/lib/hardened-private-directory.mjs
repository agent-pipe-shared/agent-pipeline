// SPDX-License-Identifier: SUL-1.0

/**
 * Creates repository-private state directories segment by segment.
 *
 * A plain recursive mkdir leaves every directory it introduces with whatever
 * the parent hands down, which on native Windows is a foreign-ACE inherited
 * DACL. This helper never recurses: each missing segment is created, proven
 * to be a physical directory, and (on win32) hardened before the next one is
 * created beneath it. A segment that already exists is only assessed - it is
 * refused when it is not secure, never silently re-hardened, because an
 * existing directory is not proof that this process owns it.
 *
 * A segment this call created whose hardening does not end secure is removed
 * again (only while still empty) before the refusal is thrown. Left behind it
 * would be an existing insecure directory on the next run, which is refused
 * for good: the failed attempt would poison its own retry.
 */
import { lstatSync, mkdirSync, rmdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { PrivateBoundaryError, assureWindowsPrivateDirectories } from "./private-boundary.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

const OWNER_REMEDY = "Remedy: an existing insecure private directory must be removed or re-secured by its owner before the installer is re-run.";
const UNAVAILABLE_REMEDY = "Remedy: the Windows assurance could not be performed; the installer can be re-run once that is resolved.";
const INSECURE_REMEDY = "Remedy: the new directory did not end private; the installer can be re-run after checking the inherited permissions of its parent.";

/** Nothing is left behind after a created-and-removed segment, so the remedy names the observed cause. */
function remedyFor(created, removed, status) {
  if (!(created && removed)) return OWNER_REMEDY;
  return status === "insecure" ? INSECURE_REMEDY : UNAVAILABLE_REMEDY;
}

function fail(code, message) {
  throw new PrivateBoundaryError(code, message);
}

/** Non-recursive on purpose: a directory that is not empty is never deleted. */
function removeEmptyDirectory(directory, rmdir) {
  try {
    rmdir(directory);
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the Windows contract to one segment: harden it when this call created
 * it, assess it otherwise. A created segment that fails is taken back before the
 * refusal is thrown; a segment that already existed is never touched. The refusal
 * names the segment relative to the anchor (never a host path), the assurance
 * status and reason, and what its owner has to do.
 */
function assureSegment(anchorPath, directory, created, { harden, assess, rmdir }) {
  let observed = null;
  const record = (probe) => (path) => {
    observed = probe(path);
    return observed;
  };
  try {
    assureWindowsPrivateDirectories([{ directory, created }], { harden: record(harden), assess: record(assess) });
  } catch (error) {
    const removed = created && removeEmptyDirectory(directory, rmdir);
    if (!(error instanceof PrivateBoundaryError) || error.code !== "PB-WINDOWS-ASSURANCE") throw error;
    const status = typeof observed?.status === "string" ? observed.status : "unavailable";
    const reason = typeof observed?.reason === "string" && observed.reason.length > 0 ? observed.reason : "no reason reported";
    const name = relative(anchorPath, directory).split(sep).join("/");
    let disposition = "The directory already existed and was left untouched.";
    if (created) {
      disposition = removed
        ? "The directory was created by this call and has been removed again."
        : "The directory was created by this call but could not be removed again.";
    }
    fail("PB-WINDOWS-ASSURANCE", `private-state directory Windows assurance is ${status} for ${name}: ${reason}. ${disposition}\n${remedyFor(created, removed, status)}`);
  }
}

/**
 * Ensure `target` exists as a chain of private directories strictly below the
 * existing directory `anchor`, and return the resolved target.
 *
 * - `PB-ESCAPE`: the target does not resolve strictly inside the anchor.
 * - `PB-ANCHOR`: the anchor is not an existing directory.
 * - `PB-DIRECTORY`: a segment exists but is not a non-symlink directory.
 * - `PB-WINDOWS-ASSURANCE` (win32 only): a created segment could not be
 *   hardened to secure (it is removed again while empty), or a pre-existing
 *   segment is not already secure (it is left exactly as found).
 */
export function ensureHardenedPrivateDirectory(anchor, target, {
  platform = process.platform,
  harden = hardenWindowsPrivateDirectory,
  assess = assessWindowsPrivatePath,
  mkdir = mkdirSync,
  rmdir = rmdirSync,
} = {}) {
  if (typeof target !== "string" || target.length === 0) fail("PB-ESCAPE", "private directory target is unavailable");
  if (typeof anchor !== "string" || anchor.length === 0) fail("PB-ANCHOR", "private directory anchor is unavailable");
  const anchorPath = resolve(anchor);
  const targetPath = resolve(target);
  const below = relative(anchorPath, targetPath);
  if (below === "" || isAbsolute(below) || below === ".." || below.startsWith(`..${sep}`)) {
    fail("PB-ESCAPE", "private directory target must resolve strictly inside its anchor");
  }
  let anchorInfo = null;
  try {
    anchorInfo = statSync(anchorPath);
  } catch {
    anchorInfo = null;
  }
  if (anchorInfo === null || !anchorInfo.isDirectory()) fail("PB-ANCHOR", "private directory anchor must be an existing directory");

  let cursor = anchorPath;
  for (const segment of below.split(sep)) {
    cursor = join(cursor, segment);
    let created = false;
    try {
      mkdir(cursor, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const info = lstatSync(cursor);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      fail("PB-DIRECTORY", "private-state directory segment must be a physical directory");
    }
    if (platform === "win32") assureSegment(anchorPath, cursor, created, { harden, assess, rmdir });
  }
  return targetPath;
}
