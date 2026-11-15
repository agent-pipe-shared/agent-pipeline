// SPDX-License-Identifier: SUL-1.0
// C29e T10: the parallel reminder -- N from pipeline.user.yaml, the lock-free counter, and outputs without a permission decision.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PARALLEL_REMINDER,
  PARALLEL_REMINDER_DEFAULT_EVERY,
  parallelReminderCounterPath,
  parallelReminderEvery,
  parallelReminderPreToolUseStdout,
  parallelReminderSessionStartStdout,
  readParallelReminderEvery,
  tickParallelReminder,
} from "./parallel-reminder.mjs";

test("N: default when absent or invalid, the configured integer otherwise, 0 turns it off", () => {
  assert.equal(parallelReminderEvery(null), PARALLEL_REMINDER_DEFAULT_EVERY);
  assert.equal(parallelReminderEvery({}), 25);
  assert.equal(parallelReminderEvery({ session: { keep_awake: false } }), 25);
  assert.equal(parallelReminderEvery({ session: { parallel_reminder_every: 10 } }), 10);
  assert.equal(parallelReminderEvery({ session: { parallel_reminder_every: 0 } }), 0);
  for (const bad of [-1, 1001, 2.5, "10", true, null]) assert.equal(parallelReminderEvery({ session: { parallel_reminder_every: bad } }), 25, `invalid ${JSON.stringify(bad)} falls back`);
  assert.equal(parallelReminderEvery([]), 25);
});

test("N is read from the project's pipeline.user.yaml, fail-open to the default", () => {
  const root = mkdtempSync(join(tmpdir(), "parallel-reminder-root-"));
  try {
    assert.equal(readParallelReminderEvery(root), 25, "no file");
    writeFileSync(join(root, "pipeline.user.yaml"), "session:\n  keep_awake: false\n  parallel_reminder_every: 7\n");
    assert.equal(readParallelReminderEvery(root), 7);
    writeFileSync(join(root, "pipeline.user.yaml"), "session: { broken\n");
    assert.equal(readParallelReminderEvery(root), 25, "unreadable YAML");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the outputs add context only and never carry a permission decision", () => {
  const pre = JSON.parse(parallelReminderPreToolUseStdout());
  assert.deepEqual(pre, { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: PARALLEL_REMINDER } });
  const start = JSON.parse(parallelReminderSessionStartStdout());
  assert.deepEqual(start, { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: PARALLEL_REMINDER } });
  assert.match(PARALLEL_REMINDER, /^Parallel by default: /u);
  assert.match(PARALLEL_REMINDER, /never two heavy test suites at once/u);
});

test("the counter fires on the N-th, 2N-th call only, per session, under the once-per-session marker directory", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "parallel-reminder-common-"));
  try {
    const transcriptPath = "/x/session-a.jsonl";
    const fired = [];
    for (let call = 1; call <= 7; call += 1) if (tickParallelReminder({ commonDir, transcriptPath, every: 3 })) fired.push(call);
    assert.deepEqual(fired, [3, 6]);
    assert.equal(tickParallelReminder({ commonDir, transcriptPath: "/x/session-b.jsonl", every: 3 }), false, "another session counts on its own");
    assert.match(parallelReminderCounterPath(commonDir, transcriptPath), /agent-pipeline[\\/]dispatch-budget[\\/]orchestrator-seen[\\/]session-a\.calls$/u);
  } finally {
    rmSync(commonDir, { recursive: true, force: true });
  }
});

test("the counter is fail-open: N 0, a missing common dir or a write error mean no reminder", () => {
  assert.equal(tickParallelReminder({ commonDir: "/nonexistent", transcriptPath: "t.jsonl", every: 0 }), false);
  assert.equal(tickParallelReminder({ commonDir: "", transcriptPath: "t.jsonl", every: 1 }), false);
  const commonDir = mkdtempSync(join(tmpdir(), "parallel-reminder-fail-"));
  try {
    mkdirSync(join(commonDir, "agent-pipeline"));
    const fail = () => { throw new Error("EACCES"); };
    assert.equal(tickParallelReminder({ commonDir, transcriptPath: "t.jsonl", every: 1 }, { appendFileSyncFn: fail }), false);
  } finally {
    rmSync(commonDir, { recursive: true, force: true });
  }
});
