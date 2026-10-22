// SPDX-License-Identifier: SUL-1.0
// Purpose: set sourceBaseline.commit/tree of the capability inventory to the HEAD of <root> (the committed state that already holds every surface the inventory lists).
// Usage:   node scripts/rebaseline-inventory.mjs [<root>]     (<root> defaults to "."; a clone path such as scratch/clones/<name> works too)
//          Run it AFTER the registration commit, then commit the inventory (a PROTECTED file: the operator commits it).
// Inputs:  <root>/docs/product-capability-inventory.json and <root>'s git HEAD commit and tree.
// Output:  "sourceBaseline -> <commit> / <tree>"; exit 1 when the baseline block is not found or already equals HEAD.
// Data:    rewrites only the sourceBaseline block of that one file. NOT read-only.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
if (["-h", "--help"].includes(process.argv[2])) { console.log("usage: node scripts/rebaseline-inventory.mjs [<root>]   (default root \".\"; rewrites sourceBaseline of <root>/docs/product-capability-inventory.json to <root>'s HEAD)"); process.exit(0); }
const root = process.argv[2] ?? ".";
const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const tree = git("rev-parse", "HEAD^{tree}");
const file = `${root}/docs/product-capability-inventory.json`;
const text = readFileSync(file, "utf8");
const next = text.replace(/("sourceBaseline": \{\s*"commit": ")[0-9a-f]{40}(",\s*"tree": ")[0-9a-f]{40}(")/u, `$1${commit}$2${tree}$3`);
if (next === text) { console.error("sourceBaseline unchanged or not found"); process.exit(1); }
writeFileSync(file, next);
console.log(`sourceBaseline -> ${commit} / ${tree}`);
