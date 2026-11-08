// SPDX-License-Identifier: SUL-1.0
// D194 / D197: the closed routine-repair list. ONE shared table of the four kinds and the refusals, run against a real temporary git
// repository. Delegated tools (heal, slice-queue cancel, move-aside, inspect) are replaced by a recording stub because their own suites
// own their behaviour; the stop-failure-aside repair and the ledger are real.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTINE_REPAIRS, classifyInspectFindings, planRoutineRepair, runRoutineRepair } from "./routine-repair.mjs";
import { runRoutineRepairCli } from "../scripts/routine-repair.mjs";
import { bindNativeCodexStart, createNativeGoldfishAuthorityProducerPort, prepareNativeGoldfishHostState } from "./native-goldfish-host-state.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE } from "./native-goldfish-host-return.mjs";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const CLI = fileURLToPath(new URL("../scripts/routine-repair.mjs", import.meta.url));
const scratchParent = join(here, "../../../scratch/routine-repair-fixtures");
const hex = (char, length) => char.repeat(length);

function withRepo(run) {
  mkdirSync(scratchParent, { recursive: true });
  const root = mkdtempSync(join(scratchParent, "repo-"));
  try {
    assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
    return run(root, join(root, ".git", "agent-pipeline"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const diagDir = (ap) => join(ap, "run", "native-goldfish-host-diagnostics");
const commitDir = (ap) => join(ap, "run", "native-goldfish-host-commit");
function writeStopFailure(ap, id, dispatchId, { schema = "pipeline.native-goldfish-host-stop-failure.v1" } = {}) {
  mkdirSync(diagDir(ap), { recursive: true });
  const name = `stop-failure-${hex(id, 32)}.json`;
  writeFileSync(join(diagDir(ap), name), JSON.stringify({ schema, dispatchId, code: "NGH-STOP", observedAt: "2026-10-30T00:00:00Z" }));
  return name;
}
function writePending(ap, dispatchId, { settled = false } = {}) {
  mkdirSync(commitDir(ap), { recursive: true });
  const bytes = Buffer.from(JSON.stringify({ binding: { dispatchId } }));
  writeFileSync(join(commitDir(ap), `pending-claude-${hex("a", 64)}.json`), bytes);
  if (settled) writeFileSync(join(commitDir(ap), `authority-terminal-${createHash("sha256").update(bytes).digest("hex")}.json`), "{}");
}
function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => !e.isDirectory()).map((e) => relative(dir, join(e.parentPath, e.name)));
}
const ledger = (ap) => (existsSync(join(ap, "routine-repair-ledger.jsonl")) ? readFileSync(join(ap, "routine-repair-ledger.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)) : []);

// A recording stand-in for the delegated tools.
// An array of inspect results is answered in order (the last one repeats).
function stub(inspectResult) {
  const calls = [];
  const answers = Array.isArray(inspectResult) ? [...inspectResult] : [inspectResult];
  const spawn = (script, args) => {
    calls.push({ tool: script.split(/[\\/]/u).pop(), args });
    if (args[0] === "inspect") return { status: 0, stdout: `${JSON.stringify(answers.length > 1 ? answers.shift() : answers[0])}\n`, stderr: "" };
    if (args[0] === "cancel") return { status: 0, stdout: `${JSON.stringify({ status: "ok", state: "cancelled" })}\n`, stderr: "" };
    return { status: 0, stdout: `${JSON.stringify({ status: args[0] === "heal" ? "healed" : "moved-aside", retained: ["20261030-aaaa-delegated"] })}\n`, stderr: "" };
  };
  return { calls, spawn };
}
const emptyInspect = { lock: { status: "absent" }, reservations: [], registry: { status: "present", producers: [], read: { status: "ok" } } };
const inspectWith = (producer) => ({ ...emptyInspect, registry: { status: "present", producers: [producer], read: { status: "ok" } } });
// The exact inspect of 2026-10-30 after a returned Goldfish and a heal (SAR-HEAL-INCOMPLETE): one drifted producer and the read refusal.
const driftedLive = { ...emptyInspect, registry: { status: "present", producers: [{ producerId: "onboarding-continuity", status: "ok", drifted: [], inFlight: 0 }, { producerId: "native-goldfish", status: "drifted", drifted: ["native-goldfish-host-commit"], inFlight: 1 }], read: { status: "refused", code: "SDC-AUTHORITY-CAS", reason: "native-goldfish:namespace-drift" } } };

// The ONE shared table. `expect.calls` is the delegated tool + first argv word list; `stopFailures` marks the real repair.
const TABLE = [
  { id: "heal", request: { kind: "heal", reason: "stale lock after a stopped dispatch" }, expect: { exit: 0, code: "healed", calls: [["session-authority-repair.mjs", "inspect"], ["session-authority-repair.mjs", "heal"], ["session-authority-repair.mjs", "inspect"]], retained: ["agent-pipeline/session-authority-abandoned/20261030-aaaa-delegated"] } },
  { id: "slice-cancel budget", request: { kind: "slice-cancel", sliceId: "S-1", cancelClass: "budget", started: true, reason: "budget exhausted" }, expect: { exit: 0, code: "ok", calls: [["slice-queue.mjs", "cancel"]], argvHas: ["S-1", "--class", "budget", "--started"] } },
  { id: "slice-cancel integrated-elsewhere", request: { kind: "slice-cancel", sliceId: "S-2", cancelClass: "integrated-elsewhere", reason: "landed in another commit" }, expect: { exit: 0, code: "ok", calls: [["slice-queue.mjs", "cancel"]], argvHas: ["integrated-elsewhere"] } },
  { id: "stop-failure-aside", request: { kind: "stop-failure-aside", reason: "diagnostic of a settled dispatch" }, setup: (ap) => { writeStopFailure(ap, "1", "D-1"); }, expect: { exit: 0, code: "moved-aside", calls: [], moved: 1 } },
  { id: "move-aside unknown-registry-entry", request: { kind: "move-aside", reason: "unindexed registry entry" }, inspect: inspectWith({ producerId: "p", status: "reconcile-refused", code: "SDC-AUTHORITY-UNAVAILABLE", reason: "unknown-registry-entry" }), expect: { exit: 0, code: "moved-aside", calls: [["session-authority-repair.mjs", "inspect"], ["session-authority-repair.mjs", "move-aside"]], argvHas: ["--no-goldfish-running"] } },
  { id: "D203 move-aside of a producer still reconcile-refused after heal", request: { kind: "move-aside", reason: "member drift heal did not resolve" }, inspect: inspectWith({ producerId: "native", status: "reconcile-refused", code: "native-authority-member-drift", reason: "x" }), expect: { exit: 0, code: "moved-aside", calls: [["session-authority-repair.mjs", "inspect"], ["session-authority-repair.mjs", "heal"], ["session-authority-repair.mjs", "inspect"], ["session-authority-repair.mjs", "move-aside"]], argvHas: ["--no-goldfish-running"] } },
  { id: "D203 move-aside stops after heal when heal resolved the reconcile-refused producer", request: { kind: "move-aside", reason: "member drift" }, inspect: [inspectWith({ producerId: "native", status: "reconcile-refused", code: "native-authority-member-drift", reason: "x" }), emptyInspect], expect: { exit: 0, code: "healed", calls: [["session-authority-repair.mjs", "inspect"], ["session-authority-repair.mjs", "heal"], ["session-authority-repair.mjs", "inspect"]] } },
  { id: "move-aside native-managed-unknown-native-entry", request: { kind: "move-aside", reason: "unknown native entry" }, inspect: inspectWith({ producerId: "p", status: "reconcile-refused", code: "native-managed-unknown-native-entry", reason: "x" }), expect: { exit: 0, code: "moved-aside", calls: [["session-authority-repair.mjs", "inspect"], ["session-authority-repair.mjs", "move-aside"]] } },
  // Refusals.
  { id: "refuse: kind outside the list", request: { kind: "release-lock", reason: "r" }, expect: { exit: 2, code: "RR-OUTSIDE-LIST", calls: [], nextHas: "release-lock" } },
  { id: "refuse: unknown kind", request: { kind: "delete-everything", reason: "r" }, expect: { exit: 2, code: "RR-OUTSIDE-LIST", calls: [], nextHas: "decided by the human" } },
  { id: "refuse: wrong cancel class", request: { kind: "slice-cancel", sliceId: "S-3", cancelClass: "wrong-premise", reason: "r" }, expect: { exit: 2, code: "RR-OUTSIDE-LIST", calls: [], nextHas: "slice-queue.mjs cancel" } },
  { id: "refuse: missing reason", request: { kind: "heal" }, expect: { exit: 2, code: "RR-REASON-REQUIRED", calls: [] } },
  { id: "refuse: blank reason", request: { kind: "stop-failure-aside", reason: "   " }, expect: { exit: 2, code: "RR-REASON-REQUIRED", calls: [] } },
  // QG-04 restatement (D203, live 2026-10-30): this row used a `drifted` producer as "another finding"; heal leaves exactly that state
  // after a returned Goldfish, so it now goes heal first (rows below). Intent unchanged with a finding that is outside the list.
  { id: "refuse: move-aside with another finding", request: { kind: "move-aside", reason: "r" }, inspect: inspectWith({ producerId: "p", status: "unreadable", code: "foreign-format", inFlight: 1 }), expect: { exit: 2, code: "RR-OUTSIDE-LIST", calls: [["session-authority-repair.mjs", "inspect"]], reasonHas: "producer:p" } },
  { id: "D203 move-aside of a producer still drifted after heal, with the registry read refusal it causes (live shape)", request: { kind: "move-aside", reason: "namespace drift after a returned goldfish" }, inspect: driftedLive, expect: { exit: 0, code: "moved-aside", calls: [["session-authority-repair.mjs", "inspect"], ["session-authority-repair.mjs", "heal"], ["session-authority-repair.mjs", "inspect"], ["session-authority-repair.mjs", "move-aside"]], argvHas: ["--no-goldfish-running"] } },
  { id: "refuse: a registry read refusal naming a producer that is not drifted stays outside the list", request: { kind: "move-aside", reason: "r" }, inspect: { ...driftedLive, registry: { ...driftedLive.registry, read: { status: "refused", code: "SDC-AUTHORITY-CAS", reason: "other-producer:namespace-drift" } } }, expect: { exit: 2, code: "RR-OUTSIDE-LIST", calls: [["session-authority-repair.mjs", "inspect"]] } },
  { id: "refuse: move-aside with one allowed and one other finding", request: { kind: "move-aside", reason: "r" }, inspect: { ...emptyInspect, lock: { status: "held", owner: "live" }, registry: { status: "present", producers: [{ producerId: "p", status: "reconcile-refused", reason: "unknown-registry-entry" }], read: { status: "ok" } } }, expect: { exit: 2, code: "RR-OUTSIDE-LIST", calls: [["session-authority-repair.mjs", "inspect"]] } },
  { id: "refuse: move-aside with no finding", request: { kind: "move-aside", reason: "r" }, inspect: emptyInspect, expect: { exit: 2, code: "RR-OUTSIDE-LIST", calls: [["session-authority-repair.mjs", "inspect"]] } },
];

for (const row of TABLE) {
  test(`routine repair: ${row.id}`, () => withRepo((root, ap) => {
    row.setup?.(ap);
    const before = files(ap);
    const { calls, spawn } = stub(row.inspect ?? emptyInspect);
    const { exit, result } = runRoutineRepair({ root, ...row.request }, { spawn, now: () => Date.parse("2026-10-30T12:00:00Z") });
    assert.equal(exit, row.expect.exit);
    assert.equal(result.code, row.expect.code);
    assert.deepEqual(calls.map((call) => [call.tool, call.args[0]]), row.expect.calls);
    if (row.expect.argvHas) for (const word of row.expect.argvHas) assert.ok(calls.at(-1).args.includes(word), `argv has ${word}`);
    if (row.expect.nextHas) assert.match(result.next, new RegExp(row.expect.nextHas.replace(/[.]/gu, "\\.")));
    if (row.expect.reasonHas) assert.match(result.reason, new RegExp(row.expect.reasonHas));
    if (row.expect.retained) assert.deepEqual(result.retained, row.expect.retained);
    if (row.expect.moved !== undefined) assert.equal(result.moved.length, row.expect.moved);
    // The ledger line: written for every run, with the shape D194 names and paths relative to the common dir.
    const lines = ledger(ap);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].schema, "pipeline.routine-repair-record.v1");
    assert.equal(lines[0].kind, row.request.kind);
    assert.equal(lines[0].result, row.expect.code);
    assert.equal(lines[0].at, "2026-10-30T12:00:00.000Z");
    assert.equal(lines[0].reason, row.request.reason?.trim() || null);
    assert.ok([...lines[0].moved.flatMap((m) => [m.from, m.to]), ...lines[0].retained].every((p) => !p.startsWith("/") && !p.includes(root)));
    // Nothing is ever deleted: every file that existed before still exists, in place or moved aside under its own name.
    const after = files(ap);
    for (const name of before) assert.ok(after.includes(name) || after.some((file) => file.endsWith(`/${name.split("/").pop()}`) && file.startsWith("session-authority-abandoned/")), `${name} kept`);
  }));
}

test("D203: heal names the move-aside routine as the next step when a producer is still reconcile-refused after its delegate", () => withRepo((root) => {
  const refused = inspectWith({ producerId: "native", status: "reconcile-refused", code: "native-authority-member-drift", reason: "x" });
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: stub(refused).spawn });
  assert.equal(exit, 0);
  assert.deepEqual(result.stillReconcileRefused, ["producer:native"]);
  assert.match(result.next, /routine-repair\.mjs run move-aside --no-goldfish-running/u);
  assert.match(result.next, /only when no Goldfish runs/u);
  const clean = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: stub(emptyInspect).spawn });
  assert.equal(clean.result.next, undefined);
}));

