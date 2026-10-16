// SPDX-License-Identifier: SUL-1.0
// Pin (ALF-C-P14-03, AC-204): original Alfred item
// pipeline.implementation-without-dispatch-escapes-review-coverage.
// The reverse inventory (candidate commit range -> dispatch records) must expose
// implementation commits that carry no dispatch record, must never treat an
// empty / unproved comparison as coverage, and must stay report-only with no
// completion effect. Exercises the real module and the real CLI against a real
// git fixture under scratch/ (no mocks of the behaviour under test).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(here, "..");
const pluginRoot = resolve(libDir, "..");
const repoRoot = resolve(pluginRoot, "..", "..");
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const work = realpathSync(mkdtempSync(join(scratchBase, "alf-c-p14-03-")));
after(() => rmSync(work, { recursive: true, force: true }));

const { openReportCandidate } = await import(pathToFileURL(join(libDir, "report-source-readers.mjs")).href);
const prod = await import(pathToFileURL(join(libDir, "candidate-implementation-coverage-report.mjs")).href);
const cliPath = join(pluginRoot, "scripts", "acceptance-coverage-report.mjs");

const GIT_ARGS = ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
  "-c", "core.autocrlf=false"];
function git(cwd, ...args) {
  return execFileSync("git", [...GIT_ARGS, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function commit(cwd, files, message) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), body);
  }
  git(cwd, "add", "--", ...Object.keys(files));
  git(cwd, "commit", "--no-verify", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}
function legacyRecord(taskId, commitSha, outcome = "succeeded") {
  const terminal = outcome !== "in-progress";
  return { schema: "pipeline.dispatch-record.v2", taskId, agentType: "goldfish-implementor", model: "fixture-model",
    effort: "medium", rulesetSha: "fixture", dispatcher: "fixture", candidateCommit: commitSha,
    resultSha256: terminal ? "a".repeat(64) : null, outcome, commits: terminal ? [commitSha] : [], log: [],
    report: terminal ? { text: "fixture report", changedFiles: [{ path: "src/y.txt" }] } : null };
}
function fixture(name, build) {
  const dir = join(work, name); mkdirSync(dir);
  git(dir, "init", "-q");
  const base = commit(dir, { "README.md": "base\n" }, "chore: base");
  return { dir, base, ...build(dir, base) };
}
function report(fx, candidate, baseCommit, mod = prod) {
  return mod.reportCandidateImplementationCoverage(openReportCandidate({ repoRoot: fx.dir, candidateCommit: candidate }), { baseCommit });
}

// Fixture A: C1 = implementation with no record; C2 = implementation; C3 = record for C2 only.
const A = fixture("a", (dir) => {
  const c1 = commit(dir, { "src/x.txt": "x\n" }, "feat: implementation without any dispatch");
  const c2 = commit(dir, { "src/y.txt": "y\n" }, "feat: implementation with a later record");
  const c3 = commit(dir, { "evidence/dispatch-record-T2.json": JSON.stringify(legacyRecord("T2", c2)) }, "docs: record");
  return { c1, c2, c3 };
});
// Fixture B: two records claim the same commit (ambiguous), one record is garbage, one is non-terminal.
const B = fixture("b", (dir) => {
  const c2 = commit(dir, { "src/y.txt": "y\n" }, "feat: implementation claimed twice");
  const c3 = commit(dir, {
    "evidence/dispatch-record-T2.json": JSON.stringify(legacyRecord("T2", c2)),
    "evidence/dispatch-record-T3.json": JSON.stringify(legacyRecord("T3", c2)),
    "evidence/dispatch-record-BAD.json": "{ not json",
  }, "docs: records");
  return { c2, c3 };
});
// Fixture C: the only record is non-terminal, so it must not map the implementation commit.
const C = fixture("c", (dir) => {
  const c2 = commit(dir, { "src/y.txt": "y\n" }, "feat: implementation, record still in progress");
  const c3 = commit(dir, { "evidence/dispatch-record-T4.json": JSON.stringify(legacyRecord("T4", c2, "in-progress")) }, "docs: record");
  return { c2, c3 };
});

