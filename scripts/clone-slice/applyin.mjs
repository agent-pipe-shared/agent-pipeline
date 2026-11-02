// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool applyin.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Scratch: apply a patch inside a scratch clone (the shell guard blocks `git apply` and cross-repo git).
// usage: node scratch/agent-out/applyin.mjs <clone-dir> <patch file> [git apply flags, e.g. --3way --check]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const [clone, patch, ...flags] = process.argv.slice(2);
const r = spawnSync("git", ["apply", ...flags, resolve(patch)], { cwd: resolve(clone), encoding: "utf8" });
console.log(`git apply ${flags.join(" ")} ${patch} in ${clone}: exit ${r.status} ${r.stderr.trim()}`);
process.exit(r.status ?? 1);
