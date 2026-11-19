// SPDX-License-Identifier: SUL-1.0
// Summarise the architecture boundary check of a tree (counts per rule, the largest over-bound files, the module picture). Read-only; reusable measuring tool of candidate 32 (docs/operating-tools.md).
// usage: node scripts/arch-measure-summary.mjs <root>
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const { checkArchitectureBoundaries, measureArchitecture } = await import(pathToFileURL(join(root, "plugins/pipeline-core/scripts/architecture-boundary-check.mjs")).href);
const result = checkArchitectureBoundaries({ rootDir: root });
console.log("status", result.status, "counts", JSON.stringify(result.counts));
const byRule = new Map();
for (const v of result.violations) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
console.log("violations by rule", JSON.stringify([...byRule]));
const over = result.violations.filter((v) => v.rule === "over-line-bound").sort((a, b) => b.lines - a.lines);
console.log("over-line-bound (not excepted):", over.length);
for (const v of over.slice(0, 40)) console.log(" ", v.lines, v.file);
for (const v of result.violations.filter((v) => v.rule !== "over-line-bound").slice(0, 30)) console.log(" ", v.rule, v.file, v.target ?? "");
let measured;
try { measured = measureArchitecture({ rootDir: root }); } catch (error) { console.log("measure failed", String(error.message).slice(0, 200)); }
if (measured?.measurement) for (const m of measured.measurement.modules) console.log("module", m.id, "files", m.measuredFiles ?? m.files, "lines", m.measuredLines ?? m.lines, "deps", JSON.stringify(m.measuredDependencies));
