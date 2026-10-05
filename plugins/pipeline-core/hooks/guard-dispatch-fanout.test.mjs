// SPDX-License-Identifier: SUL-1.0
/**
 * FANOUT slice S7 (+ F7): the dispatch guard applies the fan-out dispatch-time refusal set, in
 * shadow mode by default and blocking only in `enforce`.
 *
 * Design: specs/sprint-alfred-epic/design/fanout-enforcement-design.md section 3.4 and 3.10.
 * The refusal set, by finding code:
 *   FANOUT-NO-SLICE          an implementation dispatch names no queue slice          (3.10)
 *   FANOUT-SLICE-NOT-READY   the slice is not ready: already live, done, cancelled, held (3.4)
 *   FANOUT-DEP-BLOCKED       the slice waits on a dependency that is not done          (3.4)
 *   FANOUT-SCOPE-NOT-CONTAINED  the declared `Write scope:` leaves the queue entry's writeScope (3.4)
 *   FANOUT-SCOPE-UNDECLARED  enforce only: no `Write scope:` while another dispatch is live (3.4)
 *   FANOUT-SCOPE-OVERLAP     the write scope overlaps a live slice                       (3.4)
 *
 * In-process cases call the exported seams (`observeFanoutDispatches`, `recordFanoutEvents`,
 * `scopeWithin` in guard-dispatch.mjs; `parseDispatchSlice`, `fanoutDispatchFindings` in
 * ../lib/dispatch-policy.mjs) so they run on every platform. The hook-level cases spawn the real
 * hook and need an enrolled fixture repository. Every fixture lives under `os.tmpdir()`, never in
 * the working tree. On native Windows the enrollment write itself fails with EPERM (directory
 * fsync, the same pre-existing limit that stops guard-dispatch.test.mjs); ONLY that error on
 * win32 turns the hook-level cases into skips. Any other failure, and a fixture that enrolled but
 * does not require enforcement, FAILS the case.
 *
 * Modules are imported with top-level `await import()` so a missing export turns the individual
 * case red instead of failing the whole file at link time.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isTerminalOutcome } from "../lib/dispatch-record.mjs";
import { appendEvent, fanoutStatePath, readEvents } from "../lib/fanout-ledger.mjs";
import { HANDBACK_OUTCOMES, loadSliceQueue } from "../lib/slice-queue.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { recordConsentGiven } from "../lib/onboarding-consent-marker.mjs";

const gd = await import("./guard-dispatch.mjs");
const dp = await import("../lib/dispatch-policy.mjs");

const GUARD = fileURLToPath(new URL("./guard-dispatch.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "fanout-s7-"));
process.once("exit", () => rmSync(root, { recursive: true, force: true }));

const SESSION = "fanout-s7-session";
const slice = (id, writeScope, dependsOn = [], extra = {}) => ({
  id, title: `slice ${id}`, state: "ready", holdReason: null, dependsOn, writeScope, readScope: [],
  tier: "implementor", tierReason: null, commitMode: "diff-only", loadClass: "light",
  briefing: { ref: `specs/fx/briefings/${id}.md` }, estimatedToolCalls: 20, ...extra,
});
const queueOf = (slices) => ({
  schema: "pipeline.slice-queue.v1",
  feature: "fx",
  defaults: { commitMode: "diff-only", tier: "implementor" },
  limits: { maxAttemptsPerSlice: 2 },
  slices,
});
// B1 is ordered after A1 by dependsOn, so the queue may legally share src/a/ between them. A valid
// queue can only overlap ordered slices, so launching B1 while A1 is live is BOTH an overlap and a
// dependency violation: the overlap cases below therefore expect both codes.
const QUEUE = queueOf([slice("A1", ["src/a/"]), slice("B1", ["src/a/x.mjs"], ["A1"]), slice("C1", ["src/c/"])]);
const held = (state) => ({ state, holdReason: "fixture" });
const HELD_QUEUE = queueOf([
  slice("A1", ["src/a/"]), slice("C1", ["src/c/"]),
  slice("D1", ["src/d/"], [], held("deferred")),
  slice("H1", ["src/h/"], [], held("hold-po")),
  slice("X1", ["src/x/"], [], held("cancelled")),
]);

function makeCase(name, queue = QUEUE) {
  const dir = join(root, name);
  const commonDir = join(dir, "common");
  mkdirSync(commonDir, { recursive: true });
  writeFileSync(join(dir, "slice-queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
  return { dir, commonDir };
}
const envFor = (c, extra = {}) => ({ PIPELINE_FANOUT_CONFIG: JSON.stringify({ queuePath: "slice-queue.json", commonDir: c.commonDir, ...extra }) });
const inputFor = (c) => ({ tool_name: "Agent", tool_use_id: "toolu_fx", session_id: SESSION, cwd: c.dir, tool_input: { subagent_type: "general-purpose" } });
const entry = (prompt, role = "other") => ({ dispatch: { subagentType: "general-purpose", prompt, transport: "direct" }, role });
const ledger = (c) => readEvents(c.commonDir, "claude", SESSION).events;
const ledgerPath = (c) => fanoutStatePath(c.commonDir, "claude", SESSION);
function makeLive(c, sliceId) {
  appendEvent(c.commonDir, "claude", SESSION, {
    type: "launch", sliceId, agentType: "goldfish-implementor", model: "claude-sonnet-5-5", writeScopeHash: "a".repeat(64), commitMode: "diff-only",
  });
}
// A terminal dispatch record that is not an interim hand-back marks the slice `done` (design 3.1).
const DONE_OUTCOME = ["completed", "done", "success", "succeeded", "passed"].find((outcome) => isTerminalOutcome(outcome) && !HANDBACK_OUTCOMES.includes(outcome));
function writeDoneRecord(c, id) {
  mkdirSync(join(c.dir, "evidence"), { recursive: true });
  writeFileSync(join(c.dir, "evidence", `dispatch-record-${id}.json`), JSON.stringify({ taskId: id, outcome: DONE_OUTCOME, outcomeClassification: { kind: "authored-commit" } }));
}
const MODEL = "Model/effort: claude-sonnet-5-5 / xhigh\n";
const overlapB1 = `Implement it.\nSlice: B1\n${MODEL}`; // no Write scope line
const declaredB1 = `${overlapB1}Write scope: src/a/x.mjs\n`;
const disjointC1 = `Implement it.\nSlice: C1\n${MODEL}`; // no Write scope line
const declaredC1 = `${disjointC1}Write scope: src/c/\n`;
const noSlice = "Implement it. No slice marker anywhere.\n";
const codesOf = (plan) => plan.findings.map((finding) => finding.code);
const observe = (c, prompt, mode, role = "goldfish") => gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(prompt, role)], env: envFor(c, { mode }) });

test("precondition: the fixture queues are valid slice queues and a done outcome exists", () => {
  for (const [name, queue] of [["precondition", QUEUE], ["precondition-held", HELD_QUEUE]]) {
    const c = makeCase(name, queue);
    const loaded = loadSliceQueue(join(c.dir, "slice-queue.json"));
    assert.equal(loaded.status, "valid", JSON.stringify(loaded.errors));
  }
  assert.equal(typeof DONE_OUTCOME, "string", "a terminal outcome that is not a hand-back must exist");
});

test("parseDispatchSlice: one Slice line, optional Write scope, ambiguity names no slice", () => {
  assert.equal(dp.parseDispatchSlice("x\nSlice: S7\n").sliceId, "S7");
  assert.equal(dp.parseDispatchSlice("- **Slice:** `S7`\n").sliceId, "S7");
  assert.equal(dp.parseDispatchSlice("no marker\n").sliceId, null);
  assert.equal(dp.parseDispatchSlice("Slice: A1\nSlice: B1\n").sliceId, null);
  assert.equal(dp.parseDispatchSlice("Slice: ../etc\n").sliceId, null, "an unsafe id names no slice");
  assert.equal(dp.parseDispatchSlice("Slice: S7\nWrite scope: none\n").writeScope, "none");
  assert.deepEqual(dp.parseDispatchSlice("Slice: S7\nWrite scope: src/a.mjs, `src/b/`\n").writeScope, ["src/a.mjs", "src/b/"]);
  assert.equal(dp.parseDispatchSlice("Slice: S7\n").writeScope, null);
});

test("fanoutDispatchFindings is pure: overlap, disjoint, read-only, no slice, role gating", () => {
  const queue = loadSliceQueue(join(makeCase("pure").dir, "slice-queue.json")).queue;
  const overlaps = () => true;
  const never = () => false;
  const run = (args) => dp.fanoutDispatchFindings({ queue, ...args });
  assert.deepEqual(run({ role: "goldfish", prompt: overlapB1, liveSliceIds: ["A1"], overlaps }).findings.map((f) => f.code), ["FANOUT-SCOPE-OVERLAP"]);
  assert.deepEqual(run({ role: "goldfish", prompt: overlapB1, liveSliceIds: ["A1"], overlaps: never }).findings, []);
  // F7: the same slice already live used to pass silently ("a slice never overlaps itself"). It still
  // never counts as an overlap, but it is no longer admitted: a slice that is live is not ready.
  assert.deepEqual(run({ role: "goldfish", prompt: overlapB1, liveSliceIds: ["B1"], overlaps }).findings.map((f) => f.code), ["FANOUT-SLICE-NOT-READY"], "a slice never overlaps itself, and a live slice is not ready");
  assert.deepEqual(run({ role: "goldfish", prompt: `${overlapB1}Write scope: none\n`, liveSliceIds: ["A1"], overlaps }).findings, [], "read-only is never refused for overlap");
  assert.deepEqual(run({ role: "goldfish", prompt: noSlice, liveSliceIds: [], overlaps }).findings.map((f) => f.code), ["FANOUT-NO-SLICE"]);
  assert.deepEqual(run({ role: "goldfish", prompt: "Slice: NOPE\n", liveSliceIds: [], overlaps }).findings.map((f) => f.code), ["FANOUT-NO-SLICE"], "an unknown slice id names no queue slice");
  assert.deepEqual(run({ role: "critic", prompt: noSlice, liveSliceIds: [], overlaps }).findings, [], "only implementation (goldfish) dispatches need a slice");
  assert.deepEqual(dp.fanoutDispatchFindings({ queue: null, role: "goldfish", prompt: noSlice, overlaps }).findings, []);
});

test("(a) fanoutDispatchFindings: a slice that is not ready is refused, whatever the reason", () => {
  const queue = queueOf([
    slice("A1", ["src/a/"]),
    slice("D1", ["src/d/"], [], held("deferred")),
    slice("H1", ["src/h/"], [], held("hold-po")),
    slice("X1", ["src/x/"], [], held("cancelled")),
    slice("E1", ["src/e/"], [], held("blocked-external")),
  ]);
  const never = () => false;
  const run = (prompt, extra = {}) => dp.fanoutDispatchFindings({ queue, role: "goldfish", prompt, overlaps: never, ...extra }).findings.map((f) => f.code);
  for (const id of ["D1", "H1", "X1", "E1"]) assert.deepEqual(run(`Slice: ${id}\n`), ["FANOUT-SLICE-NOT-READY"], `declared state of ${id}`);
  assert.deepEqual(run("Slice: A1\n", { liveSliceIds: ["A1"] }), ["FANOUT-SLICE-NOT-READY"], "the same slice already live");
  for (const status of ["done", "cancelled", "held", "live"]) {
    assert.deepEqual(run("Slice: A1\n", { sliceStatus: { A1: { status, reasons: [] } } }), ["FANOUT-SLICE-NOT-READY"], `derived status ${status}`);
  }
  assert.deepEqual(run("Slice: A1\n", { sliceStatus: { A1: { status: "blocked", reasons: [{ code: "commit-live", with: ["C1"] }] } } }), ["FANOUT-SLICE-NOT-READY"], "blocked by the single-committer rule");
  assert.deepEqual(run("Slice: A1\n", { sliceStatus: { A1: { status: "ready", reasons: [] } } }), [], "a ready slice is admitted");
  assert.deepEqual(run("Slice: D1\nWrite scope: none\n"), ["FANOUT-SLICE-NOT-READY"], "read-only dispatches are exempt from the overlap check only");
});

test("(b) fanoutDispatchFindings: a dependency-blocked slice is refused", () => {
  const queue = loadSliceQueue(join(makeCase("pure-dep").dir, "slice-queue.json")).queue;
  const never = () => false;
  const run = (status, reasons) => dp.fanoutDispatchFindings({ queue, role: "goldfish", prompt: "Slice: B1\n", overlaps: never, sliceStatus: { B1: { status, reasons } } });
  const blocked = run("blocked", [{ code: "dependency", waitsOn: ["A1"] }]);
  assert.deepEqual(blocked.findings.map((f) => f.code), ["FANOUT-DEP-BLOCKED"]);
  assert.deepEqual(blocked.findings[0].waitsOn, ["A1"]);
  assert.deepEqual(run("blocked", [{ code: "dependency-cancelled", waitsOn: ["A1"] }]).findings.map((f) => f.code), ["FANOUT-DEP-BLOCKED"]);
  assert.deepEqual(run("blocked", [{ code: "scope-overlap", with: ["A1"] }]).findings, [], "a pure scope clash is the overlap check's business, not a dependency block");
  assert.deepEqual(run("ready", []).findings, []);
});

test("(c) fanoutDispatchFindings: a declared scope outside the queue entry's writeScope is refused", () => {
  const queue = loadSliceQueue(join(makeCase("pure-contain").dir, "slice-queue.json")).queue;
  const never = () => false;
  const run = (prompt, contains) => dp.fanoutDispatchFindings({ queue, role: "goldfish", prompt, overlaps: never, contains }).findings.map((f) => f.code);
  let consulted = 0;
  const outside = () => { consulted += 1; return false; };
  const inside = () => { consulted += 1; return true; };
  assert.deepEqual(run("Slice: C1\nWrite scope: src/zzz/\n", outside), ["FANOUT-SCOPE-NOT-CONTAINED"]);
  assert.deepEqual(run("Slice: C1\nWrite scope: src/c/x.mjs\n", inside), []);
  const before = consulted;
  assert.deepEqual(run("Slice: C1\n", outside), [], "an undeclared scope falls back to the queue scope in the pure helper");
  assert.deepEqual(run("Slice: C1\nWrite scope: none\n", outside), [], "read-only declares no paths");
  assert.equal(consulted, before, "the predicate is consulted only for a declared path list");
  assert.deepEqual(run("Slice: C1\nWrite scope: src/zzz/\n", undefined), [], "no predicate injected: no opinion");
});

test("scopeWithin: containment of a declared scope list in the queue entry's writeScope", () => {
  const within = gd.scopeWithin;
  assert.equal(typeof within, "function");
  assert.equal(within(["src/a/x.mjs"], ["src/a/"]), true);
  assert.equal(within(["src/a/"], ["src/a/"]), true);
  assert.equal(within(["src/a/sub/y.mjs", "src/a/x.mjs"], ["src/a/"]), true);
  assert.equal(within(["src/a/x.mjs"], ["src/a/x.mjs"]), true);
  assert.equal(within(["src/a/x.mjs"], ["src/a/**"]), true);
  assert.equal(within(["src/a/x.mjs"], ["src/**/*.mjs"]), true);
  assert.equal(within(["src/a/x.mjs"], ["./"]), true);
  assert.equal(within(["src/a/x.mjs"], ["src/a/y.mjs"]), false);
  assert.equal(within(["src/ab/x.mjs"], ["src/a/"]), false, "a sibling directory sharing a name prefix is not inside");
  assert.equal(within(["src/"], ["src/a/"]), false, "a wider scope is not contained");
  assert.equal(within(["src/a/x.mjs", "src/z.mjs"], ["src/a/"]), false, "every declared path must be inside");
  assert.equal(within(["../outside.mjs"], ["src/a/"]), false, "an unnormalisable or escaping scope is not contained");
  assert.equal(within(["src/a/x.mjs"], []), false, "nothing is inside an empty scope");
});

