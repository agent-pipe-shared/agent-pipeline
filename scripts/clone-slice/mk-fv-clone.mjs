// SPDX-License-Identifier: SUL-1.0
// Purpose: create the clone a Full Verify runs in: a plain local clone of the repository OUTSIDE it (a clone under the verified repository's own scratch/ turned two steps red without a product defect), detached at the candidate commit, with a working `upstream` remote (the security step looks for one); then hand it to scripts/full-verify.mjs.
// Usage:   node scratch/agent-out/mk-fv-clone.mjs <new-clone-dir-outside-the-repo> [<rev>]   (run from the repository root; copy from scripts/clone-slice/ first; <rev> defaults to HEAD, which must be committed and the tree clean)
// Data:    recreates <new-clone-dir> (removed first); the repository is read-only.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
const repo = process.cwd();
const [dstArg, rev = "HEAD"] = process.argv.slice(2);
if (!dstArg) { console.error("usage: mk-fv-clone.mjs <new-clone-dir-outside-the-repo> [<rev>]"); process.exit(2); }
const dst = resolve(dstArg);
const rel = relative(repo, dst);
if (rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep))) { console.error(`REFUSED: ${dst} is inside the repository; a Full Verify clone lives outside it`); process.exit(2); }
const git = (args, cwd) => { const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 }); if (r.status !== 0) { console.error(`git ${args.join(" ")}\n${r.stderr}`); process.exit(1); } return r.stdout.trim(); };
if (git(["status", "--porcelain"], repo) !== "") { console.error("REFUSED: the repository tree is not clean"); process.exit(2); }
const sha = git(["rev-parse", rev], repo);
rmSync(dst, { recursive: true, force: true });
git(["clone", "--no-checkout", repo, dst], repo);
git(["checkout", "--detach", sha], dst);
git(["remote", "add", "upstream", repo], dst);
console.log(`full verify clone at ${sha} -> ${dst}`);
