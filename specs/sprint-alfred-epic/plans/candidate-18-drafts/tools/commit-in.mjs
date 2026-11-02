// Scratch: commit everything in a scratch clone with a fixed throwaway identity, optionally running the rebaseline + sync pair first.
// Usage: node scratch/agent-out/commit-in.mjs <clone-dir> "<message>" [--rebaseline]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const [clone, message, flag] = [resolve(process.argv[2]), process.argv[3], process.argv[4]];
const repo = resolve(import.meta.dirname, "../..");
const run = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 }); if (r.status !== 0) { console.error(cmd, args.join(" "), r.stdout, r.stderr); process.exit(1); } return r.stdout.trim(); };
const git = (args) => run("git", ["-c", "user.name=Stack", "-c", "user.email=stack@example.invalid", ...args], clone);
git(["add", "-A"]);
git(["commit", "-qm", message]);
if (flag === "--rebaseline") {
  console.log(run("node", [resolve(repo, "scripts/rebaseline-inventory.mjs"), clone], repo));
  console.log(run("node", [resolve(repo, "scripts/sync-reader-inputs.mjs"), clone], repo));
  git(["add", "-A"]);
  git(["commit", "-qm", "chore(inventory): rebaseline the inventory and sync the Reader inputs"]);
}
console.log("HEAD", git(["rev-parse", "HEAD"]));