test("(e) fanoutDispatchFindings: an undeclared scope is refused only in enforce while another dispatch is live", () => {
  const queue = loadSliceQueue(join(makeCase("pure-undeclared").dir, "slice-queue.json")).queue;
  const never = () => false;
  const run = (prompt, mode, liveSliceIds) => dp.fanoutDispatchFindings({ queue, role: "goldfish", prompt, overlaps: never, mode, liveSliceIds }).findings.map((f) => f.code);
  assert.deepEqual(run("Slice: C1\n", "enforce", ["A1"]), ["FANOUT-SCOPE-UNDECLARED"]);
  assert.deepEqual(run("Slice: C1\n", "shadow", ["A1"]), [], "shadow keeps the queue-scope fallback");
  assert.deepEqual(run("Slice: C1\n", "advisory", ["A1"]), []);
  assert.deepEqual(run("Slice: C1\n", undefined, ["A1"]), [], "the default mode is shadow");
  assert.deepEqual(run("Slice: C1\n", "enforce", []), [], "nothing else is live");
  assert.deepEqual(run("Slice: C1\nWrite scope: src/c/\n", "enforce", ["A1"]), []);
  assert.deepEqual(run("Slice: C1\nWrite scope: none\n", "enforce", ["A1"]), []);
});

test("no config: inactive, no findings, no ledger write", () => {
  const c = makeCase("noconfig");
  makeLive(c, "A1");
  const before = ledger(c).length;
  const plan = gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(overlapB1, "goldfish")], env: {} });
  assert.equal(plan.active, false);
  assert.deepEqual(plan.findings, []);
  assert.equal(plan.block, false);
  assert.deepEqual(plan.launchEvents, []);
  assert.equal(ledger(c).length, before, "nothing is appended without a config");
});

