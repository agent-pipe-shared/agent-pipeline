// SPDX-License-Identifier: SUL-1.0
/**
 * C30-5 (PO 2026-11-15): tests and Verify runs leave folders in the home folder and nothing removed them (62 entries, 40.7 GB in
 * one measurement). This is the one place that removes a test tree safely, so a suite's own cleanup, `scripts/run-quiet.mjs`,
 * `scripts/full-verify.mjs` and `scripts/clean-test-leftovers.mjs` all do it the same way:
 *
 *  - `removeTestTree(path)`: a fixture may chmod its folders unreadable, so every directory of the tree is made removable first, then
 *    the tree is removed. A symbolic link is never followed and the link itself is removed. Never throws: it returns false when
 *    something stayed behind (the next sweep retries).
 *  - `keepTestHomes()`: the documented switch (PIPELINE_KEEP_TEST_HOMES=1) that keeps a fixture folder for a diagnosis. A failing
 *    run keeps its folders by itself only where the caller says so; the sweep removes them after the age guard.
 *
 * Imports node builtins only (suites import it before anything else runs).
 */
import { chmodSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** True when the person asked to keep fixture folders (a diagnosis); the default is to remove them. */
export function keepTestHomes(env = process.env) {
  return env.PIPELINE_KEEP_TEST_HOMES === "1";
}

function makeRemovable(path) {
  const stack = [path];
  while (stack.length > 0) {
    const current = stack.pop();
    let stat;
    try { stat = lstatSync(current); } catch { continue; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    try { chmodSync(current, 0o700); } catch { /* not ours to change */ }
    try { for (const entry of readdirSync(current)) stack.push(join(current, entry)); } catch { /* unreadable */ }
  }
}

/** Remove one test tree. @returns {boolean} true when it is gone. */
export function removeTestTree(path) {
  if (typeof path !== "string" || path === "") return false;
  try {
    makeRemovable(path);
    rmSync(path, { recursive: true, force: true });
  } catch { /* reported by the return value */ }
  try { lstatSync(path); return false; } catch { return true; }
}

/**
 * Remove the children of `dir` whose own modification time is older than `minAgeHours` (a younger one may belong to a run that is
 * still going). Never follows a symbolic link. @returns {{ removed: string[], kept: string[] }} names only.
 */
export function sweepOldChildren(dir, { minAgeHours = 12, now = Date.now() } = {}) {
  const removed = [], kept = [];
  let names;
  try { names = readdirSync(dir); } catch { return { removed, kept }; }
  for (const name of names) {
    const path = join(dir, name);
    let stat;
    try { stat = lstatSync(path); } catch { continue; }
    if ((now - stat.mtimeMs) / 3600000 < minAgeHours) { kept.push(name); continue; }
    (removeTestTree(path) ? removed : kept).push(name);
  }
  return { removed, kept };
}
