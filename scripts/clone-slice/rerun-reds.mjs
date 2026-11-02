// SPDX-License-Identifier: SUL-1.0
// Tracked source of the clone-slice route tool rerun-reds.mjs (docs/operating-tools.md, section "Clone-slice route"). The route runs these from scratch/agent-out/
// (the Goldfish shell guard admits that path): on a fresh machine copy scripts/clone-slice/*.mjs there first. Paths below that say scratch/agent-out are intended.
// Scratch: re-run the red suites of a verify run record ONE AT A TIME in a clone, with the same private HOME and short TMPDIR as scripts/full-verify.mjs.
// usage: node scratch/agent-out/rerun-reds.mjs <clone-dir> <run record json> <label> [--skip <name>,<name>...]
// Writes <clone>/scratch/<label>-rerun.json ({name, file, exit, seconds}[]) and prints one line per suite plus a summary. Suites without a test file (checks) are listed as "no-file".
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";

const [cloneArg, recordArg, label, skipFlag, skipList] = process.argv.slice(2);
const clone = resolve(cloneArg);
const skip = new Set(skipFlag === "--skip" ? String(skipList).split(",") : []);
const record = JSON.parse(readFileSync(resolve(recordArg), "utf8"));
const registry = JSON.parse(readFileSync(join(clone, "harness/verify-suites.json"), "utf8"));
const fileOf = new Map((registry.suites ?? []).map((s) => [s.name, s.file]));
// The literal registrations of harness/scripts/verify.mjs: { name: "x", file: join(<baseVar>, "a", "b.test.mjs") } or { name: "x", file: "path" }.
const BASES = { repoRoot: "", scriptDir: "harness/scripts", libDir: "plugins/pipeline-core/lib", hooksDir: "plugins/pipeline-core/hooks", pluginScriptsDir: "plugins/pipeline-core/scripts" };
const verifySource = readFileSync(join(clone, "harness/scripts/verify.mjs"), "utf8");
for (const m of verifySource.matchAll(/name:\s*"([^"]+)"\s*,\s*file:\s*join\((\w+)((?:\s*,\s*"[^"]+")+)\s*\)/gu)) {
  if (!(m[2] in BASES) || fileOf.has(m[1])) continue;
  const segments = [...m[3].matchAll(/"([^"]+)"/gu)].map((s) => s[1]);
  fileOf.set(m[1], [BASES[m[2]], ...segments].filter(Boolean).join("/"));
}
for (const m of verifySource.matchAll(/name:\s*"([^"]+)"\s*,\s*file:\s*"([^"]+)"/gu)) if (!fileOf.has(m[1])) fileOf.set(m[1], m[2]);
const red = record.steps.filter((s) => s.exitCode !== 0).map((s) => s.name).filter((n) => !skip.has(n));
const base = join(homedir(), ".fv", label);
const home = join(base, "h");
const tmp = join(base, "t");
rmSync(base, { recursive: true, force: true });
for (const dir of [base, home, tmp]) { mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700); }
const gitConfig = join(home, ".gitconfig");
const cfg = (key) => spawnSync("git", ["config", key], { encoding: "utf8" }).stdout.trim();
writeFileSync(gitConfig, `[user]\n\tname = ${cfg("user.name")}\n\temail = ${cfg("user.email")}\n[init]\n\tdefaultBranch = main\n`);
const nodeBinary = realpathSync(process.execPath);
const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, GIT_CONFIG_GLOBAL: gitConfig, PATH: `${dirname(nodeBinary)}${delimiter}${process.env.PATH ?? ""}` };
delete env.NODE_TEST_CONTEXT;
const results = [];
for (const name of red) {
  const file = fileOf.get(name);
  if (!file) { results.push({ name, file: null, exit: null, seconds: 0 }); console.log(`no-file ${name}`); continue; }
  const started = Date.now();
  const r = spawnSync(nodeBinary, ["--test", file], { cwd: clone, encoding: "utf8", maxBuffer: 1 << 28, env, timeout: 900_000 });
  const seconds = Math.round((Date.now() - started) / 1000);
  results.push({ name, file, exit: r.status, seconds });
  console.log(`${r.status === 0 ? "green" : "RED  "} ${seconds}s ${name}`);
}
writeFileSync(join(clone, "scratch", `${label}-rerun.json`), `${JSON.stringify(results, null, 2)}\n`);
const stillRed = results.filter((r) => r.exit !== 0 && r.file !== null);
console.log(`rerun ${results.length}: green ${results.filter((r) => r.exit === 0).length}, still red ${stillRed.length}, no test file ${results.filter((r) => r.file === null).length}`);
for (const r of stillRed) console.log(`  still red: ${r.name} (${r.file})`);
