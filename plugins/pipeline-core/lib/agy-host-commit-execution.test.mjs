// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessAgyHostCommit, captureAgyHostCommitBaseline } from "./agy-host-commit-admission.mjs";
import { commitAdmittedAgyReturn } from "./agy-host-commit-execution.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function test(name, run) { cases.push({ id: name.slice(0, 5), name: name.slice(6), run }); }

function git(root, ...args) {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "agy-host-commit-execution-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    git(root, "config", "commit.gpgsign", "false");
    writeFileSync(join(root, "file.txt"), "before\n");
    git(root, "add", "--", "file.txt");
    git(root, "commit", "-q", "-m", "fixture baseline");
    const parent = git(root, "rev-parse", "HEAD");
    const capture = captureAgyHostCommitBaseline({ root, candidateCommit: parent, resultPath: "scratch/return.json" });
    assert.equal(capture.ok, true, capture.code);
    return run({ root, parent, baseline: capture.baseline });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function commitFromObservedAdmission(input, dependencies) {
  const prior = assessAgyHostCommit(input);
  return commitAdmittedAgyReturn({ ...input, priorAdmission: prior }, dependencies);
}

test("AHE01 stages only the admitted child diff, runs normal commit and reads its exact parent/tree/paths", () => fixture(({ root, parent, baseline }) => {
  writeFileSync(join(root, "file.txt"), "after\n");
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-1",
  });
  assert.equal(result.ok, true, result.code);
  assert.equal(result.parent, parent);
  assert.deepEqual(result.paths, ["file.txt"]);
  assert.equal(git(root, "rev-parse", "HEAD"), result.commit);
  assert.equal(git(root, "show", "HEAD:file.txt"), "after");
  assert.match(git(root, "log", "-1", "--format=%B"), /Dispatch: AGY-EXAMPLE-1 \(goldfish\)/u);
  assert.match(git(root, "log", "-1", "--format=%B"), /^Agy-Host-Observed: v1$/mu);
  assert.equal(git(root, "status", "--porcelain"), "");
}));

test("AHE02 a path mismatch cannot stage or commit unrelated work", () => fixture(({ root, parent, baseline }) => {
  writeFileSync(join(root, "file.txt"), "after\n");
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["other.txt"] },
    allowedPaths: ["file.txt", "other.txt"], taskId: "AGY-EXAMPLE-2",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-PATH-MISMATCH");
  assert.equal(git(root, "rev-parse", "HEAD"), parent);
  assert.equal(git(root, "diff", "--cached", "--name-only"), "");
}));

test("AHE03 a real pre-commit hook may refuse the commit; no bypass or false success occurs", () => fixture(({ root, parent, baseline }) => {
  const marker = join(root, ".git", "hook-was-invoked");
  const hook = join(root, ".git", "hooks", "pre-commit");
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  writeFileSync(hook, `#!/bin/sh\nprintf invoked > "${marker}"\nexit 1\n`);
  chmodSync(hook, 0o700);
  writeFileSync(join(root, "file.txt"), "after\n");
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-3",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-GUARD-OR-GIT-FAILED");
  assert.equal(readFileSync(marker, "utf8"), "invoked");
  assert.equal(git(root, "rev-parse", "HEAD"), parent);
  assert.equal(git(root, "diff", "--cached", "--name-only"), "file.txt");
}));

test("AHE04 a hook-mutated staged tree cannot pass the exact commit readback", () => fixture(({ root, parent, baseline }) => {
  const hook = join(root, ".git", "hooks", "pre-commit");
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  writeFileSync(hook, "#!/bin/sh\nprintf 'changed by hook\\n' > file.txt\ngit add -- file.txt\n");
  chmodSync(hook, 0o700);
  writeFileSync(join(root, "file.txt"), "after\n");
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-4",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-READBACK-MISMATCH");
  assert.notEqual(git(root, "rev-parse", "HEAD"), parent);
  assert.equal(git(root, "show", "HEAD:file.txt"), "changed by hook");
}));

test("AHE05 inherited Git index controls cannot redirect host staging or commit", () => fixture(({ root, parent, baseline }) => {
  const alternateIndex = join(root, ".git", "alternate-index");
  writeFileSync(join(root, "file.txt"), "after\n");
  const previous = process.env.GIT_INDEX_FILE;
  let result;
  try {
    process.env.GIT_INDEX_FILE = alternateIndex;
    result = commitFromObservedAdmission({
      baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
      allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-5",
    });
  } finally {
    if (previous === undefined) delete process.env.GIT_INDEX_FILE;
    else process.env.GIT_INDEX_FILE = previous;
  }
  assert.equal(result.ok, true, result.code);
  assert.equal(result.parent, parent);
  assert.equal(existsSync(alternateIndex), false);
  assert.equal(git(root, "rev-parse", "HEAD"), result.commit);
}));

