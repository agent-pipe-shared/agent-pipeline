#!/usr/bin/env node
import { readFileSync } from "node:fs";
const results = JSON.parse(readFileSync(process.argv[2], "utf8"));
const effect = (r) => {
  const e = [];
  if (r.exit === 2) e.push("BLOCK");
  else if (r.exit !== 0) e.push(`exit${r.exit}`);
  const out = r.stdout;
  if (out && out !== "{}") {
    if (/"decision"\s*:\s*"(deny|block)"|permissionDecision"\s*:\s*"deny"/.test(out)) e.push("DENY-JSON");
    else if (/additionalContext|systemMessage|injectSteps|ephemeralMessage/.test(out)) e.push("INJECT");
    else e.push("STDOUT");
  }
  if (r.stderr && r.exit === 0) e.push("STDERR");
  if (r.files.length) e.push("FILES");
  return e.join("+");
};
const rows = results.map((r) => ({ ...r, effect: effect(r) })).filter((r) => r.effect !== "");
const byKey = new Map();
for (const r of rows) {
  const k = `${r.runner} | ${r.hook.replace(/"$/, "")} | ${r.effect}`;
  if (!byKey.has(k)) byKey.set(k, { cases: new Set(), fixtures: new Set(), files: new Set(), sample: r });
  const v = byKey.get(k); v.cases.add(`${r.event}:${r.case}`); v.fixtures.add(r.fixture); r.files.forEach((f) => v.files.add(f));
}
for (const [k, v] of [...byKey].sort()) {
  console.log(`\n${k}  [${[...v.fixtures].join(",")}]`);
  console.log(`  cases: ${[...v.cases].join(" ; ")}`);
  if (v.files.size) console.log(`  files: ${[...v.files].join(" ; ")}`);
  const msg = (v.sample.stderr || v.sample.stdout).replaceAll("\n", " ").slice(0, 300);
  if (msg) console.log(`  sample: ${msg}`);
}
