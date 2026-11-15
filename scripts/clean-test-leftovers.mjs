// SPDX-License-Identifier: SUL-1.0
// Purpose: remove the test and Verify leftovers the Pipeline's own suites and Full Verify runs leave directly in the home folder
//          (signing-method, b1i, existing-public-anchor, k79-scan, local-supervisor and design-route test homes, old Full Verify
//          clones, the shared fixture/tmp folders). It is the manual form of the cleanup candidate 30 automates after Verify.
// Usage:   node scripts/clean-test-leftovers.mjs [--apply] [--min-age-hours <n>]
//          Without --apply it only prints the plan (name, size, files, age) and removes nothing. --apply removes exactly the entries
//          of the plan. Default minimum age 12 hours by the entry's own modification time: a younger entry may belong to a run that
//          is still going and is skipped.
// Safety:  only top-level entries of the home folder whose NAME matches the allowlist below are ever considered; a symbolic link is
//          never followed or removed through; live state is not in the allowlist (.fv, fvc, .ptp, .apsp, .agent-pipeline, the
//          installed plugin folder, the PO key folder, .ssh and every other dot folder not named here). The home folder is read
//          from the operating system, no path is written into this file.
// Data:    writes nothing but the removals of --apply; reads sizes by walking each planned entry once.
import { chmodSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

function makeRemovable(path) {
  const stack = [path];
  while (stack.length) {
    const current = stack.pop();
    let stat;
    try { stat = lstatSync(current); } catch { continue; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    try { chmodSync(current, 0o700); } catch { /* not ours to change */ }
    try { for (const entry of readdirSync(current)) stack.push(join(current, entry)); } catch { /* unreadable */ }
  }
}

export function planLeftovers({ home = homedir(), minAgeHours = 12, now = Date.now() } = {}) {
  const planned = [], skipped = [];
  for (const name of readdirSync(home)) {
    if (!isLeftoverName(name)) continue;
    const path = join(home, name);
    let stat;
    try { stat = lstatSync(path); } catch { continue; }
    if (stat.isSymbolicLink()) { skipped.push({ name, reason: "symbolic link" }); continue; }
    const ageHours = (now - stat.mtimeMs) / 3600000;
    if (ageHours < minAgeHours) { skipped.push({ name, reason: `younger than ${minAgeHours} h` }); continue; }
    planned.push({ name, path, ageHours, ...(stat.isDirectory() ? measure(path) : { bytes: stat.size, files: 1 }) });
  }
  return { planned, skipped };
}

function main(argv) {
  const apply = argv.includes("--apply");
  const ageIndex = argv.indexOf("--min-age-hours");
  const minAgeHours = ageIndex === -1 ? 12 : Number(argv[ageIndex + 1]);
  if (!Number.isFinite(minAgeHours) || minAgeHours < 0) { console.error("clean-test-leftovers: REFUSED: --min-age-hours needs a non-negative number"); return 2; }
  const { planned, skipped } = planLeftovers({ minAgeHours });
  for (const item of planned) console.log(`${(item.bytes / 1048576).toFixed(1).padStart(9)} MB ${String(item.files).padStart(8)} files ${(item.ageHours / 24).toFixed(1).padStart(6)} d  ${item.name}`);
  for (const item of skipped) console.log(`   skipped  ${item.name} (${item.reason})`);
  const total = planned.reduce((sum, item) => sum + item.bytes, 0);
  console.log(`${apply ? "removing" : "plan"}: ${planned.length} entries, ${(total / 1073741824).toFixed(2)} GB`);
  if (!apply) { console.log("nothing removed; run again with --apply to remove exactly these entries"); return 0; }
  let removed = 0;
  for (const item of planned) {
    try { makeRemovable(item.path); rmSync(item.path, { recursive: true, force: true }); removed += 1; } catch (error) { console.error(`failed ${item.name}: ${error.message}`); }
  }
  console.log(`removed ${removed} of ${planned.length}`);
  return removed === planned.length ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) process.exit(main(process.argv.slice(2)));
