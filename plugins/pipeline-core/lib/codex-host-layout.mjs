// SPDX-License-Identifier: SUL-1.0

/**
 * Codex may expose a fresh workspace with these control directories already
 * mounted read-only.  They are environment-owned, not incomplete project
 * bytes: callers may recognise the exact layout, but must never write through
 * it, chmod it, or accept a broader near-match.
 */
import { accessSync, constants, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const CODEX_HOST_CONTROL_PATHS = Object.freeze([".agents", ".codex", ".git"]);
const REQUIRED_CODEX_HOST_CONTROL_PATHS = Object.freeze([".codex", ".git"]);

export function hasCodexHostControlLayout(root, {
  access = accessSync,
  fsConstants = constants,
  lstat = lstatSync,
  readdir = readdirSync,
} = {}) {
  const isReadonlyEmptyDirectory = (name) => {
    const path = join(root, name);
    try {
      const info = lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink() || readdir(path).length !== 0) return false;
      try { access(path, fsConstants.W_OK); return false; } catch { return true; }
    } catch { return false; }
  };
  if (!REQUIRED_CODEX_HOST_CONTROL_PATHS.every(isReadonlyEmptyDirectory)) return false;
  try { lstat(join(root, ".agents")); } catch (error) { return error?.code === "ENOENT"; }
  return isReadonlyEmptyDirectory(".agents");
}
