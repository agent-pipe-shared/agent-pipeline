// SPDX-License-Identifier: SUL-1.0
// Purpose: turn the rows of a delivery remeasure whose open list names an `agent` clause into 4 reader input batches (gap rounds, step 1).
// Usage:   node scripts/gap-inputs.mjs [<remeasure-dir>]     (run from the repository root; default = DEFAULT_DIR below)
// Inputs:  <remeasure-dir>/README.md, section "## Open per item" (specs/sprint-alfred-epic/evidence/delivery-remeasure-<date>/).
// Output:  scratch/gap/input-01.json .. input-04.json (each row keeps only the agent-owned clause texts); a count line on stdout.
// Data:    scratch/gap/ is untracked, per-run data (the readers write scratch/gap/out-0N.json next to it; gap-summary.mjs and
//          gap-collect.mjs read those; gap-evidence.mjs archives them). Writes only under scratch/gap/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const DEFAULT_DIR = "specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-22";
const dir = process.argv[2] ?? DEFAULT_DIR;
const src = readFileSync(`${dir}/README.md`, "utf8").split("\n");
const start = src.findIndex((l) => l.startsWith("## Open per item"));
const rows = [];
for (const line of src.slice(start)) {
  const m = /^\| (pipeline\.[^|]+?) \| (\d+) \| ([^|]*) \| (.*) \|$/u.exec(line);
  if (!m) continue;
  const owners = m[3].split(", ").map((s) => s.trim());
  if (!owners.includes("agent")) continue;
  const whats = m[4].split(/\.; |; (?=[A-Z])/u).map((s) => s.trim().replace(/\.$/u, "")).filter(Boolean);
  const clauses = owners.length === whats.length ? whats.filter((_, i) => owners[i] === "agent") : whats.filter((w) => !/Critic review|PO acceptance|native|installed host/iu.test(w));
  rows.push({ itemId: m[1], stageBaseline: Number(m[2]), agentClauses: clauses, allOwners: owners });
}
mkdirSync("scratch/gap", { recursive: true });
const size = Math.ceil(rows.length / 4);
for (let i = 0; i < 4; i += 1) writeFileSync(`scratch/gap/input-0${i + 1}.json`, `${JSON.stringify(rows.slice(i * size, (i + 1) * size), null, 1)}\n`);
console.log(`${rows.length} rows, ${size} per batch`);
