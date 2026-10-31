// Purpose: pin scripts/refresh-derived-files.mjs (D223 slice 4): one step refreshes the derived files, names exactly the files it changed,
// writes the working tree only (never stages, never commits), --check writes nothing, and a failing step is reported, not swallowed.
// The fixture root holds the REAL rebaseline-inventory.mjs and two small stand-ins for the ledger and Reader-input scripts (those two
// have their own suites); every case works in its own temp directory with a real `git init`.
// Usage:   node --test scripts/refresh-derived-files.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = resolve(import.meta.dirname, "refresh-derived-files.mjs");
const REBASELINE = resolve(import.meta.dirname, "rebaseline-inventory.mjs");
const ZERO = "0".repeat(40);
const inventoryText = (commit, tree) => `{\n  "sourceBaseline": {\n    "commit": "${commit}",\n    "tree": "${tree}"\n  }\n}\n`;

const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" }).trim();

// Ledger stand-in: prints "nothing to reconcile" when backlog/STATUS.md is current, otherwise (with --activate) rewrites it.
const LEDGER_STUB = `import { readFileSync, writeFileSync, existsSync } from "node:fs";
const activate = process.argv.includes("--activate");
const want = "projection v2\\n";
const have = existsSync("backlog/STATUS.md") ? readFileSync("backlog/STATUS.md", "utf8") : "";
if (process.env.FIXTURE_LEDGER_FAIL) { console.error("BLOCKED ledger fixture failure"); process.exit(2); }
if (have === want) { console.log("Backlog ledger already records every item's asserted status; nothing to reconcile."); process.exit(0); }
if (activate) writeFileSync("backlog/STATUS.md", want);
console.log(activate ? "Recorded 1 transition(s) across 1 item(s)." : "Would record 1 transition(s) across 1 item(s).");
`;
// Reader-input stand-in: --check exits 1 on drift, default mode rewrites docs/reader-mirror.txt.
const READER_STUB = `import { readFileSync, writeFileSync, existsSync } from "node:fs";
const want = "mirror v2\\n";
const have = existsSync("docs/reader-mirror.txt") ? readFileSync("docs/reader-mirror.txt", "utf8") : "";
if (process.argv.includes("--check")) { if (have !== want) { console.error("DRIFT (1)"); process.exit(1); } process.exit(0); }
writeFileSync("docs/reader-mirror.txt", want);
`;

