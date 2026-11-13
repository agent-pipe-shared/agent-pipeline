// SPDX-License-Identifier: SUL-1.0
// C28e (PO tile 2026-11-12, D242, ADR-0093): a Semgrep finding blocks only when the feature introduced it; older findings are listed, not blocking.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { baselineFeatureId, blockingFindings, existingInAddedFiles, existingSemgrepFindings, formatSemgrepBaselineLines, resolveSemgrepBaseline, unmatchedNewFindings } from "./semgrep-baseline.mjs";
import { featureRangeBase, featureRangeCommitSplit } from "./close-commit-split.mjs";
import { runSecurityScan } from "../scripts/security-scan.mjs";

const finding = (rule, path, line, severity = "high", tool = "semgrep") => ({ tool, severity, rule, path, line, msg: rule });

test("the verdict: a blocking-severity finding blocks unless the applied baseline names it as existing; other tools are never exempt", () => {
  const legacy = finding("r1", "/snap/a.py", 2);
  const fresh = finding("r1", "/snap/b.py", 2);
  const secret = finding("leak", "/snap/a.py", 2, "high", "gitleaks");
  const medium = finding("r2", "/snap/c.py", 1, "medium");
  const all = [legacy, fresh, secret, medium];
  assert.deepEqual(blockingFindings(all, ["critical", "high"]), [legacy, fresh, secret], "no baseline: every blocking severity blocks");
  const applied = { status: "applied", existing: [{ rule: "r1", path: "/snap/a.py", line: 2, severity: "high" }] };
  assert.deepEqual(blockingFindings(all, ["critical", "high"], applied), [fresh, secret]);
  assert.deepEqual(blockingFindings(all, ["critical", "high"], { ...applied, status: "unavailable" }), [legacy, fresh, secret], "an unavailable baseline exempts nothing");
});

test("existing findings are matched by rule, relative path and line across two worktrees; an unrelatable path is never existing", () => {
  const full = [finding("r1", "/one/tree/a.py", 2), finding("r1", "/one/tree/b.py", 2), finding("r1", "/elsewhere/c.py", 3), finding("r2", "/one/tree/d.py", 1, "medium")];
  const fresh = [finding("r1", "/two/tree/b.py", 2)];
  const rel = (root) => (path) => (path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null);
  const existing = existingSemgrepFindings(full, fresh, ["high"], { fullPath: rel("/one/tree"), newPath: rel("/two/tree") });
  assert.deepEqual(existing, [{ rule: "r1", path: "/one/tree/a.py", file: "a.py", line: 2, severity: "high" }]);
  const lines = formatSemgrepBaselineLines({ status: "applied", featureId: "probe-feature", commit: "a".repeat(40), existing, newCount: 1 });
  assert.match(lines[0], /1 finding\(s\) at a blocking severity existed before the feature and are listed, not blocking; 1 are new and block/u);
  assert.match(lines[1], /existing high r1 a\.py:2/u);
  assert.match(formatSemgrepBaselineLines({ status: "unavailable", code: "SEMGREP-BASELINE-NO-FEATURE", reason: "x" })[0], /Every Semgrep finding at a blocking severity blocks/u);
  assert.deepEqual(formatSemgrepBaselineLines({ status: "not-needed" }), []);
});