test("config without queuePath, and mode off: inactive", () => {
  const c = makeCase("nopath");
  makeLive(c, "A1");
  const noPath = { PIPELINE_FANOUT_CONFIG: JSON.stringify({ commonDir: c.commonDir, mode: "enforce" }) };
  assert.equal(gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(overlapB1)], env: noPath }).active, false);
  const off = gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(overlapB1)], env: envFor(c, { mode: "off" }) });
  assert.equal(off.active, false);
  assert.equal(off.block, false);
});

test("shadow + overlap: admitted, findings recorded, launch appended", () => {
  const c = makeCase("shadow-overlap");
  makeLive(c, "A1");
  const plan = gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(overlapB1, "goldfish")], env: envFor(c) });
  assert.equal(plan.active, true);
  assert.equal(plan.mode, "shadow", "shadow is the default mode");
  // B1 depends on A1, which is live and not done: the overlap comes with a dependency block.
  assert.deepEqual(codesOf(plan), ["FANOUT-DEP-BLOCKED", "FANOUT-SCOPE-OVERLAP"]);
  assert.equal(plan.block, false, "shadow never blocks");
  assert.equal(gd.recordFanoutEvents(plan, plan.findingEvents), 2);
  assert.equal(gd.recordFanoutEvents(plan, plan.launchEvents), 1);
  const events = ledger(c);
  assert.ok(events.some((e) => e.type === "stop-eval" && e.reason === "FANOUT-SCOPE-OVERLAP" && e.decision === "allow" && e.mode === "shadow"));
  assert.ok(events.some((e) => e.type === "stop-eval" && e.reason === "FANOUT-DEP-BLOCKED" && e.decision === "allow" && e.mode === "shadow"));
  const launch = events.filter((e) => e.type === "launch" && e.sliceId === "B1");
  assert.equal(launch.length, 1);
  assert.equal(launch[0].model, "claude-sonnet-5-5");
  assert.equal(launch[0].commitMode, "diff-only");
  assert.match(launch[0].writeScopeHash, /^[a-f0-9]{64}$/u);
});

