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
 */
import { lstatSync, mkdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { PrivateBoundaryError, assureWindowsPrivateDirectories } from "./private-boundary.mjs";
import { assessWindowsPrivatePath, hardenWindowsPrivateDirectory } from "./windows-private-state.mjs";

function fail(code, message) {
  throw new PrivateBoundaryError(code, message);
}

/**
 * Ensure `target` exists as a chain of private directories strictly below the
 * existing directory `anchor`, and return the resolved target.
 *
 * - `PB-ESCAPE`: the target does not resolve strictly inside the anchor.
 * - `PB-ANCHOR`: the anchor is not an existing directory.
 * - `PB-DIRECTORY`: a segment exists but is not a non-symlink directory.
 * - `PB-WINDOWS-ASSURANCE` (win32 only): a created segment could not be
 *   hardened to secure, or a pre-existing segment is not already secure.
 */
export function ensureHardenedPrivateDirectory(anchor, target, {
  platform = process.platform,
  harden = hardenWindowsPrivateDirectory,
  assess = assessWindowsPrivatePath,
  mkdir = mkdirSync,
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
    if (platform === "win32") assureWindowsPrivateDirectories([{ directory: cursor, created }], { harden, assess });
  }
  return targetPath;
}
