#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Regression pin: pipeline.worktree-process-start-parser-misreads-spaced-comm (AC-273).
// The Linux process start identity of worktree-lifecycle.mjs must be kernel field 22 of /proc/<pid>/stat, found by
// splitting AFTER the final ")" of the comm field, never by a whitespace split of the whole line.
//
// Acceptance points -> cases:
//   A1 real spaced/parenthesised-comm process yields the kernel ticks at both call sites  -> L-1, L-2 (Linux only),
//      S-1 (parser function body evaluated from the real source on every host), S-2 (both call sites use it)
//   A2 malformed/missing/inaccessible stat stays typed-unavailable / fail-closed           -> S-3, H-1
//   A3 existing owner/manifest/temp-resource fixtures                                       -> worktree-process-start.test.mjs,
//      worktree-lifecycle.test.mjs (unchanged; not duplicated here)
//   A4 reused PID with a different start time is not the owner, spaced names on both sides -> L-2, S-4
//   A5 integration/final-candidate binding                                                  -> not a unit-test concern (host)
// The parser is not exported, so S-* evaluate its exact source text out of the real module (no re-implementation);
// L-* observe it through the module's exported routes against real /proc and are skipped off Linux with a typed reason.
//
// QG-06 skip record (a documented, owned, dated exception, not a silent decay): L-1 and L-2 are SKIPPED, not run, on every
// non-Linux host (native Windows); they are not skipped on Linux, where they run against the real /proc.
//   recorded: the Linux/WSL run is counted in specs/sprint-alfred-epic/evidence/pin-counted-results-2026-10-22.md (commit
//             1e2592108): this file, 7 cases, 6 pass, 0 fail, 1 skip, 0 todo. L-1 and L-2 executed and passed (not skipped);
//             the one skip is H-1, a typed Linux-only skip ("/proc is readable on Linux"; the unreadable-stat path is S-3).
//   owner   : Coordinator
//   due     : 2026-10-19 (met by the recorded run above)
//   decision: PO decision K7
// The native-Windows skip of L-1 and L-2 stays by design: S-1..S-4 run on every host and carry A1, A2 and A4 at source level.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GIT_NULL_DEVICE } from "../git-null-device.mjs";
import {
  cleanupSession,
  discoverRepository,
  inspectSessionOwnerRuntime,
  loadSessionDescriptor,
  registerTemporaryIntent,
  startSessionDescriptor,
} from "../worktree-lifecycle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const SOURCE_PATH = join(here, "..", "worktree-lifecycle.mjs");
const SOURCE = readFileSync(SOURCE_PATH, "utf8");

// QG-06 skip record (see the header): the Linux/WSL run is recorded; the skip applies off Linux only.
const HOST_LIMITATION_SKIP = process.platform === "linux"
  ? false
  : "host-limitation: real /proc/<pid>/stat process identity exists only on Linux; this host is " + process.platform
    + "; the Linux/WSL run is recorded in pin-counted-results-2026-10-22.md, owner Coordinator, PO decision K7, QG-06";

const SPACED_COMM = "a (b) c";
const roots = [];
const children = [];

test.after(() => {
  for (const child of children) {
    try { child.kill("SIGKILL"); } catch { /* already exited */ }
  }
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function scratchDir(prefix) {
  const base = join(repoRoot, "scratch");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, prefix));
  roots.push(dir);
  return dir;
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, LC_ALL: "C" },
  });
  if (result.error || result.status !== 0) throw result.error || new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

