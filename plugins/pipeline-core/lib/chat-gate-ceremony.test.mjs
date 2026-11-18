#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// The chat-gate confirming step, and specifically the encoding of what the
// human types back. A gate that PRINTS a value correctly and then cannot
// accept that same value typed is not a gate, it is a lockout -- which is
// exactly what a Windows console on a legacy Western code page produced for
// a PO whose name carries an accent (measured live 2026-08-28, backlog item
// 2026-08-28-a-chat-gate-is-unusable-with-a-non-ascii-name-on-windows.md).

import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_GATE_CONFIRMATION_MISMATCH,
  CHAT_GATE_NOT_ATTENDED,
  CHAT_ATTRIBUTION_UNATTESTED,
  chatAttributionRecord,
  decodeTypedLine,
  isAttendedTerminal,
  readAttendedLine,
  requireAttendedChatGateConfirmation,
} from "./chat-gate-ceremony.mjs";

// A stand-in for a terminal that delivers exactly these bytes on fd 0, one
// byte per readSync call, then EOF -- the shape readAttendedLine consumes.
function typing(bytes) {
  const queue = [...bytes];
  return (buffer) => {
    if (queue.length === 0) return 0;
    buffer[0] = queue.shift();
    return 1;
  };
}

const attended = { isattyFn: () => true };

test("global chat attribution is explicitly non-attested, never a terminal or proof claim", () => {
  assert.deepEqual(chatAttributionRecord({ kind: "push", by: "PO" }), {
    mode: CHAT_ATTRIBUTION_UNATTESTED,
    kind: "push",
    by: "PO",
  });
  assert.deepEqual(chatAttributionRecord({ kind: "guard-maintenance-window" }), {
    mode: "chat-attributed-unattested",
    kind: "guard-maintenance-window",
  });
  assert.throws(() => chatAttributionRecord({ kind: "" }), TypeError);
  assert.throws(() => chatAttributionRecord({ kind: "push", by: "" }), TypeError);
});

test("a UTF-8 terminal's accented name decodes to what the human typed", () => {
  const utf8 = [...Buffer.from("André\n", "utf8")];
  const line = readAttendedLine("", { ...attended, writeFn: () => {}, readSyncFn: typing(utf8) });
  assert.equal(line, "André");
});

test("a legacy Windows console's single high byte is the same name, not a replacement character", () => {
  // cp1252/cp850: `é` is the one byte 0xE9. Decoded as UTF-8 it is invalid and
  // becomes U+FFFD, which can never equal the value the gate just printed.
  const cp1252 = [0x41, 0x6e, 0x64, 0x72, 0xe9, 0x0a];
  assert.equal(Buffer.from(cp1252.slice(0, 5)).toString("utf8").includes("�"), true,
    "sanity: these are exactly the bytes that used to decode to a replacement character");
  const line = readAttendedLine("", { ...attended, writeFn: () => {}, readSyncFn: typing(cp1252) });
  assert.equal(line, "André");
});

test("the confirmation compares equal for both encodings of the same typed name", () => {
  for (const bytes of [[...Buffer.from("André\n", "utf8")], [0x41, 0x6e, 0x64, 0x72, 0xe9, 0x0a]]) {
    const result = requireAttendedChatGateConfirmation({
      summaryLines: ["by: André"],
      expected: "André",
      dependencies: { ...attended, writeFn: () => {}, readSyncFn: typing(bytes) },
    });
    assert.deepEqual(result, { ok: true });
  }
});

test("ASCII input, a trailing CR and surrounding whitespace are unchanged by the decoder", () => {
  assert.equal(decodeTypedLine([...Buffer.from("Andre", "utf8")]), "Andre");
  assert.equal(decodeTypedLine([...Buffer.from("  Andre  ", "utf8")]), "Andre");
  assert.equal(decodeTypedLine([...Buffer.from("Andre\r", "utf8")]), "Andre");
  assert.equal(decodeTypedLine([]), "");
});

