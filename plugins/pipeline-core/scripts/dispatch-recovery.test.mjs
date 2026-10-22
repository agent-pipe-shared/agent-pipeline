// SPDX-License-Identifier: SUL-1.0
/**
 * dispatch-recovery verb (AC-245, P1-1 bullet 3, D139): every case drives the real CLI as a child process against
 * a private temp root. Suite name for registration (an operator step): dispatch-recovery, file
 * plugins/pipeline-core/scripts/dispatch-recovery.test.mjs.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "dispatch-recovery.mjs");
const OID = (char) => char.repeat(40);

const run = (args) => new Promise((done) => {
  execFile(process.execPath, [script, ...args], { encoding: "utf8" }, (error, stdout, stderr) => {
    done({ status: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr, json: stdout.trim() === "" ? null : JSON.parse(stdout) });
  });
});

const packetOf = (dispatchId, role = "critic") => ({ dispatchId, role, candidate: { commit: OID("a"), tree: OID("b") } });
const failedResult = (dispatchId, role = "critic", stderr = "boom", exitCode = 3) => ({
  schema: "pipeline.canonical-role-fallback.v1", status: "failed", code: "RDF-PRODUCER-FAILED", route: "fallback-self-dispatch",
  reasonCode: "RRP-NO-HOST-OBSERVATION", preparation: { packet: { dispatchId, role } }, output: { exitCode, stdout: "", stderr },
});
const returnedResult = (dispatchId, role = "critic") => ({ ...failedResult(dispatchId, role), status: "returned", code: "RDF-RETURNED", output: { exitCode: 0, stdout: "ok", stderr: "" } });

function sandbox() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dispatch-recovery-cli-")));
  const put = (name, value) => { const path = join(root, name); writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value)); return path; };
  return { root, put, cleanup: () => rmSync(root, { recursive: true, force: true }), files: () => readdirSync(root, { recursive: true }).sort() };
}
const recordArgs = (box, id, result, extra = []) => ["record", "--root", box.root, "--packet", box.put(`packet-${id}.json`, packetOf(id)), "--result", box.put(`result-${id}-${extra.length}-${Math.random()}.json`, result), ...extra];
const stateName = (id) => `evidence/dispatch-recovery-${id}.json`;

test("record opens the state from the first failed result and inspect reads it back", async () => {
  const box = sandbox();
  try {
    const opened = await run(recordArgs(box, "task-1", failedResult("task-1")));
    assert.equal(opened.status, 0, opened.stdout);
    assert.equal(opened.json.ok, true);
    assert.equal(opened.json.state.status, "open");
    assert.equal(opened.json.state.attempts.length, 1);
    assert.equal(opened.json.state.attempts[0].code, "RDF-PRODUCER-FAILED");
    const read = await run(["inspect", "--root", box.root, "--dispatch-id", "task-1"]);
    assert.equal(read.status, 0);
    assert.deepEqual(read.json.state, opened.json.state);
  } finally { box.cleanup(); }
});

test("record appends with the expected count and resolves on a returned attempt; clear removes only a resolved state", async () => {
  const box = sandbox();
  try {
    await run(recordArgs(box, "task-2", failedResult("task-2")));
    const second = await run(recordArgs(box, "task-2", failedResult("task-2", "critic", "again", 4), ["--expected-attempts", "1"]));
    assert.equal(second.json.state.attempts.length, 2);
    assert.deepEqual(second.json.state.attempts[0].stderr, "boom");
    const early = await run(["clear", "--root", box.root, "--dispatch-id", "task-2"]);
    assert.equal(early.status, 1);
    assert.equal(early.json.code, "DRC-OPEN-STATE");
    assert.match(early.json.repair, /--expected-attempts 2/u);
    const before = readFileSync(join(box.root, stateName("task-2")), "utf8");
    const done = await run(recordArgs(box, "task-2", returnedResult("task-2"), ["--expected-attempts", "2"]));
    assert.equal(done.json.state.status, "resolved");
    assert.notEqual(readFileSync(join(box.root, stateName("task-2")), "utf8"), before);
    const cleared = await run(["clear", "--root", box.root, "--dispatch-id", "task-2"]);
    assert.equal(cleared.status, 0, cleared.stdout);
    assert.equal(cleared.json.discarded, "resolved");
    assert.equal((await run(["inspect", "--root", box.root, "--dispatch-id", "task-2"])).json.code, "DRS-NO-RECOVERY");
  } finally { box.cleanup(); }
});

test("refusals name one runnable repair and write nothing", async () => {
  const box = sandbox();
  try {
    await run(recordArgs(box, "task-3", failedResult("task-3")));
    const snapshot = box.files();
    const bytes = readFileSync(join(box.root, stateName("task-3")), "utf8");
    const cases = [
      [recordArgs(box, "task-3", failedResult("task-3")), "DRS-STALE", /--expected-attempts 1|expected attempt/u],
      [recordArgs(box, "task-3", failedResult("task-3"), ["--expected-attempts", "5"]), "DRS-STALE", /--expected-attempts 1/u],
      [recordArgs(box, "task-3", failedResult("other-task"), ["--expected-attempts", "1"]), "DRS-ATTEMPT-INVALID", /unmodified JSON/u],
      [recordArgs(box, "task-3", { schema: "x" }, ["--expected-attempts", "1"]), "DRS-ATTEMPT-INVALID", /unmodified JSON/u],
      [["inspect", "--root", box.root, "--dispatch-id", "no-such-task"], "DRS-NO-RECOVERY", /record/u],
      [["inspect", "--root", box.root, "--dispatch-id", "../escape"], "DRS-INPUT", /dispatch id/u],
    ];
    for (const [args, code, repair] of cases) {
      const refused = await run(args);
      assert.equal(refused.status, 1, JSON.stringify(refused.json));
      assert.equal(refused.json.ok, false);
      assert.equal(refused.json.code, code);
      assert.match(refused.json.repair, repair);
      assert.equal(typeof refused.json.message, "string");
    }
    const renamedPacket = { ...packetOf("task-3"), role: "advisor" };
    const mismatch = await run(["record", "--root", box.root, "--packet", box.put("renamed.json", renamedPacket), "--result", box.put("r.json", failedResult("task-3", "advisor")), "--expected-attempts", "1"]);
    assert.equal(mismatch.json.code, "DRS-IDENTITY-MISMATCH");
    const renamed = await run(["record", "--root", box.root, "--packet", box.put("renamed2.json", packetOf("renamed-3")), "--result", box.put("r2.json", failedResult("renamed-3")), "--expected-attempts", "1"]);
    assert.equal(renamed.json.code, "DRC-EXPECTED", "a renamed task has no state of its own and cannot take over another's");
    assert.deepEqual(readdirSync(join(box.root, "evidence")), ["dispatch-recovery-task-3.json"]);
    assert.equal(readFileSync(join(box.root, stateName("task-3")), "utf8"), bytes);
    assert.deepEqual(box.files().filter((name) => name.startsWith("evidence")), snapshot.filter((name) => name.startsWith("evidence")));
  } finally { box.cleanup(); }
});

test("closed grammar: unknown verb, unknown or duplicate flag, missing value, relative or symlinked root are refused with nothing written", async () => {
  const box = sandbox();
  try {
    const link = join(tmpdir(), `dispatch-recovery-link-${process.pid}`);
    symlinkSync(box.root, link);
    const packet = box.put("p.json", packetOf("task-4"));
    const result = box.put("r.json", failedResult("task-4"));
    try {
      const bad = [
        [[], "DRC-USAGE"], [["frobnicate"], "DRC-USAGE"],
        [["inspect", "--root", box.root], "DRC-USAGE"],
        [["inspect", "--root", box.root, "--dispatch-id", "x", "--extra", "1"], "DRC-USAGE"],
        [["inspect", "--root", box.root, "--root", box.root, "--dispatch-id", "x"], "DRC-USAGE"],
        [["inspect", "--root", box.root, "--dispatch-id"], "DRC-USAGE"],
        [["record", "--root", box.root, "--packet", packet, "--result", result, "--discard-corrupt"], "DRC-USAGE"],
        [["record", "--root", "relative/dir", "--packet", packet, "--result", result], "DRC-ROOT"],
        [["record", "--root", `${box.root}/../${box.root.split("/").at(-1)}`, "--packet", packet, "--result", result], "DRC-ROOT"],
        [["record", "--root", link, "--packet", packet, "--result", result], "DRC-ROOT"],
        [["record", "--root", join(box.root, "missing"), "--packet", packet, "--result", result], "DRC-ROOT"],
        [["record", "--root", box.root, "--packet", join(box.root, "missing.json"), "--result", result], "DRC-INPUT-FILE"],
        [["record", "--root", box.root, "--packet", packet, "--result", box.put("big.json", JSON.stringify({ pad: "x".repeat(70000) }))], "DRC-INPUT-FILE"],
        [["record", "--root", box.root, "--packet", box.put("arr.json", "[]"), "--result", result], "DRC-INPUT-FILE"],
        [["record", "--root", box.root, "--packet", box.put("nopacket.json", { dispatchId: "x" }), "--result", result], "DRC-PACKET"],
        [["record", "--root", box.root, "--packet", packet, "--result", result, "--expected-attempts", "-1"], "DRC-USAGE"],
      ];
      for (const [args, code] of bad) {
        const refused = await run(args);
        assert.equal(refused.json.code, code, JSON.stringify(args.slice(0, 3)));
        assert.equal(refused.status, code === "DRC-USAGE" ? 2 : 1);
        assert.match(refused.json.repair, /\S/u);
      }
    } finally { rmSync(link, { force: true }); }
    assert.equal(box.files().some((name) => name.startsWith("evidence")), false, "no evidence directory or state was created");
  } finally { box.cleanup(); }
});

test("corrupt and oversize state is refused with the discard repair; clear --discard-corrupt removes only that task's file", async () => {
  const box = sandbox();
  try {
    await run(recordArgs(box, "task-5", failedResult("task-5")));
    await run(recordArgs(box, "task-6", failedResult("task-6")));
    const path = join(box.root, stateName("task-5"));
    for (const corrupt of ["{not json", JSON.stringify({ schema: "pipeline.dispatch-recovery-state.v1" }), "x".repeat(200000)]) {
      writeFileSync(path, corrupt);
      const read = await run(["inspect", "--root", box.root, "--dispatch-id", "task-5"]);
      assert.equal(read.json.code, "DRS-CORRUPT");
      assert.match(read.json.repair, /clear .*--discard-corrupt/u);
      const rec = await run(recordArgs(box, "task-5", failedResult("task-5"), ["--expected-attempts", "1"]));
      assert.equal(rec.json.code, "DRS-CORRUPT");
      assert.equal(readFileSync(path, "utf8"), corrupt, "a refused record leaves the corrupt file untouched");
    }
    const wrongFlag = await run(["clear", "--root", box.root, "--dispatch-id", "task-6", "--discard-corrupt"]);
    assert.equal(wrongFlag.json.code, "DRC-NOT-CORRUPT");
    assert.equal((await run(["inspect", "--root", box.root, "--dispatch-id", "task-6"])).json.ok, true);
    const discarded = await run(["clear", "--root", box.root, "--dispatch-id", "task-5", "--discard-corrupt"]);
    assert.equal(discarded.json.discarded, "corrupt");
    assert.deepEqual(readdirSync(join(box.root, "evidence")), ["dispatch-recovery-task-6.json"]);
    assert.equal((await run(recordArgs(box, "task-5", failedResult("task-5")))).json.ok, true, "the repair path reopens the state");
  } finally { box.cleanup(); }
});

test("the attempt history is bounded: the ninth attempt is refused and the history is kept", async () => {
  const box = sandbox();
  try {
    await run(recordArgs(box, "task-7", failedResult("task-7")));
    for (let count = 1; count < 8; count += 1) {
      const next = await run(recordArgs(box, "task-7", failedResult("task-7"), ["--expected-attempts", String(count)]));
      assert.equal(next.json.ok, true, JSON.stringify(next.json));
    }
    const bytes = readFileSync(join(box.root, stateName("task-7")), "utf8");
    const over = await run(recordArgs(box, "task-7", failedResult("task-7"), ["--expected-attempts", "8"]));
    assert.equal(over.json.code, "DRS-ATTEMPT-LIMIT");
    assert.match(over.json.repair, /Elephant/u);
    assert.equal(readFileSync(join(box.root, stateName("task-7")), "utf8"), bytes);
  } finally { box.cleanup(); }
});

test("concurrent writers never tear the state: it stays verifiable, gapless and leaves no temporary file", async () => {
  const box = sandbox();
  try {
    await run(recordArgs(box, "task-8", failedResult("task-8")));
    const attempts = await Promise.all(Array.from({ length: 6 }, (_, index) => run(recordArgs(box, "task-8", failedResult("task-8", "critic", `w${index}`), ["--expected-attempts", "1"]))));
    for (const attempt of attempts) assert.ok(attempt.json.ok === true || ["DRS-STALE", "DRS-WRITE-FAILED"].includes(attempt.json.code), JSON.stringify(attempt.json));
    assert.ok(attempts.some((attempt) => attempt.json.ok === true), "at least one writer won");
    const read = await run(["inspect", "--root", box.root, "--dispatch-id", "task-8"]);
    assert.equal(read.json.ok, true, JSON.stringify(read.json));
    assert.deepEqual(read.json.state.attempts.map((row) => row.attempt), read.json.state.attempts.map((_, index) => index + 1));
    assert.equal(read.json.state.attempts[0].stderr, "boom", "attempt 1 is never rewritten");
    assert.deepEqual(readdirSync(join(box.root, "evidence")), ["dispatch-recovery-task-8.json"]);
  } finally { box.cleanup(); }
});

test("two dispatches in one root keep independent states", async () => {
  const box = sandbox();
  try {
    mkdirSync(join(box.root, "evidence"));
    await run(recordArgs(box, "task-9", failedResult("task-9")));
    await run(recordArgs(box, "task-10", failedResult("task-10")));
    assert.deepEqual(readdirSync(join(box.root, "evidence")).sort(), ["dispatch-recovery-task-10.json", "dispatch-recovery-task-9.json"]);
  } finally { box.cleanup(); }
});
