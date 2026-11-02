// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool chain-commit.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Scratch: commit a manually resolved chain step and save its diff as the rebased form of the held patch.
// usage: node scratch/agent-out/chain-commit.mjs <clone-dir> <held patch name without .patch>
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [cloneArg, name] = process.argv.slice(2);
const clone = resolve(cloneArg);
const env = { ...process.env, GIT_AUTHOR_NAME: "Chain", GIT_AUTHOR_EMAIL: "chain@example.invalid", GIT_COMMITTER_NAME: "Chain", GIT_COMMITTER_EMAIL: "chain@example.invalid" };
const sh = (args) => spawnSync("git", args, { cwd: clone, encoding: "utf8", maxBuffer: 1 << 28, env });
sh(["add", "-A"]);
const commit = sh(["commit", "--no-verify", "-q", "-m", `chain: ${name} (resolved)`]);
if (commit.status !== 0) { console.log(commit.stderr || commit.stdout); process.exit(1); }
const out = resolve(import.meta.dirname, "chain-out");
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, `${name}.patch`), sh(["diff", "--binary", "HEAD~1", "HEAD"]).stdout);
console.log(`resolved ${name}; HEAD ${sh(["rev-parse", "HEAD"]).stdout.trim()}`);
