// SPDX-License-Identifier: SUL-1.0
// Purpose: the pre-export affected-test list of a build clone: live test files that import or name (by script basename) a module changed since <base>, plus the changed tests.
// Usage:   node scratch/agent-out/c29/direct-importers.mjs <clone> <base> [--count-by-module | --merge <extra-list> <out-list>]   (copy from scripts/clone-slice/ first; feed <out-list> to run-list.mjs)
// Data:    read-only toward the clone; --merge writes <out-list>.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const [clone, base, flag] = process.argv.slice(2);
const git = (...a) => execFileSync("git", ["-C", clone, ...a], { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const changed = git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
const modules = changed.filter((p) => /\.mjs$/u.test(p) && !/\.test\.mjs$/u.test(p) && !/\.fixture\.mjs$/u.test(p));
const changedTests = changed.filter((p) => /\.test\.mjs$/u.test(p));
// Live suites only: archived test copies under specs/, docs/ or backlog/ are evidence, not suites.
const tests = git("ls-files", "*.test.mjs").split("\n").filter((p) => p && /^(plugins|harness|scripts)\//u.test(p));
const hit = new Set(changedTests);
const byModule = new Map(modules.map((m) => [m, 0]));
for (const t of tests) {
  let text;
  try { text = readFileSync(join(clone, t), "utf8"); } catch { continue; }
  for (const m of modules) {
    const name = basename(m);
    if (text.includes(`/${name}`) || text.includes(`"${name}"`) || text.includes(`'${name}'`)) { hit.add(t); byModule.set(m, byModule.get(m) + 1); }
  }
}
if (flag === "--count-by-module") for (const [m, n] of [...byModule].sort((a, b) => b[1] - a[1])) console.log(n, m);
else if (flag === "--merge") {
  // --merge <extra-list> <out>: union with an extra list (comment lines skipped), only files present in the clone.
  const [extra, out] = process.argv.slice(5);
  for (const line of readFileSync(extra, "utf8").split("\n")) { const p = line.trim(); if (p && !p.startsWith("#")) hit.add(p); }
  const present = [...hit].filter((p) => tests.includes(p)).sort();
  const absent = [...hit].filter((p) => !tests.includes(p));
  writeFileSync(out, `${present.join("\n")}\n`);
  console.log(`written ${present.length}; not tracked in the clone: ${absent.length} ${absent.slice(0, 10).join(" ")}`);
} else for (const t of [...hit].sort()) console.log(t);
