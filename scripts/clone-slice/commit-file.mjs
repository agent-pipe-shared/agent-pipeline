// SPDX-License-Identifier: SUL-1.0
// Purpose: commit named paths in a scratch build clone with a throwaway identity; the message comes from a file (GIT-03 trailers belong in it).
// Usage:   node scratch/agent-out/commit-file.mjs <clone-dir> <absolute message-file> <path>...   (copy from scripts/clone-slice/ first, see docs/operating-tools.md "Clone-slice route")
// Data:    stages and commits inside the clone only.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const clone = resolve(process.argv[2]);
const [message, ...paths] = process.argv.slice(3);
if (!message || paths.length === 0) { console.error("usage: commit-file.mjs <clone> <message-file> <path>..."); process.exit(2); }
const git = (args) => {
  const run = spawnSync("git", ["-c", "user.name=Stack", "-c", "user.email=stack@example.invalid", ...args], { cwd: clone, encoding: "utf8", maxBuffer: 1 << 28 });
  if (run.status !== 0) { console.error(args.join(" "), run.stdout, run.stderr); process.exit(1); }
  return run.stdout.trim();
};
git(["add", "--", ...paths]);
git(["commit", "-q", "-F", message, "--", ...paths]);
console.log("HEAD", git(["rev-parse", "HEAD"]));
