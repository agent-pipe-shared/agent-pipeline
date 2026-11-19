// SPDX-License-Identifier: SUL-1.0
// Size and coupling picture of the plugin (non-test .mjs files): lines per top folder, share held by files over 1000 lines, fan-in of the biggest files, directory-level cycles. Read-only; reusable measuring tool of candidate 32 (docs/operating-tools.md).
// usage: node scripts/arch-measure-size.mjs <root>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 }).toString().split("\0").filter((f) => /\.mjs$/.test(f) && /^(plugins|harness|scripts)\//.test(f));
const isTest = (f) => /\.test\.mjs$/.test(f) || /(^|\/)(tests?|__tests__)\//.test(f);
const lines = new Map();
for (const f of files) { try { lines.set(f, readFileSync(join(root, f), "utf8").split("\n").length); } catch { /* skip */ } }
const src = files.filter((f) => !isTest(f) && lines.has(f));
const tst = files.filter((f) => isTest(f) && lines.has(f));
const bucket = (f) => f.startsWith("plugins/") ? f.split("/").slice(0, 3).join("/") : f.split("/").slice(0, 2).join("/");
const agg = new Map();
for (const f of src) { const k = bucket(f); const r = agg.get(k) ?? { files: 0, lines: 0, big: 0, bigLines: 0 }; r.files++; r.lines += lines.get(f); if (lines.get(f) > 1000) { r.big++; r.bigLines += lines.get(f); } agg.set(k, r); }
console.log("non-test mjs files", src.length, "lines", src.reduce((a, f) => a + lines.get(f), 0), "| test files", tst.length, "lines", tst.reduce((a, f) => a + lines.get(f), 0));
for (const [k, r] of [...agg].sort((a, b) => b[1].lines - a[1].lines).slice(0, 12)) console.log(" ", k.padEnd(42), "files", String(r.files).padStart(4), "lines", String(r.lines).padStart(7), "| over 1000:", r.big, "files holding", r.bigLines, "lines");
const over = src.filter((f) => lines.get(f) > 1000);
console.log("source files over 1000 lines:", over.length, "= lines", over.reduce((a, f) => a + lines.get(f), 0), "; over 2000:", src.filter((f) => lines.get(f) > 2000).length, "; over 5000:", src.filter((f) => lines.get(f) > 5000).length);
const testsOver = tst.filter((f) => lines.get(f) > 1000);
console.log("test files over 1000 lines:", testsOver.length);
// import graph (relative static imports only)
const spec = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
const fanIn = new Map(), edges = new Map();
for (const f of src) {
  const text = readFileSync(join(root, f), "utf8");
  for (const m of text.matchAll(spec)) {
    const target = normalize(join(dirname(f), m[1] ?? m[2]));
    if (!lines.has(target) || isTest(target)) continue;
    fanIn.set(target, (fanIn.get(target) ?? 0) + 1);
    const a = dirname(f), b = dirname(target);
    if (a !== b) { if (!edges.has(a)) edges.set(a, new Set()); edges.get(a).add(b); }
  }
}
console.log("biggest files by fan-in (importers):");
for (const [f, n] of [...fanIn].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(" ", String(n).padStart(4), String(lines.get(f)).padStart(6), f);
const bigIn = [...fanIn].filter(([f]) => lines.get(f) > 1000).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log("oversized files with highest fan-in:");
for (const [f, n] of bigIn) console.log(" ", String(n).padStart(4), String(lines.get(f)).padStart(6), f);
const dirs = [...edges.keys()];
const mutual = [];
for (const a of dirs) for (const b of edges.get(a)) if (a < b && edges.get(b)?.has(a)) mutual.push(`${a} <-> ${b}`);
console.log("folder pairs importing each other:", mutual.length); for (const m of mutual.slice(0, 12)) console.log(" ", m);
