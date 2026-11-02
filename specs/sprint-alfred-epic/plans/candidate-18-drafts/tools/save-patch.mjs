// Scratch: write `git diff --binary <base> <rev>` of a clone into a file, then prove it applies to the repository HEAD (git apply --check).
// Usage: node scratch/agent-out/save-patch.mjs <clone-dir> <base> <rev> <out-file> [<check-root>]
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const [clone, base, rev, out, checkRoot] = process.argv.slice(2);
const diff = spawnSync("git", ["diff", "--binary", base, rev], { cwd: resolve(clone), encoding: "utf8", maxBuffer: 1 << 28 });
if (diff.status !== 0) { console.error(diff.stderr); process.exit(1); }
writeFileSync(resolve(out), diff.stdout);
const root = resolve(checkRoot ?? resolve(import.meta.dirname, "../.."));
const check = spawnSync("git", ["apply", "--check", resolve(out)], { cwd: root, encoding: "utf8" });
console.log(`wrote ${out} (${diff.stdout.length} bytes); apply --check on ${checkRoot ?? "repo"}: exit ${check.status} ${check.stderr.trim()}`);
