// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessAgyHostCommit, captureAgyHostCommitBaseline } from "./agy-host-commit-admission.mjs";
import { commitAdmittedNativeGoldfishReturn } from "./agy-host-commit-execution.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

function git(root, ...args) {
  const run = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "native-goldfish-host-commit-"));
  try {
    git(root, "init", "-q"); git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid"); git(root, "config", "commit.gpgsign", "false");
    writeFileSync(join(root, "file.txt"), "before\n"); git(root, "add", "--", "file.txt");
    git(root, "commit", "-q", "-m", "fixture baseline");
    const parent = git(root, "rev-parse", "HEAD");
    const baseline = captureAgyHostCommitBaseline({ root, candidateCommit: parent, resultPath: "scratch/native-return.json" });
    assert.equal(baseline.ok, true, baseline.code);
    return run({ root, parent, baseline: baseline.baseline });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function admitted({ baseline, runner, taskId }) {
  const input = { baseline, final: { outcome: "succeeded", changedPaths: ["file.txt"] }, allowedPaths: ["file.txt"] };
  const priorAdmission = assessAgyHostCommit(input);
  assert.equal(priorAdmission.ok, true, priorAdmission.code);
  return commitAdmittedNativeGoldfishReturn({ ...input, runner, taskId, priorAdmission });
}

const cases = [
  { id: "NGHC01", name: "Claude and Codex host routes commit only the admitted return and read back their own marker", run: () => {
    for (const runner of ["claude", "codex"]) fixture(({ root, parent, baseline }) => {
      writeFileSync(join(root, "file.txt"), `${runner} return\n`);
      const taskId = `NATIVE-${runner.toUpperCase()}-1`;
      const result = admitted({ baseline, runner, taskId });
      assert.equal(result.ok, true, result.code);
      assert.equal(result.parent, parent);
      assert.deepEqual(result.paths, ["file.txt"]);
      assert.equal(git(root, "rev-parse", "HEAD"), result.commit);
      const message = git(root, "log", "-1", "--format=%B");
      assert.match(message, new RegExp(`Dispatch: ${taskId} \\(goldfish\\)`));
      assert.match(message, new RegExp(`Native-Host-Observed: v1 \\(${runner}\\)`));
      assert.doesNotMatch(message, /Agy-Host-Observed/u);
      assert.equal(git(root, "status", "--porcelain"), "");
    });
  } },
  { id: "NGHC02", name: "normal Git hooks remain enabled on the native host-commit route", run: () => fixture(({ root, parent, baseline }) => {
    const marker = join(root, ".git", "hook-invoked");
    mkdirSync(join(root, ".git", "hooks"), { recursive: true });
    const hook = join(root, ".git", "hooks", "pre-commit");
    writeFileSync(hook, `#!/bin/sh\nprintf invoked > "${marker}"\nexit 1\n`); chmodSync(hook, 0o700);
    writeFileSync(join(root, "file.txt"), "after\n");
    const result = admitted({ baseline, runner: "codex", taskId: "NATIVE-CODEX-2" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "NATIVE-HOST-COMMIT-GUARD-OR-GIT-FAILED");
    assert.equal(readFileSync(marker, "utf8"), "invoked");
    assert.equal(git(root, "rev-parse", "HEAD"), parent);
  }) },
];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
for (const item of cases) item.run();
process.stdout.write(`${cases.length} native Goldfish commit-execution cases passed\n`);
