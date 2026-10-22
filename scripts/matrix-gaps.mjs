// SPDX-License-Identifier: SUL-1.0
// Purpose: list the rows of a delivery-matrix snapshot whose open clauses are owned by the agent.
// Usage:   node scripts/matrix-gaps.mjs [<remeasure-dir>]     (run from the repository root; default = DEFAULT_DIR below)
// Inputs:  <remeasure-dir>/snapshot.json (specs/sprint-alfred-epic/evidence/delivery-remeasure-<date>/).
// Output:  openByOwner totals, one sample open clause, one line per agent-owned open clause, and their count.
// Data:    specs/sprint-alfred-epic/evidence/delivery-remeasure-*/snapshot.json. Read-only.
import { readFileSync } from "node:fs";
// The newest remeasure folder; pass another folder as the first argument to read an older snapshot.
const DEFAULT_DIR = "specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-22";
const dir = process.argv[2] ?? DEFAULT_DIR;
const snap = JSON.parse(readFileSync(`${dir}/snapshot.json`, "utf8"));
console.log("openByOwner:", JSON.stringify(snap.openByOwner));
const sample = snap.rows.find((r) => Array.isArray(r.open) && r.open.length);
console.log("open sample:", JSON.stringify(sample?.open?.[0]));
let n = 0;
for (const r of snap.rows) {
  for (const o of r.open ?? []) {
    if (o.owner === "agent") { n += 1; console.log(`- [${r.stage}] ${r.itemId}: ${String(o.clause ?? o.text ?? o.what ?? "").slice(0, 220)}`); }
  }
}
console.log("agent-owned open clauses:", n);
