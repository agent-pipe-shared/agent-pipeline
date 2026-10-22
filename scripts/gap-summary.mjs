// SPDX-License-Identifier: SUL-1.0
// Purpose: print the clauses of the gap reader outputs that have a given status, plus the totals per status.
// Usage:   node scripts/gap-summary.mjs [STATUS]     (run from the repository root; default STATUS = OPEN-BUILDABLE)
// Inputs:  scratch/gap/out-01.json .. out-04.json (untracked, per-run reader outputs written after scripts/gap-inputs.mjs).
// Output:  per matching clause its item id, text and detail; last line the JSON totals per status.
// Data:    scratch/gap/. Read-only.
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("scratch/gap/out-01.json")) { console.error("gap-summary: scratch/gap/out-01.json not found; run the readers (inputs from scripts/gap-inputs.mjs) first, from the repository root"); process.exit(2); }
const want = process.argv[2] ?? "OPEN-BUILDABLE";
const totals = {};
for (let n = 1; n <= 4; n += 1) {
  for (const row of JSON.parse(readFileSync(`scratch/gap/out-0${n}.json`, "utf8"))) {
    for (const c of row.clauses) {
      totals[c.status] = (totals[c.status] ?? 0) + 1;
      if (c.status === want) console.log(`${row.itemId}${c.protected ? " [protected]" : ""}\n  clause: ${c.clause}\n  ${c.detail}\n`);
    }
  }
}
console.log(JSON.stringify(totals));
