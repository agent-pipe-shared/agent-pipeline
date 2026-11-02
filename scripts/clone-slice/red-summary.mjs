// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool red-summary.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Scratch: group the red steps of a verify run record by their first failure line.
// usage: node scratch/agent-out/red-summary.mjs <verify-latest.json>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const record = JSON.parse(readFileSync(resolve(process.argv[2]), "utf8"));
const red = record.steps.filter((s) => s.exitCode !== 0);
console.log(`keys of a red step: ${Object.keys(red[0] ?? {}).join(", ")}`);
const groups = new Map();
for (const s of red) {
  const text = [s.stderrTail, s.stdoutTail, s.diagnostic, s.output, s.tail].filter((v) => typeof v === "string").join("\n");
  const line = text.split("\n").map((l) => l.trim()).find((l) => /(Error|error:|FAIL|BLOCKED|not ok|✖)/u.test(l)) ?? "(no failure line captured)";
  const key = line.slice(0, 160);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(s.name);
}
for (const [key, names] of [...groups].sort((a, b) => b[1].length - a[1].length)) console.log(`${names.length}x ${key}\n   ${names.slice(0, 6).join(", ")}${names.length > 6 ? ", ..." : ""}`);