test("D203 (live 2026-10-30): a heal that ends SAR-HEAL-INCOMPLETE with a drifted producer still names the move-aside routine", () => withRepo((root) => {
  const { spawn: base } = stub(driftedLive);
  const spawn = (script, args) => (args[0] === "heal"
    ? { status: 2, stdout: `${JSON.stringify({ status: "refused", code: "SAR-HEAL-INCOMPLETE", reason: "the registry still does not read after heal: native-goldfish:namespace-drift" })}\n`, stderr: "" }
    : base(script, args));
  const { result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn });
  assert.deepEqual(result.stillReconcileRefused, ["producer:native-goldfish", "registry-read"]);
  assert.match(result.next, /routine-repair\.mjs run move-aside --no-goldfish-running/u);
}));

test("stop-failure-aside moves the record aside under session-authority-abandoned and removes it from the diagnostics directory", () => withRepo((root, ap) => {
  const name = writeStopFailure(ap, "2", "D-2");
  const { exit, result } = runRoutineRepair({ kind: "stop-failure-aside", root, reason: "r" });
  assert.equal(exit, 0);
  assert.equal(files(diagDir(ap)).length, 0);
  const moved = files(join(ap, "session-authority-abandoned"));
  assert.equal(moved.length, 1);
  assert.match(moved[0], new RegExp(`-stop-failure/${name.replace(".", "\\.")}$`));
  assert.equal(result.moved[0].from, `agent-pipeline/run/native-goldfish-host-diagnostics/${name}`.replace(/^agent-pipeline\//u, "agent-pipeline/"));
}));

test("stop-failure-aside keeps the record of a dispatch with an unsettled pending state, and moves it once settled", () => withRepo((root, ap) => {
  const name = writeStopFailure(ap, "3", "D-3");
  writePending(ap, "D-3");
  const first = runRoutineRepair({ kind: "stop-failure-aside", root, reason: "r" });
  assert.equal(first.exit, 0);
  assert.equal(first.result.code, "nothing-to-move");
  assert.match(first.result.keptStopFailures[0].reason, /unsettled pending state/u);
  assert.ok(existsSync(join(diagDir(ap), name)));
  writePending(ap, "D-3", { settled: true });
  const second = runRoutineRepair({ kind: "stop-failure-aside", root, reason: "r" });
  assert.equal(second.result.code, "moved-aside");
  assert.ok(!existsSync(join(diagDir(ap), name)));
  assert.equal(ledger(ap).length, 2);
}));

test("stop-failure-aside never moves a symlink or a record of another schema", () => withRepo((root, ap) => {
  mkdirSync(diagDir(ap), { recursive: true });
  const target = join(root, "target.json");
  writeFileSync(target, JSON.stringify({ schema: "pipeline.native-goldfish-host-stop-failure.v1", dispatchId: "D-4" }));
  symlinkSync(target, join(diagDir(ap), `stop-failure-${hex("4", 32)}.json`));
  writeStopFailure(ap, "5", "D-5", { schema: "something.else.v1" });
  writeFileSync(join(diagDir(ap), `stop-failure-${hex("6", 32)}.json`), "{ not json");
  const { exit, result } = runRoutineRepair({ kind: "stop-failure-aside", root, reason: "r" });
  assert.equal(exit, 0);
  assert.equal(result.code, "nothing-to-move");
  assert.equal(result.keptStopFailures.length, 3);
  assert.equal(files(diagDir(ap)).length, 3);
  assert.ok(existsSync(target));
  assert.equal(result.retained.length, 3);
}));

// W7: a pending state as the host writes it: the name carries a key digest, not the sha256 of the bytes; the terminal and integration
// siblings carry the sha256 of the pending bytes. The reservation row is the one session-authority-repair inspect would report.
function writeNamedPending(ap, dispatchId, { terminal = false, integration = false } = {}) {
  mkdirSync(commitDir(ap), { recursive: true });
  const bytes = Buffer.from(JSON.stringify({ binding: { dispatchId }, delivery: { sliceId: dispatchId, itemId: "I-1" } }));
  const digest = createHash("sha256").update(bytes).digest("hex");
  const name = `pending-claude-${createHash("sha256").update(`key:${dispatchId}`).digest("hex")}.json`;
  writeFileSync(join(commitDir(ap), name), bytes);
  const siblings = [];
  if (terminal) { siblings.push(`authority-terminal-${digest}.json`); writeFileSync(join(commitDir(ap), siblings.at(-1)), "{}"); }
  if (integration) { siblings.push(`authority-integration-${digest}.json`); writeFileSync(join(commitDir(ap), siblings.at(-1)), "{}"); }
  return { name, digest, siblings, dispatchId };
}
const rowOf = (pending, settled) => ({ pending: pending.name, sliceId: pending.dispatchId, dispatchId: pending.dispatchId, settled });
const inspectRows = (...reservations) => ({ ...emptyInspect, reservations });
const SETTLED_DEPS = { now: () => Date.parse("2026-10-30T12:00:00Z") };

test("settled-pending-aside moves the stop-failure record of a retired dispatch into the same aside directory and keeps the one of an unsettled dispatch", () => withRepo((root, ap) => {
  const retired = writeNamedPending(ap, "D-A", { terminal: true });
  const ready = writeNamedPending(ap, "D-C");
  const moved = writeStopFailure(ap, "1", "D-A");
  const kept = writeStopFailure(ap, "2", "D-C");
  const { exit, result } = runRoutineRepair({ kind: "settled-pending-aside", root, reason: "r" }, { spawn: stub(inspectRows(rowOf(retired, "integrated-by-commit"), rowOf(ready, null))).spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.ok(!existsSync(join(diagDir(ap), moved)) && existsSync(join(diagDir(ap), kept)));
  assert.deepEqual(result.retiredStopFailures.map((row) => row.dispatchId), ["D-A"]);
  assert.match(result.keptStopFailures[0].reason, /unsettled pending state/u);
  const aside = files(join(ap, "session-authority-abandoned"));
  assert.equal(new Set(aside.map((file) => file.split("/")[0])).size, 1, "one aside directory");
  assert.ok(aside.every((file) => file.split("/")[0].endsWith("-settled-pending")));
  assert.ok(aside.some((file) => file.endsWith(`/${moved}`)));
}));

test("settled-pending-aside moves settled pending states with their terminal and integration siblings, keeps the rest with reasons, and moves the stop-failure record of a retired dispatch only", () => withRepo((root, ap) => {
  const byCommit = writeNamedPending(ap, "D-A", { terminal: true, integration: true });
  const cancelled = writeNamedPending(ap, "D-B");
  const ready = writeNamedPending(ap, "D-C");
  const unreadable = { name: `pending-claude-${hex("c", 64)}.json` };
  writeFileSync(join(commitDir(ap), unreadable.name), "{ not json");
  const target = join(root, "elsewhere.json");
  writeFileSync(target, "{}");
  const linkName = `pending-codex-${hex("d", 64)}.json`;
  symlinkSync(target, join(commitDir(ap), linkName));
  const { calls, spawn } = stub(inspectRows(rowOf(byCommit, "integrated-by-commit"), rowOf(cancelled, "cancelled"), rowOf(ready, null),
    { pending: unreadable.name, status: "unreadable", reason: "bad json" }, { pending: linkName, sliceId: "D-L", dispatchId: "D-L", settled: "integrated-by-commit" }));
  const { exit, result } = runRoutineRepair({ kind: "settled-pending-aside", root, reason: "retire settled pending states" }, { spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.equal(result.code, "moved-aside");
  assert.deepEqual(calls.map((call) => call.args[0]), ["inspect"]);
  const left = readdirSync(commitDir(ap)).sort();
  assert.ok(!left.includes(byCommit.name) && !left.includes(cancelled.name));
  for (const sibling of byCommit.siblings) assert.ok(!left.includes(sibling), sibling);
  for (const name of [ready.name, unreadable.name, linkName]) assert.ok(left.includes(name), name);
  assert.deepEqual(result.retiredPending.map((row) => row.name).sort(), [byCommit.name, cancelled.name].sort());
  assert.deepEqual(result.keptPending.map((row) => row.name).sort(), [linkName, ready.name, unreadable.name].sort());
  assert.ok(result.keptPending.every((row) => typeof row.reason === "string" && row.reason !== ""));
  const aside = files(join(ap, "session-authority-abandoned"));
  for (const name of [byCommit.name, cancelled.name, ...byCommit.siblings]) assert.ok(aside.some((file) => file.endsWith(`-settled-pending/${name}`)), name);
  assert.ok(existsSync(target));
  assert.equal(ledger(ap).length, 1);
  assert.equal(ledger(ap)[0].kind, "settled-pending-aside");
  // A replay with nothing settled left moves nothing.
  const again = runRoutineRepair({ kind: "settled-pending-aside", root, reason: "again" }, { spawn: stub(inspectRows(rowOf(ready, null))).spawn, ...SETTLED_DEPS });
  assert.equal(again.exit, 0);
  assert.equal(again.result.code, "nothing-to-move");
  assert.equal(again.result.moved.length, 0);
}));

test("settled-pending-aside keeps dispatch id, slice id and integrating commit of every moved pending state in its result and its ledger line", () => withRepo((root, ap) => {
  const byCommit = writeNamedPending(ap, "D-K", { terminal: true });
  const cancelled = writeNamedPending(ap, "D-N");
  const commit = hex("a", 40);
  const rows = [{ ...rowOf(byCommit, "integrated-by-commit"), sliceId: "SLICE-K", commit }, { ...rowOf(cancelled, "cancelled"), sliceId: "SLICE-N", commit: null }];
  const { exit, result } = runRoutineRepair({ kind: "settled-pending-aside", root, reason: "r" }, { spawn: stub(inspectRows(...rows)).spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  const pointer = (row) => ({ dispatchId: row.dispatchId, sliceId: row.sliceId, commit: row.commit });
  const byName = (list, name) => list.find((row) => row.name === name);
  assert.deepEqual(pointer(byName(result.retiredPending, byCommit.name)), { dispatchId: "D-K", sliceId: "SLICE-K", commit });
  assert.deepEqual(pointer(byName(result.retiredPending, cancelled.name)), { dispatchId: "D-N", sliceId: "SLICE-N", commit: null });
  const line = ledger(ap)[0];
  assert.equal(line.schema, "pipeline.routine-repair-record.v1");
  assert.deepEqual(byName(line.retiredPending, byCommit.name), { name: byCommit.name, settled: "integrated-by-commit", dispatchId: "D-K", sliceId: "SLICE-K", commit });
  assert.equal(byName(line.retiredPending, cancelled.name).commit, null);
  assert.match(byName(line.retiredPending, byCommit.name).commit, /^[0-9a-f]{40}$/u);
}));

test("settled-pending-aside keys the siblings by the sha256 of the pending bytes, never by the key digest in the pending name", () => withRepo((root, ap) => {
  const pending = writeNamedPending(ap, "D-M", { terminal: true });
  const nameDigest = /^pending-claude-([a-f0-9]{64})\.json$/u.exec(pending.name)[1];
  assert.notEqual(nameDigest, pending.digest);
  const foreign = `authority-terminal-${nameDigest}.json`;
  writeFileSync(join(commitDir(ap), foreign), "{}");
  const { exit, result } = runRoutineRepair({ kind: "settled-pending-aside", root, reason: "r" }, { spawn: stub(inspectRows(rowOf(pending, "integrated"))).spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.deepEqual(result.retiredPending.map((row) => row.name), [pending.name]);
  const left = readdirSync(commitDir(ap));
  assert.ok(!left.includes(pending.name) && !left.includes(pending.siblings[0]));
  assert.ok(left.includes(foreign), "a sibling named by the key digest stays");
}));

// 2026-10-30, live: heal moved only the terminal and integration records of 246 settled pending states and left their scope,
// checkpoint and recheck records behind; the host state reader then refused every dispatch with native-authority-orphan-prefix.
// The assertion is the reader's own condition: every authority record left names the sha256 of a pending file still present.
test("settled-pending-aside moves every authority record of a retired pending state and every orphaned one, so no authority record names a missing pending file", () => withRepo((root, ap) => {
  const record = (name, pendingSha256, extra = {}) => writeFileSync(join(commitDir(ap), name), JSON.stringify({ pendingSha256, ...extra }));
  const settled = writeNamedPending(ap, "D-S");
  const live = writeNamedPending(ap, "D-L");
  const settledKinds = [`authority-terminal-${settled.digest}.json`, `authority-integration-${settled.digest}.json`, `authority-check-${settled.digest}.json`,
    `authority-scope-${settled.digest}-1.json`, `authority-scope-${settled.digest}-2.json`, `authority-checkpoint-${settled.digest}-1.json`, `authority-recheck-${settled.digest}-1.json`];
  for (const name of settledKinds) record(name, settled.digest);
  const liveKinds = [`authority-scope-${live.digest}-1.json`, `authority-checkpoint-${live.digest}-1.json`];
  for (const name of liveKinds) record(name, live.digest);
  const gone = hex("e", 64);
  const orphans = [`authority-scope-${gone}-1.json`, `authority-recheck-${gone}-3.json`];
  for (const name of orphans) record(name, gone);
  writeFileSync(join(commitDir(ap), `authority-scope-${hex("f", 64)}-1.json`), "{ not json");
  const { exit, result } = runRoutineRepair({ kind: "settled-pending-aside", root, reason: "r" }, { spawn: stub(inspectRows(rowOf(settled, "integrated-by-commit"), rowOf(live, null))).spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  const left = readdirSync(commitDir(ap)).sort();
  for (const name of [settled.name, ...settledKinds, ...orphans]) assert.ok(!left.includes(name), `${name} left`);
  for (const name of [live.name, ...liveKinds]) assert.ok(left.includes(name), `${name} moved`);
  assert.deepEqual(result.retiredPending[0].siblings.sort(), [...settledKinds].sort());
  assert.deepEqual(result.retiredOrphanAuthority.map((row) => row.name).sort(), [...orphans].sort());
  assert.deepEqual(result.keptOrphanAuthority.map((row) => row.name), [`authority-scope-${hex("f", 64)}-1.json`], "an unreadable record is kept, never guessed");
  const present = new Set(left.filter((name) => name.startsWith("pending-")).map((name) => createHash("sha256").update(readFileSync(join(commitDir(ap), name))).digest("hex")));
  for (const name of left.filter((entry) => entry.startsWith("authority-"))) {
    let sha = null;
    try { sha = JSON.parse(readFileSync(join(commitDir(ap), name), "utf8")).pendingSha256; } catch { continue; }
    assert.ok(present.has(sha), `${name} names a missing pending file`);
  }
  const aside = files(join(ap, "session-authority-abandoned"));
  for (const name of [...settledKinds, ...orphans]) assert.ok(aside.some((file) => file.endsWith(`-settled-pending/${name}`)), `${name} retained aside`);
}));

test("heal also moves orphaned authority records when no pending state is settled", () => withRepo((root, ap) => {
  mkdirSync(commitDir(ap), { recursive: true });
  const gone = hex("a", 64);
  writeFileSync(join(commitDir(ap), `authority-checkpoint-${gone}-1.json`), JSON.stringify({ pendingSha256: gone }));
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: stub(emptyInspect).spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.deepEqual(result.settledPending.retiredOrphanAuthority.map((row) => row.name), [`authority-checkpoint-${gone}-1.json`]);
  assert.deepEqual(readdirSync(commitDir(ap)), []);
}));

// Live 2026-11-08 (Codex greenfield): a Codex agent association names its pending file. Heal retired the pending file of the integrated first
// worker and left the association, so the host state reader refused every further dispatch with native-authority-agent-unresolved, and neither
// heal nor move-aside cleared it. The association leaves with the pending file, and one already stranded leaves on the next heal.
test("C21: heal retires the Codex agent association of a retired pending state and one already stranded, and keeps a live or unreadable one", () => withRepo((root, ap) => {
  const association = (seed, pendingFile) => {
    const name = `agent-codex-${hex(seed, 64)}.json`;
    writeFileSync(join(commitDir(ap), name), JSON.stringify({ runner: "codex", pendingFile }));
    return name;
  };
  const settled = writeNamedPending(ap, "D-S");
  const live = writeNamedPending(ap, "D-L");
  const ofSettled = association("1", settled.name);
  const ofLive = association("2", live.name);
  const stranded = association("3", `pending-codex-${hex("9", 64)}.json`);
  const unreadable = `agent-codex-${hex("4", 64)}.json`;
  writeFileSync(join(commitDir(ap), unreadable), "{ not json");
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: stub(inspectRows(rowOf(settled, "integrated"), rowOf(live, null))).spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  const left = readdirSync(commitDir(ap)).sort();
  for (const name of [settled.name, ofSettled, stranded]) assert.ok(!left.includes(name), `${name} left`);
  for (const name of [live.name, ofLive, unreadable]) assert.ok(left.includes(name), `${name} moved`);
  assert.deepEqual(result.settledPending.retiredOrphanAuthority.map((row) => row.name).sort(), [ofSettled, stranded].sort());
  assert.deepEqual(result.settledPending.keptOrphanAuthority.map((row) => row.name), [unreadable], "an unreadable association is kept, never guessed");
  const aside = files(join(ap, "session-authority-abandoned"));
  for (const name of [ofSettled, stranded]) assert.ok(aside.some((file) => file.endsWith(`-settled-pending/${name}`)), `${name} retained aside`);
}));

// The chain of that live refusal against the real owner: a real Codex start writes the association, the pending file leaves, the reader of every
// registry path refuses, a real heal retires the association and the same reader reads again.
test("C21 chain: a stranded Codex association refuses the real authority reader, and a real heal clears it", () => withRepo((root, ap) => {
  const commit = "a".repeat(40), tree = "b".repeat(40), session = "session-c21";
  const dependencies = { git: (_root, args) => (args.at(-1) === "HEAD^{commit}" ? commit : tree), resolveCommonDir: () => join(root, ".git"),
    captureBaseline: ({ root: candidateRoot, candidateCommit, resultPath }) => ({ ok: true, baseline: { schema: "pipeline.agy-host-commit-baseline.v1", root: candidateRoot, candidateCommit, resultPath, untracked: [] } }) };
  const binding = { schema: "pipeline.native-goldfish-host-briefing.v2", dispatchId: "TASK-C21", candidateCommit: commit, candidateTree: tree, runner: "codex",
    role: "pipeline-core:goldfish-implementor", nativeAgentType: "worker", model: "gpt-6-luna", effort: "high", rulesetSha: "c".repeat(64), allowedPaths: ["src/change.mjs"],
    criticDecision: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
      diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" } };
  const message = `<!-- pipeline-native-goldfish-host-commit:v2\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
  const prepared = prepareNativeGoldfishHostState({ root, runner: "codex", input: { cwd: root, session_id: session, tool_name: "spawn_agent", tool_use_id: "tool-c21", tool_input: { agent_type: "worker", message } } }, dependencies);
  assert.equal(prepared.ok, true, prepared.code);
  const started = bindNativeCodexStart({ commonDir: join(root, ".git"), input: { hook_event_name: "SubagentStart", session_id: session, agent_id: "child-c21", agent_type: "worker", model: binding.model } });
  assert.equal(started.ok, true, started.code);
  const pendingFile = readdirSync(commitDir(ap)).find((name) => name.startsWith("pending-codex-"));
  renameSync(join(commitDir(ap), pendingFile), join(ap, "moved-by-the-earlier-heal.json"));
  const readBaseline = () => createNativeGoldfishAuthorityProducerPort({ repository: inspectSignedDescriptorCustodyRepository(root) }).readBaseline();
  assert.throws(readBaseline, (error) => /native-authority-agent-unresolved/u.test(`${error.reason} ${error.message}`));
  const { result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, SETTLED_DEPS);
  assert.ok(result.settledPending.retiredOrphanAuthority.some((row) => row.pendingFile === pendingFile), JSON.stringify(result));
  assert.deepEqual(readdirSync(commitDir(ap)).filter((name) => name.startsWith("agent-codex-")), []);
  assert.doesNotThrow(readBaseline);
}));

test("settled-pending-aside is refused without a reason and when inspect does not report", () => withRepo((root) => {
  assert.equal(runRoutineRepair({ kind: "settled-pending-aside", root }, { spawn: stub(emptyInspect).spawn }).result.code, "RR-REASON-REQUIRED");
  const failing = runRoutineRepair({ kind: "settled-pending-aside", root, reason: "r" }, { spawn: () => ({ status: 1, stdout: "", stderr: "x" }) });
  assert.equal(failing.exit, 2);
  assert.equal(failing.result.code, "RR-INSPECT-FAILED");
}));

test("heal retires settled pending states before its delegate runs, and reports them in its record", () => withRepo((root, ap) => {
  const settled = writeNamedPending(ap, "D-H", { terminal: true });
  const ready = writeNamedPending(ap, "D-R");
  const { calls, spawn } = stub(inspectRows(rowOf(settled, "integrated-by-commit"), rowOf(ready, null)));
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.deepEqual(calls.map((call) => call.args[0]), ["inspect", "heal", "inspect"], "inspect, heal, then the D203 check");
  assert.deepEqual(result.settledPending.retiredPending.map((row) => row.name), [settled.name]);
  assert.deepEqual(result.settledPending.keptPending.map((row) => row.name), [ready.name]);
  assert.ok(!existsSync(join(commitDir(ap), settled.name)) && existsSync(join(commitDir(ap), ready.name)));
}));

const driftedIdle = { ...driftedLive, registry: { ...driftedLive.registry, producers: driftedLive.registry.producers.map((row) => ({ ...row, inFlight: 0 })) } };
// AC-127 / C19: while any producer reports a bound member armed or running, heal does not retire the settled pending states and
// stop-failure records of OTHER dispatches (the 2026-11-02 namespace drift that blocked the next dispatch); it reports them deferred.
const armedProducer = { producerId: "native-goldfish", status: "ok", drifted: [], inFlight: 1 };
const idleProducer = { ...armedProducer, inFlight: 0 };
const withProducer = (producer, ...reservations) => ({ ...emptyInspect, reservations, registry: { status: "present", producers: [producer], read: { status: "ok" } } });

test("C19: heal with a member armed leaves the settled pending states and stop-failure records in place and reports them deferred; a later heal with nothing armed retires them", () => withRepo((root, ap) => {
  const settled = writeNamedPending(ap, "D-DONE", { terminal: true });
  const stopName = writeStopFailure(ap, "5", "D-DONE");
  const armed = stub(withProducer(armedProducer, rowOf(settled, "integrated-by-commit")));
  const first = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: armed.spawn, ...SETTLED_DEPS });
  assert.equal(first.exit, 0, JSON.stringify(first.result));
  assert.deepEqual(armed.calls.map((call) => call.args[0]), ["inspect", "heal", "inspect"]);
  assert.ok(existsSync(join(commitDir(ap), settled.name)) && existsSync(join(commitDir(ap), settled.siblings[0])), "the settled pending state stays");
  assert.ok(existsSync(join(diagDir(ap), stopName)), "the stop-failure record stays");
  assert.deepEqual(files(join(ap, "session-authority-abandoned")), [], "nothing moved aside by the retirement");
  assert.equal(first.result.settledPending.retiredPending, undefined);
  assert.equal(first.result.settledPending.deferred.count, 2);
  assert.match(first.result.settledPending.deferred.reason, /armed or running/u);
  assert.match(first.result.settledPending.deferred.reason, /run heal again/u);
  // Never fully blocking: a member whose dispatch ended without a release stays armed for ever and heal never un-arms it, so "run heal again
  // when nothing is armed" alone would never come true. The deferral also names the one way out for the case that no Goldfish runs.
  // C19K-W248 (QG-04, restated in place): the way out is now heal's own --no-goldfish-running form, an agent step (PO 2026-11-06).
  assert.match(first.result.settledPending.deferred.reason, /run this, an agent step needing no human: node .*routine-repair\.mjs run heal --no-goldfish-running --root <root> --reason "<why>"/u);
  assert.match(first.result.settledPending.deferred.next, /routine-repair\.mjs run heal --no-goldfish-running/u);
  const idle = stub(withProducer(idleProducer, rowOf(settled, "integrated-by-commit")));
  const second = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: idle.spawn, ...SETTLED_DEPS });
  assert.equal(second.exit, 0, JSON.stringify(second.result));
  assert.equal(second.result.settledPending.deferred, undefined);
  assert.deepEqual(second.result.settledPending.retiredPending.map((row) => row.name), [settled.name]);
  assert.ok(!existsSync(join(commitDir(ap), settled.name)) && !existsSync(join(diagDir(ap), stopName)));
}));

test("C19K-W248-1: heal --no-goldfish-running with a member left armed moves the registry aside, then retires the settled pending states and heals", () => withRepo((root, ap) => {
  const settled = writeNamedPending(ap, "D-STALE", { terminal: true });
  const stopName = writeStopFailure(ap, "6", "D-STALE");
  const armed = stub(withProducer(armedProducer, rowOf(settled, "integrated-by-commit")));
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r", noGoldfishRunning: true }, { spawn: armed.spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.deepEqual(armed.calls.map((call) => call.args[0]), ["inspect", "move-aside", "inspect", "heal", "inspect"]);
  assert.ok(armed.calls[1].args.includes("--no-goldfish-running"));
  assert.equal(result.settledPending.deferred, undefined);
  assert.equal(result.settledPending.staleMemberMoveAside.code, "moved-aside");
  assert.deepEqual(result.settledPending.retiredPending.map((row) => row.name), [settled.name]);
  assert.ok(!existsSync(join(commitDir(ap), settled.name)) && !existsSync(join(diagDir(ap), stopName)));
}));

test("C19K-W248-2: without --no-goldfish-running heal still defers and moves nothing aside (a running Goldfish is never disturbed)", () => withRepo((root, ap) => {
  const settled = writeNamedPending(ap, "D-LIVE", { terminal: true });
  const armed = stub(withProducer(armedProducer, rowOf(settled, "integrated-by-commit")));
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: armed.spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.ok(!armed.calls.some((call) => call.args[0] === "move-aside"));
  assert.match(result.settledPending.deferred.next, /run heal --no-goldfish-running/u);
  assert.ok(existsSync(join(commitDir(ap), settled.name)));
}));

test("C19K-W248-3: move-aside is not refused for an open item reservation, and a member left armed with nothing else wrong is moved aside", () => withRepo((root) => {
  const open = { pending: "pending-claude-x.json", sliceId: "S-OPEN", queueState: "ready", settled: null, commit: null };
  const armed = stub(withProducer(armedProducer, open));
  const { exit, result } = runRoutineRepair({ kind: "move-aside", root, reason: "r" }, { spawn: armed.spawn });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.deepEqual(armed.calls.map((call) => call.args[0]), ["inspect", "move-aside"]);
  const idle = stub(withProducer(idleProducer, open));
  const nothing = runRoutineRepair({ kind: "move-aside", root, reason: "r" }, { spawn: idle.spawn });
  assert.equal(nothing.exit, 2);
  assert.equal(nothing.result.code, "RR-OUTSIDE-LIST");
  assert.match(nothing.result.reason, /no blocking finding/u);
}));

test("C19K-W248-4: the CLI admits --no-goldfish-running for heal and move-aside only", () => {
  const out = [];
  const code = runRoutineRepairCli(["run", "stop-failure-aside", "--root", "x", "--reason", "r", "--no-goldfish-running"], (text) => out.push(text));
  assert.equal(code, 2);
  assert.match(JSON.parse(out[0]).reason, /belongs to move-aside and heal only/u);
});

test("C19: a deferred retirement is not 'clear' for the automatic move-aside, so a registry that still does not read is not moved aside while a dispatch runs", () => withRepo((root, ap) => {
  const settled = writeNamedPending(ap, "D-DONE2", { terminal: true });
  const inFlightDrifted = { ...driftedLive, reservations: [rowOf(settled, "integrated-by-commit")] };
  const { calls, spawn: base } = stub(inFlightDrifted);
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: healIncompleteSpawn(base), ...SETTLED_DEPS });
  assert.equal(exit, 2);
  assert.ok(!calls.some((call) => call.args[0] === "move-aside"), "no move-aside ran");
  assert.equal(result.autoMoveAside.attempted, false);
  assert.match(result.autoMoveAside.why, /deferred|armed or running/u);
  assert.ok(existsSync(join(commitDir(ap), settled.name)), "the settled pending state stays");
}));

test("the closed list is frozen, names exactly five kinds, and plan refuses everything else without mutating", () => {
  assert.deepEqual(ROUTINE_REPAIRS.map((row) => row.kind), ["heal", "slice-cancel", "stop-failure-aside", "move-aside", "settled-pending-aside"]);
  assert.ok(Object.isFrozen(ROUTINE_REPAIRS) && ROUTINE_REPAIRS.every((row) => Object.isFrozen(row)));
  assert.throws(() => ROUTINE_REPAIRS.push({ kind: "rm" }), TypeError);
  assert.equal(planRoutineRepair({ kind: "rm", reason: "r", root: "x" }).code, "RR-OUTSIDE-LIST");
  assert.equal(planRoutineRepair({ kind: "heal", reason: "r", root: "x" }).ok, true);
});

test("classifyInspectFindings allows only the two named findings", () => {
  assert.deepEqual(classifyInspectFindings(emptyInspect), []);
  assert.deepEqual(classifyInspectFindings(inspectWith({ producerId: "p", status: "unreadable", reason: "unknown-registry-entry" })).map((r) => r.allowed), [true]);
  assert.deepEqual(classifyInspectFindings({ ...emptyInspect, reservations: [{ sliceId: "S", settled: null }] }).map((r) => r.allowed), [false]);
});

test("CLI: list prints the closed list, an unknown kind is refused outside the list, and a real run writes the ledger", () => withRepo((root, ap) => {
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", shell: false });
  const listed = run("list");
  assert.equal(listed.status, 0);
  assert.deepEqual(JSON.parse(listed.stdout).repairs.map((row) => row.kind), ["heal", "slice-cancel", "stop-failure-aside", "move-aside", "settled-pending-aside"]);
  const unknown = run("run", "release-lock", "--root", root, "--reason", "r");
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stdout).code, "RR-OUTSIDE-LIST");
  assert.equal(run("run", "stop-failure-aside", "--root", root).status, 2);
  assert.equal(JSON.parse(run("run", "stop-failure-aside", "--root", root).stdout).code, "RR-REASON-REQUIRED");
  writeStopFailure(ap, "7", "D-7");
  const done = run("run", "stop-failure-aside", "--root", root, "--reason", "settled dispatch");
  assert.equal(done.status, 0);
  assert.equal(JSON.parse(done.stdout).code, "moved-aside");
  const lines = ledger(ap);
  assert.deepEqual(lines.map((line) => line.result), ["RR-OUTSIDE-LIST", "RR-REASON-REQUIRED", "RR-REASON-REQUIRED", "moved-aside"]);
  assert.equal(run("list", "extra").status, 2);
}));

// Interim (PO 2026-11-01): heal's own retirement of settled pending states drifts the namespace under a registry member that a dispatch
// ended without releasing. When that is all that is left and nothing can be running, heal finishes with the retained-aside move-aside.
const healIncompleteSpawn = (base, { moveAside } = {}) => (script, args) => {
  if (args[0] === "heal") return { status: 2, stdout: `${JSON.stringify({ status: "refused", code: "SAR-HEAL-INCOMPLETE", reason: "the registry still does not read after heal: native-goldfish:namespace-drift" })}\n`, stderr: "" };
  if (args[0] === "move-aside" && moveAside) return moveAside;
  return base(script, args);
};

test("interim: a heal that ends SAR-HEAL-INCOMPLETE with nothing open or kept moves the registry aside itself, verifies it, and records one ledger line", () => withRepo((root, ap) => {
  const settled = writeNamedPending(ap, "D-AUTO", { terminal: false });
  // QG-04 restatement (C19, AC-127): this case is "nothing can be running"; its fixture carried inFlight 1, which now defers the retirement.
  const withSettled = { ...driftedIdle, reservations: [rowOf(settled, "integrated-by-commit")] };
  const { calls, spawn: base } = stub([withSettled, driftedLive, emptyInspect]);
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "retire settled pending states before dispatch" }, { spawn: healIncompleteSpawn(base), ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.equal(result.code, "healed-by-move-aside");
  assert.deepEqual(calls.map((call) => call.args[0]), ["inspect", "inspect", "move-aside", "inspect"]);
  const argv = calls.find((call) => call.args[0] === "move-aside").args;
  assert.ok(argv.includes("--no-goldfish-running"));
  assert.match(argv[argv.indexOf("--reason") + 1], /retire settled pending states before dispatch/u);
  assert.equal(result.next, undefined);
  assert.equal(result.stillReconcileRefused, undefined);
  assert.deepEqual(result.settledPending.retiredPending.map((row) => row.name), [settled.name]);
  assert.equal(ledger(ap).length, 1);
  assert.equal(ledger(ap)[0].result, "healed-by-move-aside");
  assert.ok(!existsSync(join(commitDir(ap), settled.name)), "the settled pending state left");
}));

test("interim: an unsettled pending state keeps heal from moving the registry aside; it still names the routine for the human", () => withRepo((root, ap) => {
  const open = writeNamedPending(ap, "D-OPEN");
  const withOpen = { ...driftedLive, reservations: [rowOf(open, null)] };
  const { calls, spawn: base } = stub(withOpen);
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: healIncompleteSpawn(base), ...SETTLED_DEPS });
  assert.equal(exit, 2);
  assert.equal(result.code, "SAR-HEAL-INCOMPLETE");
  assert.ok(!calls.some((call) => call.args[0] === "move-aside"), "no move-aside ran");
  assert.equal(result.autoMoveAside.attempted, false);
  assert.match(result.autoMoveAside.why, /pending state was kept|findings|reconcile-refused/u);
  assert.match(result.next, /run move-aside --no-goldfish-running/u);
  assert.ok(existsSync(join(commitDir(ap), open.name)), "the open pending state stays");
}));

test("interim: another finding (a held lock) keeps heal from moving the registry aside", () => withRepo((root) => {
  const held = { ...driftedLive, lock: { status: "held", owner: "live" } };
  const { calls, spawn: base } = stub(held);
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: healIncompleteSpawn(base), ...SETTLED_DEPS });
  assert.equal(exit, 2);
  assert.ok(!calls.some((call) => call.args[0] === "move-aside"));
  assert.match(result.autoMoveAside.why, /other than a reconcile-refused/u);
}));

test("interim: a heal that fails for another reason, or one that succeeded, never moves the registry aside", () => withRepo((root) => {
  const other = (script, args) => (args[0] === "heal"
    ? { status: 2, stdout: `${JSON.stringify({ status: "refused", code: "SAR-LOCK-HELD", reason: "held" })}\n`, stderr: "" }
    : stub(driftedLive).spawn(script, args));
  const failed = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: other, ...SETTLED_DEPS });
  assert.equal(failed.result.code, "SAR-LOCK-HELD");
  assert.equal(failed.result.autoMoveAside, undefined);
  const ok = stub(driftedLive);
  const succeeded = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: ok.spawn, ...SETTLED_DEPS });
  assert.equal(succeeded.exit, 0);
  assert.equal(succeeded.result.code, "healed");
  assert.ok(!ok.calls.some((call) => call.args[0] === "move-aside"));
}));

test("interim: when the move-aside itself fails, or the registry still refuses after it, heal reports that and stays refused", () => withRepo((root) => {
  // QG-04 restatement (C19, AC-127): the auto move-aside is attempted only with nothing in flight; the fixture is the idle variant.
  const refusedMove = { status: 2, stdout: `${JSON.stringify({ status: "refused", code: "SAR-GOLDFISH-ASSERTION", reason: "no" })}\n`, stderr: "" };
  const failed = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: healIncompleteSpawn(stub(driftedIdle).spawn, { moveAside: refusedMove }), ...SETTLED_DEPS });
  assert.equal(failed.exit, 2);
  assert.equal(failed.result.autoMoveAside.attempted, true);
  assert.equal(failed.result.autoMoveAside.code, "SAR-GOLDFISH-ASSERTION");
  const still = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn: healIncompleteSpawn(stub(driftedIdle).spawn), ...SETTLED_DEPS });
  assert.equal(still.exit, 2);
  assert.equal(still.result.autoMoveAside.code, "RR-STILL-REFUSED");
}));

test("interim: the move-aside kind carries on to the move-aside after a heal that ends SAR-HEAL-INCOMPLETE (it used to stop there)", () => withRepo((root) => {
  const { calls, spawn: base } = stub(driftedLive);
  const { exit, result } = runRoutineRepair({ kind: "move-aside", root, reason: "namespace drift after a returned goldfish" }, { spawn: healIncompleteSpawn(base), ...SETTLED_DEPS });
  assert.equal(exit, 0, JSON.stringify(result));
  assert.equal(result.code, "moved-aside");
  assert.deepEqual(calls.map((call) => call.args[0]), ["inspect", "inspect", "move-aside"]);
  assert.ok(calls.at(-1).args.includes("--no-goldfish-running"));
}));

test("interim: heal on a clean project does exactly what it did before and records no automatic move-aside", () => withRepo((root) => {
  const { calls, spawn } = stub(emptyInspect);
  const { exit, result } = runRoutineRepair({ kind: "heal", root, reason: "r" }, { spawn, ...SETTLED_DEPS });
  assert.equal(exit, 0);
  assert.equal(result.code, "healed");
  assert.equal(result.autoMoveAside, undefined);
  assert.deepEqual(calls.map((call) => call.args[0]), ["inspect", "heal", "inspect"]);
}));