/** The core acceptance assertion: an implementation commit without a dispatch record is surfaced. */
function assertUnmappedImplementationIsSurfaced(r, fx) {
  assert.equal(r.state, "gaps");
  const finding = r.findings.find(f => f.commit === fx.c1);
  assert.deepEqual(finding, { code: "REPORT-IMPLEMENTATION-WITHOUT-DISPATCH-MAPPING", commit: fx.c1 });
  assert.equal(r.commits.find(u => u.commit === fx.c1).mapping, "missing");
}
function assertEmptyRangeIsNotCoverage(r) {
  assert.equal(r.comparison.trueEmptyRange, true);
  assert.equal(r.comparison.zeroApplicableRowsIsCoverage, false);
  assert.equal(r.state, "unknown");
  assert.deepEqual(r.findings, []);
}

// Host limitation: the module under test resolves git only from fixed trusted roots (no seam);
// where none resolves (native Windows host without git in those roots) every case is skipped.
const { resolveTrustedSystemExecutable } = await import(pathToFileURL(join(libDir, "trusted-tool-resolution.mjs")).href);
const trustedGit = resolveTrustedSystemExecutable("git", { homeDir: null });
const SKIP = trustedGit.ok ? false
  : `host-limitation: no trusted git (${trustedGit.status}); owner Coordinator, due 2026-10-19 for the Linux/WSL run (PO decision K7)`;