test("shadow + no slice: admitted, FANOUT-NO-SLICE recorded, no launch", () => {
  const c = makeCase("shadow-noslice");
  makeLive(c, "A1");
  const plan = gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(noSlice, "goldfish")], env: envFor(c) });
  assert.deepEqual(codesOf(plan), ["FANOUT-NO-SLICE"]);
  assert.equal(plan.block, false);
  assert.deepEqual(plan.launchEvents, []);
  assert.equal(gd.recordFanoutEvents(plan, plan.findingEvents), 1);
  assert.ok(ledger(c).some((e) => e.type === "stop-eval" && e.reason === "FANOUT-NO-SLICE" && e.decision === "allow"));
  assert.equal(ledger(c).filter((e) => e.type === "launch").length, 1, "only the fixture's own A1 launch exists");
});

test("enforce + overlap: blocked with FANOUT-SCOPE-OVERLAP", () => {
  const c = makeCase("enforce-overlap");
  makeLive(c, "A1");
  const plan = observe(c, declaredB1, "enforce");
  assert.equal(plan.mode, "enforce");
  assert.equal(plan.block, true);
  assert.deepEqual(codesOf(plan), ["FANOUT-DEP-BLOCKED", "FANOUT-SCOPE-OVERLAP"]);
  gd.recordFanoutEvents(plan, plan.findingEvents);
  assert.ok(ledger(c).some((e) => e.type === "stop-eval" && e.reason === "FANOUT-SCOPE-OVERLAP" && e.decision === "block" && e.mode === "enforce"));
});