test("fail closed: a new finding without a counterpart in the full scan, or an existing finding in an added file, is detected", () => {
  const rel = (root) => (path) => (path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null);
  const full = [finding("tooling.rules.probe", "/one/a.py", 2), finding("tooling.rules.probe", "/one/b.py", 2)];
  assert.equal(unmatchedNewFindings(full, [finding("tooling.rules.probe", "/two/b.py", 2)], { fullPath: rel("/one"), newPath: rel("/two") }), 0);
  assert.equal(unmatchedNewFindings(full, [finding("tmp.x.tree.tooling.rules.probe", "/two/b.py", 2)], { fullPath: rel("/one"), newPath: rel("/two") }), 1, "a path-derived rule id that differs between the two worktrees");
  assert.equal(unmatchedNewFindings(full, [finding("tooling.rules.probe", "/elsewhere/b.py", 2)], { fullPath: rel("/one"), newPath: rel("/two") }), 1);
  const existing = [{ rule: "r", path: "/one/a.py", file: "a.py", line: 2, severity: "high" }, { rule: "r", path: "/one/new.py", file: "new.py", line: 1, severity: "high" }];
  assert.deepEqual(existingInAddedFiles(existing, ["new.py", "other.txt"]).map((entry) => entry.file), ["new.py"]);
  assert.deepEqual(existingInAddedFiles(existing, []), []);
});

test("the feature of the baseline: the active feature, else the last closed one, else none", () => {
  assert.equal(baselineFeatureId({ activeFeature: { id: "alpha-one" }, closedFeatures: [{ id: "beta-two" }] }), "alpha-one");
  assert.equal(baselineFeatureId({ activeFeature: null, closedFeatures: [{ id: "beta-two" }, { id: "gamma-three" }] }), "gamma-three");
  assert.equal(baselineFeatureId({ activeFeature: { id: "../x" } }), null);
  assert.equal(baselineFeatureId(null), null);
});

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}
function commitAll(root, message) {
  git(root, "add", "-A");
  git(root, "commit", "-qm", message);
  return git(root, "rev-parse", "HEAD");
}
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "semgrep-baseline-"));
  git(root, "init", "-q");
  git(root, "config", "user.name", "Baseline Fixture");
  git(root, "config", "user.email", "baseline-fixture@example.invalid");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "remote", "add", "origin", "https://example.invalid/pipeline/baseline-fixture.git");
  return root;
}
const writeState = (root, state, tier = "project") => { mkdirSync(join(root, tier), { recursive: true }); writeFileSync(join(root, tier, "pipeline-state.json"), `${JSON.stringify(state)}\n`); };