test("a genuinely different typed value is still a mismatch", () => {
  const result = requireAttendedChatGateConfirmation({
    expected: "André",
    dependencies: { ...attended, writeFn: () => {}, readSyncFn: typing([...Buffer.from("Andrea\n", "utf8")]) },
  });
  assert.deepEqual(result, { ok: false, code: CHAT_GATE_CONFIRMATION_MISMATCH });
});

test("the attendance boundary is unchanged: a non-TTY refuses before any byte is read", () => {
  let reads = 0;
  const result = requireAttendedChatGateConfirmation({
    expected: "André",
    dependencies: {
      isattyFn: () => false,
      writeFn: () => {},
      readSyncFn: (buffer) => { reads += 1; buffer[0] = 0x0a; return 1; },
    },
  });
  assert.deepEqual(result, { ok: false, code: CHAT_GATE_NOT_ATTENDED });
  assert.equal(reads, 0, "a pipe carrying the right bytes must never be read at all");
  assert.equal(isAttendedTerminal({ isattyFn: () => { throw new Error("no tty"); } }), false,
    "an undeterminable fd 0 stays 'not attended' -- the fail-closed direction");
});

/* ------------------------------------------------------------------------- *
 * C30J-J3 (queue C30-21, analysis items C3 / SM-3 / SM-11, finding A7-4, criterion
 * AC-112): the ceremony publishes its records and advances its registry member as
 * two stores, so a process that ENDS between two of those writes leaves a member
 * that disagrees with the records. Every cell below ends a real ceremony (SIGKILL)
 * at one named point of `runRegisteredCeremony` / `ceremonyExecuteBody`, then asks
 * two questions: does the NEXT ceremony start work with no repair, and does a plain
 * registry read work before any start. The records are the truth, the member the copy.
 * ------------------------------------------------------------------------- */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inspectSessionAuthorityRegistryRead, withSessionAuthorityBoundary } from "./session-authority-registry.mjs";
import { prepareSessionAuthorityRegistryFixture } from "./test-item-approved-course-fixture.mjs";
import { retireAbandonedChatGateCeremonies, runRegisteredAttendedChatGateConfirmation } from "./chat-gate-ceremony.mjs";

const J3_CHILD = `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const kill = JSON.parse(process.env.J3_KILL);
const hit = () => process.kill(process.pid, "SIGKILL");
if (kill.afterRecord) {
  const realLink = fs.linkSync;
  const realUnlink = fs.unlinkSync;
  // "before": the record's temporary file is written and not yet linked. "after": the record is linked AND its temporary file is gone (the record is whole).
  fs.linkSync = (from, to) => {
    const m = /chat-gate-ceremonies[\\\\/][0-9a-f]{32}[.](reserved|running|terminal-observed)[.]json$/u.exec(String(to));
    if (m && m[1] === kill.afterRecord.phase && kill.afterRecord.when === "before") hit();
    return realLink(from, to);
  };
  fs.unlinkSync = (path) => {
    const m = /chat-gate-ceremonies[\\\\/][0-9a-f]{32}[.](reserved|running|terminal-observed)[.]json[.]\\d+[.][0-9a-f]{16}[.]tmp$/u.exec(String(path));
    const result = realUnlink(path);
    if (m && m[1] === kill.afterRecord.phase && kill.afterRecord.when === "after") hit();
    return result;
  };
}
if (kill.body) {
  // The ceremony body is the passphrase/confirmation prompt: an attended terminal on fd 0 whose read ends the process.
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  const realRead = fs.readSync;
  fs.readSync = (fd, ...rest) => (fd === 0 ? hit() : realRead(fd, ...rest));
}
syncBuiltinESMExports();
const registry = await import(process.env.J3_REGISTRY);
const ceremony = await import(process.env.J3_CEREMONY);
const repository = JSON.parse(process.env.J3_REPO);
const run = () => ceremony.runRegisteredAttendedChatGateConfirmation({ repository, summaryLines: ["x"], expected: "x" });
if (kill.stage) {
  let seen = 0;
  const observer = registry.createSessionAuthorityMethodStageObserver({ onStage: ({ stage }) => { if (stage === kill.stage.name && ++seen === kill.stage.nth) hit(); } });
  registry.withSessionAuthorityMethodStages({ observer }, run);
} else run();
`;
const J3_SKIP = process.platform === "win32" ? "the kill points use SIGKILL and a Linux fs interception" : false;
const j3Ceremonies = (repository) => join(repository.commonDir, "agent-pipeline", "chat-gate-ceremonies");
const j3Files = (repository) => existsSync(j3Ceremonies(repository)) ? readdirSync(j3Ceremonies(repository)).sort() : [];
const j3Read = (repository) => { try { return inspectSessionAuthorityRegistryRead({ repository }); } catch (error) { return { status: "threw", message: String(error?.message ?? error).slice(0, 160) }; } };

