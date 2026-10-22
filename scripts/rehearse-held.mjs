// SPDX-License-Identifier: SUL-1.0
// Purpose: replay the held (unprotected, post-sitting) commits of each build clone into a rehearsal clone in the fixed order, 3-way merging where main moved, and stop at the first conflict.
// Usage:   node scripts/rehearse-held.mjs <scratch/clones/<rehearsal> | .> [--only k1,k5]     (run from the main checkout root)
//          Target "." replays into the main checkout itself (clone heads kept under refs/held/, not as branches).
// Inputs:  the build clones scratch/clones/<name> named in the ORDER table below (per-run data of the 0.7.0 sprint: edit ORDER and
//          its skip SHAs when the held set changes); helpers scripts/import-held.mjs and scripts/in-clone.mjs.
// Output:  "== <name>: <n> commit(s) after <base>" per clone, the import lines of import-held, then "all held commits replayed" or "STOP at <name> (exit <code>)".
// Data:    fetches the clone HEADs into the target as held-<name> branches or refs/held/<name>, commits into the target. NOT read-only toward the target; never writes a build clone.
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const [target, ...rest] = process.argv.slice(2);
const inMain = target === ".";
if (!inMain && !target?.startsWith("scratch/clones/")) { console.error("usage: rehearse-held.mjs <scratch/clones/<rehearsal> | .> [--only a,b]"); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const importHeld = join(here, "import-held.mjs");
const inClone = join(here, "in-clone.mjs");
// In the main checkout (target ".") the helper runs directly (identity is configured there) and the clone heads are kept under refs/held/, not as branches.
const runImport = (...a) => (inMain
  ? spawnSync(process.execPath, [importHeld, ...a], { stdio: "inherit" })
  : spawnSync(process.execPath, [inClone, target, importHeld, ...a], { stdio: "inherit" }));
const only = rest[0] === "--only" ? new Set(rest[1].split(",")) : null;
// order = the protected apply order; skips = commits already imported to main under a different SHA.
const ORDER = [
  ["k1", []], ["k5", []], ["k8", ["846caa5f9"]], ["k6", []], ["k7", []], ["k9", []], ["k10", []], ["k11", []],
  ["k15", []], ["k16", []], ["k20", []], ["k22", []], ["k23", []], ["k25", []], ["k29", []],
  ["k32", []], ["k33", []], ["k34", []], ["k35", ["2d3a8dd65", "a05b11593"]], ["k36", []],
  ["k39", []], ["k37", []], ["k31", []], ["k40", []], ["k41", []], ["k42", []], ["k43", []], ["k46", []], ["k47", []], ["k48", []], ["k49", []],
];
const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
for (const [name, skips] of ORDER) {
  if (only && !only.has(name)) continue;
  const src = resolve("scratch/clones", name);
  const ref = inMain ? `refs/held/${name}` : `held-${name}`;
  git(target, "fetch", "--quiet", src, `HEAD:${ref}`.replace(/^HEAD:held-/u, "HEAD:refs/heads/held-"));
  const base = git(target, "merge-base", "HEAD", ref);
  const count = git(target, "rev-list", "--count", `${base}..${ref}`);
  console.log(`== ${name}: ${count} commit(s) after ${base.slice(0, 9)}${skips.length ? ` (skip ${skips.join(",")})` : ""}`);
  if (count === "0") continue;
  if (name === "k23") {
    // the denial pin of k23 conflicts with k10's two cases; k23's last commit carries the resolved file: take the first commits without it, then the resolved file from the last one.
    const pin = "plugins/pipeline-core/lib/pins/denial-names-a-diagnosis-it-refuses.test.mjs";
    for (const [from, to, extra] of [[base, `${ref}~1`, [`--exclude=${pin}`]], [`${ref}~1`, ref, [`--theirs=${pin}`]]]) {
      const rr = runImport(from, to, ...extra);
      if (rr.status !== 0) { console.log(`STOP at k23 (exit ${rr.status})`); process.exit(rr.status ?? 1); }
    }
    continue;
  }
  const r = runImport(base, ref, ...(skips.length ? ["--skip", ...skips] : []));
  if (r.status !== 0) { console.log(`STOP at ${name} (exit ${r.status})`); process.exit(r.status ?? 1); }
}
console.log("all held commits replayed");
