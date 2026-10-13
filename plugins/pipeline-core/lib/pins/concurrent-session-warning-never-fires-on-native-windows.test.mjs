// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.concurrent-session-warning-never-fires-on-native-windows (ALF-C-P1-15, AC-139).
// Acceptance: on native Windows a second live session in the same repository produces the warning;
// a dead or previous-boot descriptor does not. Exercised through the real lifecycle module and the
// real warning function. The documented seams (platform, nowMs, uptimeSeconds) drive the win32
// branch on every host; one case additionally runs with no seam on the real host.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";

import {
  inspectSessionOwnerRuntime,
  startSessionDescriptor,
} from "../worktree-lifecycle.mjs";
import {
  CONCURRENT_SESSION_WARNING_SCHEMA,
  observeConcurrentSessionWarning,
} from "../../scripts/pipeline-start-preflight.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const fixtureRoots = [];
after(() => { for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true }); });

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) throw result.error || new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

function repoFixture() {
  const fixture = mkdtempSync(join(scratchBase, "csw-pin-"));
  fixtureRoots.push(fixture);
  const primary = join(fixture, "repo");
  mkdirSync(primary);
  git(primary, ["init", "--initial-branch=main"]);
  writeFileSync(join(primary, "README.md"), "fixture\n");
  git(primary, ["add", "README.md"]);
  git(primary, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
  return primary;
}

// nowMs multiple of 60 000 and uptime multiple of 60: the boot minute is exact.
const NOW_MS = 1_800_000_000_000;
const SEAMS = { platform: "win32", nowMs: NOW_MS, uptimeSeconds: 7_200 };
const ABSENT_PID = 2_147_483_647;

function session(primary, tag, seams = SEAMS, extra = {}) {
  return startSessionDescriptor(primary, {
    sessionId: `session-cswpin-${tag}`,
    ownerNonce: `owner-nonce-cswpin-${tag}-000000001`,
    ownerPid: process.pid,
    ...seams,
    ...extra,
  });
}

function warn(primary, currentSessionId, seams = {}) {
  return observeConcurrentSessionWarning({
    startPath: primary,
    currentSessionId,
    inspectOwner: (startPath, sessionId, options) =>
      inspectSessionOwnerRuntime(startPath, sessionId, { ...options, ...SEAMS, ...seams }),
  });
}

test("a second live win32 session in the same repository produces a probable warning", () => {
  const primary = repoFixture();
  const mine = session(primary, "live-mine");
  const other = session(primary, "live-other");
  const recorded = JSON.parse(readFileSync(other.path, "utf8")).ownerRuntime;
  assert.equal(recorded.pid, process.pid, "a win32 owner must be recorded (it was null before the fix)");
  assert.match(recorded.processStartId, /^\d+$/u);
  const warning = warn(primary, mine.sessionId);
  assert.notEqual(warning, null);
  assert.equal(warning.schema, CONCURRENT_SESSION_WARNING_SCHEMA);
  assert.equal(warning.sessionId, other.sessionId);
  assert.equal(warning.status, "live");
  assert.equal(warning.probable, true);
  assert.match(warning.message, /probably live/u);
  assert.equal(JSON.stringify(warning).includes(other.ownerNonce), false);
});

test("the current session itself never triggers the warning", () => {
  const primary = repoFixture();
  const mine = session(primary, "self");
  assert.equal(warn(primary, mine.sessionId), null);
});

test("a dead owner process does not warn (pid gone at registration or vanished later)", () => {
  const primary = repoFixture();
  const mine = session(primary, "dead-mine");
  const absent = session(primary, "dead-absent", SEAMS, { ownerPid: ABSENT_PID });
  assert.equal(JSON.parse(readFileSync(absent.path, "utf8")).ownerRuntime, null);
  assert.equal(warn(primary, mine.sessionId), null);
  const vanished = session(primary, "dead-vanished");
  const descriptor = JSON.parse(readFileSync(vanished.path, "utf8"));
  descriptor.ownerRuntime.pid = ABSENT_PID;
  writeFileSync(vanished.path, `${JSON.stringify(descriptor, null, 2)}\n`);
  assert.equal(
    inspectSessionOwnerRuntime(primary, vanished.sessionId, { ...SEAMS, probableLiveness: true }).status,
    "not-live",
  );
  assert.equal(warn(primary, mine.sessionId), null);
});

test("a descriptor from a previous boot does not warn", () => {
  const primary = repoFixture();
  const mine = session(primary, "boot-mine");
  const other = session(primary, "boot-other");
  assert.notEqual(warn(primary, mine.sessionId), null, "control: same boot warns");
  // An hour later the host reports ten minutes of uptime: it rebooted after registration.
  const rebooted = { nowMs: NOW_MS + 3_600_000, uptimeSeconds: 600 };
  assert.equal(warn(primary, mine.sessionId, rebooted), null);
  const read = inspectSessionOwnerRuntime(primary, other.sessionId, { ...SEAMS, ...rebooted, probableLiveness: true });
  assert.equal(read.status, "reused");
  assert.equal("probable" in read, false);
});

test("the default (non opt-in) read stays unavailable off Linux, so only the advisory warning is affected", () => {
  const primary = repoFixture();
  const other = session(primary, "default-other");
  assert.equal(inspectSessionOwnerRuntime(primary, other.sessionId, SEAMS).status, "unavailable");
});

test("real host, no seams: a second session owned by a live process warns on this platform", (t) => {
  const primary = repoFixture();
  const mine = startSessionDescriptor(primary, { sessionId: "session-cswpin-real-mine", ownerNonce: "owner-nonce-cswpin-real-mine-0001" });
  const other = startSessionDescriptor(primary, { sessionId: "session-cswpin-real-other", ownerNonce: "owner-nonce-cswpin-real-other-001" });
  if (process.platform !== "win32" && process.platform !== "linux") {
    t.skip("host-limitation: neither native Windows nor Linux; no liveness evidence exists on this platform");
    return;
  }
  const warning = observeConcurrentSessionWarning({ startPath: primary, currentSessionId: mine.sessionId });
  assert.notEqual(warning, null, `a live second session must warn on ${process.platform}`);
  assert.equal(warning.sessionId, other.sessionId);
  assert.equal(warning.status, "live");
  assert.equal(warning.probable === true, process.platform === "win32");
});
