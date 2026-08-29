#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-protected-path-integrity.test.mjs -- covers check-protected-path-integrity.mjs against
 * SYNTHETIC fixture directories (never this repository's own real protected paths, mirroring
 * check-backlog-done-predicate.test.mjs's own fixture-only discipline).
 *
 * Two phases, matching NVA-R10-PROTPATH's acceptance bar:
 *
 *   PHASE 1 ("CONTROLLED REPRO", first test below) proves the CURRENT gap the backlog item
 *   reports, using only mechanisms that already existed in this repository before this dispatch
 *   -- it imports nothing from check-protected-path-integrity.mjs. Run standalone (this exact
 *   test, isolated), it demonstrates that a spawned subprocess writing directly to a file this
 *   repository would otherwise protect is not intercepted by anything: no PreToolUse guard is
 *   even in the loop, because none of them observe a syscall issued by a process whose own
 *   launch (as a plain, unremarkable Bash tool call) they already approved. This assertion's
 *   truth does not depend on this dispatch's own new module -- it was true before it, and stays
 *   true after, because Stage 1 is purely additive and never touches guard-*.mjs.
 *
 *   PHASE 2 (every test after) inverts that gap into a regression test: it drives the SAME kind
 *   of bypass through checkProtectedPathIntegrity's own record -> bypass -> compare flow and
 *   asserts a typed finding is produced, across three distinct bypass mechanisms (DoD: "verified
 *   against at least three distinct bypass shapes, each its own test").
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DEFAULT_EXCLUDED_RELATIVE_DIRS,
  FINDING_CODE,
  buildBaseline,
  compareAgainstBaseline,
  defaultBaselinePath,
  defaultHasConsumedCapabilityForPath,
  enumerateGateStrengthProtectedPaths,
  enumerateProtectedPaths,
  enumerateTestPathProtectedPaths,
  readBaseline,
  recordBaseline,
  resolveGitCommonDir,
  sha256Of,
  walkFiles,
  DEFAULT_ROOT,
} from "./check-protected-path-integrity.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("./check-protected-path-integrity.mjs", import.meta.url));

// ---------------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------------

function makeFixtureRoot(prefix = "check-protected-path-integrity-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeFixtureFile(root, relPath, content) {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return abs;
}

/** A fixture-only, synthetic gate-strength-shaped rule -- never the real GATE_STRENGTH_PATHS. */
const gsRule = (id, path, reason = `fixture rule ${id}`) => ({ id, path, reason });

/** A fixture-only testpath rule, matching loadProtectedTestPathRules()'s own `{id, re, reason}` shape. */
const tpRule = (id, pattern, reason = `fixture testpath rule ${id}`) => ({ id, re: new RegExp(pattern, "iu"), reason });

/** Writes a Node script that, when run, writes `payload` to `targetAbsPath` via plain fs.writeFileSync --
 * shape (a) of the reported bypass. */
function writeNodeDirectBypass(fixtureRoot) {
  return writeFixtureFile(
    fixtureRoot,
    "bypass-node-direct.mjs",
    "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.argv[2], process.argv[3]);\n",
  );
}

/** A Node script that shells out and uses a `>` redirect to write -- shape (b): "a shell redirect
 * issued from inside a spawned script". The OUTER process is still `node <script>`; the redirect
 * never appears in any command text a guard could inspect, because it is inside the script's own
 * spawned child, not in the argv the guard ever sees. */
function writeNodeShellRedirectBypass(fixtureRoot) {
  return writeFixtureFile(
    fixtureRoot,
    "bypass-node-shell-redirect.mjs",
    [
      "import { execFileSync } from 'node:child_process';",
      "const target = process.argv[2];",
      "const payload = process.argv[3];",
      "execFileSync('/bin/sh', ['-c', `printf %s ${JSON.stringify(payload)} > ${JSON.stringify(target)}`]);",
      "",
    ].join("\n"),
  );
}

function runBypass(scriptAbsPath, targetAbsPath, payload) {
  const result = spawnSync(process.execPath, [scriptAbsPath, targetAbsPath, payload], { encoding: "utf8" });
  assert.equal(result.status, 0, `bypass script must run cleanly (stderr: ${result.stderr})`);
}

// ---------------------------------------------------------------------------------
// PHASE 1 -- CONTROLLED REPRO of the current, pre-existing gap
// ---------------------------------------------------------------------------------

test("PHASE 1 (CONTROLLED REPRO): a spawned Node subprocess writes directly to a file this repository would protect, and nothing in this repository intercepts it", () => {
  const root = makeFixtureRoot();
  const target = writeFixtureFile(root, "would-be-protected.json", "original-bytes");
  const bypass = writeNodeDirectBypass(root);

  const before = readFileSync(target, "utf8");
  assert.equal(before, "original-bytes");

  // The bypass runs as a bare, unremarkable `node <script> <args>` subprocess call -- exactly
  // the shape guard-gate-strength.mjs's own header names as invisible to it ("None of them can
  // see a syscall issued by a process they already approved the launch of"). No PreToolUse hook
  // is invoked anywhere in this flow: this is a plain node:child_process spawn, not a Claude
  // Code tool call, which is precisely the point -- there is no hook boundary here to cross.
  runBypass(bypass, target, "MUTATED-BY-BYPASS");

  const after = readFileSync(target, "utf8");
  assert.notEqual(after, before, "the file's bytes changed");
  assert.equal(after, "MUTATED-BY-BYPASS", "the exact bypass payload landed, unblocked and unmodified");

  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------
// Small unit coverage of the building blocks
// ---------------------------------------------------------------------------------

test("walkFiles: finds every file, skipping the default excluded directories", () => {
  const root = makeFixtureRoot();
  writeFixtureFile(root, "a.txt", "1");
  writeFixtureFile(root, "sub/b.txt", "2");
  writeFixtureFile(root, ".git/HEAD", "ref: refs/heads/main");
  writeFixtureFile(root, "node_modules/pkg/index.js", "x");
  writeFixtureFile(root, ".claude/worktrees/wt-1/c.txt", "3");

  const files = walkFiles(root);
  assert.deepEqual(files, ["a.txt", "sub/b.txt"]);
  rmSync(root, { recursive: true, force: true });
});

test("walkFiles: excludedRelativeDirs is overridable (empty set walks everything)", () => {
  const root = makeFixtureRoot();
  writeFixtureFile(root, "node_modules/pkg/index.js", "x");
  const files = walkFiles(root, { excludedRelativeDirs: [] });
  assert.deepEqual(files, ["node_modules/pkg/index.js"]);
  rmSync(root, { recursive: true, force: true });
});

test("sha256Of: stable digest for existing content, null for a missing file", () => {
  const root = makeFixtureRoot();
  const file = writeFixtureFile(root, "x.txt", "hello");
  const digest = sha256Of(file);
  assert.equal(digest, sha256Of(file));
  assert.equal(digest.length, 64);
  assert.equal(sha256Of(join(root, "absent.txt")), null);
  rmSync(root, { recursive: true, force: true });
});

test("enumerateGateStrengthProtectedPaths: resolves a concrete path only when it exists as a file", () => {
  const root = makeFixtureRoot();
  writeFixtureFile(root, "present.json", "{}");
  const entries = enumerateGateStrengthProtectedPaths({
    rootDir: root,
    gateStrengthPaths: [gsRule("GS-FIX-1", "present.json"), gsRule("GS-FIX-2", "absent.json")],
  });
  assert.deepEqual(entries.map((e) => e.path), ["present.json"]);
  assert.equal(entries[0].source, "gate-strength");
  rmSync(root, { recursive: true, force: true });
});

test("enumerateGateStrengthProtectedPaths: a trailing '/*' rule expands to every file currently under that subtree", () => {
  const root = makeFixtureRoot();
  writeFixtureFile(root, "staging/one.json", "1");
  writeFixtureFile(root, "staging/nested/two.json", "2");
  const entries = enumerateGateStrengthProtectedPaths({
    rootDir: root,
    gateStrengthPaths: [gsRule("GS-FIX-GLOB", "staging/*")],
  });
  assert.deepEqual(
    entries.map((e) => e.path).sort(),
    ["staging/nested/two.json", "staging/one.json"],
  );
  rmSync(root, { recursive: true, force: true });
});

test("enumerateTestPathProtectedPaths: matches walked files against the rule's regex", () => {
  const root = makeFixtureRoot();
  writeFixtureFile(root, "plugins/x/hooks/guard-thing.test.mjs", "// suite");
  writeFixtureFile(root, "plugins/x/hooks/guard-thing.mjs", "// not the suite");
  const entries = enumerateTestPathProtectedPaths({
    rootDir: root,
    rules: [tpRule("TP-FIX-1", "guard-thing\\.test\\.mjs$")],
  });
  assert.deepEqual(entries.map((e) => e.path), ["plugins/x/hooks/guard-thing.test.mjs"]);
  rmSync(root, { recursive: true, force: true });
});

test("enumerateProtectedPaths: combines gate-strength and testpath sources, de-duplicated by path", () => {
  const root = makeFixtureRoot();
  writeFixtureFile(root, "gs-file.json", "{}");
  writeFixtureFile(root, "tp-file.test.mjs", "// suite");
  const entries = enumerateProtectedPaths({
    rootDir: root,
    gateStrengthPaths: [gsRule("GS-FIX", "gs-file.json")],
    testPathRules: [tpRule("TP-FIX", "tp-file\\.test\\.mjs$")],
  });
  assert.deepEqual(entries.map((e) => e.path), ["gs-file.json", "tp-file.test.mjs"]);
  assert.deepEqual(entries.map((e) => e.source), ["gate-strength", "testpath"]);
  rmSync(root, { recursive: true, force: true });
});

test("buildBaseline / recordBaseline / readBaseline: round-trips digests through an explicit baselinePath", () => {
  const root = makeFixtureRoot();
  const target = writeFixtureFile(root, "protected.json", "v1");
  const baselinePath = join(root, "baseline.json");
  const result = recordBaseline({
    rootDir: root,
    baselinePath,
    gateStrengthPaths: [gsRule("GS-FIX", "protected.json")],
    testPathRules: [],
  });
  assert.equal(result.status, "recorded");
  const reread = readBaseline(baselinePath);
  assert.equal(reread.entries.length, 1);
  assert.equal(reread.entries[0].path, "protected.json");
  assert.equal(reread.entries[0].sha256, sha256Of(target));
  rmSync(root, { recursive: true, force: true });
});

test("readBaseline: returns null for a missing or corrupt file", () => {
  const root = makeFixtureRoot();
  assert.equal(readBaseline(join(root, "nope.json")), null);
  const corrupt = writeFixtureFile(root, "corrupt.json", "{ not json");
  assert.equal(readBaseline(corrupt), null);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------
// PHASE 2 -- the mechanism detects the same class of bypass, across 3 distinct shapes
// ---------------------------------------------------------------------------------

function baselineThenBypassThenCompare({ root, bypassFn, hasConsumedCapabilityForPath }) {
  const baselinePath = join(root, "baseline.json");
  const gateStrengthPaths = [gsRule("GS-BYPASS", "protected.json")];
  recordBaseline({ rootDir: root, baselinePath, gateStrengthPaths, testPathRules: [] });
  bypassFn();
  return compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath });
}

test("PHASE 2a: a Node script writing directly via fs.writeFileSync is detected", () => {
  const root = makeFixtureRoot();
  const target = writeFixtureFile(root, "protected.json", "original");
  const bypass = writeNodeDirectBypass(root);
  const result = baselineThenBypassThenCompare({
    root,
    bypassFn: () => runBypass(bypass, target, "MUTATED-A"),
    hasConsumedCapabilityForPath: () => false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].code, FINDING_CODE);
  assert.equal(result.findings[0].path, "protected.json");
  assert.notEqual(result.findings[0].baselineSha256, result.findings[0].currentSha256);
  rmSync(root, { recursive: true, force: true });
});

test("PHASE 2b: a shell redirect issued from inside a spawned Node script is detected", () => {
  const root = makeFixtureRoot();
  const target = writeFixtureFile(root, "protected.json", "original");
  const bypass = writeNodeShellRedirectBypass(root);
  const result = baselineThenBypassThenCompare({
    root,
    bypassFn: () => runBypass(bypass, target, "MUTATED-B"),
    hasConsumedCapabilityForPath: () => false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, "protected.json");
  rmSync(root, { recursive: true, force: true });
});

test("PHASE 2c: a non-Node interpreter (python3) writing directly is detected", { skip: !hasPython3() }, () => {
  const root = makeFixtureRoot();
  const target = writeFixtureFile(root, "protected.json", "original");
  const result = baselineThenBypassThenCompare({
    root,
    bypassFn: () => {
      const run = spawnSync("python3", ["-c", `open(${JSON.stringify(target)}, "w").write(${JSON.stringify("MUTATED-C")})`], { encoding: "utf8" });
      assert.equal(run.status, 0, `python3 bypass must run cleanly (stderr: ${run.stderr})`);
    },
    hasConsumedCapabilityForPath: () => false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, "protected.json");
  rmSync(root, { recursive: true, force: true });
});

function hasPython3() {
  const probe = spawnSync("python3", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
}

test("compareAgainstBaseline: a matching CONSUMED capability suppresses the finding", () => {
  const root = makeFixtureRoot();
  const target = writeFixtureFile(root, "protected.json", "original");
  const bypass = writeNodeDirectBypass(root);
  const result = baselineThenBypassThenCompare({
    root,
    bypassFn: () => runBypass(bypass, target, "AUTHORIZED-CHANGE"),
    hasConsumedCapabilityForPath: (rootDir, path) => path === "protected.json",
  });
  assert.equal(result.ok, true, "a consumed capability covering this exact path suppresses the finding");
  assert.deepEqual(result.findings, []);
  rmSync(root, { recursive: true, force: true });
});

test("compareAgainstBaseline: an unchanged baseline reports no findings", () => {
  const root = makeFixtureRoot();
  writeFixtureFile(root, "protected.json", "original");
  const baselinePath = join(root, "baseline.json");
  recordBaseline({ rootDir: root, baselinePath, gateStrengthPaths: [gsRule("GS-STABLE", "protected.json")], testPathRules: [] });
  const result = compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: () => false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.checked, 1);
  rmSync(root, { recursive: true, force: true });
});

test("compareAgainstBaseline: 'no-baseline' and 'repository-unresolved' are distinguished from a clean compare", () => {
  const root = makeFixtureRoot();
  const missing = compareAgainstBaseline({ rootDir: root, baselinePath: join(root, "never-recorded.json") });
  assert.equal(missing.status, "no-baseline");
  assert.equal(missing.ok, false);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------
// A script-driven edit to a NON-protected path produces no finding (scope containment)
// ---------------------------------------------------------------------------------

test("a script-driven edit to a NON-protected path is unaffected: no finding, and the path was never enumerated", () => {
  const root = makeFixtureRoot();
  writeFixtureFile(root, "protected.json", "original");
  const ordinary = writeFixtureFile(root, "ordinary.json", "original");
  const bypass = writeNodeDirectBypass(root);

  const gateStrengthPaths = [gsRule("GS-SCOPE", "protected.json")];
  const enumerated = enumerateProtectedPaths({ rootDir: root, gateStrengthPaths, testPathRules: [] });
  assert.deepEqual(enumerated.map((e) => e.path), ["protected.json"], "the ordinary file is never part of the protected set");

  const baselinePath = join(root, "baseline.json");
  recordBaseline({ rootDir: root, baselinePath, gateStrengthPaths, testPathRules: [] });
  runBypass(bypass, ordinary, "EDITED-ORDINARY-FILE");
  const result = compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: () => false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------
// The false-negative population is bounded: a newly-protected path is covered the moment it is
// added to the protected-set INPUT (never a second hand-maintained list).
// ---------------------------------------------------------------------------------

test("a newly-protected path (added only to the fixture's protected-set input) is covered in the same run", () => {
  const root = makeFixtureRoot();
  writeFixtureFile(root, "already-protected.json", "1");
  const newlyAdded = writeFixtureFile(root, "just-added.json", "2");

  const beforeAdd = enumerateProtectedPaths({
    rootDir: root,
    gateStrengthPaths: [gsRule("GS-OLD", "already-protected.json")],
    testPathRules: [],
  });
  assert.deepEqual(beforeAdd.map((e) => e.path), ["already-protected.json"]);

  const afterAdd = enumerateProtectedPaths({
    rootDir: root,
    gateStrengthPaths: [gsRule("GS-OLD", "already-protected.json"), gsRule("GS-NEW", "just-added.json")],
    testPathRules: [],
  });
  assert.deepEqual(afterAdd.map((e) => e.path).sort(), ["already-protected.json", "just-added.json"]);

  // And the newly-protected path is covered by the detection flow itself, end to end.
  const baselinePath = join(root, "baseline.json");
  recordBaseline({
    rootDir: root, baselinePath,
    gateStrengthPaths: [gsRule("GS-OLD", "already-protected.json"), gsRule("GS-NEW", "just-added.json")],
    testPathRules: [],
  });
  const bypass = writeNodeDirectBypass(root);
  runBypass(bypass, newlyAdded, "MUTATED-NEWLY-ADDED");
  const result = compareAgainstBaseline({ rootDir: root, baselinePath, hasConsumedCapabilityForPath: () => false });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, "just-added.json");
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------
// Persistence plumbing: resolveGitCommonDir / defaultBaselinePath / defaultHasConsumedCapabilityForPath
// ---------------------------------------------------------------------------------

test("resolveGitCommonDir: null for a directory that is not a git repository", () => {
  const root = makeFixtureRoot();
  assert.equal(resolveGitCommonDir(root), null);
  rmSync(root, { recursive: true, force: true });
});

test("resolveGitCommonDir / defaultBaselinePath: resolve against a real (fixture) git repository", () => {
  const root = makeFixtureRoot();
  execFileSync("git", ["init", "--quiet", root], { encoding: "utf8" });
  const commonDir = resolveGitCommonDir(root);
  assert.ok(typeof commonDir === "string" && commonDir.length > 0);
  const baselinePath = defaultBaselinePath(root);
  assert.ok(baselinePath.endsWith(join("agent-pipeline", "protected-path-integrity", "baseline.json")));
  rmSync(root, { recursive: true, force: true });
});

test("defaultHasConsumedCapabilityForPath: true only for an exact-path match against a status:consumed capability file", () => {
  const root = makeFixtureRoot();
  execFileSync("git", ["init", "--quiet", root], { encoding: "utf8" });
  const commonDir = resolveGitCommonDir(root);
  const capsDir = join(commonDir, "agent-pipeline", "human-guard-overrides", "capabilities");
  mkdirSync(capsDir, { recursive: true });
  writeFileSync(join(capsDir, "cap-consumed.json"), JSON.stringify({ status: "consumed", eligiblePaths: ["pipeline.user.yaml"] }), "utf8");
  writeFileSync(join(capsDir, "cap-armed.json"), JSON.stringify({ status: "armed", eligiblePaths: ["other.json"] }), "utf8");
  writeFileSync(join(capsDir, "cap-corrupt.json"), "{ not json", "utf8");

  assert.equal(defaultHasConsumedCapabilityForPath(root, "pipeline.user.yaml"), true);
  assert.equal(defaultHasConsumedCapabilityForPath(root, "other.json"), false, "armed (never consumed) does not count");
  assert.equal(defaultHasConsumedCapabilityForPath(root, "unrelated.json"), false);
  rmSync(root, { recursive: true, force: true });
});

test("defaultHasConsumedCapabilityForPath: false (never throws) when no capabilities directory exists", () => {
  const root = makeFixtureRoot();
  execFileSync("git", ["init", "--quiet", root], { encoding: "utf8" });
  assert.equal(defaultHasConsumedCapabilityForPath(root, "anything.json"), false);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------
// Real-repository sanity: the actual source-of-truth enumeration is exercised at least once
// against this repository's own real GATE_STRENGTH_PATHS / protectedTestPaths -- read-only,
// no baseline written, no mutation of this checkout's tracked or .git state.
// ---------------------------------------------------------------------------------

test("enumerateProtectedPaths against the real repository root finds real gate-strength and testpath entries", () => {
  const entries = enumerateProtectedPaths({ rootDir: DEFAULT_ROOT });
  assert.ok(entries.length > 0);
  const paths = entries.map((e) => e.path);
  assert.ok(paths.includes("pipeline.user.yaml"), "GS-1 is a concrete, always-present path in this repository");
  assert.ok(entries.some((e) => e.source === "testpath"), "at least one real testpath rule resolves to a real file");
});

// ---------------------------------------------------------------------------------
// CLI smoke: the "usage" branch (no verb) never touches the filesystem
// ---------------------------------------------------------------------------------

test("CLI: invoked with no verb, prints usage and exits 2 -- no record/compare side effect", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: check-protected-path-integrity\.mjs record\|compare/);
});

test("DEFAULT_EXCLUDED_RELATIVE_DIRS: names the three excluded directories", () => {
  assert.deepEqual([...DEFAULT_EXCLUDED_RELATIVE_DIRS], [".git", "node_modules", ".claude/worktrees"]);
});
