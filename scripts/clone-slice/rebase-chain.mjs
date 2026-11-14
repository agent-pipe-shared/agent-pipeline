// SPDX-License-Identifier: SUL-1.0
// Purpose: rebuild a held-patch chain on a newer main base when main moved under the chain (typically docs/state.md condensed after the chain's base commit, so a patch fails its context at apply): a shared clone at <main-base>, the old build clone's objects fetched, <old-base>..<old-tip> cherry-picked. Stops at the first conflict.
// Usage:   node scratch/agent-out/rebase-chain.mjs <new-clone> <main-base> <old-clone> <old-base> <old-tip-FULL-sha> [--continue]   (run from the repository root; copy from scripts/clone-slice/ first; <main-base> is the commit BEFORE any export commit)
//          --continue: after a manual conflict resolution (files staged) go on with the cherry-pick sequence. Then export from <new-clone> with scripts/export-held-chain.mjs using <main-base> as the base.
// Data:    writes only <new-clone> (recreated); the repository and the old clone are read-only.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
const [newCloneArg, mainBase, oldCloneArg, oldBase, oldTip, flag] = process.argv.slice(2);
const repo = process.cwd();
const newClone = resolve(newCloneArg);
const oldClone = resolve(oldCloneArg);
const env = { ...process.env, GIT_AUTHOR_NAME: "Chain", GIT_AUTHOR_EMAIL: "chain@example.invalid", GIT_COMMITTER_NAME: "Chain", GIT_COMMITTER_EMAIL: "chain@example.invalid", GIT_EDITOR: "true" };
const git = (args, cwd = newClone) => spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28, env });
const show = (r) => { if (r.stdout.trim()) console.log(r.stdout.trim()); if (r.stderr.trim()) console.log(r.stderr.trim()); };
if (flag !== "--continue") {
  rmSync(newClone, { recursive: true, force: true });
  show(git(["clone", "--shared", "--no-checkout", repo, newClone], repo));
  const co = git(["checkout", "--detach", mainBase]); show(co); if (co.status !== 0) process.exit(1);
  const fetch = git(["fetch", "--no-tags", oldClone, oldTip]); show(fetch); if (fetch.status !== 0) process.exit(1);
  const pick = git(["cherry-pick", "--allow-empty", "--keep-redundant-commits", `${oldBase}..${oldTip}`]);
  show(pick);
  console.log(`cherry-pick exit ${pick.status}`);
  console.log(git(["status", "--short"]).stdout.trim());
  process.exit(pick.status === 0 ? 0 : 3);
}
const cont = git(["cherry-pick", "--continue"]); show(cont);
console.log(`continue exit ${cont.status}`);
console.log(git(["status", "--short"]).stdout.trim());
process.exit(cont.status === 0 ? 0 : 3);
