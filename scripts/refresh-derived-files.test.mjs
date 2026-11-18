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

// ---- Case-completion augmentation rows (candidate 30k, K1-01 stage 4) ------------------------------------------------
// The fixture root carries the REAL checker, augmentation module, receipt helper and completion helper (the refresh runs <root>'s own
// scripts), a minimal verify.mjs and a declarative suite list. Suites are real registerTestCaseCompletion files, so the ids a suite
// DECLARES come from a real descriptor 3 stream, exactly as the Full Verify reads them.
const REPO = resolve(import.meta.dirname, "..");
const { verifyCaseCompletionPolicySha256: sha } = await import(new URL("../plugins/pipeline-core/lib/verify-case-completion-receipt.mjs", import.meta.url).href);
const { applyVerifyCaseCompletionAugmentations } = await import(new URL("../harness/scripts/verify-case-completion-augmentation.mjs", import.meta.url).href);
const CC_FILES = [
  "harness/scripts/check-verify-case-completion.mjs", "harness/scripts/check-verify-suite-registration.mjs", "harness/scripts/verify-case-completion-augmentation.mjs",
  "plugins/pipeline-core/lib/schema-lite.mjs", "plugins/pipeline-core/lib/verify-case-completion-receipt.mjs", "plugins/pipeline-core/lib/governance-event.mjs",
  "plugins/pipeline-core/lib/test-case-completion.mjs",
];
const AUG = "harness/config/verify-case-completion-augmentations.v1.json";
const policyOf = (ids, maxBytes = 4096) => ({ schema: "pipeline.verify-case-completion-policy.v1", caseIds: ids, maxBytes });
const suiteSource = (ids) => `import { registerTestCaseCompletion } from "../../plugins/pipeline-core/lib/test-case-completion.mjs";
const ids = ${JSON.stringify(ids)};
registerTestCaseCompletion({ cases: ids.map((id) => ({ id, name: "case " + id, run() {} })), fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? 3), maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? 4096) });
`;
const writeJson = (root, rel, value) => writeFileSync(join(root, rel), `${JSON.stringify(value, null, 2)}\n`);
const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));
const sourceRows = () => [
  { name: "alpha-tests", file: "harness/scripts/alpha.test.mjs", caseCompletion: policyOf(["A01"]) },
  { name: "beta-tests", file: "harness/scripts/beta.test.mjs", caseCompletion: policyOf(["B01"]) },
  { name: "gamma-tests", file: "harness/scripts/gamma.test.mjs", caseCompletion: policyOf(["G01"]) },
];
// alpha: source policy only; beta: an earlier candidate already grew it through an augmentation row; gamma: never changes and must never run.
function mkCcFixture() {
  const root = mkFixture();
  for (const rel of CC_FILES) { mkdirSync(join(root, rel, ".."), { recursive: true }); copyFileSync(join(REPO, rel), join(root, rel)); }
  mkdirSync(join(root, "harness/config"), { recursive: true });
  // delta: an INLINE policy in verify.mjs (the other source of a policy next to verify-suites.json).
  writeFileSync(join(root, "harness/scripts/verify.mjs"), `const TEST_SUITES = [\n  { name: "delta-tests", file: join(scriptDir, "delta.test.mjs"), caseCompletion: { schema: "pipeline.verify-case-completion-policy.v1", caseIds: ["D01"], maxBytes: 4096 } },\n];\nconst SCOPED_VERIFY_SUITES = Object.freeze([\n]);\nconst WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([\n]);\n`);
  writeFileSync(join(root, "harness/scripts/delta.test.mjs"), suiteSource(["D01"]));
  writeJson(root, "harness/verify-suites.json", { schema: "pipeline.verify-suites.v1", suites: sourceRows() });
  writeFileSync(join(root, "harness/scripts/alpha.test.mjs"), suiteSource(["A01"]));
  writeFileSync(join(root, "harness/scripts/beta.test.mjs"), suiteSource(["B01", "B02"]));
  writeFileSync(join(root, "harness/scripts/gamma.test.mjs"), `throw new Error("an unchanged suite must never be run by the refresh");\n`);
  writeJson(root, AUG, { schema: "pipeline.verify-case-completion-augmentations.v1", augmentations: [
    { name: "beta-tests", file: "harness/scripts/beta.test.mjs", caseCompletion: policyOf(["B01", "B02"]), previousPolicySha256: sha(policyOf(["B01"])) },
    { name: "gamma-tests", file: "harness/scripts/gamma.test.mjs", caseCompletion: policyOf(["G01", "G02"]), previousPolicySha256: sha(policyOf(["G01"])) },
  ] });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "cc fixture");
  const head = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "docs/product-capability-inventory.json"), inventoryText(head, git(root, "rev-parse", "HEAD^{tree}")));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "baseline names the commit before the suites grow");
  return root;
}
const growSuite = (root, name, ids) => { writeFileSync(join(root, `harness/scripts/${name}.test.mjs`), suiteSource(ids)); git(root, "add", "-A"); git(root, "commit", "-q", "-m", `${name} grows`); };

