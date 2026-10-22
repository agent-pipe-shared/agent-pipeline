// SPDX-License-Identifier: SUL-1.0
//
// ALF-K13 / PO decision D110: the liveness READBACK of an open dispatch record's owner. The signal is the existing session-owner runtime
// judgement (PID plus process start identity, inspectSessionOwnerRuntime) reached through the record's v2 landed owner claim:
// open record -> v2 claim (sessionId + ownerNonceSha256) -> session descriptor ownerRuntime -> alive | gone | unjudgeable.
// "Dead only on proof": a v1 claim, a descriptor without an owner process (a Claude hook identity), an unobservable process and a
// missing descriptor are all `unjudgeable`. The readback mutates nothing and takes no lock.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { GIT_NULL_DEVICE } from "./git-null-device.mjs";
import { discoverRepository, startSessionDescriptor } from "./worktree-lifecycle.mjs";
import { DISPATCH_RECORD_LIVENESS_SCHEMA, readDispatchRecordLiveness } from "./dispatch-record-liveness.mjs";
import { DISPATCH_RECORD_OWNER_SCHEMA, LANDED_DISPATCH_RECORD_OWNER_SCHEMA } from "./guard/dispatch-record-lane.mjs";

const SKIP = process.platform === "linux" ? false : "linux-only: the process start identity is read from /proc/<pid>/stat; run under WSL";
const SCRIPT = fileURLToPath(new URL("../scripts/dispatch-record-liveness.mjs", import.meta.url));
const sha = (text) => createHash("sha256").update(text).digest("hex");
const roots = [];
const children = [];

test.after(() => {
  for (const child of children) { try { child.kill("SIGKILL"); } catch { /* already gone */ } }
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE, LC_ALL: "C" } });
  if (result.error || result.status !== 0) throw result.error || new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

