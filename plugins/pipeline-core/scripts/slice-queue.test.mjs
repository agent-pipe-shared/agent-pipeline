// SPDX-License-Identifier: SUL-1.0
// FANOUT slice S4: child-process contract tests for the slice-queue CLI.
// Every case spawns the real script with `process.execPath` inside a fresh sandbox
// directory under the repository `scratch/` (never host temp) and reads the JSON
// the script printed. The private ledger lives in a sandbox `--common-dir`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull } from "node:os";
import { openSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendEvent, readEvents } from "../lib/fanout-ledger.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "slice-queue.mjs");
const SCRATCH = resolve(HERE, "..", "..", "..", "scratch", "FANOUT-S4");
const NOW = "2026-10-05T12:00:00.000Z";
const sandboxes = [];

const cases = [];
function check(name, run) {
  cases.push({ id: `SC${String(cases.length + 1).padStart(2, "0")}`, name, run });
}

function sandbox() {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH, "cli-"));
  sandboxes.push(dir);
  return dir;
}
function cli(cwd, args) {
  const child = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 60_000 });
  let json = null;
  try {
    json = JSON.parse(child.stdout);
  } catch { /* leave null: the assertion that needs it fails loudly */ }
  return { status: child.status, json, stdout: child.stdout, stderr: child.stderr };
}
const slice = (id, writeScope, extra = {}) => ({
  id, title: `slice ${id}`, state: "ready", writeScope, tier: "implementor", commitMode: "diff-only", loadClass: "light", ...extra,
});
function queueText(slices, extra = {}) {
  return `${JSON.stringify({ schema: "pipeline.slice-queue.v1", feature: "demo", slices, ...extra }, null, 2)}\n`;
}
function writeQueue(dir, slices, extra = {}, rel = "specs/demo/slice-queue.json") {
  const path = join(dir, ...rel.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, queueText(slices, extra));
  return path;
}
const REL = "specs/demo/slice-queue.json";
const ledgerArgs = (dir) => ["--common-dir", join(dir, "git-common"), "--runner", "claude", "--session", "sess-1"];
const codes = (list) => list.map((item) => item.code);

check("validate: a valid queue exits 0 with machine-readable JSON (absolute --queue)", () => {
  const dir = sandbox();
  const path = writeQueue(dir, [slice("A", ["a.mjs"]), slice("B", ["b.mjs"])]);
  const result = cli(dir, ["validate", "--queue", path]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.verb, "validate");
  assert.equal(result.json.status, "valid");
  assert.deepEqual(result.json.errors, []);
});

check("validate: an absent queue exits 4 SQ-NOT-FOUND, an invalid one exits 3 with the library's codes", () => {
  const dir = sandbox();
  const absent = cli(dir, ["validate", "--queue", REL]);
  assert.equal(absent.status, 4);
  assert.equal(absent.json.code, "SQ-NOT-FOUND");
  writeQueue(dir, [slice("A", ["lib/x.mjs"]), slice("B", ["lib/x.mjs"])]);
  const overlap = cli(dir, ["validate", "--queue", REL]);
  assert.equal(overlap.status, 3);
  assert.equal(overlap.json.ok, false);
  assert.ok(codes(overlap.json.errors).includes("SQ-OVERLAP"));
});

check("add: --init-feature creates the queue (relative --queue), a second add appends, the result validates", () => {
  const dir = sandbox();
  const first = cli(dir, ["add", "--queue", REL, "--init-feature", "demo", "--id", "A", "--title", "first", "--write-scope", "a.mjs"]);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(first.json.ok, true);
  const second = cli(dir, ["add", "--queue", REL, "--id", "B", "--title", "second", "--write-scope", "b.mjs", "--write-scope", "b.test.mjs", "--depends-on", "A", "--tier", "mechanic"]);
  assert.equal(second.status, 0, second.stdout + second.stderr);
  const stored = JSON.parse(readFileSync(join(dir, ...REL.split("/")), "utf8"));
  assert.equal(stored.schema, "pipeline.slice-queue.v1");
  assert.deepEqual(stored.slices.map((item) => item.id), ["A", "B"]);
  assert.deepEqual(stored.slices[1].writeScope, ["b.mjs", "b.test.mjs"]);
  assert.deepEqual(stored.slices[1].dependsOn, ["A"]);
  assert.equal(stored.slices[1].tier, "mechanic");
  assert.equal(cli(dir, ["validate", "--queue", REL]).status, 0);
});

