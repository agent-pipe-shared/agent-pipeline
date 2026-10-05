#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// ALFRED-RDY-20261005: a Verify run records its cleanup duty in a run record, never in a session
// descriptor or a session-cleanup binding; a stale record of a dead PID is settled without a signature.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { listActiveSessionDescriptors } from "./worktree-lifecycle.mjs";
import {
  VERIFY_RUN_RECORD_SCHEMA, defaultProcessStartIdentity, readVerifyRunRecords, registerVerifyRunRecord,
  settleVerifyRunRecord, sweepStaleVerifyRunRecords, verifyRunDirectory, verifyRunRecordsDirectory,
} from "./verify-run-record.mjs";

const DEAD_PID = 2_147_483_646;

// Cases are declared with stable ids and registered together through the completion protocol at the end of the file.
const cases = [];
function register(id, name, run) {
  cases.push({ id, name, run });
}

function fixture() {
  const path = realpathSync(mkdtempSync(join(tmpdir(), "rdy-run-record-")));
  assert.equal(spawnSync("git", ["init", "--quiet", path], { encoding: "utf8" }).status, 0);
  return { path, common: join(path, ".git") };
}

function startRun(common, runId, extra = {}) {
  const runPath = verifyRunDirectory(common, runId);
  mkdirSync(runPath, { recursive: true });
  writeFileSync(join(runPath, "journal.jsonl"), "{}\n");
  return { runPath, written: registerVerifyRunRecord({ gitCommonDir: common, runId, runPath, ...extra }) };
}

register("VRR01", "a run record creates no session descriptor, no session-cleanup state, and carries PID + start evidence", () => {
  const { path, common } = fixture();
  try {
    const { written } = startRun(common, "run-a");
    assert.equal(written.record.schema, VERIFY_RUN_RECORD_SCHEMA);
    assert.equal(written.record.pid, process.pid);
    assert.equal(written.record.processStartId, defaultProcessStartIdentity(process.pid));
    assert.deepEqual(listActiveSessionDescriptors(path), []);
    assert.equal(existsSync(join(common, "agent-pipeline", "session-descriptors")), false);
    assert.equal(existsSync(join(verifyRunRecordsDirectory(common), "run-a.json")), true);
    assert.throws(() => registerVerifyRunRecord({ gitCommonDir: common, runId: "run-a", runPath: verifyRunDirectory(common, "run-a") }), /VERIFY-RUN-RECORD-EXISTS/u);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

register("VRR02", "an abort path settles the record and drains the unsealed run directory", () => {
  const { path, common } = fixture();
  try {
    const { runPath } = startRun(common, "run-abort");
    const settled = settleVerifyRunRecord({ gitCommonDir: common, runId: "run-abort" });
    assert.deepEqual([settled.status, settled.drainedRunDirectory, settled.retainedSealedRun], ["retired", true, false]);
    assert.equal(existsSync(runPath), false);
    assert.deepEqual(readVerifyRunRecords({ gitCommonDir: common }), []);
    assert.equal(settleVerifyRunRecord({ gitCommonDir: common, runId: "run-abort" }).status, "absent");
    assert.deepEqual(listActiveSessionDescriptors(path), []);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

register("VRR03", "a stale record of a dead PID is swept without a signature; live and sealed runs are respected", () => {
  const { path, common } = fixture();
  try {
    const dead = startRun(common, "run-dead", { pid: DEAD_PID, processStartId: "1" });
    const sealed = startRun(common, "run-sealed", { pid: DEAD_PID, processStartId: "1" });
    writeFileSync(join(sealed.runPath, "terminal.json"), "{}\n");
    const live = startRun(common, "run-live");
    const swept = sweepStaleVerifyRunRecords({ gitCommonDir: common });
    assert.deepEqual(swept.settled.sort(), ["run-dead", "run-sealed"]);
    assert.deepEqual(swept.retained, ["run-live"]);
    assert.deepEqual(swept.errors, []);
    assert.equal(existsSync(dead.runPath), false, "an unsealed stale run directory is drained");
    assert.equal(existsSync(join(sealed.runPath, "terminal.json")), true, "a sealed run is retained evidence");
    assert.equal(existsSync(live.runPath), true, "a live run is never touched");
    assert.deepEqual(readVerifyRunRecords({ gitCommonDir: common }).map((entry) => entry.runId), ["run-live"]);
    assert.deepEqual(listActiveSessionDescriptors(path), [], "the sweep never creates or reads session state");
    // The caller's own run is never swept even when its owner looks dead.
    assert.deepEqual(sweepStaleVerifyRunRecords({ gitCommonDir: common, exceptRunId: "run-live", processAlive: () => false }).settled, []);
    assert.equal(JSON.parse(readFileSync(join(verifyRunRecordsDirectory(common), "run-live.json"), "utf8")).runId, "run-live");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

assert.equal(cases.length, 3, "the complete verify-run-record corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
