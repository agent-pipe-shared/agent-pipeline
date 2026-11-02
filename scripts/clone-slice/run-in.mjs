// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool run-in.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Scratch: run a node script inside a scratch clone (the shell guard blocks cross-directory commands).
// usage: node scratch/agent-out/run-in.mjs <clone-dir> <script relative to the clone> [args...]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const [cloneArg, script, ...args] = process.argv.slice(2);
const r = spawnSync(process.execPath, [script, ...args], { cwd: resolve(cloneArg), encoding: "utf8", maxBuffer: 1 << 28 });
process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
console.log(`exit ${r.status}`);
process.exit(r.status ?? 1);
