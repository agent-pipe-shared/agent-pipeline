// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, openSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureAgyHostCommitBaseline, assessAgyHostCommit, observeAgyHostHead } from "./agy-host-commit-admission.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function test(name, run) { cases.push({ id: name.slice(0, 5), name: name.slice(6), run }); }

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "agy-host-commit-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "one.mjs"), "export const one = 1;\n");
    git("add", "src/one.mjs");
    git("commit", "-qm", "fixture");
    const candidateCommit = git("rev-parse", "HEAD");
    return run({ root, git, candidateCommit, resultPath: "results/agy.json" });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function capture(context) {
  const result = captureAgyHostCommitBaseline(context);
  assert.equal(result.ok, true, result.code);
  return result.baseline;
}

test("AHC01 admits only an exact, consent-bound diff after a clean baseline", () => fixture((context) => {
  const baseline = capture(context);
  writeFileSync(join(context.root, "src", "one.mjs"), "export const one = 2;\n");
  mkdirSync(join(context.root, "results"));
  writeFileSync(join(context.root, context.resultPath), "transport result\n");
  const result = assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/one.mjs"] });
  assert.equal(result.code, "AGY-HOST-COMMIT-ADMITTED");
  assert.deepEqual(result.paths, ["src/one.mjs"]);
  assert.equal(context.git("status", "--porcelain").includes("M src/one.mjs"), true);
}));

test("AHC02 refuses mismatched child claims and paths outside consent", () => fixture((context) => {
  const baseline = capture(context);
  writeFileSync(join(context.root, "src", "one.mjs"), "export const one = 2;\n");
  assert.equal(assessAgyHostCommit({ baseline, final: { changedPaths: ["src/other.mjs"] }, allowedPaths: ["src/other.mjs"] }).code, "AGY-HOST-COMMIT-PATH-MISMATCH");
  assert.equal(assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/other.mjs"] }).code, "AGY-HOST-COMMIT-CONSENT-PATH");
}));

test("AHC03 refuses a changed HEAD or a staged file", () => fixture((context) => {
  const baseline = capture(context);
  assert.equal(observeAgyHostHead({ baseline }).code, "AGY-HOST-HEAD-UNCHANGED");
  writeFileSync(join(context.root, "src", "one.mjs"), "export const one = 2;\n");
  context.git("add", "src/one.mjs");
  assert.equal(assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/one.mjs"] }).code, "AGY-HOST-COMMIT-DRIFT");
  context.git("commit", "-qm", "other actor");
  assert.equal(assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/one.mjs"] }).code, "AGY-HOST-COMMIT-DRIFT");
  assert.equal(observeAgyHostHead({ baseline }).code, "AGY-HOST-HEAD-DRIFT");
  assert.equal(observeAgyHostHead({ baseline: { ...baseline, root: "/not-the-repository" } }).code, "AGY-HOST-HEAD-INPUT");
}));

test("AHC04 preserves preexisting untracked input and detects its mutation", () => fixture((context) => {
  writeFileSync(join(context.root, "request.json"), "original\n");
  const baseline = capture(context);
  writeFileSync(join(context.root, "request.json"), "changed\n");
  writeFileSync(join(context.root, "src", "one.mjs"), "export const one = 2;\n");
  assert.equal(assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/one.mjs"] }).code, "AGY-HOST-COMMIT-BASELINE-CHANGED");
}));

test("AHC05 rejects result collisions, symlinks and forged baseline entries", () => fixture((context) => {
  mkdirSync(join(context.root, "results"));
  writeFileSync(join(context.root, context.resultPath), "already present\n");
  assert.equal(captureAgyHostCommitBaseline(context).code, "AGY-HOST-BASELINE-RESULT-COLLISION");
  rmSync(join(context.root, context.resultPath));
  const baseline = capture(context);
  symlinkSync(join(context.root, "src", "one.mjs"), join(context.root, "src", "link.mjs"));
  assert.equal(assessAgyHostCommit({ baseline, final: { changedPaths: ["src/link.mjs"] }, allowedPaths: ["src/link.mjs"] }).code, "AGY-HOST-COMMIT-PATH-UNSAFE");
  assert.equal(assessAgyHostCommit({ baseline: { ...baseline, untracked: [{ path: "request.json", sha256: "not-a-digest" }] }, final: { changedPaths: ["src/link.mjs"] }, allowedPaths: ["src/link.mjs"] }).code, "AGY-HOST-COMMIT-INPUT");
}));

test("AHC06 rejects a rename unless both old and new paths are declared and allowed", () => fixture((context) => {
  const baseline = capture(context);
  context.git("mv", "src/one.mjs", "src/two.mjs");
  context.git("reset", "-q", "HEAD");
  assert.equal(assessAgyHostCommit({ baseline, final: { changedPaths: ["src/two.mjs"] }, allowedPaths: ["src/two.mjs"] }).code, "AGY-HOST-COMMIT-PATH-MISMATCH");
  const result = assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs", "src/two.mjs"] }, allowedPaths: ["src/one.mjs", "src/two.mjs"] });
  assert.equal(result.code, "AGY-HOST-COMMIT-ADMITTED");
}));

assert.equal(cases.length, 6, "the complete Agy Host Commit Admission corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
