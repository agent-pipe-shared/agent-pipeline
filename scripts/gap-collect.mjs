// SPDX-License-Identifier: SUL-1.0
// Purpose: validate the gap-round reader outputs and list the actionable clauses (OPEN-BUILDABLE, NOW-AGENT, NOW-PO-TERMINAL) plus the verdict counts.
// Usage:   node scripts/gap-collect.mjs     (run from the repository root; no arguments)
// Inputs:  scratch/gap/out5-1..4.json and scratch/gap/out6-1..6.json (untracked, per-run reader outputs of rounds 5 and 6 of 2026-10-22;
//          edit the file list below for a later round).
// Output:  MISSING / INVALID JSON notices, the verdict counts, and one block per actionable clause. Verdicts are the readers' own and unverified.
// Data:    scratch/gap/. Read-only.
import { readFileSync, existsSync } from "node:fs";
const files = [...[1, 2, 3, 4].map((i) => `scratch/gap/out5-${i}.json`), ...[1, 2, 3, 4, 5, 6].map((i) => `scratch/gap/out6-${i}.json`)];
const counts = {};
const actionable = [];
for (const f of files) {
  if (!existsSync(f)) { console.log(`MISSING ${f}`); continue; }
  let rows;
  try { rows = JSON.parse(readFileSync(f, "utf8")); } catch (e) { console.log(`INVALID JSON ${f}: ${e.message}`); continue; }
  for (const r of rows) {
    counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    if (["OPEN-BUILDABLE", "NOW-AGENT", "NOW-PO-TERMINAL"].includes(r.verdict)) actionable.push({ f: f.split("/").pop(), ...r });
  }
}
console.log("counts:", JSON.stringify(counts));
for (const a of actionable) console.log(`\n[${a.verdict}] ${a.id} (${a.f}) protected=${a.protected}\n  clause: ${a.clause}\n  detail: ${a.detail}\n  next: ${a.smallestBuild ?? a.nextStep ?? ""}`);
