// SPDX-License-Identifier: SUL-1.0
// Purpose: remove the test and Verify leftovers the Pipeline's own suites and Full Verify runs leave directly in the home folder
//          (signing-method, b1i, existing-public-anchor, k79-scan, local-supervisor and design-route test homes, old Full Verify
//          clones, the shared fixture/tmp folders). Candidate 30 (C30-5) runs it automatically: `scripts/full-verify.mjs` calls
//          `sweepLeftovers` at the end of every run, `scripts/run-quiet.mjs` sweeps its own label folders, and the suites remove
//          what they create. This file is also the manual form.
// Usage:   node scripts/clean-test-leftovers.mjs [--apply] [--min-age-hours <n>] [--verify-homes <days>]
//          Without --apply it only prints the plan (name, size, files, age) and removes nothing. --apply removes exactly the entries
//          of the plan. Default minimum age 12 hours by the entry's own modification time: a younger entry may belong to a run that
//          is still going and is skipped. --verify-homes <days> additionally plans the per-run homes of finished Full Verify runs
//          (`.fv/<label>`) and their clones (`fvc/<name>`) that are older than <days> days; without the flag `.fv` and `fvc` are
//          never touched (a red run keeps its home for the red-suite reruns).
// Safety:  only top-level entries of the home folder whose NAME matches the allowlist below are ever considered; a symbolic link is
//          never followed or removed through; live state is not in the allowlist (.fv, fvc, .ptp, .apsp, .agent-pipeline, the
//          installed plugin folder, the PO key folder, .ssh and every other dot folder not named here). The home folder is read
//          from the operating system, no path is written into this file.
// Data:    writes nothing but the removals of --apply; reads sizes by walking each planned entry once.
import { lstatSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { removeTestTree } from "../plugins/pipeline-core/lib/test-home-cleanup.mjs";

export const LEFTOVER_PATTERNS = Object.freeze([
  /^\.pipeline-signing-method-[A-Za-z0-9]{6}$/u,
  /^\.pipeline-b1i-[A-Za-z0-9]{6}$/u,
  /^\.pipeline-existing-public-anchor-[A-Za-z0-9]{6}$/u,
  /^\.cache-k79-scan-[A-Za-z0-9]{6}$/u,
  /^\.local-supervisor-[A-Za-z0-9]{6}$/u,
  /^design-route-[A-Za-z0-9-]+$/u,
  /^fv-?(?:c18|18[a-z]+|19[a-z]?|19[lm](?:-applied)?)$/u,
  /^fx19h$/u,
  /^(?:fixtures|pipeline-test-tmp|pipeline-verify-tmp|scratch)$/u,
  /^hook-authority-trace-linux\.jsonl$/u,
]);

export function isLeftoverName(name) { return LEFTOVER_PATTERNS.some((pattern) => pattern.test(name)); }

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

export function planLeftovers({ home = homedir(), minAgeHours = 12, now = Date.now(), verifyHomeDays = null } = {}) {
  const planned = [], skipped = [];
  const consider = (name, path, limitHours) => {
    let stat;
    try { stat = lstatSync(path); } catch { return; }
    if (stat.isSymbolicLink()) { skipped.push({ name, reason: "symbolic link" }); return; }
    const ageHours = (now - stat.mtimeMs) / 3600000;
    if (ageHours < limitHours) { skipped.push({ name, reason: `younger than ${limitHours} h` }); return; }
    planned.push({ name, path, ageHours, ...(stat.isDirectory() ? measure(path) : { bytes: stat.size, files: 1 }) });
  };
  for (const name of readdirSync(home)) if (isLeftoverName(name)) consider(name, join(home, name), minAgeHours);
  // C30-5: the per-run homes of finished Full Verify runs and their clones, only when asked and only the children of the two
  // folders, older than the given number of days. The folders themselves and everything else of the home folder stay.
  if (verifyHomeDays !== null) {
    for (const folder of [".fv", "fvc"]) {
      let children;
      try { children = readdirSync(join(home, folder)); } catch { continue; }
      for (const child of children) consider(`${folder}/${child}`, join(home, folder, child), verifyHomeDays * 24);
    }
  }
  return { planned, skipped };
}

/**
 * C30-5: plan and (with `apply`) remove the leftovers in one call, the form Verify uses at the end of a run. Returns counts only.
 * Never throws; an entry that cannot be removed stays and is retried by the next sweep.
 */
export function sweepLeftovers({ home = homedir(), minAgeHours = 12, now = Date.now(), apply = true, verifyHomeDays = null } = {}) {
  try {
    const { planned } = planLeftovers({ home, minAgeHours, now, verifyHomeDays });
    const bytes = planned.reduce((sum, item) => sum + item.bytes, 0);
    if (!apply) return { planned: planned.length, removed: 0, bytes };
    let removed = 0;
    for (const item of planned) if (removeTestTree(item.path)) removed += 1;
    return { planned: planned.length, removed, bytes };
  } catch { return { planned: 0, removed: 0, bytes: 0 }; }
}

function main(argv) {
  const apply = argv.includes("--apply");
  const ageIndex = argv.indexOf("--min-age-hours");
  const minAgeHours = ageIndex === -1 ? 12 : Number(argv[ageIndex + 1]);
  if (!Number.isFinite(minAgeHours) || minAgeHours < 0) { console.error("clean-test-leftovers: REFUSED: --min-age-hours needs a non-negative number"); return 2; }
  const verifyIndex = argv.indexOf("--verify-homes");
  const verifyHomeDays = verifyIndex === -1 ? null : Number(argv[verifyIndex + 1]);
  if (verifyHomeDays !== null && (!Number.isFinite(verifyHomeDays) || verifyHomeDays < 0)) { console.error("clean-test-leftovers: REFUSED: --verify-homes needs a non-negative number of days"); return 2; }
  const { planned, skipped } = planLeftovers({ minAgeHours, verifyHomeDays });
  for (const item of planned) console.log(`${(item.bytes / 1048576).toFixed(1).padStart(9)} MB ${String(item.files).padStart(8)} files ${(item.ageHours / 24).toFixed(1).padStart(6)} d  ${item.name}`);
  for (const item of skipped) console.log(`   skipped  ${item.name} (${item.reason})`);
  const total = planned.reduce((sum, item) => sum + item.bytes, 0);
  console.log(`${apply ? "removing" : "plan"}: ${planned.length} entries, ${(total / 1073741824).toFixed(2)} GB`);
  if (!apply) { console.log("nothing removed; run again with --apply to remove exactly these entries"); return 0; }
  let removed = 0;
  for (const item of planned) {
    if (removeTestTree(item.path)) removed += 1; else console.error(`failed ${item.name}`);
  }
  console.log(`removed ${removed} of ${planned.length}`);
  return removed === planned.length ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) process.exit(main(process.argv.slice(2)));