describe("implementation without dispatch escapes review coverage (AC-204)", { skip: SKIP }, () => {
  test("an implementation commit with no dispatch record is reported as a gap", () => {
    const r = report(A, A.c3, A.base);
    assertUnmappedImplementationIsSurfaced(r, A);
    assert.ok(r.pathMappings.some(m => m.path === "src/x.txt" && m.commits.includes(A.c1)), "path is still mapped to its commit");
  });

  test("a commit with a structurally matching record is mapped but remains unproved (no admission, no review claim)", () => {
    const r = report(A, A.c3, A.base);
    const unit = r.commits.find(u => u.commit === A.c2);
    assert.equal(unit.mapping, "structural-match");
    const row = r.records.find(x => x.taskId === "T2");
    assert.equal(row.mapping, "candidate-range-structural-match");
    assert.equal(row.admission.code, "REPORT-AUTHENTIC-ADMISSION-NOT-PROVED");
    assert.equal(row.review.code, "REPORT-BOUND-REVIEW-NOT-PROVED");
    assert.equal(row.authorship, "unknown", "legacy record never labelled worker authorship");
    // The record-carrying commit itself has no record of its own, so it is also surfaced.
    assert.ok(r.findings.some(f => f.commit === A.c3 && f.code === "REPORT-IMPLEMENTATION-WITHOUT-DISPATCH-MAPPING"));
    assert.ok(!r.findings.some(f => f.commit === A.c2), "the mapped commit raises no finding");
  });

  test("an empty comparison range is explicit but is never coverage", () => {
    assertEmptyRangeIsNotCoverage(report(A, A.c3, A.c3));
  });

  test("without a base commit nothing is certified: state unknown, baseline unavailable, no comparison", () => {
    const r = report(A, A.c3, undefined);
    assert.equal(r.state, "unknown");
    assert.deepEqual(r.baseline, { state: "unavailable", code: "REPORT-BASE-NOT-SUPPLIED" });
    assert.equal(r.comparison, null);
    assert.deepEqual(r.findings, []);
  });

  test("an unprovable baseline (base not an ancestor) degrades to unknown, never to a pass", () => {
    const r = report(A, A.c1, A.c3);
    assert.equal(r.state, "unknown");
    assert.equal(r.baseline.state, "unavailable");
    assert.equal(r.baseline.code, "REPORT-GIT-UNAVAILABLE");
  });

  test("the baseline owner stays unresolved even for a good range (no baseline authority is claimed)", () => {
    const r = report(A, A.c3, A.base);
    assert.deepEqual(r.baseline, { state: "unavailable", code: "REPORT-IMPLEMENTATION-BASELINE-OWNER-UNRESOLVED" });
  });

  test("two records claiming one commit are reported ambiguous, an invalid record stays unknown", () => {
    const r = report(B, B.c3, B.base);
    assert.equal(r.commits.find(u => u.commit === B.c2).mapping, "ambiguous");
    assert.ok(r.findings.some(f => f.code === "REPORT-AMBIGUOUS-DISPATCH-MAPPING" && f.commit === B.c2));
    const bad = r.records.find(x => x.path.endsWith("-BAD.json"));
    assert.deepEqual({ state: bad.state, code: bad.code }, { state: "unknown", code: "REPORT-DISPATCH-INVALID" });
    assert.equal(r.state, "gaps");
  });

  test("a non-terminal dispatch record does not cover its implementation commit", () => {
    const r = report(C, C.c3, C.base);
    assert.equal(r.records.find(x => x.taskId === "T4").mapping, "not-applicable");
    assert.equal(r.commits.find(u => u.commit === C.c2).mapping, "missing");
    assert.ok(r.findings.some(f => f.code === "REPORT-IMPLEMENTATION-WITHOUT-DISPATCH-MAPPING" && f.commit === C.c2));
  });

  test("the report is diagnostic only: no completion effect in any state", () => {
    for (const r of [report(A, A.c3, A.base), report(A, A.c3, A.c3), report(A, A.c3, undefined), report(A, A.c1, A.c3), report(B, B.c3, B.base)]) {
      assert.equal(r.reportOnly, true);
      assert.equal(r.completionEffect, "none");
      assert.equal(r.schema, "pipeline.candidate-implementation-coverage-report.v1");
      assert.ok(["unknown", "gaps"].includes(r.state), `state ${r.state} is never a pass`);
    }
  });

  test("the CLI surfaces the same gap, is report-only, and rejects malformed arguments", () => {
    const run = (...args) => spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
    const ok = run("--kind", "candidate", "--root", A.dir, "--candidate", A.c3, "--base", A.base);
    assert.equal(ok.status, 0);
    const out = JSON.parse(ok.stdout);
    assert.equal(out.reportOnly, true);
    assert.equal(out.completionEffect, "none");
    assertUnmappedImplementationIsSurfaced(out.candidateCoverage, A);
    const noBase = JSON.parse(run("--kind", "candidate", "--root", A.dir, "--candidate", A.c3).stdout);
    assert.equal(noBase.candidateCoverage.state, "unknown");
    const empty = JSON.parse(run("--kind", "candidate", "--root", A.dir, "--candidate", A.c3, "--base", A.c3).stdout);
    assertEmptyRangeIsNotCoverage(empty.candidateCoverage);
    assert.equal(run("--kind", "candidate", "--candidate", A.c3, "--spec", "specs/x.md").status, 2);
  });

  describe("RED: the assertions fail against scratch mirrors with the guarantee removed", () => {
    async function mirror(name, mutate) {
      const source = readFileSync(join(libDir, "candidate-implementation-coverage-report.mjs"), "utf8");
      const rebased = source.replaceAll(/from "\.\//gu, `from "${pathToFileURL(libDir).href}/`);
      const mutated = mutate(rebased);
      assert.notEqual(mutated, rebased, `mutation ${name} must change the mirror`);
      const file = join(work, `mirror-${name}.mjs`); writeFileSync(file, mutated);
      return import(pathToFileURL(file).href);
    }
    test("a mirror that drops the unmapped-commit findings fails the gap assertion", async () => {
      const m = await mirror("nofindings", s => s.replace("report.findings = unmapped.map(", "report.findings = [].concat(unmapped.slice(0, 0)).map("));
      assert.throws(() => assertUnmappedImplementationIsSurfaced(report(A, A.c3, A.base, m), A), assert.AssertionError);
    });
    test("a mirror that counts an empty range as coverage fails the empty-range assertion", async () => {
      const m = await mirror("emptycoverage", s => s.replace("zeroApplicableRowsIsCoverage: false", "zeroApplicableRowsIsCoverage: true"));
      assert.throws(() => assertEmptyRangeIsNotCoverage(report(A, A.c3, A.c3, m)), assert.AssertionError);
    });
    test("the unmodified production function passes the same assertions", () => {
      assertUnmappedImplementationIsSurfaced(report(A, A.c3, A.base), A);
      assertEmptyRangeIsNotCoverage(report(A, A.c3, A.c3));
    });
  });
});