function repoFixture() {
  const primary = join(scratchDir("procstart-pin-repo-"), "repo");
  mkdirSync(primary);
  git(primary, ["init", "--initial-branch=main"]);
  writeFileSync(join(primary, "README.md"), "fixture\n");
  git(primary, ["add", "README.md"]);
  git(primary, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
  return primary;
}

/** The exact source text of the module's private parser, evaluated as-is (not re-implemented). */
function extractParser() {
  const match = /function linuxProcessStartTicks\(stat\) \{[\s\S]*?\n\}\n/u.exec(SOURCE);
  assert(match, "linuxProcessStartTicks not found in worktree-lifecycle.mjs");
  return new Function(`${match[0]}\nreturn linuxProcessStartTicks;`)();
}

/** A genuine Linux stat line layout: pid (comm) state then fields 4..52; field 22 (starttime) is set explicitly. */
function statLine(pid, comm, startTicks) {
  const tail = ["S"];
  for (let field = 4; field <= 52; field += 1) tail.push(field === 22 ? String(startTicks) : String(field * 1000));
  return `${pid} (${comm}) ${tail.join(" ")}\n`;
}

// ---- Source-level cases: run on every host -------------------------------------------------------------------

test("S-1 the real parser returns kernel field 22 for spaced and parenthesised comm names", () => {
  const parse = extractParser();
  for (const comm of ["plain", "host worker (x)", "a (b) c", "x) y (z", "))) ", "(", "a b c d e f g h i j k"]) {
    const line = statLine(4242, comm, 2100258);
    assert.equal(parse(line), "2100258", `comm ${JSON.stringify(comm)}`);
    // The fixture must bite for spaced names: the pre-fix whitespace split lands on another field.
    if (/\s|\)/u.test(comm) && comm.trim() !== "") assert.notEqual(line.trim().split(" ")[21], "2100258");
  }
});

test("S-2 both identity call sites route through the one validated parser", () => {
  assert.equal((SOURCE.match(/linuxProcessStartTicks\(readFileSync\(`\/proc\/\$\{pid\}\/stat`, "utf8"\)\)/gu) ?? []).length, 2,
    "localProcessStartIdentity and processStartIdentity must both read /proc/<pid>/stat through linuxProcessStartTicks");
  assert.doesNotMatch(SOURCE, /split\(" "\)\[21\]/u, "no whole-line whitespace split of the stat line may remain");
});

test("S-3 malformed, truncated or non-numeric stat data yields null, never a verified identity", () => {
  const parse = extractParser();
  const good = statLine(7, "w", 99);
  const cases = [
    undefined, null, 42, "", "   ", "garbage", "7 w S 1 2 3", "(no pid) S 1 2", "7 (w)", "7 (w)S 1 2 3",
    "7 (w) S 1 2 3",                                     // far too few fields
    statLine(7, "w", "notnumber"), statLine(7, "w", "-5"), statLine(7, "w", "1.5"),
    good.replace(" (w) ", " w "),                          // no parenthesised comm at all
  ];
  for (const value of cases) assert.equal(parse(value), null, `input ${JSON.stringify(value)}`);
  assert.equal(parse(good), "99");
});

test("S-4 two spaced-name stat lines with different start ticks are distinguishable (reused PID is not the owner)", () => {
  const parse = extractParser();
  const owner = parse(statLine(555, "host worker (x)", 2100258));
  const reused = parse(statLine(555, "host worker (x)", 2100999));
  assert.equal(owner, "2100258");
  assert.equal(reused, "2100999");
  assert.notEqual(owner, reused);
});

// ---- Real-module host case: typed unavailable when /proc cannot be read ---------------------------------------

test("H-1 a Linux-platform inspection with an unreadable /proc stat is typed unavailable, not live or reused", { skip: process.platform === "linux" ? "host-limitation: /proc is readable on Linux; unreadable-stat path covered by S-3" : false }, () => {
  const primary = repoFixture();
  const started = startSessionDescriptor(primary, {
    sessionId: "session-procstart-pin-h1",
    ownerNonce: "owner-nonce-procstart-pin-01",
    ownerPid: process.pid,
  });
  // This host has no /proc/<pid>/stat: the real localProcessStartIdentity must fail closed, with the owner alive.
  const status = inspectSessionOwnerRuntime(primary, started.sessionId, { platform: "linux" });
  assert.equal(status.status, "unavailable");
});

// ---- Real Linux process cases: skipped off Linux with a typed host-limitation reason --------------------------

