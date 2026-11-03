// Purpose: the pre-stamp case-completion check of a candidate (candidate 19, A2). The Full Verify rejects a suite that declares case ids its policy does not
// list (VERIFY-CASE-COMPLETION-DECLARATION), but a suite run alone never notices, so a candidate that grows a suite fails only in the one-hour run (candidate 18: 11 suites).
// This tool finds the test files changed between a base and the clone's HEAD, maps each to its Verify suite, and runs `run-cc.mjs` for each, one at a time.
// Test files that no suite registers are listed as UNREGISTERED (they need a Verify registration, a registry row and a policy before the Full Verify).
// Usage: node scripts/clone-slice/cc-changed.mjs <clone-dir> <base-ref> [--only <suite>,<suite>...]
//        (run-cc.mjs must sit next to this file; in a scratch copy of the route both are in scratch/agent-out/)
// Output: one line per suite from run-cc ("<suite>: exit n; policy ...; accepted|REJECTED ...; unregistered: ...; missing: ..."), then a summary; exit 1 if any suite is REJECTED
//         or any changed test file is unregistered. Writes only <clone>/scratch/cc-<suite>.out (via run-cc).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const onlyAt = args.indexOf("--only");
const only = onlyAt >= 0 ? new Set(String(args[onlyAt + 1]).split(",")) : null;
const [cloneArg, baseRef] = args.filter((arg, index) => arg !== "--only" && (onlyAt < 0 || index !== onlyAt + 1));
if (!cloneArg || !baseRef) {
  console.error("usage: node scripts/clone-slice/cc-changed.mjs <clone-dir> <base-ref> [--only <suite>,...]");
  process.exit(2);
}
const clone = resolve(cloneArg);
const here = dirname(fileURLToPath(import.meta.url));

const diff = spawnSync("git", ["-C", clone, "diff", "--name-only", "--diff-filter=AM", `${baseRef}..HEAD`], { encoding: "utf8" });
if (diff.status !== 0) { console.error(diff.stderr); process.exit(2); }
const changed = diff.stdout.split("\n").filter((file) => /\.test\.mjs$/u.test(file) && !file.startsWith("specs/"));

// name -> file, the same two sources rerun-reds.mjs reads: harness/verify-suites.json and the literal registrations in harness/scripts/verify.mjs.
const registry = JSON.parse(readFileSync(join(clone, "harness/verify-suites.json"), "utf8"));
const fileOf = new Map((registry.suites ?? []).map((suite) => [suite.name, suite.file]));
const BASES = { repoRoot: "", scriptDir: "harness/scripts", libDir: "plugins/pipeline-core/lib", hooksDir: "plugins/pipeline-core/hooks", pluginScriptsDir: "plugins/pipeline-core/scripts" };
const source = readFileSync(join(clone, "harness/scripts/verify.mjs"), "utf8");
for (const m of source.matchAll(/name:\s*"([^"]+)"\s*,\s*file:\s*join\((\w+)((?:\s*,\s*"[^"]+")+)\s*\)/gu)) {
  if (!(m[2] in BASES) || fileOf.has(m[1])) continue;
  fileOf.set(m[1], [BASES[m[2]], ...[...m[3].matchAll(/"([^"]+)"/gu)].map((s) => s[1])].filter(Boolean).join("/"));
}
for (const m of source.matchAll(/name:\s*"([^"]+)"\s*,\s*file:\s*"([^"]+)"/gu)) if (!fileOf.has(m[1])) fileOf.set(m[1], m[2]);

const suitesOf = new Map();
for (const [name, file] of fileOf) suitesOf.set(file, [...(suitesOf.get(file) ?? []), name]);
let rejected = 0;
const unregistered = [];
for (const file of changed) {
  const names = suitesOf.get(file);
  if (!names) { unregistered.push(file); console.log(`UNREGISTERED ${file}`); continue; }
  for (const name of names) {
    if (only && !only.has(name)) continue;
    const run = spawnSync(process.execPath, [join(here, "run-cc.mjs"), clone, name, file], { encoding: "utf8", maxBuffer: 1 << 26 });
    const line = (run.stdout || run.stderr).trim().split("\n").pop();
    console.log(line);
    if (/REJECTED/u.test(line) || run.status !== 0) rejected += 1;
  }
}
console.log(`changed test files ${changed.length}; rejected or failed suites ${rejected}; unregistered files ${unregistered.length}`);
process.exit(rejected > 0 || unregistered.length > 0 ? 1 : 0);
