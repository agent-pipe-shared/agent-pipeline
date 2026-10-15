// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.verify-on-a-wsl-mnt-drive-checkout-hides-its-reason (AC-267).
// Acceptance points:
//   P1 the outer code stays VERIFY-CLEANUP-REGISTRATION-REQUIRED (callers match on it);
//   P2 the original error is kept in the cause chain and named in the message;
//   P3 the not-private case prints a typed hint naming the filesystem limit (DrvFs, permissive modes)
//      and the native-clone workaround (clone into the Linux home);
//   P4 other inner failures carry the cause but no DrvFs hint (the hint is not blanket noise);
//   P5 through the real directory path (no injected failure) a permissive-mode private directory
//      reaches the operator as P1-P3.
// Host limit: directory mode bits do not exist on native Windows, so P5 needs the Linux/WSL run.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, chmodSync, rmSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { VERIFY_PRIVATE_DIRECTORY_HINT, registerRunRecordOwner } from "../../scripts/verify-journal.mjs";

import { observeNativeWindowsProcess } from "../windows-native-process-observer.mjs";

// registerRunRecordOwner reads the own process start identity BEFORE it calls the injected seam; on native
// Windows that goes through a native helper which a host can report unavailable (e.g. WPO-HELPER-CAS).
const processProbe = process.platform === "win32"
  ? observeNativeWindowsProcess({ pid: process.pid })
  : { status: "present" };
const SEAM_LIMITATION = processProbe.status === "present"
  ? false
  : `host-limitation: native Windows process observation is ${processProbe.status} (${processProbe.reason ?? "no reason"}) so the injected-seam cases cannot reach the seam; owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)`;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const args = { gitCommonDir: "/unused", runId: "verify-hint", runPath: "/unused/run" };

const HOST_LIMITATION = process.platform === "win32"
  ? "host-limitation: directory mode bits are unavailable on native Windows (DACL path); owner Coordinator, due 2026-10-19, Linux/WSL run (PO decision K7)"
  : false;

function capture(fn) {
  try { fn(); } catch (error) { return error; }
  return undefined;
}

// The acceptance examiner, applied to whichever function it is handed.
function assertNotPrivateAcceptance(register) {
  const inner = new Error("VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE");
  const thrown = capture(() => register({ ...args, registerRecord: () => { throw inner; } }));
  assert.ok(thrown instanceof Error, "must throw");
  assert.match(thrown.message, /^VERIFY-CLEANUP-REGISTRATION-REQUIRED/u, "P1 outer code");
  assert.match(thrown.message, /VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE/u, "P2 original code named");
  assert.equal(thrown.cause, inner, "P2 cause chain");
  assert.match(thrown.message, /HINT/u, "P3 typed hint");
  assert.match(thrown.message, /DrvFs/u, "P3 names the filesystem");
  assert.match(thrown.message, /permissive modes/u, "P3 names the limit");
  assert.match(thrown.message, /clone the repository into the Linux home/u, "P3 workaround");
}

test("P1-P2 (real path, host-limited): an unavailable own-process identity keeps the outer code and names its cause", { skip: processProbe.status === "present" ? "applies only where the host reports process observation unavailable" : false }, () => {
  const thrown = capture(() => registerRunRecordOwner({ ...args, registerRecord: () => ({ recordSha256: "a".repeat(64) }) }));
  assert.match(thrown.message, /^VERIFY-CLEANUP-REGISTRATION-REQUIRED \(cause: VERIFY-JOURNAL-PROCESS-UNAVAILABLE\)$/u);
  assert.equal(thrown.cause.message, "VERIFY-JOURNAL-PROCESS-UNAVAILABLE");
  assert.ok(!thrown.message.includes("HINT"));
});

test("P1-P3: not-private failure keeps outer code, cause chain and the DrvFs / Linux-home hint", { skip: SEAM_LIMITATION }, () => {
  assertNotPrivateAcceptance(registerRunRecordOwner);
  assert.match(VERIFY_PRIVATE_DIRECTORY_HINT, /^HINT: /u);
  assert.match(VERIFY_PRIVATE_DIRECTORY_HINT, /\/mnt\/<drive>/u);
});

