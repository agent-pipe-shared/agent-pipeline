// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, openSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { captureAgyHostCommitBaseline, assessAgyHostCommit, observeAgyHostHead } from "./agy-host-commit-admission.mjs";
import { nativeGoldfishHookMessage } from "../hooks/native-goldfish-host.mjs";
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

test("AHC07 names the unignored Pipeline working files instead of a bare path mismatch, and still admits once they are ignored", () => fixture((context) => {
  const route = "evidence/dispatch-route-ALF-X.json";
  const writeRoute = () => { mkdirSync(join(context.root, "evidence"), { recursive: true }); writeFileSync(join(context.root, route), "{}\n"); };
  const baseline = capture(context);
  writeFileSync(join(context.root, "src", "one.mjs"), "export const one = 2;\n");
  writeRoute();
  const named = assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/one.mjs"] });
  assert.equal(named.code, "AGY-HOST-COMMIT-PIPELINE-PATH-UNIGNORED");
  assert.deepEqual(named.pipelinePaths, [route]);
  mkdirSync(join(context.root, "scratch", "pkg"), { recursive: true });
  writeFileSync(join(context.root, "scratch", "pkg", "x.txt"), "x\n");
  assert.deepEqual(assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/one.mjs"] }).pipelinePaths, [route, "scratch/pkg/x.txt"]);
  // A mismatch that the Pipeline paths do not explain keeps the unchanged refusal.
  assert.equal(assessAgyHostCommit({ baseline, final: { changedPaths: ["src/other.mjs"] }, allowedPaths: ["src/other.mjs"] }).code, "AGY-HOST-COMMIT-PATH-MISMATCH");
  // Control: the same dispatch in a project that ignores the working directories before the baseline is admitted.
  rmSync(join(context.root, "evidence"), { recursive: true, force: true });
  rmSync(join(context.root, "scratch"), { recursive: true, force: true });
  context.git("checkout", "--", "src/one.mjs");
  writeFileSync(join(context.root, ".gitignore"), "/evidence/\n/scratch/\n");
  context.git("add", ".gitignore");
  context.git("commit", "-qm", "ignore the Pipeline working directories");
  const ignored = capture({ ...context, candidateCommit: context.git("rev-parse", "HEAD") });
  writeFileSync(join(context.root, "src", "one.mjs"), "export const one = 2;\n");
  writeRoute();
  assert.equal(assessAgyHostCommit({ baseline: ignored, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/one.mjs"] }).code, "AGY-HOST-COMMIT-ADMITTED");
}));

test("AHC08 the host hook prints a runnable repair for the unignored Pipeline paths", () => {
  const message = nativeGoldfishHookMessage({ status: "recovery-required", code: "AGY-HOST-COMMIT-PIPELINE-PATH-UNIGNORED", commit: null, record: null });
  assert.match(message, /AGY-HOST-COMMIT-PIPELINE-PATH-UNIGNORED/u);
  assert.match(message, /Repair: add the lines \/evidence\/ and \/scratch\/ to the project's \.gitignore and commit that change/u);
  assert.match(message, /Orchestrator route[^:]*: .*Dispatch: <dispatchId> \(goldfish\).*dispatch-record-write\.mjs/u);
  assert.match(message, /No commit or authorship record is claimed/u);
});

test("AHC09 AC-164: a drift names which sub-condition fired and the staged paths, code unchanged", () => fixture((context) => {
  const baseline = capture(context);
  writeFileSync(join(context.root, "src", "one.mjs"), "export const one = 2;\n");
  context.git("add", "src/one.mjs");
  const staged = assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/one.mjs"] });
  assert.equal(staged.code, "AGY-HOST-COMMIT-DRIFT");
  assert.deepEqual(staged.detail, { conditions: ["index-staged"], stagedPaths: ["src/one.mjs"] });
  context.git("commit", "-qm", "other actor");
  const moved = assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/one.mjs"] });
  assert.equal(moved.code, "AGY-HOST-COMMIT-DRIFT");
  assert.deepEqual(moved.detail, { conditions: ["head-moved"] });
}));

test("AHC10 AC-164: a path mismatch names the extra and the missing paths, at most five each, repository-relative", () => fixture((context) => {
  const baseline = capture(context);
  writeFileSync(join(context.root, "src", "one.mjs"), "export const one = 2;\n");
  mkdirSync(join(context.root, "docs"));
  for (let i = 0; i < 7; i += 1) writeFileSync(join(context.root, "docs", `n${i}.md`), "x\n");
  const result = assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs", "src/never.mjs"] }, allowedPaths: ["src/one.mjs", "src/never.mjs"] });
  assert.equal(result.code, "AGY-HOST-COMMIT-PATH-MISMATCH");
  assert.deepEqual(result.detail.extraPaths, [0, 1, 2, 3, 4].map((i) => `docs/n${i}.md`));
  assert.deepEqual(result.detail.missingPaths, ["src/never.mjs"]);
  assert.equal(result.detail.extraCount, 7);
  assert.equal(JSON.stringify(result).includes(context.root), false);
}));

test("AHC11 AC-164: a consent-path refusal names the paths outside the consent", () => fixture((context) => {
  const baseline = capture(context);
  writeFileSync(join(context.root, "src", "one.mjs"), "export const one = 2;\n");
  const consent = assessAgyHostCommit({ baseline, final: { changedPaths: ["src/one.mjs"] }, allowedPaths: ["src/other.mjs"] });
  assert.equal(consent.code, "AGY-HOST-COMMIT-CONSENT-PATH");
  assert.deepEqual(consent.detail, { outsideAllowed: ["src/one.mjs"] });
}));

test("AHC12 AC-164: the hook notice prints a short sentence derived from the code and the detail", () => {
  const result = { status: "recovery-required", code: "AGY-HOST-COMMIT-PATH-MISMATCH", commit: null, record: null,
    detail: { extraPaths: ["docs/n0.md"], missingPaths: ["src/never.mjs"], extraCount: 1 } };
  const message = nativeGoldfishHookMessage(result);
  assert.match(message, /AGY-HOST-COMMIT-PATH-MISMATCH/u);
  assert.match(message, /docs\/n0\.md/u);
  assert.match(message, /src\/never\.mjs/u);
  const stop = nativeGoldfishHookMessage(null, { stopFailure: { code: "AGY-HOST-COMMIT-DRIFT", dispatchId: "X-1", observedAt: "2026-11-02T00:00:00.000Z",
    stage: null, reason: null, detail: { conditions: ["head-moved"] } } });
  assert.match(stop, /AGY-HOST-COMMIT-DRIFT/u);
  assert.match(stop, /head-moved/u);
});

assert.equal(cases.length, 12, "the complete Agy Host Commit Admission corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