test("RDF09 a suite that declares one more id gets exactly one new augmentation row bound to the source policy digest, nothing else moves", () => {
  const root = mkCcFixture();
  growSuite(root, "alpha", ["A01", "A02"]);
  const rowsBefore = readJson(root, AUG).augmentations;
  const suitesBefore = readFileSync(join(root, "harness/verify-suites.json"), "utf8");
  const r = run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^case-completion-augmentations: refreshed$/mu);
  const rowsAfter = readJson(root, AUG).augmentations;
  assert.equal(rowsAfter.length, rowsBefore.length + 1);
  assert.deepEqual(rowsAfter.slice(0, rowsBefore.length), rowsBefore, "every existing row is byte-for-byte what it was");
  assert.deepEqual(rowsAfter.at(-1), { name: "alpha-tests", file: "harness/scripts/alpha.test.mjs", caseCompletion: policyOf(["A01", "A02"]), previousPolicySha256: sha(policyOf(["A01"])) });
  assert.equal(readFileSync(join(root, "harness/verify-suites.json"), "utf8"), suitesBefore, "the source policy is never edited");
  assert.match(r.stdout, new RegExp(`^  ${AUG.replace(/[./]/g, "\\$&")}$`, "mu"));
  const composed = applyVerifyCaseCompletionAugmentations(readJson(root, "harness/verify-suites.json").suites, readJson(root, AUG));
  assert.equal(composed.ok, true, "the checker's own composition accepts the file: " + JSON.stringify(composed));
  assert.deepEqual(composed.suites.find((s) => s.name === "alpha-tests").caseCompletion.caseIds, ["A01", "A02"]);
  assert.equal(git(root, "diff", "--cached", "--name-only"), "", "nothing staged");
  assert.doesNotMatch(git(root, "status", "--porcelain"), /scratch|\.out/u, "the descriptor 3 stream is not left inside the root");
});

test("RDF10 a second run finds the rows in line and writes nothing", () => {
  const root = mkCcFixture();
  growSuite(root, "alpha", ["A01", "A02"]);
  assert.equal(run(root).status, 0);
  const bytes = readFileSync(join(root, AUG), "utf8");
  const r = run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^case-completion-augmentations: current$/mu);
  assert.equal(readFileSync(join(root, AUG), "utf8"), bytes);
});

test("RDF11 --check names the drifting step, exits 1 and writes nothing", () => {
  const root = mkCcFixture();
  growSuite(root, "alpha", ["A01", "A02"]);
  const bytes = readFileSync(join(root, AUG), "utf8");
  const r = run(root, "--check");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^case-completion-augmentations: DRIFT$/mu);
  assert.match(r.stdout, /DRIFT in [^\n]*case-completion-augmentations/u);
  assert.equal(readFileSync(join(root, AUG), "utf8"), bytes);
  assert.equal(git(root, "status", "--porcelain"), "");
});

test("RDF12 a suite whose augmentation row already exists is extended in place: same preimage, same other rows, strictly more ids", () => {
  const root = mkCcFixture();
  growSuite(root, "beta", ["B01", "B02", "B03"]);
  const before = readJson(root, AUG).augmentations;
  const r = run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const after = readJson(root, AUG).augmentations;
  assert.equal(after.length, before.length, "no second row for one suite name");
  assert.deepEqual(after[0], { ...before[0], caseCompletion: policyOf(["B01", "B02", "B03"]) });
  assert.equal(after[0].previousPolicySha256, before[0].previousPolicySha256, "the preimage binding is never re-bound");
  assert.deepEqual(after[1], before[1]);
});

test("RDF13 a suite that drops a declared id is NOT an extension: reported FAILED, exit 2, the file keeps its bytes", () => {
  const root = mkCcFixture();
  growSuite(root, "beta", ["B02"]);
  const bytes = readFileSync(join(root, AUG), "utf8");
  const r = run(root);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^case-completion-augmentations: FAILED$/mu);
  assert.match(r.stderr, /beta-tests: NOT AN EXTENSION/u);
  assert.equal(readFileSync(join(root, AUG), "utf8"), bytes);
});