check("invalid-schema: a refused mutation exits 3 with a typed code and leaves the queue byte-for-byte and no temp file", () => {
  const dir = sandbox();
  const path = writeQueue(dir, [slice("A", ["a.mjs"])]);
  const before = readFileSync(path);
  const unknownDep = cli(dir, ["add", "--queue", path, "--id", "B", "--title", "b", "--write-scope", "b.mjs", "--depends-on", "NOPE"]);
  assert.equal(unknownDep.status, 3);
  assert.equal(unknownDep.json.ok, false);
  assert.ok(codes(unknownDep.json.errors).includes("SQ-DEP-UNKNOWN"));
  const duplicate = cli(dir, ["add", "--queue", path, "--id", "A", "--title", "again", "--write-scope", "z.mjs"]);
  assert.equal(duplicate.status, 3);
  assert.ok(codes(duplicate.json.errors).includes("SQ-ID"));
  const shared = cli(dir, ["add", "--queue", path, "--id", "C", "--title", "c", "--write-scope", "docs/state.md"]);
  assert.equal(shared.status, 3);
  assert.ok(codes(shared.json.errors).includes("SQ-SHARED-SURFACE"));
  assert.ok(readFileSync(path).equals(before), "queue file must be unchanged");
  assert.deepEqual(readdirSync(dirname(path)), ["slice-queue.json"], "no temp file may survive a refused write");
});

check("invalid-schema: a corrupt queue file refuses every mutating verb and stays untouched", () => {
  const dir = sandbox();
  const path = join(dir, "q.json");
  writeFileSync(path, `${JSON.stringify({ schema: "pipeline.slice-queue.v1", feature: "demo", dependson: [], slices: [slice("A", ["a.mjs"])] })}\n`);
  const before = readFileSync(path);
  for (const args of [["defer", "A", "--reason", "x"], ["hold", "A", "--po-question", "x"], ["depend", "A", "A"], ["add", "--id", "B", "--title", "b", "--write-scope", "b.mjs"]]) {
    const result = cli(dir, [...args, "--queue", path]);
    assert.equal(result.status, 3, `${args[0]}: ${result.stdout}`);
    assert.ok(codes(result.json.errors).includes("SQ-SCHEMA"));
  }
  writeFileSync(path, "{not json");
  assert.equal(cli(dir, ["validate", "--queue", path]).status, 3);
  assert.equal(readFileSync(path, "utf8"), "{not json");
  assert.deepEqual(readdirSync(dir), ["q.json"]);
  assert.ok(before.length > 0);
});

check("next: returns the first ready slice in queue order, honours dependsOn and --limit", () => {
  const dir = sandbox();
  writeQueue(dir, [slice("Z", ["z.mjs"]), slice("A", ["a.mjs"], { dependsOn: ["Z"] }), slice("M", ["m.mjs"])]);
  const result = cli(dir, ["next", "--queue", REL, "--now", NOW]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.json.ready, ["Z", "M"]);
  assert.equal(result.json.next, "Z");
  assert.equal(result.json.counts.blocked, 1);
  const limited = cli(dir, ["next", "--queue", REL, "--now", NOW, "--limit", "1"]);
  assert.deepEqual(limited.json.ready, ["Z"]);
});