test("(d) FANOUT-NO-SLICE blocks in enforce (design 3.10), never in shadow or advisory", () => {
  const c = makeCase("nosl");
  makeLive(c, "A1");
  for (const prompt of [noSlice, "Implement it.\nSlice: NOPE\n"]) {
    const enforce = observe(c, prompt, "enforce");
    assert.deepEqual(codesOf(enforce), ["FANOUT-NO-SLICE"]);
    assert.equal(enforce.block, true, "enforce: work cannot bypass the queue");
    assert.deepEqual(enforce.launchEvents, []);
    gd.recordFanoutEvents(enforce, enforce.findingEvents);
    for (const mode of ["shadow", "advisory"]) {
      const plan = observe(c, prompt, mode);
      assert.deepEqual(codesOf(plan), ["FANOUT-NO-SLICE"]);
      assert.equal(plan.block, false, `${mode} never blocks`);
    }
  }
  assert.ok(ledger(c).some((e) => e.type === "stop-eval" && e.reason === "FANOUT-NO-SLICE" && e.decision === "block" && e.mode === "enforce"));
  assert.deepEqual(observe(c, noSlice, "enforce", "critic").findings, [], "only implementation (goldfish) dispatches need a slice");
});

test("advisory never blocks, even on an overlap", () => {
  const c = makeCase("advisory-overlap");
  makeLive(c, "A1");
  const advisory = observe(c, declaredB1, "advisory");
  assert.deepEqual(codesOf(advisory), ["FANOUT-DEP-BLOCKED", "FANOUT-SCOPE-OVERLAP"]);
  assert.equal(advisory.block, false);
});