/** Ends one real ceremony at the named point; the child process is gone afterwards. */
function j3Killed(repository, kill) {
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", J3_CHILD], {
    encoding: "utf8",
    env: { ...process.env, J3_KILL: JSON.stringify(kill), J3_REPO: JSON.stringify(repository),
      J3_REGISTRY: new URL("./session-authority-registry.mjs", import.meta.url).href, J3_CEREMONY: new URL("./chat-gate-ceremony.mjs", import.meta.url).href },
  });
  assert.equal(child.signal, "SIGKILL", `the child must end at the kill point: ${child.stderr}`);
  return child;
}
/** What the next start of a ceremony does: the second ceremony runs unattended, so it ends `cancelled` by itself when it starts at all. */
function j3Start(repository) {
  try { return { result: runRegisteredAttendedChatGateConfirmation({ repository, summaryLines: ["x"], expected: "x" }) }; }
  catch (error) { return { refused: String(error?.message ?? error), repair: error?.repair }; }
}
function j3Fixture() { return prepareSessionAuthorityRegistryFixture(); }
/** One retirement pass inside the registry boundary, as a ceremony start runs it; what is left to retire or to keep. */
const j3Retire = (repository) => withSessionAuthorityBoundary({ repository }, (boundary) => retireAbandonedChatGateCeremonies({ repository, boundary }));

// kill point -> what the registry member and the records look like afterwards
const J3_POINTS = [
  ["P1 after the member reserve, before any record", { stage: { name: "after-reservation-published-before-effects", nth: 1 } }],
  ["P2 after the reserved record, before the running record", { afterRecord: { phase: "reserved", when: "after" } }],
  ["P3 after the running record, before the member advance (A7-4 window 1)", { afterRecord: { phase: "running", when: "after" } }],
  ["P4 after the terminal record, before the member advance (A7-4 window 2)", { afterRecord: { phase: "terminal-observed", when: "after" } }],
  ["P5 after the terminal advance, before the release", { stage: { name: "after-owner-effects-readback", nth: 2 } }],
  ["P6 inside the release, between the release record and the member update", { stage: { name: "after-release-published-before-member-update", nth: 1 } }],
];

for (const [name, kill] of J3_POINTS) {
  // P1 cannot be closed: the member is keyed by the binding digest and no record exists yet, so the ceremony's owner file (keyed by its id) cannot be linked
  // to it without a new stored field. Its next start is refused, and the refusal names the runnable repair (asserted in the next test).
  if (!name.startsWith("P1")) test(`C30J-J3 ${name}: the next ceremony start needs no repair and leaves a readable registry`, { skip: J3_SKIP }, () => {
    const { repoDir, repository } = j3Fixture();
    try {
      j3Killed(repository, kill);
      const next = j3Start(repository);
      assert.equal(next.refused, undefined, `the next start was refused: ${next.refused} / repair: ${next.repair}`);
      assert.deepEqual(next.result, { ok: false, code: CHAT_GATE_NOT_ATTENDED });
      assert.deepEqual(j3Read(repository), { status: "readable" });
    } finally { rmSync(repoDir, { recursive: true, force: true }); }
  });
  // A plain registry read before any start is refused: P1 by this module's own `reconcile` (`chat:member-without-source`), P2 to P4 by the registry's stored
  // baseline comparison (`chat-gate:namespace-drift`), and a writer killed inside its boundary leaves the registry lock behind (`registry-lock-held`); the
  // baseline comparison and the lock live in session-authority-registry.mjs, outside this slice's write list, so these stay visible as todo cases.
  test(`C30J-J3 ${name}: a plain registry read before any new start is readable`, { skip: J3_SKIP, todo: "P1 cannot be tied to a ceremony; P2 to P6 need session-authority-registry.mjs (baseline comparison, lock), outside the write list of C30J-J3" }, () => {
    const { repoDir, repository } = j3Fixture();
    try {
      j3Killed(repository, kill);
      assert.deepEqual(j3Read(repository), { status: "readable" });
    } finally { rmSync(repoDir, { recursive: true, force: true }); }
  });
}

