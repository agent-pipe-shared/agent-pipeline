// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hostCommitWaitCommand, writeNativeGoldfishStopOutcome } from "../lib/native-goldfish-stop-outcome.mjs";
import { waitForHostCommit } from "./wait-host-commit.mjs";

const SCRIPT = fileURLToPath(new URL("./wait-host-commit.mjs", import.meta.url));
const AFTER = "2026-11-10T08:00:00.000Z";
const at = (iso) => () => new Date(iso);
const inside = (body) => { const commonDir = mkdtempSync(join(tmpdir(), "whc-")); try { return body(commonDir); } finally { rmSync(commonDir, { recursive: true, force: true }); } };
const clock = () => { let t = 0; return { now: () => t, pause: (ms) => { t += ms; } }; };
const COMMITTED = { status: "authored-commit-recorded", code: "NGHF-AUTHORED-RECORD-VERIFIED", commit: "a".repeat(40), integration: { status: "integrated" } };

test("a finished stop answers at once with its commit and tells the agent to go on in this turn", () => inside((commonDir) => {
  writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "fix-1", result: COMMITTED, message: "ok", now: at("2026-11-10T08:00:30.000Z") });
  const { exitCode, result } = waitForHostCommit({ root: "unused", dispatch: "fix-1", after: AFTER }, { commonDir, ...clock() });
  assert.equal(exitCode, 0);
  assert.equal(result.status, "committed");
  assert.equal(result.commit, COMMITTED.commit);
  assert.equal(result.integration, "integrated");
  assert.match(result.message, /same turn/u);
}));

// C29 K-38 (Glossover): "integration":"refused" came back without a reason, and the Elephant could not tell whether a step was needed.
test("C29 K-38: a refused Main integration names its code and reason and says the delivery is committed and not re-dispatched", () => inside((commonDir) => {
  const refused = { ...COMMITTED, integration: { status: "refused", code: "SDC-AUTHORITY-CAS", reason: "reference-preimage-changed" } };
  writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "fix-1", result: refused, message: "ok", now: at("2026-11-10T08:00:30.000Z") });
  const { exitCode, result } = waitForHostCommit({ root: "unused", dispatch: "fix-1", after: AFTER }, { commonDir, ...clock() });
  assert.equal(exitCode, 0);
  assert.equal(result.status, "committed");
  assert.equal(result.integration, "refused");
  assert.equal(result.integrationCode, "SDC-AUTHORITY-CAS");
  assert.equal(result.integrationReason, "reference-preimage-changed");
  assert.match(result.message, /refused \(SDC-AUTHORITY-CAS: reference-preimage-changed\)/u);
  assert.match(result.message, /do not re-dispatch/u);
  assert.match(result.message, /Dispatch: fix-1 \(goldfish\)/u);
  assert.match(result.message, /the stop recorded no slice id/u, "without a recorded slice id the release stays conditional");
  // With the recorded slice id the message states the fact: the same id releases the dependents, a different one does not.
  writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "fix-3", result: { ...refused, delivery: { pendingSha256: "a".repeat(64), sliceId: "fix-3" } }, message: "ok", now: at("2026-11-10T08:00:30.000Z") });
  const same = waitForHostCommit({ root: "unused", dispatch: "fix-3", after: AFTER }, { commonDir, ...clock() }).result;
  assert.equal(same.sliceId, "fix-3");
  assert.match(same.message, /names slice fix-3, so the commit evidence releases its dependents/u);
  writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "fix-4", result: { ...refused, delivery: { pendingSha256: "a".repeat(64), sliceId: "ITEM-B" } }, message: "ok", now: at("2026-11-10T08:00:30.000Z") });
  const other = waitForHostCommit({ root: "unused", dispatch: "fix-4", after: AFTER }, { commonDir, ...clock() }).result;
  assert.match(other.message, /names fix-4 but the slice is ITEM-B, so the commit evidence does not release its dependents/u);
  // An integrated stop carries no integration detail and no note.
  writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "fix-2", result: COMMITTED, message: "ok", now: at("2026-11-10T08:00:30.000Z") });
  const clean = waitForHostCommit({ root: "unused", dispatch: "fix-2", after: AFTER }, { commonDir, ...clock() }).result;
  assert.equal(Object.hasOwn(clean, "integrationCode"), false);
  assert.doesNotMatch(clean.message, /refused/u);
}));