test("AHE06 a commit written before a failed process response stays recovery-required, never no-delivery", () => fixture(({ root, parent, baseline }) => {
  writeFileSync(join(root, "file.txt"), "after\n");
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-6",
  }, { spawnSync(command, args, options) {
    const actual = spawnSync(command, args, options);
    if (args[2] === "commit" && actual.status === 0) {
      return { status: 7, stdout: actual.stdout, stderr: actual.stderr };
    }
    return actual;
  } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-OUTCOME-UNKNOWN");
  assert.match(result.commit, /^[a-f0-9]{40}$/u);
  assert.notEqual(result.commit, parent);
  assert.equal(git(root, "rev-parse", "HEAD"), result.commit);
  assert.equal(git(root, "show", "HEAD:file.txt"), "after");
}));

test("AHE07 a timed-out commit with unchanged HEAD is still recovery-required", () => fixture(({ root, parent, baseline }) => {
  writeFileSync(join(root, "file.txt"), "after\n");
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-7",
  }, { spawnSync(command, args, options) {
    if (args[2] === "commit") return { status: null, error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) };
    return spawnSync(command, args, options);
  } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-OUTCOME-UNKNOWN");
  assert.equal(result.commit, parent);
  assert.equal(git(root, "diff", "--cached", "--name-only"), "file.txt");
}));

test("AHE08 same-path content changed after admission cannot enter the host commit", () => fixture(({ root, parent, baseline }) => {
  writeFileSync(join(root, "file.txt"), "admitted\n");
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-8",
  }, { spawnSync(command, args, options) {
    if (args[2] === "add") writeFileSync(join(root, "file.txt"), "raced content\n");
    return spawnSync(command, args, options);
  } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-CONTENT-DRIFT");
  assert.equal(git(root, "rev-parse", "HEAD"), parent);
  assert.equal(git(root, "show", ":file.txt"), "raced content");
}));

test("AHE09 an admitted deletion has no staged blob and still commits truthfully", () => fixture(({ root, parent, baseline }) => {
  rmSync(join(root, "file.txt"));
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-9",
  });
  assert.equal(result.ok, true, result.code);
  assert.equal(result.parent, parent);
  assert.deepEqual(result.paths, ["file.txt"]);
  assert.equal(git(root, "ls-files", "--", "file.txt"), "");
}));

test("AHE10 a same-path change after the host's first admission is refused before staging", () => fixture(({ root, parent, baseline }) => {
  writeFileSync(join(root, "file.txt"), "observed after return\n");
  const input = { baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-10" };
  const priorAdmission = assessAgyHostCommit(input);
  assert.equal(priorAdmission.ok, true, priorAdmission.code);
  writeFileSync(join(root, "file.txt"), "replaced before commit\n");
  const result = commitAdmittedAgyReturn({ ...input, priorAdmission });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-PRIOR-ADMISSION-DRIFT");
  assert.equal(git(root, "rev-parse", "HEAD"), parent);
  assert.equal(git(root, "diff", "--cached", "--name-only"), "");
}));

test("AHE11 no host-held prior admission cannot mint a commit", () => fixture(({ root, parent, baseline }) => {
  writeFileSync(join(root, "file.txt"), "after\n");
  const result = commitAdmittedAgyReturn({ baseline,
    final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-11" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-PRIOR-ADMISSION-DRIFT");
  assert.equal(git(root, "rev-parse", "HEAD"), parent);
  assert.equal(git(root, "diff", "--cached", "--name-only"), "");
}));

test("AHE12 a commit-msg hook cannot silently replace the admitted Dispatch trailer", () => fixture(({ root, parent, baseline }) => {
  const hook = join(root, ".git", "hooks", "commit-msg");
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  writeFileSync(hook, "#!/bin/sh\nsed -i 's/AGY-EXAMPLE-12/OTHER-DISPATCH/' \"$1\"\n");
  chmodSync(hook, 0o700);
  writeFileSync(join(root, "file.txt"), "after\n");
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-12",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-READBACK-MISMATCH");
  assert.notEqual(git(root, "rev-parse", "HEAD"), parent);
  assert.match(git(root, "log", "-1", "--format=%B"), /Dispatch: OTHER-DISPATCH/u);
}));

test("AHE13 a concurrent HEAD advance during readback cannot produce authored success", () => fixture(({ root, parent, baseline }) => {
  writeFileSync(join(root, "file.txt"), "after\n");
  let advanced = false;
  const result = commitFromObservedAdmission({
    baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] },
    allowedPaths: ["file.txt"], taskId: "AGY-EXAMPLE-13",
  }, { spawnSync(command, args, options) {
    const actual = spawnSync(command, args, options);
    if (!advanced && args[2] === "cat-file" && actual.status === 0) {
      advanced = true;
      git(root, "commit", "--allow-empty", "-qm", "concurrent host commit");
    }
    return actual;
  } });
  assert.equal(advanced, true);
  assert.equal(result.ok, false);
  assert.equal(result.code, "AGY-HOST-COMMIT-READBACK-MISMATCH");
  assert.notEqual(result.commit, parent);
  assert.notEqual(git(root, "rev-parse", "HEAD"), result.commit);
}));

assert.equal(cases.length, 13, "the complete Agy Host Commit Execution corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
