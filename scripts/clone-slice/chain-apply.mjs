// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool chain-apply.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Scratch: apply the held patches of an order file, one commit each, in a fresh shared clone of the base; stop at the first patch that does not apply.
// usage: node scratch/agent-out/chain-apply.mjs <clone-dir> <order file> [--from <n>]
//   <order file>: one held-patch file name (without .patch) per line, '#' comments allowed.
//   Without --from the clone is created at the candidate 18 base; with --from <n> (1-based) the existing clone continues at line n.
//   Every applied step writes its full diff to scratch/agent-out/chain-out/<name>.patch (the patch in the form that applies at that point of the chain).
//   On a failed plain apply the patch is applied with --reject and the tool exits 3, leaving the .rej files for a manual resolution; resolve, commit with
//   commit-in.mjs "chain: <name> (resolved)", then rerun with --from <n+1>; the resolved diff is saved with save-resolved below.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const BASE = "c9a73fb80d6f587efb5e3cd595a87fa5ae480e03";
const H = "specs/sprint-alfred-epic/evidence/held-patches";
const [cloneArg, orderArg, ...rest] = process.argv.slice(2);
const clone = resolve(cloneArg);
const from = rest[0] === "--from" ? Number(rest[1]) : 1;
const sh = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, GIT_AUTHOR_NAME: "Chain", GIT_AUTHOR_EMAIL: "chain@example.invalid", GIT_COMMITTER_NAME: "Chain", GIT_COMMITTER_EMAIL: "chain@example.invalid" } });
const names = readFileSync(resolve(orderArg), "utf8").split("\n").map((line) => line.replace(/#.*$/u, "").trim()).filter(Boolean);
if (from === 1) {
  rmSync(clone, { recursive: true, force: true });
  sh(["clone", "--shared", "--no-checkout", repo, clone], repo);
  const checkout = sh(["checkout", "--detach", BASE], clone);
  if (checkout.status !== 0) { console.log(checkout.stderr); process.exit(1); }
}
const out = resolve(repo, "scratch/agent-out/chain-out");
mkdirSync(out, { recursive: true });
for (let index = from - 1; index < names.length; index += 1) {
  const name = names[index];
  const rebased = resolve(repo, H, `${name}.rebased.patch`);
  const patch = existsSync(rebased) ? rebased : resolve(repo, H, `${name}.patch`);
  if (!existsSync(patch)) { console.log(`MISSING ${index + 1} ${name}`); process.exit(4); }
  const plain = sh(["apply", patch], clone);
  if (plain.status !== 0) {
    const reject = sh(["apply", "--reject", patch], clone);
    console.log(`FAIL ${index + 1} ${name}\n${plain.stderr.trim()}\n--- with --reject ---\n${reject.stderr.trim().split("\n").slice(-25).join("\n")}`);
    process.exit(3);
  }
  sh(["add", "-A"], clone);
  const commit = sh(["commit", "--no-verify", "-q", "-m", `chain: ${name}`], clone);
  if (commit.status !== 0) { console.log(`COMMIT-FAIL ${name}\n${commit.stderr}`); process.exit(5); }
  writeFileSync(resolve(out, `${name}.patch`), sh(["diff", "--binary", "HEAD~1", "HEAD"], clone).stdout);
  console.log(`ok ${index + 1} ${name}`);
}
console.log(`all ${names.length} applied; HEAD ${sh(["rev-parse", "HEAD"], clone).stdout.trim()}`);