test("P2: the hint is appended when the original failure is wrapped in a longer message", { skip: SEAM_LIMITATION }, () => {
  const inner = new Error("wrapped: VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE at /x");
  const thrown = capture(() => registerRunRecordOwner({ ...args, registerRecord: () => { throw inner; } }));
  assert.match(thrown.message, /^VERIFY-CLEANUP-REGISTRATION-REQUIRED \(cause: wrapped: VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE/u);
  assert.ok(thrown.message.includes(VERIFY_PRIVATE_DIRECTORY_HINT));
  assert.equal(thrown.cause, inner);
});

test("P4: other inner failures keep their cause and carry no DrvFs hint", { skip: SEAM_LIMITATION }, () => {
  const inner = new Error("VERIFY-JOURNAL-DIRECTORY-UNSAFE");
  const thrown = capture(() => registerRunRecordOwner({ ...args, registerRecord: () => { throw inner; } }));
  assert.match(thrown.message, /^VERIFY-CLEANUP-REGISTRATION-REQUIRED/u);
  assert.match(thrown.message, /VERIFY-JOURNAL-DIRECTORY-UNSAFE/u);
  assert.equal(thrown.cause, inner);
  assert.ok(!thrown.message.includes("HINT"));
  assert.ok(!/DrvFs/u.test(thrown.message));
});

test("P2: a failure without a message falls back to its code and still keeps the cause", { skip: SEAM_LIMITATION }, () => {
  const inner = Object.assign(new Error(""), { code: "EACCES" });
  const thrown = capture(() => registerRunRecordOwner({ ...args, registerRecord: () => { throw inner; } }));
  assert.match(thrown.message, /^VERIFY-CLEANUP-REGISTRATION-REQUIRED \(cause: EACCES\)$/u);
  assert.equal(thrown.cause, inner);
  const bare = capture(() => registerRunRecordOwner({ ...args, registerRecord: () => { throw undefined; } }));
  assert.match(bare.message, /\(cause: unknown\)/u);
});

test("P1: success path is untouched (no wrapping when registration works)", { skip: SEAM_LIMITATION }, () => {
  const result = registerRunRecordOwner({ ...args, registerRecord: () => ({ recordSha256: "a".repeat(64) }) });
  assert.equal(result.receipt.status, "registered");
  assert.equal(result.receipt.descriptorSha256, "a".repeat(64));
});

test("RED proof: the examiner fails against the pre-fix generic wrapper (scratch mirror)", () => {
  // Mirror of the behaviour the item reports: original error swallowed, generic code only.
  const preFix = ({ registerRecord }) => {
    try { registerRecord(); } catch { throw new Error("VERIFY-CLEANUP-REGISTRATION-REQUIRED"); }
  };
  assert.throws(() => assertNotPrivateAcceptance(preFix), assert.AssertionError);
  // Mirror that keeps the cause but drops the hint is still insufficient.
  const noHint = ({ registerRecord }) => {
    try { registerRecord(); } catch (cause) { throw new Error(`VERIFY-CLEANUP-REGISTRATION-REQUIRED (cause: ${cause.message})`, { cause }); }
  };
  assert.throws(() => assertNotPrivateAcceptance(noHint), assert.AssertionError);
});

test("P5: real directory path with permissive modes reaches the operator as typed hint", { skip: HOST_LIMITATION }, () => {
  const base = join(repoRoot, "scratch");
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "alf-c-p3-05-"));
  try {
    const common = realpathSync(root);
    const pipeline = join(common, "agent-pipeline");
    mkdirSync(pipeline, { mode: 0o700 });
    chmodSync(pipeline, 0o777); // what DrvFs reports for every path
    const thrown = capture(() => registerRunRecordOwner({ gitCommonDir: common, runId: "verify-p5", runPath: join(common, "run") }));
    assert.ok(thrown instanceof Error);
    assert.match(thrown.message, /^VERIFY-CLEANUP-REGISTRATION-REQUIRED/u);
    assert.match(thrown.message, /VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE/u);
    assert.ok(thrown.message.includes(VERIFY_PRIVATE_DIRECTORY_HINT));
    assert.equal(thrown.cause?.message, "VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