test("enforce + disjoint: admitted and launch appended", () => {
  const c = makeCase("enforce-disjoint");
  makeLive(c, "A1");
  const plan = observe(c, declaredC1, "enforce");
  assert.deepEqual(plan.findings, []);
  assert.equal(plan.block, false);
  assert.equal(gd.recordFanoutEvents(plan, plan.launchEvents), 1);
  assert.equal(ledger(c).filter((e) => e.type === "launch" && e.sliceId === "C1").length, 1);
});

test("one call with two dispatches is evaluated pairwise (Workflow fan-out round)", () => {
  const c = makeCase("pairwise");
  const plan = gd.observeFanoutDispatches({
    input: inputFor(c),
    entries: [entry("Slice: A1\n", "goldfish"), entry(declaredB1, "goldfish")],
    env: envFor(c, { mode: "enforce" }),
  });
  assert.deepEqual(codesOf(plan), ["FANOUT-DEP-BLOCKED", "FANOUT-SCOPE-OVERLAP"]);
  assert.deepEqual(plan.findings.map((f) => f.index), [1, 1]);
  assert.equal(plan.block, true);
});

test("(a) the same slice already live is refused, also twice within one call", () => {
  const c = makeCase("same-live");
  makeLive(c, "A1");
  const declaredA1 = `Implement it.\nSlice: A1\n${MODEL}Write scope: src/a/\n`;
  const enforce = observe(c, declaredA1, "enforce");
  assert.deepEqual(codesOf(enforce), ["FANOUT-SLICE-NOT-READY"], "a slice is never an overlap with itself, but a live slice is not ready");
  assert.equal(enforce.block, true);
  const shadow = observe(c, declaredA1, "shadow");
  assert.deepEqual(codesOf(shadow), ["FANOUT-SLICE-NOT-READY"]);
  assert.equal(shadow.block, false, "shadow records it and never blocks");

  const twice = makeCase("same-twice");
  const call = gd.observeFanoutDispatches({
    input: inputFor(twice),
    entries: [entry(declaredA1, "goldfish"), entry(declaredA1, "goldfish")],
    env: envFor(twice, { mode: "enforce" }),
  });
  assert.deepEqual(codesOf(call), ["FANOUT-SLICE-NOT-READY"]);
  assert.equal(call.findings[0].index, 1, "the second naming of the slice in one call is the refused one");
  assert.equal(call.block, true);
});

test("(a) a done slice is refused (terminal dispatch record)", () => {
  const c = makeCase("done");
  writeDoneRecord(c, "C1");
  const enforce = observe(c, declaredC1, "enforce");
  assert.deepEqual(codesOf(enforce), ["FANOUT-SLICE-NOT-READY"]);
  assert.equal(enforce.block, true);
  assert.equal(observe(c, declaredC1, "shadow").block, false);
});

test("(a) deferred, hold-po and cancelled slices are refused", () => {
  const c = makeCase("held", HELD_QUEUE);
  for (const id of ["D1", "H1", "X1"]) {
    const prompt = `Implement it.\nSlice: ${id}\n${MODEL}`;
    const enforce = observe(c, prompt, "enforce");
    assert.deepEqual(codesOf(enforce), ["FANOUT-SLICE-NOT-READY"], id);
    assert.equal(enforce.block, true, id);
    assert.equal(observe(c, prompt, "shadow").block, false, `${id} in shadow`);
  }
});

test("(b) a dependency-blocked slice is refused; once the dependency is done it is admitted", () => {
  const c = makeCase("dep");
  const enforce = observe(c, declaredB1, "enforce");
  assert.deepEqual(codesOf(enforce), ["FANOUT-DEP-BLOCKED"], "A1 is neither live nor done: B1 must wait, and nothing overlaps");
  assert.deepEqual(enforce.findings[0].waitsOn, ["A1"]);
  assert.equal(enforce.block, true);
  assert.equal(observe(c, declaredB1, "shadow").block, false);

  writeDoneRecord(c, "A1");
  const admitted = observe(c, declaredB1, "enforce");
  assert.deepEqual(admitted.findings, []);
  assert.equal(admitted.block, false);
});

