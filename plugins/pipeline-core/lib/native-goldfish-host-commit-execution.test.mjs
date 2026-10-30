// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { assessAgyHostCommit, captureAgyHostCommitBaseline } from "./agy-host-commit-admission.mjs";
import { commitAdmittedNativeGoldfishReturn } from "./agy-host-commit-execution.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import * as hook from "../hooks/native-goldfish-host.mjs";

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
  { id: "NGHC03", name: "an async launch without pending state says no pending state existed, names the stored preparation code and does not blame a missing final return", run: () => {
    const message = hook.nativeGoldfishHookMessage({ status: "recovery-required", code: "NGHF-PENDING-UNAVAILABLE",
      reason: "async-launch", preparationCode: "NGHS-CLAUDE-FOREGROUND-REQUIRED", commit: null, record: null });
    assert.match(message, /\(NGHF-PENDING-UNAVAILABLE\)/u);
    assert.match(message, /no pending host-commit state existed/u);
    assert.match(message, /NGHS-CLAUDE-FOREGROUND-REQUIRED/u);
    assert.match(message, /background/u);
    assert.doesNotMatch(message, /no final return reached/u);
  } },
  { id: "NGHC04", name: "the advice does not recommend the record writer for a v4 authored-commit Claude record it refuses and does not claim host-observed evidence", run: () => {
    for (const reason of ["async-launch", "no-pending"]) {
      const message = hook.nativeGoldfishHookMessage({ status: "recovery-required", code: "NGHF-PENDING-UNAVAILABLE",
        reason, commit: null, record: null });
      assert.match(message, /Dispatch: <dispatchId> \(goldfish\)/u, reason);
      assert.doesNotMatch(message, /write the dispatch record via/u, reason);
      assert.match(message, /dispatch-record-write\.mjs refuses/u, reason);
      assert.match(message, /not host-observed evidence/u, reason);
      assert.doesNotMatch(message, /NGHS-/u, reason);
    }
  } },
  { id: "NGHC05", name: "a stop-failure diagnostic is read back as its newest code and dispatch, and an absent or malformed one reads as none", run: () => {
    const commonDir = mkdtempSync(join(tmpdir(), "native-goldfish-diag-"));
    try {
      assert.equal(hook.readNativeGoldfishStopFailure({ commonDir }), null);
      const diagnostics = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-diagnostics");
      mkdirSync(diagnostics, { recursive: true });
      const write = (name, body) => writeFileSync(join(diagnostics, name), typeof body === "string" ? body : `${JSON.stringify(body)}\n`);
      write("stop-failure-aaa.json", { schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "OLD-1",
        toolUseId: "t1", status: "recovery-required", code: "NGHF-OLD", commit: null, observedAt: "2026-10-27T10:00:00.000Z" });
      write("stop-failure-bbb.json", { schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "NEW-2",
        toolUseId: "t2", status: "recovery-required", code: "NGHF-COMMIT-ADMISSION", commit: null, observedAt: "2026-10-27T11:00:00.000Z" });
      write("stop-failure-ccc.json", "{not json");
      const failure = hook.readNativeGoldfishStopFailure({ commonDir });
      assert.equal(failure.code, "NGHF-COMMIT-ADMISSION");
      assert.equal(failure.dispatchId, "NEW-2");
    } finally { rmSync(commonDir, { recursive: true, force: true }); }
  } },
  { id: "NGHC06", name: "a failed background host commit is shown in the PostToolUse message, alone when nothing else applies, and absent when none exists", run: () => {
    const failure = { code: "NGHF-COMMIT-ADMISSION", dispatchId: "NEW-2", observedAt: "2026-10-27T11:00:00.000Z" };
    const alone = hook.nativeGoldfishHookMessage({ status: "not-applicable", code: "NGHF-NOT-APPLICABLE" }, { stopFailure: failure });
    assert.match(alone, /NGHF-COMMIT-ADMISSION/u);
    assert.match(alone, /NEW-2/u);
    assert.match(alone, /No commit or authorship record is claimed/u);
    const joined = hook.nativeGoldfishHookMessage({ status: "recovery-required", code: "NGHF-PENDING-UNAVAILABLE",
      reason: "async-launch", commit: null, record: null }, { stopFailure: failure });
    assert.match(joined, /\(NGHF-PENDING-UNAVAILABLE\)/u);
    assert.match(joined, /NGHF-COMMIT-ADMISSION/u);
    assert.equal(hook.nativeGoldfishHookMessage({ status: "not-applicable", code: "NGHF-NOT-APPLICABLE" }, { stopFailure: null }), null);
    assert.equal(hook.nativeGoldfishHookMessage({ status: "not-applicable", code: "NGHF-NOT-APPLICABLE" }), null);
    const stopped = hook.nativeGoldfishHookMessage({ status: "recovery-required", code: "NGHF-COMMIT-ADMISSION", commit: null, record: null });
    assert.match(stopped, /NGHF-COMMIT-ADMISSION/u);
  } },
  { id: "NGHC07", name: "PF-70: a recorded stage and reason are read back and named in the stop notice; an older record without them reads as null", run: () => {
    const commonDir = mkdtempSync(join(tmpdir(), "native-goldfish-diag-"));
    try {
      const diagnostics = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-diagnostics");
      mkdirSync(diagnostics, { recursive: true });
      writeFileSync(join(diagnostics, "stop-failure-ddd.json"), `${JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "OLD-3",
        toolUseId: "t3", status: "recovery-required", code: "NGHF-OLD", commit: null, observedAt: "2026-10-30T05:00:00.000Z" })}\n`);
      assert.equal(hook.readNativeGoldfishStopFailure({ commonDir }).stage, null);
      assert.equal(hook.readNativeGoldfishStopFailure({ commonDir }).reason, null);
      writeFileSync(join(diagnostics, "stop-failure-eee.json"), `${JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "NEW-4",
        toolUseId: "t4", status: "recovery-required", code: "SDC-AUTHORITY-UNAVAILABLE", stage: "attempt-inspection", reason: "state-write-handle-unavailable",
        commit: null, observedAt: "2026-10-30T06:30:18.650Z" })}\n`);
      const failure = hook.readNativeGoldfishStopFailure({ commonDir });
      assert.equal(failure.stage, "attempt-inspection");
      assert.equal(failure.reason, "state-write-handle-unavailable");
      const message = hook.nativeGoldfishHookMessage({ status: "not-applicable", code: "NGHF-NOT-APPLICABLE" }, { stopFailure: failure });
      assert.match(message, /SDC-AUTHORITY-UNAVAILABLE; stage attempt-inspection, reason state-write-handle-unavailable/u);
    } finally { rmSync(commonDir, { recursive: true, force: true }); }
  } },
];

const fd =process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w") : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
for (const item of cases) item.run();
process.stdout.write(`${cases.length} native Goldfish commit-execution cases passed\n`);
