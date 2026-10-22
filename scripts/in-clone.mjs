// SPDX-License-Identifier: SUL-1.0
// Purpose: run a helper script with a build clone as cwd and the main checkout's git identity in the environment (rehearsal only).
// Usage:   node scripts/in-clone.mjs scratch/clones/<name> <node-script> [args...]     (run from the main checkout root)
// Inputs:  the clone directory (must start with scratch/clones/), the script path (relative to the main checkout), git config user.name/user.email of the main checkout.
// Output:  whatever the script prints; its exit code. Used by scripts/rehearse-held.mjs.
// Data:    none. Read-only itself; the script it runs decides what it writes (inside the clone).
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
const [clone, script, ...rest] = process.argv.slice(2);
if (!clone || !clone.startsWith("scratch/clones/") || !script) { console.error("usage: in-clone.mjs scratch/clones/<name> <script> [args...]"); process.exit(2); }
const cfg = (k) => execFileSync("git", ["config", k], { encoding: "utf8" }).trim();
const env = { ...process.env, GIT_AUTHOR_NAME: cfg("user.name"), GIT_AUTHOR_EMAIL: cfg("user.email"), GIT_COMMITTER_NAME: cfg("user.name"), GIT_COMMITTER_EMAIL: cfg("user.email") };
const r = spawnSync(process.execPath, [resolve(script), ...rest], { cwd: resolve(clone), env, stdio: "inherit" });
process.exit(r.status ?? 1);