function mkFixture() {
  const root = mkdtempSync(join(tmpdir(), "rdf-root-"));
  execFileSync("git", ["init", "-q", root]);
  git(root, "config", "user.name", "fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  for (const d of ["scripts", "docs", "backlog", "plugins/pipeline-core/scripts"]) mkdirSync(join(root, d), { recursive: true });
  copyFileSync(REBASELINE, join(root, "scripts", "rebaseline-inventory.mjs"));
  writeFileSync(join(root, "scripts", "sync-reader-inputs.mjs"), READER_STUB);
  writeFileSync(join(root, "plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs"), LEDGER_STUB);
  writeFileSync(join(root, "docs/product-capability-inventory.json"), inventoryText(ZERO, ZERO));
  writeFileSync(join(root, "docs/reader-mirror.txt"), "mirror v1\n");
  writeFileSync(join(root, "backlog/STATUS.md"), "projection v1\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}
const run = (root, ...extra) => spawnSync(process.execPath, [SCRIPT, root, ...extra], { encoding: "utf8" });
const stagedAndCommits = (root) => ({ staged: git(root, "diff", "--cached", "--name-only"), head: git(root, "rev-parse", "HEAD"), stash: git(root, "stash", "list") });

test("RDF01 the step refreshes all three derived files, names exactly those paths, and stages and commits nothing", () => {
  const root = mkFixture();
  const before = stagedAndCommits(root);
  const r = run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^backlog-ledger: refreshed$/mu);
  assert.match(r.stdout, /^inventory-baseline: refreshed$/mu);
  assert.match(r.stdout, /^reader-inputs: refreshed$/mu);
  assert.match(r.stdout, /changed \(3\)/u);
  for (const p of ["backlog/STATUS.md", "docs/product-capability-inventory.json", "docs/reader-mirror.txt"]) assert.match(r.stdout, new RegExp(`^  ${p.replace(/[./]/g, "\\$&")}$`, "mu"));
  assert.match(r.stdout, /commit instruction: git add backlog\/STATUS\.md docs\/product-capability-inventory\.json docs\/reader-mirror\.txt /u);
  assert.equal(readFileSync(join(root, "backlog/STATUS.md"), "utf8"), "projection v2\n");
  assert.equal(readFileSync(join(root, "docs/reader-mirror.txt"), "utf8"), "mirror v2\n");
  assert.match(readFileSync(join(root, "docs/product-capability-inventory.json"), "utf8"), new RegExp(git(root, "rev-parse", "HEAD")));
  assert.deepEqual(stagedAndCommits(root), before, "nothing staged, HEAD unchanged, no stash");
});

test("RDF02 a second run finds everything current and reports nothing to commit", () => {
  const root = mkFixture();
  assert.equal(run(root).status, 0);
  const r = run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^backlog-ledger: refreshed$/mu, "the ledger step always runs with --activate; its own no-op writes nothing");
  assert.match(r.stdout, /^inventory-baseline: current$/mu);
  assert.match(r.stdout, /no derived file changed; nothing to commit/u);
});

test("RDF03 --check on drift writes nothing, names the drifting steps and exits 1", () => {
  const root = mkFixture();
  const snapshot = ["backlog/STATUS.md", "docs/product-capability-inventory.json", "docs/reader-mirror.txt"].map((p) => readFileSync(join(root, p), "utf8"));
  const r = run(root, "--check");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^backlog-ledger: DRIFT$/mu);
  assert.match(r.stdout, /^inventory-baseline: DRIFT$/mu);
  assert.match(r.stdout, /^reader-inputs: DRIFT$/mu);
  assert.match(r.stdout, /DRIFT in backlog-ledger, inventory-baseline, reader-inputs/u);
  assert.deepEqual(["backlog/STATUS.md", "docs/product-capability-inventory.json", "docs/reader-mirror.txt"].map((p) => readFileSync(join(root, p), "utf8")), snapshot);
  assert.equal(git(root, "status", "--porcelain"), "");
});

test("RDF04 --check after a refresh reports every derived file current and exits 0", () => {
  const root = mkFixture();
  assert.equal(run(root).status, 0);
  const r = run(root, "--check");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /all derived files are current/u);
});

test("RDF05 a failing step is reported FAILED with exit 2, the other steps still run, and nothing is staged", () => {
  const root = mkFixture();
  const before = stagedAndCommits(root);
  const r = spawnSync(process.execPath, [SCRIPT, root], { encoding: "utf8", env: { ...process.env, FIXTURE_LEDGER_FAIL: "1" } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^backlog-ledger: FAILED$/mu);
  assert.match(r.stdout, /^reader-inputs: refreshed$/mu);
  assert.match(r.stderr, /BLOCKED ledger fixture failure/u);
  assert.deepEqual(stagedAndCommits(root), before);
});

test("RDF06 a path that was already dirty before the step counts as changed when its bytes move, and an untouched dirty path does not", () => {
  const root = mkFixture();
  writeFileSync(join(root, "docs/reader-mirror.txt"), "mirror v0 dirty\n");
  writeFileSync(join(root, "docs/unrelated-note.txt"), "keep me\n");
  const r = run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^  docs\/reader-mirror\.txt$/mu);
  assert.doesNotMatch(r.stdout, /unrelated-note/u);
});

test("RDF07 an unknown flag or a second positional is refused with exit 2 and writes nothing", () => {
  const root = mkFixture();
  for (const bad of [["--activate"], [root]]) {
    const r = spawnSync(process.execPath, [SCRIPT, root, ...bad], { encoding: "utf8" });
    assert.equal(r.status, 2, bad.join(" "));
    assert.match(r.stderr, /usage:/u);
  }
  assert.equal(git(root, "status", "--porcelain"), "");
});

test("RDF08 the script source never runs git add, commit or stash", () => {
  const source = readFileSync(SCRIPT, "utf8");
  assert.doesNotMatch(source, /git\(\s*["'](add|commit|stash|reset|checkout)["']/u);
  assert.doesNotMatch(source, /["']git["']\s*,\s*\[\s*["'](add|commit|stash|reset|checkout)["']/u);
});
