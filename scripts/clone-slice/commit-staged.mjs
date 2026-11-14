// SPDX-License-Identifier: SUL-1.0
// Purpose: commit whatever is already staged in a scratch build clone with a throwaway identity (for test paths a guard will not let appear in argv: `git -C <clone> add -- <paths>` first).
// Usage:   node scratch/agent-out/commit-staged.mjs <clone-dir> <absolute message-file>   (copy from scripts/clone-slice/ first)
// Data:    commits inside the clone only; prints the staged names.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const clone = resolve(process.argv[2]);
const message = process.argv[3];
if (!message) { console.error("usage: commit-staged.mjs <clone> <message-file>"); process.exit(2); }
const git = (args) => {
  const run = spawnSync("git", ["-c", "user.name=Stack", "-c", "user.email=stack@example.invalid", ...args], { cwd: clone, encoding: "utf8", maxBuffer: 1 << 28 });
  if (run.status !== 0) { console.error(args.join(" "), run.stdout, run.stderr); process.exit(1); }
  return run.stdout.trim();
};
console.log(git(["diff", "--cached", "--name-only"]));
git(["commit", "-q", "-F", message]);
console.log("HEAD", git(["rev-parse", "HEAD"]));
