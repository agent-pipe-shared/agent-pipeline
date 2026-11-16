// SPDX-License-Identifier: SUL-1.0
// Purpose: remove the old build, rehearsal and work clones and working folders that pile up under this repository's `scratch/` (a
//          measured 236 GB checkout, about 130 GB in `scratch/clones` and 92 GB in `scratch/agent-out`; every candidate leaves its
//          clones behind and their results live on as held patches and commits, so a clone is only a cache). It is the repository-
//          side partner of `scripts/clean-test-leftovers.mjs` (the home folder) and is run the same way on every machine.
// Usage:   node scripts/clean-repo-scratch.mjs [plan|apply] [--keep-days <n>] [--root <repository root>]
//          `plan` (the default) prints what would go (name, size, files, age) and what stays and why, and removes nothing. `apply`
//          removes exactly the entries of that plan. --keep-days (default 1) keeps every entry modified within that many days, so
//          the candidate being built stays. The root defaults to the repository this script lives in.
// Scope:   only DIRECTORIES that are direct children of `scratch/clones`, `scratch/agent-out` and `scratch/agent-out/w24reh` are ever
//          considered; files (the helper scripts, notes, logs) and every other top-level entry of `scratch/` are never touched.
//          Kept whatever their age: the names in KEEP_NAMES (shared fixtures, the helper-script folder, the rehearsal folder itself).
//          A symbolic link is skipped, never followed. Each planned path must resolve inside `<root>/scratch/` or it is refused.
// Safety:  `apply` refuses while a Full Verify, a parallel run or a Verify run is active on this machine (checked through `/proc` on
//          Linux; on a machine without `/proc` it says so and relies on the person). The home folder, `.fv`, `fvc` and the PO's
//          project folders are outside this script's scope. No path is written into this file; the root comes from its own location.
// Data:    writes nothing but the removals of `apply`; reads sizes by walking each planned entry once.
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { removeTestTree } from "../plugins/pipeline-core/lib/test-home-cleanup.mjs";

/** Parent folders (relative to `scratch/`) whose direct child directories are candidates. */
export const SCAN_PARENTS = Object.freeze(["clones", "agent-out", "agent-out/w24reh"]);
/** Child names kept whatever their age: fixtures, the helper-script folder and the rehearsal folder (its children are scanned). */
export const KEEP_NAMES = Object.freeze(["fixtures", "scratch", "c29", "w24reh"]);
/** Command-line fragments that mean a test or Verify run is active (no removal while one is). */
export const ACTIVE_RUN_MARKERS = Object.freeze(["full-verify.mjs", "run-parallel.mjs", "harness/scripts/verify.mjs", "run-quiet.mjs", "run-list.mjs"]);

function measure(path) {
  let bytes = 0, files = 0;
  const stack = [path];
  while (stack.length) {
    const current = stack.pop();
    let stat;
    try { stat = lstatSync(current); } catch { continue; }
    if (stat.isDirectory() && !stat.isSymbolicLink()) { try { for (const entry of readdirSync(current)) stack.push(join(current, entry)); } catch { /* unreadable */ } }
    else { bytes += stat.size; files += 1; }
  }
  return { bytes, files };
}

/** True when `path` really lies inside `<root>/scratch/` (real paths, so a link cannot lead out). */
export function isInsideScratch(root, path) {
  try {
    const scratch = realpathSync(join(root, "scratch"));
    const real = realpathSync(path);
    return real !== scratch && real.startsWith(scratch + sep);
  } catch { return false; }
}

export function planScratch({ root, keepDays = 1, now = Date.now() } = {}) {
  const scratch = join(root, "scratch");
  const planned = [], kept = [];
  for (const parent of SCAN_PARENTS) {
    let names;
    try { names = readdirSync(join(scratch, parent)); } catch { continue; }
    for (const name of names) {
      const label = `${parent}/${name}`;
      const path = join(scratch, parent, name);
      let stat;
      try { stat = lstatSync(path); } catch { continue; }
      if (stat.isSymbolicLink()) { kept.push({ name: label, reason: "symbolic link" }); continue; }
      if (!stat.isDirectory()) continue;
      if (KEEP_NAMES.includes(name)) { kept.push({ name: label, reason: "kept by name" }); continue; }
      const ageDays = (now - stat.mtimeMs) / 86400000;
      if (ageDays < keepDays) { kept.push({ name: label, reason: `younger than ${keepDays} d` }); continue; }
      if (!isInsideScratch(root, path)) { kept.push({ name: label, reason: "outside scratch (refused)" }); continue; }
      planned.push({ name: label, path, ageDays, ...measure(path) });
    }
  }
  return { planned, kept };
}

/** Command lines of the processes running now (Linux `/proc`), or null when they cannot be read. */
export function readActiveCommandLines(proc = "/proc") {
  try {
    const lines = [];
    for (const entry of readdirSync(proc)) {
      if (!/^\d+$/u.test(entry) || Number(entry) === process.pid) continue;
      try { lines.push(readFileSync(join(proc, entry, "cmdline"), "utf8").split("\0").join(" ")); } catch { /* process ended */ }
    }
    return lines;
  } catch { return null; }
}

/** The markers found in any of the given command lines (pure). */
export function activeRunsIn(commandLines, markers = ACTIVE_RUN_MARKERS) {
  return markers.filter((marker) => commandLines.some((line) => line.includes(marker)));
}

export function applyPlan(planned) {
  let removed = 0;
  for (const item of planned) if (removeTestTree(item.path)) removed += 1; else console.error(`failed ${item.name}`);
  return removed;
}

function main(argv) {
  const mode = argv.find((arg) => arg === "plan" || arg === "apply") ?? "plan";
  const valueOf = (flag) => { const index = argv.indexOf(flag); return index === -1 ? undefined : argv[index + 1]; };
  const keepDays = valueOf("--keep-days") === undefined ? 1 : Number(valueOf("--keep-days"));
  if (!Number.isFinite(keepDays) || keepDays < 0) { console.error("clean-repo-scratch: REFUSED: --keep-days needs a non-negative number"); return 2; }
  const root = resolve(valueOf("--root") ?? fileURLToPath(new URL("..", import.meta.url)));
  const { planned, kept } = planScratch({ root, keepDays });
  for (const item of planned) console.log(`${(item.bytes / 1048576).toFixed(1).padStart(10)} MB ${String(item.files).padStart(8)} files ${item.ageDays.toFixed(1).padStart(6)} d  ${item.name}`);
  for (const item of kept) console.log(`   kept  ${item.name} (${item.reason})`);
  const total = planned.reduce((sum, item) => sum + item.bytes, 0);
  console.log(`${mode === "apply" ? "removing" : "plan"}: ${planned.length} entries, ${(total / 1073741824).toFixed(2)} GB; ${kept.length} kept`);
  if (mode !== "apply") { console.log("nothing removed; run `apply` to remove exactly these entries"); return 0; }
  const lines = readActiveCommandLines();
  if (lines === null) console.log("note: no /proc here, so an active Verify or test run cannot be detected; make sure none is running");
  else {
    const active = activeRunsIn(lines);
    if (active.length > 0) { console.error(`clean-repo-scratch: REFUSED: a run is active (${active.join(", ")}); wait until it ends, then run apply again`); return 2; }
  }
  const removed = applyPlan(planned);
  console.log(`removed ${removed} of ${planned.length}`);
  return removed === planned.length ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) process.exit(main(process.argv.slice(2)));