test("C30J-J3 P1: a member reserved by a writer that ended before any record cannot be tied to a ceremony; the next start is refused and the refusal names the runnable repair", { skip: J3_SKIP }, () => {
  const { repoDir, repository } = j3Fixture();
  try {
    j3Killed(repository, J3_POINTS[0][1]);
    const next = j3Start(repository);
    assert.match(String(next.refused), /^chat:member-without-source$/u);
    assert.match(String(next.repair), /routine-repair\.mjs run move-aside --no-goldfish-running --root /u);
  } finally { rmSync(repoDir, { recursive: true, force: true }); }
});

test("C30J-J3 P3b a kill after the temporary file of the running record was written and before it was linked leaves no unreadable file and the next start works", { skip: J3_SKIP }, () => {
  const { repoDir, repository } = j3Fixture();
  try {
    j3Killed(repository, { afterRecord: { phase: "running", when: "before" } });
    const next = j3Start(repository);
    assert.equal(next.refused, undefined, `the next start was refused: ${next.refused} / repair: ${next.repair} / files: ${j3Files(repository).join(",")}`);
    assert.deepEqual(j3Read(repository), { status: "readable" });
  } finally { rmSync(repoDir, { recursive: true, force: true }); }
});

// A ceremony that recorded no owner (every ceremony of a build before C30I-S6) cannot be judged dead by its owner record.
for (const [name, kill] of [
  ["P2", { afterRecord: { phase: "reserved", when: "after" } }],
  ["P3", { afterRecord: { phase: "running", when: "after" } }],
  ["P4", { afterRecord: { phase: "terminal-observed", when: "after" } }],
]) {
  test(`C30J-J3 ${name} with no owner record: a member BEHIND its records is provably left by a writer that ended, so the next start closes it without a repair`, { skip: J3_SKIP }, () => {
    const { repoDir, repository } = j3Fixture();
    try {
      j3Killed(repository, kill);
      rmSync(join(repository.commonDir, "agent-pipeline", "chat-gate-ceremony-owners"), { recursive: true, force: true });
      const id = j3Files(repository)[0].split(".")[0];
      const next = j3Start(repository);
      assert.equal(next.refused, undefined, `the next start was refused: ${next.refused} / repair: ${next.repair}`);
      assert.deepEqual(j3Read(repository), { status: "readable" });
      const terminal = join(j3Ceremonies(repository), `${id}.terminal-observed.json`);
      assert.equal(JSON.parse(readFileSync(terminal, "utf8")).terminal, "cancelled", "the left-over ceremony ends as cancelled");
      // The record check alone does not show that the registry member was closed: a second retirement pass must find nothing left to retire or to keep.
      assert.deepEqual(j3Retire(repository), { retired: [], kept: [] }, "the member of the left-over ceremony was released by the start");
    } finally { rmSync(repoDir, { recursive: true, force: true }); }
  });
}

