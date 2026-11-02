// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool toplevels.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Scratch: print the unique top-level paths touched by the patches of an order file (rebased variants preferred).
// usage: node scratch/agent-out/toplevels.mjs <order file>
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const H = "specs/sprint-alfred-epic/evidence/held-patches";
const names = readFileSync(resolve(process.argv[2]), "utf8").split("\n").map((l) => l.replace(/#.*$/u, "").trim()).filter(Boolean);
const tops = new Map();
for (const name of names) {
  const rebased = resolve(repo, H, `${name}.rebased.patch`);
  const text = readFileSync(existsSync(rebased) ? rebased : resolve(repo, H, `${name}.patch`), "utf8");
  for (const m of text.matchAll(/^diff --git a\/(\S+) b\/\S+$/gmu)) {
    const parts = m[1].split("/");
    const top = parts.length === 1 ? parts[0] : parts[0] === "plugins" ? parts.slice(0, 3).join("/") : parts[0];
    if (!tops.has(top)) tops.set(top, name);
  }
}
for (const [top, first] of [...tops].sort()) console.log(`${top}\t(first: ${first.slice(0, 12)})`);