test("the baseline is the start of the feature range, shared with the close's commit count, and refused when it cannot be read", () => {
  const root = makeRepo();
  try {
    writeFileSync(join(root, "a.txt"), "one\n");
    writeState(root, { activeFeature: { id: "probe-feature" } });
    const before = commitAll(root, "before the feature");
    mkdirSync(join(root, "specs", "probe-feature"), { recursive: true });
    writeFileSync(join(root, "specs", "probe-feature", "spec.md"), "# spec\n");
    commitAll(root, "feature start");
    writeFileSync(join(root, "a.txt"), "two\n");
    commitAll(root, "feature work");
    assert.equal(featureRangeBase({ rootDir: root, featureId: "probe-feature" }).base, before);
    assert.equal(featureRangeCommitSplit({ rootDir: root, featureId: "probe-feature" }).base, before, "the close count uses the same start");
    const resolved = resolveSemgrepBaseline({ rootDir: root });
    assert.equal(resolved.status, "applied");
    assert.equal(resolved.commit, before);
    assert.equal(resolved.featureId, "probe-feature");
    writeState(root, { activeFeature: null, closedFeatures: [] });
    assert.equal(resolveSemgrepBaseline({ rootDir: root }).code, "SEMGREP-BASELINE-NO-FEATURE");
    writeState(root, { activeFeature: { id: "other-feature" } });
    assert.equal(resolveSemgrepBaseline({ rootDir: root }).code, "SEMGREP-BASELINE-RANGE-UNREADABLE");
    rmSync(join(root, "project"), { recursive: true, force: true });
    assert.equal(resolveSemgrepBaseline({ rootDir: root }).code, "SEMGREP-BASELINE-STATE-UNREADABLE");
    const notAncestor = (args) => (args[0] === "merge-base" ? { status: 1, stdout: "" } : spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }));
    writeState(root, { activeFeature: { id: "probe-feature" } });
    assert.equal(resolveSemgrepBaseline({ rootDir: root, runGit: notAncestor }).code, "SEMGREP-BASELINE-NOT-ANCESTOR");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const semgrepAvailable = spawnSync("semgrep", ["--version"], { encoding: "utf8", shell: false, timeout: 60000 }).status === 0;

test("the real chain: a new Semgrep finding blocks, a finding older than the feature is listed and does not block, no feature means all block", { skip: semgrepAvailable ? false : "semgrep is not installed" }, async () => {
  const root = makeRepo();
  try {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n\ngates:\n  security:\n    mode: blocking\n    type: automated\n\nsecurity:\n  scanners:\n    gitleaks:\n      enabled: false\n    osv-scanner:\n      enabled: false\n    semgrep:\n      enabled: true\n      rules_dir: \"tooling/rules\"\n    license-check:\n      enabled: false\n");
    mkdirSync(join(root, "tooling", "rules"), { recursive: true });
    writeFileSync(join(root, "tooling", "rules", "probe.yml"), "rules:\n  - id: probe-eval\n    languages: [python]\n    severity: ERROR\n    message: eval call\n    pattern: eval(...)\n");
    writeFileSync(join(root, "legacy.py"), "def old(x):\n    return eval(x)\n");
    // The manifest sits at the legacy tier (.claude/), so the project authority names .claude/pipeline-state.json.
    writeState(root, { activeFeature: { id: "probe-feature" } }, ".claude");
    const base = commitAll(root, "legacy code");
    mkdirSync(join(root, "specs", "probe-feature"), { recursive: true });
    writeFileSync(join(root, "specs", "probe-feature", "spec.md"), "# spec\n");
    commitAll(root, "feature start");
    writeFileSync(join(root, "legacy.py"), "# moved by one line\ndef old(x):\n    return eval(x)\n");
    writeFileSync(join(root, "fresh.py"), "def new(y):\n    return eval(y)\n");
    commitAll(root, "feature work with a new finding");
    const scanOnce = async () => runSecurityScan({ rootDir: root, env: process.env, timeoutMs: 120000, evidenceOutDir: join(root, "..", `${root.split(/[\\/]/u).at(-1)}-evidence`) });

    let { evidence, exitCode } = await scanOnce();
    let record = evidence.execution.semgrepBaseline;
    assert.equal(evidence.scanners[0].status, "FINDINGS", JSON.stringify(evidence.scanners[0]));
    assert.equal(record.status, "applied", JSON.stringify(record));
    assert.equal(record.commit, base);
    assert.deepEqual(record.existing.map((entry) => `${entry.file}:${entry.line}`), ["legacy.py:3"]);
    assert.equal(record.newCount, 1);
    assert.equal(record.worktreeCleanup, "removed");
    assert.equal(exitCode, 2, "the new finding blocks");

    rmSync(join(root, "fresh.py"));
    commitAll(root, "remove the new finding");
    ({ evidence, exitCode } = await scanOnce());
    record = evidence.execution.semgrepBaseline;
    assert.equal(record.status, "applied");
    assert.equal(record.newCount, 0);
    assert.equal(record.existing.length, 1);
    assert.equal(evidence.findings.length, 1, "the older finding stays in the evidence");
    assert.equal(exitCode, 0, "an older finding is listed and does not block");

    writeState(root, { activeFeature: null, closedFeatures: [] }, ".claude");
    commitAll(root, "no feature named");
    ({ evidence, exitCode } = await scanOnce());
    assert.equal(evidence.execution.semgrepBaseline.code, "SEMGREP-BASELINE-NO-FEATURE");
    assert.equal(exitCode, 2, "without a baseline every blocking-severity finding blocks");

    assert.equal(git(root, "worktree", "list", "--porcelain").split("\n").filter((line) => line.startsWith("worktree ")).length, 1, "no worktree is left behind");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(join(root, "..", `${root.split(/[\\/]/u).at(-1)}-evidence`), { recursive: true, force: true });
  }
});