test("a stop that finishes during the wait is seen by the next poll", () => inside((commonDir) => {
  const ticking = clock();
  const pause = (ms) => { ticking.pause(ms); if (ticking.now() >= 6_000) writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "fix-1", result: COMMITTED, message: "ok", now: at("2026-11-10T08:00:30.000Z") }); };
  const { result } = waitForHostCommit({ root: "unused", dispatch: "fix-1", after: AFTER }, { commonDir, now: ticking.now, pause });
  assert.equal(result.status, "committed");
  assert.equal(result.waitedSeconds, 6);
}));

test("neither another dispatch's outcome nor an earlier attempt under the same id answers for this one", () => inside((commonDir) => {
  writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "other", result: COMMITTED, message: "ok", now: at("2026-11-10T08:00:30.000Z") });
  writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "fix-1", result: COMMITTED, message: "ok", now: at("2026-11-10T07:59:59.000Z") });
  const { exitCode, result } = waitForHostCommit({ root: "unused", dispatch: "fix-1", after: AFTER, timeoutSeconds: 3 }, { commonDir, ...clock() });
  assert.equal(exitCode, 0);
  assert.equal(result.status, "still-waiting");
  assert.equal(result.code, "WHC-NO-STOP-OUTCOME-YET");
  assert.match(result.message, /identical command once more/u);
}));

test("a stop without a commit hands over its own recovery and exits non-zero", () => inside((commonDir) => {
  writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "fix-1", result: { status: "recovery-required", code: "NGHF-COMMIT-EXCEPTION", commit: null }, message: "inspect the worktree", now: at("2026-11-10T08:00:30.000Z") });
  const { exitCode, result } = waitForHostCommit({ root: "unused", dispatch: "fix-1", after: AFTER }, { commonDir, ...clock() });
  assert.equal(exitCode, 1);
  assert.equal(result.status, "stop-failed");
  assert.equal(result.code, "NGHF-COMMIT-EXCEPTION");
  assert.match(result.message, /inspect the worktree/u);
}));

test("a budget checkpoint is its own status and claims no commit", () => inside((commonDir) => {
  writeNativeGoldfishStopOutcome({ commonDir, dispatchId: "fix-1", result: { status: "checkpoint-recorded", code: "NGHF-CHECKPOINT-RESERVATION-LIVE", commit: null }, message: "", now: at("2026-11-10T08:00:30.000Z") });
  const { exitCode, result } = waitForHostCommit({ root: "unused", dispatch: "fix-1", after: AFTER }, { commonDir, ...clock() });
  assert.equal(exitCode, 0);
  assert.equal(result.status, "checkpoint");
  assert.equal(result.commit, undefined);
  // The record stays on disk and a continued child gets no new notice: the printed time must step past it.
  assert.equal(result.nextAfter, "2026-11-10T08:00:30.001Z");
  assert.match(result.message, /--after 2026-11-10T08:00:30\.001Z/u);
  const next = waitForHostCommit({ root: "unused", dispatch: "fix-1", after: result.nextAfter, timeoutSeconds: 1 }, { commonDir, ...clock() });
  assert.equal(next.result.status, "still-waiting");
}));

test("the launch notice command carries the exact flags and refuses what it cannot quote", () => {
  assert.equal(hostCommitWaitCommand({ root: "/r", dispatchId: "fix-1", after: AFTER, pluginRoot: "/p" }), `node '${join("/p", "scripts", "wait-host-commit.mjs")}' --root '/r' --dispatch fix-1 --after ${AFTER}`);
  assert.equal(hostCommitWaitCommand({ root: "/r'x", dispatchId: "fix-1", after: AFTER, pluginRoot: "/p" }), null);
  assert.equal(hostCommitWaitCommand({ root: "/r", dispatchId: "a b", after: AFTER, pluginRoot: "/p" }), null);
});

test("the command line: one JSON line, usage is typed, --help is free", () => inside((root) => {
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  assert.equal(run("--help").status, 0);
  const usage = run("--root", root, "--dispatch", "fix-1");
  assert.equal(usage.status, 2);
  assert.equal(JSON.parse(usage.stdout).code, "WHC-USAGE");
  assert.equal(run("--root", root, "--dispatch", "fix-1", "--after", AFTER, "--timeout-seconds", "171").status, 2);
  const unreadable = run("--root", root, "--dispatch", "fix-1", "--after", AFTER, "--timeout-seconds", "1");
  assert.equal(unreadable.status, 1, unreadable.stdout);
  assert.equal(JSON.parse(unreadable.stdout).code, "WHC-REPOSITORY-UNREADABLE");
}));
