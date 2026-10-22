// SPDX-License-Identifier: SUL-1.0
// Purpose: tally who owns the open work per item in a delivery remeasure README (agent, critic, po-acceptance, host, ...).
// Usage:   node scripts/delivery-owners.mjs [<remeasure-dir>]     (run from the repository root; default = DEFAULT_DIR below)
// Inputs:  <remeasure-dir>/README.md, section "## Open per item" (specs/sprint-alfred-epic/evidence/delivery-remeasure-<date>/).
// Output:  rows parsed by stage, owner tally, and how many items have agent work / agent-only work / only critic and acceptance left.
// Data:    specs/sprint-alfred-epic/evidence/delivery-remeasure-*/README.md. Read-only.
import { readFileSync } from "node:fs";
// The remeasure this tally was written for; pass a newer folder as the first argument.
const DEFAULT_DIR = "specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-20";
const dir = process.argv[2] ?? DEFAULT_DIR;
const lines = readFileSync(`${dir}/README.md`, "utf8").split("\n");
const start = lines.findIndex((l) => l.startsWith("## Open per item"));
const rows = lines.slice(start).filter((l) => l.startsWith("| pipeline.") || l.startsWith("| ac-") || /^\| [A-Za-z0-9._-]+ \| (25|50|75) \|/.test(l));
const tally = {};
const byStage = {};
let agentOnly = 0, agentAny = 0, hostOnlyNoAgent = 0, onlyAcceptance = 0;
for (const r of rows) {
  const c = r.split("|").map((x) => x.trim());
  const stage = c[2];
  const owners = c[3].split(",").map((x) => x.trim()).filter(Boolean);
  byStage[stage] = (byStage[stage] ?? 0) + 1;
  for (const o of owners) tally[o] = (tally[o] ?? 0) + 1;
  const real = owners.filter((o) => !["critic", "po-acceptance"].includes(o));
  if (owners.includes("agent")) agentAny++;
  if (real.length === 1 && real[0] === "agent") agentOnly++;
  if (real.length === 0) onlyAcceptance++;
  if (real.length && !owners.includes("agent")) hostOnlyNoAgent++;
}
console.log("rows parsed:", rows.length, "by stage:", JSON.stringify(byStage));
console.log("owner tally:", JSON.stringify(tally));
console.log("items with agent work:", agentAny, "| agent-only (besides critic/acceptance):", agentOnly, "| only critic/acceptance left:", onlyAcceptance, "| host/decision/signature work, no agent work:", hostOnlyNoAgent);
