// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool mkclone.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Scratch: make a shared slice clone of the main repo, detached at a base commit.
// usage: node scratch/agent-out/mkclone.mjs <new clone dir> [base sha]   (default base c9a73fb80d6f587efb5e3cd595a87fa5ae480e03)
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
const dst = resolve(process.argv[2]);
const base = process.argv[3] ?? "c9a73fb80d6f587efb5e3cd595a87fa5ae480e03";
const sh = (args, cwd) => { const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 }); if (r.status !== 0) { console.error(args.join(" "), r.stderr); process.exit(1); } return r.stdout.trim(); };
rmSync(dst, { recursive: true, force: true });
sh(["clone", "--shared", "--no-checkout", process.cwd(), dst], process.cwd());
sh(["checkout", "--detach", base], dst);
console.log("clone at", base, "->", dst);