function fixture() {
  const holder = mkdtempSync(join(tmpdir(), "dispatch-liveness-"));
  chmodSync(holder, 0o700);
  roots.push(holder);
  const primary = join(holder, "repo");
  mkdirSync(primary);
  git(primary, ["init", "--initial-branch=main"]);
  writeFileSync(join(primary, "README.md"), "fixture\n");
  git(primary, ["add", "README.md"]);
  git(primary, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
  mkdirSync(join(primary, "evidence"));
  const commonDir = discoverRepository(primary).commonDir;
  return { primary, commonDir };
}

function writeRecord(fx, taskId, outcome) {
  writeFileSync(join(fx.primary, "evidence", `dispatch-record-${taskId}.json`),
    `${JSON.stringify({ schema: "pipeline.dispatch-record.v4", taskId, outcome })}\n`, { mode: 0o600 });
}

function claimDirectory(fx) {
  const dir = join(fx.commonDir, "agent-pipeline", "dispatch-record-owner");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function writeV2Claim(fx, taskId, sessionId, ownerNonce) {
  const claim = { schema: LANDED_DISPATCH_RECORD_OWNER_SCHEMA, taskId, sessionId, ownerNonceSha256: sha(ownerNonce),
    creationDescriptorSha256: sha("descriptor"), creationInvocationBindingSha256: sha("binding"), recordSha256: sha("record"),
    recordIdentity: { dev: 1, ino: 2 }, createdAt: "2026-10-22T00:00:00.000Z", assurance: "physical-readback" };
  writeFileSync(join(claimDirectory(fx), `${taskId}.json`), `${JSON.stringify(claim, null, 2)}\n`, { mode: 0o600 });
}

function writeV1Claim(fx, taskId) {
  const claim = { schema: DISPATCH_RECORD_OWNER_SCHEMA, bindingKind: "attempted-native-write", taskId, agentId: "agent-1", agentType: "goldfish", claimedAt: "2026-10-22T00:00:00.000Z" };
  writeFileSync(join(claimDirectory(fx), `${taskId}.json`), `${JSON.stringify(claim, null, 2)}\n`, { mode: 0o600 });
}

/** A session descriptor plus the open record and v2 claim that name it. */
function openRecordOwnedBySession(fx, taskId, descriptorOptions) {
  const nonce = `owner-nonce-${taskId}-0000000001`;
  const started = startSessionDescriptor(fx.primary, { sessionId: `session-${taskId}`, ownerNonce: nonce, ...descriptorOptions });
  writeRecord(fx, taskId, "in-progress");
  writeV2Claim(fx, taskId, started.sessionId, nonce);
  return started;
}

const entryOf = (result, taskId) => result.records.find((entry) => entry.taskId === taskId);

function treeBytes(root) {
  const found = {};
  const walk = (path, rel) => {
    for (const name of readdirSync(path).sort()) {
      const abs = join(path, name), relative = rel === "" ? name : `${rel}/${name}`, stat = statSync(abs);
      if (stat.isDirectory()) { found[`${relative}/`] = "dir"; walk(abs, relative); }
      else found[relative] = `${sha(readFileSync(abs))}:${stat.mode}:${stat.mtimeMs}`;
    }
  };
  walk(root, "");
  return found;
}

test("DRL-1 alive: the owner session's own live process (pid and start identity both match) is `alive`", { skip: SKIP }, () => {
  const fx = fixture();
  openRecordOwnedBySession(fx, "ALIVE-1");
  const result = readDispatchRecordLiveness(fx.primary);
  assert.equal(result.schema, DISPATCH_RECORD_LIVENESS_SCHEMA);
  const entry = entryOf(result, "ALIVE-1");
  assert.equal(entry.verdict, "alive");
  assert.equal(entry.claimKind, "landed-v2");
  assert.equal(entry.reason, "owner-process-live");
  assert.equal(entry.sessionId, "session-ALIVE-1");
});

test("DRL-2 gone: the owner process has exited (no such pid) -> `gone`", { skip: SKIP }, async () => {
  const fx = fixture();
  const child = spawn("sleep", ["60"], { stdio: "ignore" });
  children.push(child);
  openRecordOwnedBySession(fx, "GONE-1", { ownerPid: child.pid });
  assert.equal(entryOf(readDispatchRecordLiveness(fx.primary), "GONE-1").verdict, "alive", "fixture precondition: the recorded process is alive while it runs");
  child.kill("SIGKILL");
  await once(child, "exit");
  const entry = entryOf(readDispatchRecordLiveness(fx.primary), "GONE-1");
  assert.equal(entry.verdict, "gone");
  assert.equal(entry.reason, "owner-process-gone");
});

test("DRL-3 gone: the recorded pid is alive but with a DIFFERENT start identity (pid reuse) -> `gone`", { skip: SKIP }, () => {
  const fx = fixture();
  const started = openRecordOwnedBySession(fx, "REUSED-1");
  const descriptor = JSON.parse(readFileSync(started.path, "utf8"));
  descriptor.ownerRuntime.processStartId = String(BigInt(descriptor.ownerRuntime.processStartId) + 1n);
  writeFileSync(started.path, `${JSON.stringify(descriptor)}\n`);
  const entry = entryOf(readDispatchRecordLiveness(fx.primary), "REUSED-1");
  assert.equal(entry.verdict, "gone");
  assert.equal(entry.reason, "owner-pid-reused");
});

test("DRL-4 unjudgeable: a v1 (attempted native write) claim carries no owner process -> `unjudgeable`, never `gone`", { skip: SKIP }, () => {
  const fx = fixture();
  writeRecord(fx, "V1-1", "in-progress");
  writeV1Claim(fx, "V1-1");
  const entry = entryOf(readDispatchRecordLiveness(fx.primary), "V1-1");
  assert.equal(entry.verdict, "unjudgeable");
  assert.equal(entry.claimKind, "attempted-v1");
  assert.equal(entry.reason, "claim-v1-has-no-owner-process");
});

test("DRL-5 unjudgeable: a Claude hook identity descriptor (ownerRuntime null by design) -> `unjudgeable`", { skip: SKIP }, () => {
  const fx = fixture();
  openRecordOwnedBySession(fx, "HOOK-1", { ownerRuntime: null });
  const entry = entryOf(readDispatchRecordLiveness(fx.primary), "HOOK-1");
  assert.equal(entry.verdict, "unjudgeable");
  assert.equal(entry.reason, "owner-runtime-unavailable");
});

test("DRL-6 unjudgeable: the process start identity cannot be observed on this platform (unavailable observation) -> `unjudgeable`", { skip: SKIP }, () => {
  const fx = fixture();
  openRecordOwnedBySession(fx, "UNAVAIL-1");
  const entry = entryOf(readDispatchRecordLiveness(fx.primary, { platform: "darwin" }), "UNAVAIL-1");
  assert.equal(entry.verdict, "unjudgeable");
  assert.equal(entry.reason, "owner-runtime-unavailable");
});

test("DRL-7 every owner status maps exactly: live -> alive; not-live, reused -> gone; unavailable, unobserved -> unjudgeable", { skip: SKIP }, () => {
  const fx = fixture();
  openRecordOwnedBySession(fx, "MAP-1");
  const expected = { live: "alive", "not-live": "gone", reused: "gone", unavailable: "unjudgeable", unobserved: "unjudgeable" };
  for (const [status, verdict] of Object.entries(expected)) {
    const result = readDispatchRecordLiveness(fx.primary, { inspectOwnerFn: () => ({ status }) });
    assert.equal(entryOf(result, "MAP-1").verdict, verdict, `owner status ${status}`);
  }
});

test("DRL-8 unjudgeable: a missing descriptor, a session whose nonce differs from the claim, no claim and an invalid claim are never `gone`", { skip: SKIP }, () => {
  const fx = fixture();
  writeRecord(fx, "NODESC-1", "in-progress");
  writeV2Claim(fx, "NODESC-1", "session-nowhere", "owner-nonce-nowhere-00000001");
  openRecordOwnedBySession(fx, "NONCE-1");
  writeV2Claim(fx, "NONCE-1", "session-NONCE-1", "a-different-nonce-0000000002");
  writeRecord(fx, "NOCLAIM-1", "in-progress");
  writeRecord(fx, "BADCLAIM-1", "in-progress");
  writeFileSync(join(claimDirectory(fx), "BADCLAIM-1.json"), "not json\n", { mode: 0o600 });
  const result = readDispatchRecordLiveness(fx.primary);
  assert.deepEqual([entryOf(result, "NODESC-1").verdict, entryOf(result, "NODESC-1").reason], ["unjudgeable", "descriptor-missing"]);
  assert.deepEqual([entryOf(result, "NONCE-1").verdict, entryOf(result, "NONCE-1").reason], ["unjudgeable", "session-nonce-mismatch"]);
  assert.deepEqual([entryOf(result, "NOCLAIM-1").verdict, entryOf(result, "NOCLAIM-1").claimKind, entryOf(result, "NOCLAIM-1").reason], ["unjudgeable", "none", "no-owner-claim"]);
  assert.deepEqual([entryOf(result, "BADCLAIM-1").verdict, entryOf(result, "BADCLAIM-1").claimKind, entryOf(result, "BADCLAIM-1").reason], ["unjudgeable", "invalid", "claim-invalid"]);
});

test("DRL-9 only OPEN records are read back: in-progress and the interim `committed-pending-report` are; a final outcome is not", { skip: SKIP }, () => {
  const fx = fixture();
  writeRecord(fx, "OPEN-1", "in-progress");
  writeRecord(fx, "OPEN-2", "committed-pending-report");
  writeRecord(fx, "FINAL-1", "completed");
  const result = readDispatchRecordLiveness(fx.primary);
  assert.deepEqual(result.records.map((entry) => entry.taskId).sort(), ["OPEN-1", "OPEN-2"]);
  assert.deepEqual(result.counts, { alive: 0, gone: 0, unjudgeable: 2 });
});

test("DRL-10 the readback mutates nothing: every byte under the git common dir and the evidence directory is unchanged and no registry lock appears", { skip: SKIP }, () => {
  const fx = fixture();
  openRecordOwnedBySession(fx, "RO-1");
  openRecordOwnedBySession(fx, "RO-2", { ownerRuntime: null });
  writeRecord(fx, "RO-3", "in-progress");
  writeV1Claim(fx, "RO-3");
  const before = { common: treeBytes(join(fx.commonDir, "agent-pipeline")), evidence: treeBytes(join(fx.primary, "evidence")) };
  const result = readDispatchRecordLiveness(fx.primary);
  assert.equal(result.records.length, 3);
  assert.equal(result.readOnly, true);
  assert.deepEqual({ common: treeBytes(join(fx.commonDir, "agent-pipeline")), evidence: treeBytes(join(fx.primary, "evidence")) }, before);
  assert.equal(existsSync(join(fx.commonDir, "agent-pipeline", "session-authority")), false, "no session-authority registry was created");
});

test("DRL-11 the CLI prints the same typed result as one JSON document, exits 0, and refuses unknown arguments with exit 2", { skip: SKIP }, () => {
  const fx = fixture();
  openRecordOwnedBySession(fx, "CLI-1");
  const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  const ok = run(["--root", fx.primary]);
  assert.equal(ok.status, 0, ok.stderr);
  const printed = JSON.parse(ok.stdout);
  assert.deepEqual(printed, JSON.parse(JSON.stringify(readDispatchRecordLiveness(fx.primary))));
  assert.equal(entryOf(printed, "CLI-1").verdict, "alive");
  const only = JSON.parse(run(["--root", fx.primary, "--task", "NO-SUCH"]).stdout);
  assert.deepEqual(only.records, []);
  const bad = run(["--root", fx.primary, "--wat"]);
  assert.equal(bad.status, 2);
  assert.equal(JSON.parse(bad.stdout).code, "DRL-ARGS");
  const outside = mkdtempSync(join(tmpdir(), "dispatch-liveness-norepo-"));
  roots.push(outside);
  const notRepo = run(["--root", outside]);
  assert.equal(notRepo.status, 2);
  assert.equal(JSON.parse(notRepo.stdout).code, "DRL-ROOT");
});

test("DRL-12 --second-writer (the guard mode): alive -> exit 2 with a repair on stderr; the dispatch's own record, gone and unjudgeable -> exit 0; a failed check is an advisory, never a refusal", { skip: SKIP }, async () => {
  const fx = fixture();
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, "--root", fx.primary, "--second-writer", ...args], { encoding: "utf8" });
  const none = run("-");
  assert.deepEqual([none.status, none.stderr], [0, ""], "no open record: silent exit 0");
  openRecordOwnedBySession(fx, "SW-ALIVE-1");
  const refused = run("-");
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /GUARD-DISPATCH-SECOND-WRITER: .*dispatch-record-SW-ALIVE-1\.json.*session-SW-ALIVE-1/su);
  assert.match(refused.stderr, /Repair, one of: wait .*dispatch-record-liveness\.mjs --root .*dispatch-record-write\.mjs/su);
  assert.equal(run("SW-ALIVE-1").status, 0, "the dispatch's own record never refuses it");
  assert.equal(run("OTHER,SW-ALIVE-1").status, 0);
  const child = spawn("sleep", ["60"], { stdio: "ignore" });
  children.push(child);
  openRecordOwnedBySession(fx, "SW-GONE-1", { ownerPid: child.pid });
  child.kill("SIGKILL");
  await once(child, "exit");
  assert.equal(run("SW-ALIVE-1").status, 0);
  assert.doesNotMatch(run("SW-ALIVE-1").stderr, /SW-GONE-1/u, "a gone owner is neither refused nor announced");
  writeRecord(fx, "SW-V1-1", "in-progress");
  writeV1Claim(fx, "SW-V1-1");
  const unjudged = run("SW-ALIVE-1");
  assert.equal(unjudged.status, 0);
  assert.match(unjudged.stderr, /GUARD-DISPATCH-SECOND-WRITER-UNJUDGED: .*dispatch-record-SW-V1-1\.json.*claim-v1-has-no-owner-process/su);
  const outside = mkdtempSync(join(tmpdir(), "dispatch-liveness-norepo-"));
  roots.push(outside);
  const broken = spawnSync(process.execPath, [SCRIPT, "--root", outside, "--second-writer", "-"], { encoding: "utf8" });
  assert.equal(broken.status, 0);
  assert.match(broken.stderr, /GUARD-DISPATCH-SECOND-WRITER-UNJUDGED: the open dispatch records of this checkout could not be read/u);
  const badArgs = spawnSync(process.execPath, [SCRIPT, "--second-writer"], { encoding: "utf8" });
  assert.equal(badArgs.status, 0);
  assert.match(badArgs.stderr, /could not run/u);
});
