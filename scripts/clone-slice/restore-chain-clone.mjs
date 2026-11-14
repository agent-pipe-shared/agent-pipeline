// SPDX-License-Identifier: SUL-1.0
// Purpose: bundle a build clone's commit chain <base>..HEAD into one git bundle (exact commit ids kept), or restore such a bundle into a
//          fresh shared clone of the main repository detached at the chain tip, so another machine continues the same build clone.
// Usage:   node scripts/clone-slice/restore-chain-clone.mjs bundle  <clone-dir> <base-commit> <bundle-file>
//          node scripts/clone-slice/restore-chain-clone.mjs restore <new-clone-dir> <base-commit> <bundle-file>   (run from the main checkout root)
// Output:  one line naming the bundled range, or the restored clone's HEAD (it must equal the chain tip recorded in the handover README).
// Data:    bundle writes only <bundle-file>; restore removes and recreates <new-clone-dir> (a scratch path) and never writes the main checkout.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const [mode, dir, base, bundle] = process.argv.slice(2);
if (!["bundle", "restore"].includes(mode) || !dir || !base || !bundle) {
  console.error("usage: restore-chain-clone.mjs bundle|restore <clone-dir> <base-commit> <bundle-file>");
  process.exit(2);
}
const git = (args, cwd) => {
  const run = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  if (run.status !== 0) { console.error(`git ${args.join(" ")}`, run.stdout, run.stderr); process.exit(1); }
  return run.stdout.trim();
};
if (mode === "bundle") {
  const clone = resolve(dir);
  git(["branch", "-f", "chain-tip", "HEAD"], clone);
  git(["bundle", "create", resolve(bundle), `${base}..chain-tip`], clone);
  console.log(`bundled ${base}..${git(["rev-parse", "HEAD"], clone)} -> ${bundle}`);
} else {
  const repo = resolve(".");
  const clone = resolve(dir);
  if (!clone.startsWith(`${repo}/scratch/`)) { console.error("restore target must be under scratch/"); process.exit(2); }
  rmSync(clone, { recursive: true, force: true });
  git(["clone", "--shared", "--no-checkout", repo, clone], repo);
  git(["cat-file", "-e", `${base}^{commit}`], clone);
  git(["bundle", "verify", resolve(bundle)], clone);
  git(["fetch", "--quiet", resolve(bundle), "chain-tip:refs/heads/chain-tip"], clone);
  git(["checkout", "--quiet", "--detach", "chain-tip"], clone);
  console.log(`restored ${clone} at ${git(["rev-parse", "HEAD"], clone)}`);
}
