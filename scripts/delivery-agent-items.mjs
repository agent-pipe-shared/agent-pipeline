// SPDX-License-Identifier: SUL-1.0
// Purpose: list the items of a delivery remeasure whose only remaining owner (besides critic and PO acceptance) is the agent.
// Usage:   node scripts/delivery-agent-items.mjs [<remeasure-dir> [<out-tsv>]]     (run from the repository root; defaults = the constants below)
// Inputs:  <remeasure-dir>/README.md, section "## Open per item" (specs/sprint-alfred-epic/evidence/delivery-remeasure-<date>/).
// Output:  one TSV line per item (id, stage, first open clause) in <out-tsv>, and a count on stdout.
// Data:    reads the remeasure README; writes <out-tsv> under scratch/analysis/ (untracked, per-run data). The write is the only side effect.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const DEFAULT_DIR = "specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-20";
const DEFAULT_OUT = "scratch/analysis/agent-only-items-2026-10-21.tsv";
const dir = process.argv[2] ?? DEFAULT_DIR;
const outFile = process.argv[3] ?? DEFAULT_OUT;
const lines = readFileSync(`${dir}/README.md`, "utf8").split("\n");
const start = lines.findIndex((l) => l.startsWith("## Open per item"));
const rows = lines.slice(start).filter((l) => /^\| [A-Za-z0-9._-]+ \| (25|50|75) \|/.test(l));
const out = [];
for (const r of rows) {
  const c = r.split("|").map((x) => x.trim());
  const owners = c[3].split(",").map((x) => x.trim());
  const real = owners.filter((o) => !["critic", "po-acceptance"].includes(o));
  if (real.length === 1 && real[0] === "agent") out.push(`${c[1].replace("pipeline.", "")}\t${c[2]}\t${c[4].split(";")[0]}`);
}
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, out.join("\n") + "\n");
console.log(out.length, `agent-only items written to ${outFile}`);