test("(c) a declared scope outside the queue entry's writeScope is refused", () => {
  const c = makeCase("contain");
  const outside = `${disjointC1}Write scope: src/zzz/\n`;
  const enforce = observe(c, outside, "enforce");
  assert.deepEqual(codesOf(enforce), ["FANOUT-SCOPE-NOT-CONTAINED"]);
  assert.equal(enforce.block, true);
  const mixed = observe(c, `${disjointC1}Write scope: src/c/ok.mjs, src/zzz/evil.mjs\n`, "enforce");
  assert.deepEqual(codesOf(mixed), ["FANOUT-SCOPE-NOT-CONTAINED"], "one escaping path is enough");
  const shadow = observe(c, outside, "shadow");
  assert.deepEqual(codesOf(shadow), ["FANOUT-SCOPE-NOT-CONTAINED"]);
  assert.equal(shadow.block, false);
  assert.deepEqual(observe(c, `${disjointC1}Write scope: src/c/sub/y.mjs\n`, "enforce").findings, [], "a path inside the entry's scope is admitted");
});

test("(e) enforce only: an undeclared scope while another dispatch is live is refused, not defaulted", () => {
  const c = makeCase("undeclared");
  makeLive(c, "A1");
  const enforce = observe(c, disjointC1, "enforce");
  assert.deepEqual(codesOf(enforce), ["FANOUT-SCOPE-UNDECLARED"]);
  assert.equal(enforce.block, true);
  for (const mode of ["shadow", "advisory"]) {
    const plan = observe(c, disjointC1, mode);
    assert.deepEqual(plan.findings, [], `${mode} keeps the silent queue-scope fallback`);
    assert.equal(plan.block, false);
  }
  assert.deepEqual(observe(c, declaredC1, "enforce").findings, [], "a declared scope is admitted");
  assert.deepEqual(observe(c, `${disjointC1}Write scope: none\n`, "enforce").findings, [], "read-only declares its scope too");
  const alone = makeCase("undeclared-alone");
  assert.deepEqual(observe(alone, disjointC1, "enforce").findings, [], "nothing else is live");
});

test("shadow and advisory never change a verdict: every refusal above is recorded, none blocks", () => {
  const c = makeCase("never-block", HELD_QUEUE);
  makeLive(c, "A1");
  const prompts = [
    noSlice,
    `Implement it.\nSlice: A1\n${MODEL}Write scope: src/a/\n`,
    `Implement it.\nSlice: D1\n${MODEL}`,
    `${disjointC1}Write scope: src/zzz/\n`,
    disjointC1,
  ];
  for (const mode of ["shadow", "advisory"]) {
    for (const prompt of prompts) assert.equal(observe(c, prompt, mode).block, false, `${mode}: ${prompt.slice(0, 40)}`);
  }
});

test("faults fail open: corrupt queue, unreadable ledger, malformed config", () => {
  const corrupt = makeCase("fault-queue");
  writeFileSync(join(corrupt.dir, "slice-queue.json"), "{ this is not json");
  makeLive(corrupt, "A1");
  const a = gd.observeFanoutDispatches({ input: inputFor(corrupt), entries: [entry(overlapB1, "goldfish")], env: envFor(corrupt, { mode: "enforce" }) });
  assert.equal(a.active, false);
  assert.equal(a.block, false);
  assert.deepEqual(a.findings, []);

  const unreadable = makeCase("fault-ledger");
  mkdirSync(ledgerPath(unreadable), { recursive: true }); // a directory where the ledger file belongs
  const b = gd.observeFanoutDispatches({ input: inputFor(unreadable), entries: [entry(overlapB1, "goldfish")], env: envFor(unreadable, { mode: "enforce" }) });
  assert.equal(b.active, false);
  assert.equal(b.block, false);
  assert.deepEqual(b.launchEvents, []);

  const badConfig = makeCase("fault-config");
  const c = gd.observeFanoutDispatches({ input: inputFor(badConfig), entries: [entry(overlapB1, "goldfish")], env: { PIPELINE_FANOUT_CONFIG: "{ not json" } });
  assert.equal(c.active, false);
  assert.equal(c.block, false);
  const relativeCommonDir = gd.observeFanoutDispatches({ input: inputFor(badConfig), entries: [entry(overlapB1, "goldfish")], env: envFor(badConfig, { commonDir: "relative/dir", mode: "enforce" }) });
  assert.equal(relativeCommonDir.active, false, "a non-absolute commonDir is a thrown fault, not a guess");
  assert.equal(relativeCommonDir.block, false);
  assert.doesNotThrow(() => gd.recordFanoutEvents({ commonDir: "relative/dir", runner: "claude", sessionId: SESSION }, [{ type: "launch" }]));
});

