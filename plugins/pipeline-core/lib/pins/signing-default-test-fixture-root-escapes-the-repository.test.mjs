// SPDX-License-Identifier: SUL-1.0
// Regression pin for backlog item pipeline.signing-default-test-fixture-root-escapes-the-repository (AC-260).
// Acceptance points covered:
//   P1 the suite fixture root is derived with fileURLToPath (no raw URL pathname) and lands inside the repository's scratch/
//   P2 the suite imports and runs on this host: no mkdir ENOENT, nothing is created above the repository root
//   P3 the five pinned case IDs RC21C001..RC21C005 are kept (suite and harness/verify-suites.json)
//   P4 RC21C003 carries the strictly reversed member order extension (P4a source), and on the LIVE suite it executes and passes (P4b)
//   P5 (todo, known RED) the live suite is fully green on current source: RC21C003/005 pass, RC21C001/002/004 fail WIN-AUTH-DACL (owned private key directory on Windows)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const suitePath = join(repoRoot, "plugins", "pipeline-core", "scripts", "design-workflow-signing-default.test.mjs");
const libDir = join(repoRoot, "plugins", "pipeline-core", "lib");
const scriptsDir = dirname(suitePath);
const suiteSource = readFileSync(suitePath, "utf8");
const CASE_IDS = ["RC21C001", "RC21C002", "RC21C003", "RC21C004", "RC21C005"];

const inside = (root, p) => { const r = relative(root, p); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };
const cleanEnv = () => {
  const e = { ...process.env };
  delete e.PIPELINE_SIGNING_FIXTURE_ROOT;
  delete e.PIPELINE_VERIFY_CASE_COMPLETION_FD;
  delete e.NODE_TEST_CONTEXT;
  return e;
};
const runSuite = (file, env) => spawnSync(process.execPath, ["--test", file], { cwd: repoRoot, env, encoding: "utf8", timeout: 240000 });
let liveRun;
const runLive = () => (liveRun ??= runSuite(suitePath, cleanEnv()));
const caseLine =(out, id, mark) => new RegExp(`${mark} ${id} `).test(out);

test("P1 default fixture root is fileURLToPath-derived and inside the repository scratch/", () => {
  assert.doesNotMatch(suiteSource, /new URL\([^)]*\)\.pathname/, "raw URL pathname must not be used");
  const m = suiteSource.match(/fileURLToPath\(new URL\("([^"]+)",import\.meta\.url\)\)/);
  assert.ok(m, "fixtureRoot must come from fileURLToPath(new URL(<rel>, import.meta.url))");
  const derived = resolve(scriptsDir, m[1]);
  assert.equal(derived, resolve(repoRoot, "scratch", "default-signing"));
  assert.ok(inside(join(repoRoot, "scratch"), derived));
  // RED discriminator: the original expression (four levels up) resolves above the repository.
  const original = resolve(scriptsDir, "../../../../scratch/default-signing/");
  assert.equal(inside(repoRoot, original), false, "the check would catch the original escaping root");
  assert.equal(inside(repoRoot, derived), true);
});

test("P2 default-root run imports without ENOENT and creates nothing above the repository", () => {
  const escaped = resolve(repoRoot, "..", "scratch", "default-signing");
  const existedBefore = existsSync(escaped);
  const r = runLive();
  const out = `${r.stdout}\n${r.stderr}`;
  assert.doesNotMatch(out, /ENOENT/, "no mkdir ENOENT (doubled drive letter) at import");
  for (const id of CASE_IDS) assert.ok(caseLine(out, id, "[✖✔]"), `${id} must be reported (it runs, pass or fail)`);
  assert.ok(existsSync(join(repoRoot, "scratch", "default-signing")), "fixture root created inside repository scratch/");
  if (!existedBefore) assert.equal(existsSync(escaped), false, "nothing created above the repository root");
});

test("P3 five pinned case IDs are kept in the suite and in harness/verify-suites.json", () => {
  assert.match(suiteSource, /completionCases\.length !== 5/);
  const suites = JSON.parse(readFileSync(join(repoRoot, "harness", "verify-suites.json"), "utf8"));
  const walk = (v, acc) => { if (Array.isArray(v)) v.forEach((x) => walk(x, acc)); else if (v && typeof v === "object") { acc.push(v); Object.values(v).forEach((x) => walk(x, acc)); } return acc; };
  const entry = walk(suites, []).find((o) => o.name === "design-workflow-signing-default-tests");
  assert.ok(entry, "suite entry present");
  assert.deepEqual(entry.caseCompletion.caseIds, CASE_IDS);
  assert.equal(entry.file, "plugins/pipeline-core/scripts/design-workflow-signing-default.test.mjs");
  assert.equal((suiteSource.match(/^test\(/gm) ?? []).length, 5);
});

test("P4a RC21C003 source carries the strictly reversed member order extension", () => {
  const start = suiteSource.indexOf("test('canonical DWP equality accepts reordering");
  const end = suiteSource.indexOf("test('canonical comparison retains exact shape");
  assert.ok(start > 0 && end > start);
  const body = suiteSource.slice(start, end);
  assert.match(body, /reverseKeys/);
  assert.match(body, /Object\.keys\(o\)\.reverse\(\)/);
  assert.match(body, /assert\.notEqual\(JSON\.stringify\(reversed\),JSON\.stringify\(f\.request\)\)/);
  assert.match(body, /reversedChecked\.ok,true/);
  assert.match(body, /reversedChecked\.intentSha256,original\.intentSha256/);
});

test("P4b fixture() builds a package the real validator admits, and the strictly reversed member order case RC21C003 executes and passes on the live suite", () => {
  const r = runLive();
  const out = `${r.stdout}\n${r.stderr}`;
  assert.doesNotMatch(out, /DWP-ADVISOR-EXCEPTION-RATIONALE-UNBACKED|DWP-BOUND-PATH-(MODIFIED|UNTRACKED)/, `fixture must build a valid package\n${out.slice(0, 1500)}`);
  assert.ok(caseLine(out, "RC21C003", "✔"), `RC21C003 (reversed member order) must pass\n${out.slice(0, 1500)}`);
  assert.ok(caseLine(out, "RC21C005", "✔"), `RC21C005 must pass\n${out.slice(0, 1500)}`);
});

test("P5 live suite is fully green on current source (known RED: RC21C001/002/004 fail WIN-AUTH-DACL on Windows)", {
  todo: "RC21C001/002/004 reach runHumanApproval and fail SDC-AUTHORITY-UNAVAILABLE / WIN-AUTH-DACL (owned private key directory); not a fixture() defect; needs the held encrypted-key / owned-authority successor, outside this pin's write scope",
}, () => {
  const r = runLive();
  assert.equal(r.status, 0, "live suite must exit 0");
});