// A ceremony that ended after its terminal advance and recorded no owner is consistent (member and records agree), so a live owner in another process
// may still be releasing it: the next start works, and the ceremony is neither refused nor retired on a guess.
test("C30J-J3 P5 with no owner record: a member that agrees with its complete records is kept, not retired, and the next start works", { skip: J3_SKIP }, () => {
  const { repoDir, repository } = j3Fixture();
  try {
    j3Killed(repository, { stage: { name: "after-owner-effects-readback", nth: 2 } });
    rmSync(join(repository.commonDir, "agent-pipeline", "chat-gate-ceremony-owners"), { recursive: true, force: true });
    const next = j3Start(repository);
    assert.equal(next.refused, undefined, `the next start was refused: ${next.refused} / repair: ${next.repair}`);
    assert.deepEqual(j3Read(repository), { status: "readable" });
    const pass = j3Retire(repository);
    assert.deepEqual(pass.retired, []);
    assert.equal(pass.kept.length, 1);
    assert.match(pass.kept[0].why, /no process is recorded as its owner/u);
  } finally { rmSync(repoDir, { recursive: true, force: true }); }
});

// A member that is NOT behind its records (it agrees with them: the ceremony body, the prompt, is what runs) may belong to a live owner in another
// process, so it is closed only with a recorded owner that is provably gone, never on a guess.
test("C30J-J3 P-body a ceremony that ended inside its prompt (member and records agree, owner gone) is retired by the next start", { skip: J3_SKIP }, () => {
  const { repoDir, repository } = j3Fixture();
  try {
    j3Killed(repository, { body: true });
    assert.deepEqual(j3Files(repository).map((name) => name.split(".")[1]), ["reserved", "running"]);
    const id = j3Files(repository)[0].split(".")[0];
    const next = j3Start(repository);
    assert.equal(next.refused, undefined, `the next start was refused: ${next.refused} / repair: ${next.repair}`);
    assert.equal(JSON.parse(readFileSync(join(j3Ceremonies(repository), `${id}.terminal-observed.json`), "utf8")).terminal, "cancelled");
    assert.deepEqual(j3Read(repository), { status: "readable" });
  } finally { rmSync(repoDir, { recursive: true, force: true }); }
});
test("C30J-J3 P-body with no owner record: a member that agrees with its records is not retired on a guess (its records stay as they are)", { skip: J3_SKIP }, () => {
  const { repoDir, repository } = j3Fixture();
  try {
    j3Killed(repository, { body: true });
    rmSync(join(repository.commonDir, "agent-pipeline", "chat-gate-ceremony-owners"), { recursive: true, force: true });
    const id = j3Files(repository)[0].split(".")[0];
    j3Start(repository);
    assert.deepEqual(j3Files(repository).filter((name) => name.startsWith(id)).map((name) => name.split(".")[1]), ["reserved", "running"], "nothing was written to the ceremony");
    const pass = j3Retire(repository);
    assert.deepEqual(pass.retired, []);
    assert.equal(pass.kept.length, 1);
  } finally { rmSync(repoDir, { recursive: true, force: true }); }
});

// What stays refused (the analysis rule KEEPS refusing a member ahead of its records and non-prefix facts). The state is the prompt kill with no owner record;
// the repair named is the registry move-aside. A changed association is refused by the first, unchanged check of `reconcile` and cannot be built from outside.
for (const [name, damage] of [
  ["a member AHEAD of its records (a record the member already saw is gone)", (dir, id) => rmSync(join(dir, `${id}.running.json`))],
  ["non-prefix facts (a record replaced by a copy of the same bytes on another file)", (dir, id) => {
    const path = join(dir, `${id}.running.json`), copy = join(dir, "..", `${id}.copy`);
    writeFileSync(copy, readFileSync(path), { mode: 0o600 });
    renameSync(copy, path);
  }],
]) {
  test(`C30J-J3 stays refused: ${name}; the refusal names the runnable repair`, { skip: J3_SKIP }, () => {
    const { repoDir, repository } = j3Fixture();
    try {
      j3Killed(repository, { body: true });
      rmSync(join(repository.commonDir, "agent-pipeline", "chat-gate-ceremony-owners"), { recursive: true, force: true });
      damage(j3Ceremonies(repository), j3Files(repository)[0].split(".")[0]);
      const next = j3Start(repository);
      assert.equal(next.refused, "chat:member-source-drift");
      assert.match(String(next.repair), /routine-repair\.mjs run move-aside --no-goldfish-running --root /u);
    } finally { rmSync(repoDir, { recursive: true, force: true }); }
  });
}