test("RDF14 a changed suite that cannot run is reported FAILED, never skipped silently, and nothing is written", () => {
  const root = mkCcFixture();
  writeFileSync(join(root, "harness/scripts/alpha.test.mjs"), `throw new Error("broken suite");\n`);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "alpha breaks");
  const bytes = readFileSync(join(root, AUG), "utf8");
  const r = run(root);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^case-completion-augmentations: FAILED$/mu);
  assert.match(r.stderr, /alpha-tests: could not be run/u);
  assert.equal(readFileSync(join(root, AUG), "utf8"), bytes);
});

test("RDF18 a changed suite whose case fails after it declared its ids is still read: the row is extended, the failing exit is named as a note, nothing is skipped", () => {
  const root = mkCcFixture();
  writeFileSync(join(root, "harness/scripts/alpha.test.mjs"), `import { registerTestCaseCompletion } from "../../plugins/pipeline-core/lib/test-case-completion.mjs";
const ids = ["A01", "A02"];
registerTestCaseCompletion({ cases: ids.map((id) => ({ id, name: "case " + id, run() { if (id === "A02") throw new Error("a late case fails"); } })), fd: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD ?? 3), maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? 4096) });
`);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "alpha grows and one case fails");
  const r = run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^case-completion-augmentations: refreshed$/mu);
  assert.match(r.stdout, /alpha-tests: note, the suite exited 1 while its 2 declared ids were read/u);
  assert.deepEqual(readJson(root, AUG).augmentations.at(-1).caseCompletion.caseIds, ["A01", "A02"]);
});

test("RDF17 a failed augmentation step does not move the inventory baseline: a second run still selects the same suites and fails again", () => {
  const inventory = (root) => readFileSync(join(root, "docs/product-capability-inventory.json"), "utf8");
  for (const [label, grow] of [["dropped id", (root) => growSuite(root, "beta", ["B02"])], ["broken suite", (root) => { writeFileSync(join(root, "harness/scripts/alpha.test.mjs"), `throw new Error("broken suite");\n`); git(root, "add", "-A"); git(root, "commit", "-q", "-m", "alpha breaks"); }]]) {
    const root = mkCcFixture();
    grow(root);
    const baseline = inventory(root), bytes = readFileSync(join(root, AUG), "utf8");
    const first = run(root);
    assert.equal(first.status, 2, `${label}: ${first.stdout}${first.stderr}`);
    assert.match(first.stdout, /^inventory-baseline: SKIPPED$/mu, label);
    assert.match(first.stderr, /inventory-baseline: not moved because case-completion-augmentations failed/u, label);
    assert.equal(inventory(root), baseline, `${label}: the baseline is the base of the suite selection and stays put`);
    const second = run(root);
    assert.equal(second.status, 2, `${label}: the same failure is reported again: ${second.stdout}${second.stderr}`);
    assert.match(second.stdout, /^case-completion-augmentations: FAILED$/mu, label);
    assert.equal(readFileSync(join(root, AUG), "utf8"), bytes, label);
  }
});

test("RDF18 a suite whose policy is INLINE in verify.mjs gets one new row bound to that inline policy's digest", () => {
  const root = mkCcFixture();
  growSuite(root, "delta", ["D01", "D02"]);
  const before = readJson(root, AUG).augmentations;
  const r = run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const after = readJson(root, AUG).augmentations;
  assert.deepEqual(after.slice(0, before.length), before);
  assert.deepEqual(after.at(-1), { name: "delta-tests", file: "harness/scripts/delta.test.mjs", caseCompletion: policyOf(["D01", "D02"]), previousPolicySha256: sha(policyOf(["D01"])) });
});

test("RDF15 with no harness case-completion files in the root the step is a silent current and the other steps are unaffected", () => {
  const root = mkFixture();
  const r = run(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^case-completion-augmentations: current$/mu);
  assert.match(r.stdout, /changed \(3\)/u);
});

test("RDF16 a sourceBaseline commit that does not resolve names the runnable command instead of guessing a selection", () => {
  const root = mkCcFixture();
  writeFileSync(join(root, "docs/product-capability-inventory.json"), inventoryText(ZERO, ZERO));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "baseline lost");
  const r = run(root);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^case-completion-augmentations: FAILED$/mu);
  assert.match(r.stderr, /node harness\/scripts\/check-verify-case-completion\.mjs --sync-augmentations --since <ref>/u);
  assert.match(r.stdout, /^inventory-baseline: refreshed$/mu, "an unresolvable baseline is moved anyway: that is the way out of the state, not a deadlock");
});