function spawnSpacedCommProcess(linkDir) {
  const link = join(linkDir, SPACED_COMM);
  if (!existsSync(link)) {
    const target = ["/bin/sleep", "/usr/bin/sleep"].find((candidate) => existsSync(candidate));
    assert(target, "no sleep binary found");
    symlinkSync(target, link);
  }
  const child = spawn(link, ["60"], { stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
  children.push(child);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (readFileSync(`/proc/${child.pid}/comm`, "utf8").trim() === SPACED_COMM) break;
    pause(20);
  }
  assert.equal(readFileSync(`/proc/${child.pid}/comm`, "utf8").trim(), SPACED_COMM);
  return child;
}

function kernelTicks(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8").trim();
  const match = /^\d+ \(.*\) [A-Za-z] (.*)$/su.exec(stat);
  assert(match);
  const ticks = match[1].split(" ")[18];
  assert.notEqual(stat.split(" ")[21], ticks, "fixture must bite");
  return ticks;
}

test("L-1 a real spaced-comm process: the descriptor records and re-reads the kernel starttime", { skip: HOST_LIMITATION_SKIP }, () => {
  const owner = spawnSpacedCommProcess(scratchDir("procstart-pin-link-"));
  const expected = kernelTicks(owner.pid);
  const primary = repoFixture();
  const started = startSessionDescriptor(primary, {
    sessionId: "session-procstart-pin-l1",
    ownerNonce: "owner-nonce-procstart-pin-02",
    ownerPid: owner.pid,
  });
  assert.equal(loadSessionDescriptor(primary, started.sessionId).ownerRuntime.processStartId, expected);
  assert.equal(inspectSessionOwnerRuntime(primary, started.sessionId).status, "live");
});

test("L-2 a verify-run lock keeps its spaced-comm writer live and treats another spaced process's identity as a reused PID", { skip: HOST_LIMITATION_SKIP }, () => {
  const linkDir = scratchDir("procstart-pin-link-");
  const first = spawnSpacedCommProcess(linkDir);
  const firstTicks = kernelTicks(first.pid);
  let secondTicks = firstTicks;
  for (let attempt = 0; attempt < 20 && secondTicks === firstTicks; attempt += 1) {
    pause(30);
    const second = spawnSpacedCommProcess(linkDir);
    secondTicks = kernelTicks(second.pid);
  }
  assert.notEqual(secondTicks, firstTicks);
  const primary = repoFixture();
  const session = startSessionDescriptor(primary, { sessionId: "session-procstart-pin-l2", ownerNonce: "owner-nonce-procstart-pin-03" });
  const repo = discoverRepository(primary);
  const runId = "verify-procstart-pin-run";
  const runPath = join(repo.commonDir, "agent-pipeline", "verify", "runs", runId);
  registerTemporaryIntent(primary, {
    sessionId: session.sessionId,
    ownerNonce: session.ownerNonce,
    resourceId: "verify-procstart-pin-resource",
    type: "verify-run-directory",
    path: runPath,
    contentClass: "verify-recovery",
    soleCopy: false,
    cleanupPolicy: "remove-directory",
  });
  mkdirSync(runPath, { mode: 0o700 });
  const lockPath = join(runPath, "run.lock");
  const lock = (pid, processStartId) => `${JSON.stringify({
    schema: "pipeline.verify-run-lock.v1", runId, pid, processStartId, owner: "current-os-user", status: "active", closedAt: null,
  })}\n`;
  writeFileSync(lockPath, lock(first.pid, firstTicks), { mode: 0o600 });
  const live = cleanupSession(primary, session);
  assert.equal(live.ok, false);
  assert.equal(live.receipt.outcomes[0].code, "WT-VERIFY-RUN-ACTIVE");
  writeFileSync(lockPath, lock(first.pid, secondTicks), { mode: 0o600 });
  const reused = cleanupSession(primary, session);
  assert.equal(reused.ok, true);
  assert.equal(existsSync(runPath), false);
});
