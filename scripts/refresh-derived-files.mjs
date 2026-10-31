// SPDX-License-Identifier: SUL-1.0
// Purpose: refresh every DERIVED file of a checkout in one step instead of three remembered commands: the backlog ledger projections
//          (reconcile-backlog-ledger.mjs --activate), the capability-inventory sourceBaseline (rebaseline-inventory.mjs) and the Reader-input
//          mirrors, manifest and pins (sync-reader-inputs.mjs). D223 slice 4: the step is written to the working tree and NEVER staged or
//          committed; it names the files it changed and the commit instruction, the agent (or the PO) commits them.
// Usage:   node scripts/refresh-derived-files.mjs [<root>] [--check]     (<root> defaults to "."; a clone path such as scratch/clones/<name> works too)
//          Run it AFTER the commit that changed the sources, then commit the named files. --check writes nothing and exits 1 on drift.
// Inputs:  <root>'s git HEAD, docs/product-capability-inventory.json, backlog/, the Reader-input sources.
// Output:  one line per step (current | refreshed | DRIFT | FAILED), then the changed paths and the commit instruction; exit 0 when every
//          derived file is current or was refreshed, 1 when --check found drift, 2 when a step failed.
// Data:    default mode rewrites derived files in <root> (the three scripts above write nothing else). Never runs git add/commit/stash.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log("usage: node scripts/refresh-derived-files.mjs [<root>] [--check]   (refreshes the backlog ledger projections, the inventory sourceBaseline and the Reader inputs; writes the working tree only, never stages or commits; --check writes nothing)");
  process.exit(0);
}
const check = args.includes("--check");
const positional = args.filter((a) => !a.startsWith("--"));
const unknown = args.filter((a) => a.startsWith("--") && a !== "--check");
if (unknown.length > 0 || positional.length > 1) {
  console.error("usage: node scripts/refresh-derived-files.mjs [<root>] [--check]");
  process.exit(2);
}
const root = resolve(positional[0] ?? ".");
const scriptsDir = resolve(root, "scripts");
const run = (file, fileArgs, cwd = root) => spawnSync(process.execPath, [file, ...fileArgs], { cwd, encoding: "utf8", maxBuffer: 1 << 26 });
const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8", maxBuffer: 1 << 26 });

// Content fingerprint of every path git reports as modified or untracked, so a path that was already dirty before the step still counts as changed when its bytes move.
function fingerprint() {
  const status = git("status", "--porcelain=v1", "-z", "--untracked-files=all");
  const map = new Map();
  for (const entry of status.stdout.split("\0")) {
    if (entry.length < 4) continue;
    const path = entry.slice(3);
    const abs = resolve(root, path);
    map.set(path, existsSync(abs) ? createHash("sha256").update(readFileSync(abs)).digest("hex") : "absent");
  }
  return map;
}

const steps = [];
const fail = (name, result) => {
  steps.push({ name, state: "FAILED" });
  console.error(`${name}: FAILED (exit ${result.status})`);
  const text = `${result.stdout}${result.stderr}`.trim();
  if (text) console.error(text.split("\n").slice(-12).join("\n"));
};

const before = fingerprint();

// 1. Backlog ledger projections. Without --activate the script only plans: "nothing to reconcile" means current.
{
  const result = run(resolve(root, "plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs"), check ? [] : ["--activate"]);
  if (result.status !== 0) fail("backlog-ledger", result);
  else if (check) steps.push({ name: "backlog-ledger", state: /nothing to reconcile/u.test(result.stdout) ? "current" : "DRIFT" });
  else steps.push({ name: "backlog-ledger", state: "refreshed" });
}

// 2. Capability inventory sourceBaseline: the baseline must name <root>'s HEAD. rebaseline exits 1 when it is already equal.
{
  const inventory = resolve(root, "docs/product-capability-inventory.json");
  const head = git("rev-parse", "HEAD").stdout.trim();
  const tree = git("rev-parse", "HEAD^{tree}").stdout.trim();
  const text = existsSync(inventory) ? readFileSync(inventory, "utf8") : "";
  const m = /"sourceBaseline": \{\s*"commit": "([0-9a-f]{40})",\s*"tree": "([0-9a-f]{40})"/u.exec(text);
  if (!m) fail("inventory-baseline", { status: 1, stdout: "", stderr: "sourceBaseline block not found" });
  else if (m[1] === head && m[2] === tree) steps.push({ name: "inventory-baseline", state: "current" });
  else if (check) steps.push({ name: "inventory-baseline", state: "DRIFT" });
  else {
    const result = run(resolve(scriptsDir, "rebaseline-inventory.mjs"), [root]);
    if (result.status !== 0) fail("inventory-baseline", result);
    else steps.push({ name: "inventory-baseline", state: "refreshed" });
  }
}

// 3. Reader inputs (mirrors, manifest, pins). --check is the script's own read-only mode.
{
  const result = run(resolve(scriptsDir, "sync-reader-inputs.mjs"), check ? [root, "--check"] : [root]);
  if (check && result.status === 1) steps.push({ name: "reader-inputs", state: "DRIFT" });
  else if (result.status !== 0) fail("reader-inputs", result);
  else if (check) steps.push({ name: "reader-inputs", state: "current" });
  else steps.push({ name: "reader-inputs", state: "refreshed" });
}

const after = fingerprint();
const changed = [...after].filter(([path, hash]) => before.get(path) !== hash).map(([path]) => path).sort();
for (const s of steps) console.log(`${s.name}: ${s.state}`);

if (steps.some((s) => s.state === "FAILED")) process.exit(2);
if (check) {
  const drift = steps.filter((s) => s.state === "DRIFT").map((s) => s.name);
  if (drift.length > 0) { console.log(`DRIFT in ${drift.join(", ")}: run without --check to refresh, then commit the named files.`); process.exit(1); }
  console.log("all derived files are current");
  process.exit(0);
}
if (changed.length === 0) {
  console.log("no derived file changed; nothing to commit");
} else {
  console.log(`changed (${changed.length}), written to the working tree and not staged:`);
  for (const p of changed) console.log(`  ${p}`);
  console.log(`commit instruction: git add ${changed.join(" ")}  then commit them (one chore commit); this script never stages or commits.`);
}
process.exit(0);