// ---- hook-level: the real hook process, enrolled fixture repository ----------------------------
// The fixture repository lives under os.tmpdir() (inside `root`): the working tree is never
// touched and no repository is initialised inside it.
const hookRepo = join(root, "hook-repo");
let enrollmentSkip = null; // set ONLY for the documented native-Windows enrollment limit
let enrollmentFailure = null; // any other fixture failure: the hook-level cases FAIL with it
try {
  mkdirSync(join(hookRepo, ".claude"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: hookRepo });
} catch (error) {
  enrollmentFailure = error;
}
if (enrollmentFailure === null) {
  try {
    recordConsentGiven({ rootDir: hookRepo });
  } catch (error) {
    if (process.platform === "win32" && error?.code === "EPERM") {
      enrollmentSkip = "native Windows cannot write the enrollment marker (EPERM on directory fsync); the hook-level cases need WSL/Linux/macOS";
    } else {
      enrollmentFailure = error;
    }
  }
}
function requireEnrollment() {
  if (enrollmentFailure !== null) throw enrollmentFailure;
  assert.equal(observeGovernanceScope({ rootDir: hookRepo }).requiresEnforcement, true, "the fixture repository must be governance-enrolled");
}

function runHook(c, prompt, config) {
  writeFileSync(join(hookRepo, "slice-queue.json"), `${JSON.stringify(QUEUE, null, 2)}\n`);
  const payload = { tool_name: "Agent", tool_use_id: "toolu_fx", session_id: SESSION, cwd: hookRepo, tool_input: { subagent_type: "general-purpose", prompt } };
  const env = { ...process.env, CLAUDE_PROJECT_DIR: hookRepo, PIPELINE_FANOUT_CONFIG: JSON.stringify({ queuePath: "slice-queue.json", commonDir: c.commonDir, ...config }) };
  return spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), env, encoding: "utf8", cwd: hookRepo });
}

test("hook: shadow + overlap exits 0 and appends the launch", { skip: enrollmentSkip ?? false }, () => {
  requireEnrollment();
  const c = makeCase("hook-shadow");
  makeLive(c, "A1");
  const result = runHook(c, overlapB1, {});
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /BLOCKED/u);
  assert.ok(ledger(c).some((e) => e.type === "launch" && e.sliceId === "B1"));
  assert.ok(ledger(c).some((e) => e.type === "stop-eval" && e.reason === "FANOUT-SCOPE-OVERLAP"));
});

test("hook: enforce + overlap exits 2 naming FANOUT-SCOPE-OVERLAP and appends no launch", { skip: enrollmentSkip ?? false }, () => {
  requireEnrollment();
  const c = makeCase("hook-enforce");
  makeLive(c, "A1");
  const result = runHook(c, declaredB1, { mode: "enforce" });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /FANOUT-SCOPE-OVERLAP/u);
  assert.equal(ledger(c).filter((e) => e.type === "launch" && e.sliceId === "B1").length, 0);
});

test("hook: enforce + the same slice already live exits 2 naming FANOUT-SLICE-NOT-READY", { skip: enrollmentSkip ?? false }, () => {
  requireEnrollment();
  const c = makeCase("hook-not-ready");
  makeLive(c, "A1");
  const result = runHook(c, `Implement it.\nSlice: A1\n${MODEL}Write scope: src/a/\n`, { mode: "enforce" });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /FANOUT-SLICE-NOT-READY/u);
  assert.equal(ledger(c).filter((e) => e.type === "launch" && e.sliceId === "A1").length, 1, "only the fixture's own launch exists");
});

test("hook: no config exits 0 and never touches the ledger", { skip: enrollmentSkip ?? false }, () => {
  requireEnrollment();
  const c = makeCase("hook-noconfig");
  const payload = { tool_name: "Agent", session_id: SESSION, cwd: hookRepo, tool_input: { subagent_type: "general-purpose", prompt: overlapB1 } };
  const env = { ...process.env, CLAUDE_PROJECT_DIR: hookRepo };
  delete env.PIPELINE_FANOUT_CONFIG;
  const result = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), env, encoding: "utf8", cwd: hookRepo });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(ledgerPath(c)), false);
});
