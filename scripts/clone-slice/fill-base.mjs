// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool fill-base.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Replace the literal placeholder BASE_SHA in the given briefing package files with the given commit SHA (in place), after
// the slice clone for that base exists, so a package written before the base commit existed can be built.
// usage: node scratch/agent-out/fill-base.mjs <40-hex sha> <package file>...
import { readFileSync, writeFileSync } from "node:fs";
const [sha, ...files] = process.argv.slice(2);
if (!/^[0-9a-f]{40}$/u.test(sha ?? "") || files.length === 0) { console.error("usage: fill-base.mjs <40-hex sha> <package file>..."); process.exit(2); }
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const count = text.split("BASE_SHA").length - 1;
  writeFileSync(file, text.replaceAll("BASE_SHA", sha));
  console.log(`${file}: ${count} replaced`);
}