check("next: a terminal dispatch record makes the slice done and unblocks its dependants", () => {
  const dir = sandbox();
  writeQueue(dir, [slice("A", ["a.mjs"]), slice("B", ["b.mjs"], { dependsOn: ["A"] })]);
  mkdirSync(join(dir, "evidence"), { recursive: true });
  writeFileSync(join(dir, "evidence", "dispatch-record-A.json"), `${JSON.stringify({ taskId: "A", outcome: "completed" })}\n`);
  const result = cli(dir, ["next", "--queue", REL, "--now", NOW]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(result.json.ready, ["B"]);
  assert.equal(result.json.counts.done, 1);
});

check("defer / hold / depend change the declared state and take the slice out of the ready set", () => {
  const dir = sandbox();
  writeQueue(dir, [slice("A", ["a.mjs"]), slice("B", ["b.mjs"]), slice("C", ["c.mjs"]), slice("D", ["d.mjs"])]);
  const deferred = cli(dir, ["defer", "A", "--queue", REL, "--reason", "not now"]);
  assert.equal(deferred.status, 0, deferred.stdout + deferred.stderr);
  const held = cli(dir, ["hold", "B", "--queue", REL, "--po-question", "which shape?"]);
  assert.equal(held.status, 0, held.stdout + held.stderr);
  const dep = cli(dir, ["depend", "C", "D", "--queue", REL]);
  assert.equal(dep.status, 0, dep.stdout + dep.stderr);
  assert.equal(cli(dir, ["depend", "C", "D", "--queue", REL]).status, 0, "depend is idempotent");
  const stored = JSON.parse(readFileSync(join(dir, ...REL.split("/")), "utf8"));
  const byId = Object.fromEntries(stored.slices.map((item) => [item.id, item]));
  assert.equal(byId.A.state, "deferred");
  assert.equal(byId.A.holdReason, "not now");
  assert.equal(byId.B.state, "hold-po");
  assert.equal(byId.B.holdReason, "which shape?");
  assert.deepEqual(byId.C.dependsOn, ["D"]);
  assert.deepEqual(cli(dir, ["next", "--queue", REL, "--now", NOW]).json.ready, ["D"]);
});

check("defer / hold / depend: usage errors exit 2, unknown ids exit 4, a dependency cycle exit 3", () => {
  const dir = sandbox();
  const path = writeQueue(dir, [slice("A", ["a.mjs"]), slice("B", ["b.mjs"], { dependsOn: ["A"] })]);
  const before = readFileSync(path);
  assert.equal(cli(dir, ["defer", "A", "--queue", REL]).status, 2, "defer needs --reason");
  assert.equal(cli(dir, ["hold", "A", "--queue", REL]).status, 2, "hold needs --po-question");
  assert.equal(cli(dir, ["defer", "NOPE", "--queue", REL, "--reason", "x"]).status, 4);
  const cycle = cli(dir, ["depend", "A", "B", "--queue", REL]);
  assert.equal(cycle.status, 3);
  assert.ok(codes(cycle.json.errors).includes("SQ-DEP-CYCLE"));
  assert.ok(readFileSync(path).equals(before));
});

check("pause: records a hashed pause event, refuses a window over 4 hours and a missing session", () => {
  const dir = sandbox();
  writeQueue(dir, [slice("A", ["a.mjs"])]);
  const ok = cli(dir, ["pause", "--by", "po", "--reason", "lunch", "--until", "2026-10-05T13:00:00.000Z", "--now", NOW, ...ledgerArgs(dir)]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(ok.json.event.type, "pause");
  assert.equal(ok.json.event.by, "po");
  assert.ok(!ok.stdout.includes("lunch"), "the reason sentence must not be echoed into the ledger event");
  const events = readEvents(join(dir, "git-common"), "claude", "sess-1").events;
  assert.deepEqual(events.map((event) => event.type), ["pause"]);
  const tooLong = cli(dir, ["pause", "--by", "elephant", "--reason", "x", "--until", "2026-10-05T17:00:00.000Z", "--now", NOW, ...ledgerArgs(dir)]);
  assert.equal(tooLong.status, 2);
  assert.equal(tooLong.json.code, "SQ-USAGE");
  assert.equal(cli(dir, ["pause", "--by", "po", "--reason", "x", "--until", "2026-10-05T13:00:00.000Z", "--now", NOW]).status, 2);
});

check("reap: frees a silent live slice by writing a finish/reap event; unknown id exits 4; reason is mandatory", () => {
  const dir = sandbox();
  writeQueue(dir, [slice("A", ["a.mjs"]), slice("B", ["b.mjs"])]);
  const common = join(dir, "git-common");
  appendEvent(common, "claude", "sess-1", { type: "launch", sliceId: "A", agentType: "goldfish-implementor", model: "m", writeScopeHash: "a".repeat(64), commitMode: "diff-only", at: "2026-10-05T10:00:00.000Z" });
  const live = cli(dir, ["next", "--queue", REL, "--now", NOW, ...ledgerArgs(dir)]);
  assert.equal(live.status, 0, live.stdout + live.stderr);
  assert.deepEqual(live.json.live.map((entry) => entry.sliceId), ["A"]);
  assert.deepEqual(live.json.ready, ["B"]);
  assert.equal(cli(dir, ["reap", "A", "--queue", REL, ...ledgerArgs(dir)]).status, 2, "reap needs --reason");
  assert.equal(cli(dir, ["reap", "NOPE", "--queue", REL, "--reason", "dead", "--now", NOW, ...ledgerArgs(dir)]).status, 4);
  const reaped = cli(dir, ["reap", "A", "--queue", REL, "--reason", "dead agent", "--now", NOW, ...ledgerArgs(dir)]);
  assert.equal(reaped.status, 0, reaped.stdout + reaped.stderr);
  assert.equal(reaped.json.event.how, "reap");
  assert.match(reaped.json.event.reasonSha256, /^[a-f0-9]{64}$/u);
  const after = cli(dir, ["next", "--queue", REL, "--now", NOW, ...ledgerArgs(dir)]);
  assert.deepEqual(after.json.live, []);
  assert.deepEqual(after.json.ready, ["A", "B"]);
});

check("finish: writes a finish event with the chosen --how (default elephant); a bad --how exits 2", () => {
  const dir = sandbox();
  writeQueue(dir, [slice("A", ["a.mjs"])]);
  const done = cli(dir, ["finish", "A", "--queue", REL, "--now", NOW, ...ledgerArgs(dir)]);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  assert.equal(done.json.event.how, "elephant");
  const notified = cli(dir, ["finish", "A", "--queue", REL, "--how", "notification", "--now", NOW, ...ledgerArgs(dir)]);
  assert.equal(notified.json.event.how, "notification");
  assert.equal(cli(dir, ["finish", "A", "--queue", REL, "--how", "bogus", ...ledgerArgs(dir)]).status, 2);
  assert.equal(cli(dir, ["finish", "A", "--queue", REL, "--now", NOW]).status, 2, "finish needs a session");
  assert.deepEqual(readEvents(join(dir, "git-common"), "claude", "sess-1").events.map((event) => event.how), ["elephant", "notification"]);
});

check("report: summarises the queue and the session ledger as JSON", () => {
  const dir = sandbox();
  writeQueue(dir, [slice("A", ["a.mjs"]), slice("B", ["b.mjs"])]);
  const common = join(dir, "git-common");
  appendEvent(common, "claude", "sess-1", { type: "stop-eval", live: 0, target: 2, ready: 2, decision: "block", reason: "FANOUT-UNDERFILLED", mode: "enforce", at: "2026-10-05T11:00:00.000Z" });
  appendEvent(common, "claude", "sess-1", { type: "stop-eval", live: 1, target: 2, ready: 1, decision: "allow", reason: "FANOUT-OK", mode: "enforce", at: "2026-10-05T11:10:00.000Z" });
  appendEvent(common, "claude", "sess-1", { type: "block", reasonCode: "FANOUT-UNDERFILLED", live: 0, target: 2, ready: 2, at: "2026-10-05T11:00:00.000Z" });
  const result = cli(dir, ["report", "--queue", REL, "--now", NOW, ...ledgerArgs(dir)]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.json.verb, "report");
  assert.equal(result.json.queue.size, 2);
  assert.equal(result.json.ledger.events.block, 1);
  assert.equal(result.json.ledger.events["stop-eval"], 2);
  assert.equal(result.json.ledger.slotIdleMinutesWithReady, 20, "10 min x 2 idle slots, then 10 min x 1 idle slot is not counted past the last eval");
  const queueOnly = cli(dir, ["report", "--queue", REL, "--now", NOW]);
  assert.equal(queueOnly.status, 0);
  assert.equal(queueOnly.json.ledger, null);
});

check("usage: an unknown verb, a missing --queue and an unknown flag exit 2 with SQ-USAGE", () => {
  const dir = sandbox();
  writeQueue(dir, [slice("A", ["a.mjs"])]);
  for (const args of [["bogus", "--queue", REL], ["validate"], ["validate", "--queue", REL, "--nonsense", "1"], []]) {
    const result = cli(dir, args);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.equal(result.json.ok, false);
    assert.equal(result.json.code, "SQ-USAGE");
  }
});

assert.equal(cases.length, 14, "the complete CLI corpus must be registered before execution begins");
process.on("exit", () => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
