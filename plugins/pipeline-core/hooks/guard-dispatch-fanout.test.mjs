// SPDX-License-Identifier: SUL-1.0
/**
 * FANOUT slice S7: the dispatch guard checks slice-scope overlap, in shadow mode by default.
 *
 * Design: specs/sprint-alfred-epic/design/fanout-enforcement-design.md section 3.4 and row S7.
 *
 * In-process cases call the exported seams (`observeFanoutDispatches`, `recordFanoutEvents` in
 * guard-dispatch.mjs; `parseDispatchSlice`, `fanoutDispatchFindings` in ../lib/dispatch-policy.mjs)
 * so they run on every platform. The hook-level cases spawn the real hook and need an enrolled
 * fixture repository; where enrollment itself cannot be written (native Windows: directory fsync
 * fails with EPERM, the same pre-existing limit that stops guard-dispatch.test.mjs) they are
 * skipped with that reason rather than faked.
 *
 * Modules are imported with top-level `await import()` so a missing export turns the individual
 * case red instead of failing the whole file at link time.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { appendEvent, fanoutStatePath, readEvents } from "../lib/fanout-ledger.mjs";
import { loadSliceQueue } from "../lib/slice-queue.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { recordConsentGiven } from "../lib/onboarding-consent-marker.mjs";

const gd = await import("./guard-dispatch.mjs");
const dp = await import("../lib/dispatch-policy.mjs");

const GUARD = fileURLToPath(new URL("./guard-dispatch.mjs", import.meta.url));
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const root = mkdtempSync(join(repoRoot, "scratch", "fanout-s7-"));
process.once("exit", () => rmSync(root, { recursive: true, force: true }));

const SESSION = "fanout-s7-session";
const slice = (id, writeScope, dependsOn = []) => ({
  id, title: `slice ${id}`, state: "ready", holdReason: null, dependsOn, writeScope, readScope: [],
  tier: "implementor", tierReason: null, commitMode: "diff-only", loadClass: "light",
  briefing: { ref: `specs/fx/briefings/${id}.md` }, estimatedToolCalls: 20,
});
// B1 is ordered after A1 by dependsOn, so the queue may legally share src/a/ between them;
// that is exactly the case the dispatch-time check exists for (B1 launched while A1 is live).
const QUEUE = {
  schema: "pipeline.slice-queue.v1",
  feature: "fx",
  defaults: { commitMode: "diff-only", tier: "implementor" },
  limits: { maxAttemptsPerSlice: 2 },
  slices: [slice("A1", ["src/a/"]), slice("B1", ["src/a/x.mjs"], ["A1"]), slice("C1", ["src/c/"])],
};

function makeCase(name) {
  const dir = join(root, name);
  const commonDir = join(dir, "common");
  mkdirSync(commonDir, { recursive: true });
  writeFileSync(join(dir, "slice-queue.json"), `${JSON.stringify(QUEUE, null, 2)}\n`);
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
const overlapB1 = "Implement it.\nSlice: B1\nModel/effort: claude-sonnet-5-5 / xhigh\n";
const disjointC1 = "Implement it.\nSlice: C1\nModel/effort: claude-sonnet-5-5 / xhigh\n";
const noSlice = "Implement it. No slice marker anywhere.\n";
const codesOf = (plan) => plan.findings.map((finding) => finding.code);

test("precondition: the fixture queue is a valid slice queue", () => {
  const c = makeCase("precondition");
  const loaded = loadSliceQueue(join(c.dir, "slice-queue.json"));
  assert.equal(loaded.status, "valid", JSON.stringify(loaded.errors));
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
  assert.deepEqual(run({ role: "goldfish", prompt: overlapB1, liveSliceIds: ["B1"], overlaps }).findings, [], "a slice never overlaps itself");
  assert.deepEqual(run({ role: "goldfish", prompt: `${overlapB1}Write scope: none\n`, liveSliceIds: ["A1"], overlaps }).findings, [], "read-only is never refused for overlap");
  assert.deepEqual(run({ role: "goldfish", prompt: noSlice, liveSliceIds: [], overlaps }).findings.map((f) => f.code), ["FANOUT-NO-SLICE"]);
  assert.deepEqual(run({ role: "goldfish", prompt: "Slice: NOPE\n", liveSliceIds: [], overlaps }).findings.map((f) => f.code), ["FANOUT-NO-SLICE"], "an unknown slice id names no queue slice");
  assert.deepEqual(run({ role: "critic", prompt: noSlice, liveSliceIds: [], overlaps }).findings, [], "only implementation (goldfish) dispatches need a slice");
  assert.deepEqual(dp.fanoutDispatchFindings({ queue: null, role: "goldfish", prompt: noSlice, overlaps }).findings, []);
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

test("shadow + overlap: admitted, finding recorded, launch appended", () => {
  const c = makeCase("shadow-overlap");
  makeLive(c, "A1");
  const plan = gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(overlapB1, "goldfish")], env: envFor(c) });
  assert.equal(plan.active, true);
  assert.equal(plan.mode, "shadow", "shadow is the default mode");
  assert.deepEqual(codesOf(plan), ["FANOUT-SCOPE-OVERLAP"]);
  assert.equal(plan.block, false, "shadow never blocks");
  assert.equal(gd.recordFanoutEvents(plan, plan.findingEvents), 1);
  assert.equal(gd.recordFanoutEvents(plan, plan.launchEvents), 1);
  const events = ledger(c);
  assert.ok(events.some((e) => e.type === "stop-eval" && e.reason === "FANOUT-SCOPE-OVERLAP" && e.decision === "allow" && e.mode === "shadow"));
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
  const plan = gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(overlapB1, "goldfish")], env: envFor(c, { mode: "enforce" }) });
  assert.equal(plan.mode, "enforce");
  assert.equal(plan.block, true);
  assert.deepEqual(codesOf(plan), ["FANOUT-SCOPE-OVERLAP"]);
  gd.recordFanoutEvents(plan, plan.findingEvents);
  assert.ok(ledger(c).some((e) => e.type === "stop-eval" && e.reason === "FANOUT-SCOPE-OVERLAP" && e.decision === "block" && e.mode === "enforce"));
});

test("enforce + no slice does not block; advisory never blocks", () => {
  const c = makeCase("enforce-noslice");
  makeLive(c, "A1");
  const enforce = gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(noSlice, "goldfish")], env: envFor(c, { mode: "enforce" }) });
  assert.deepEqual(codesOf(enforce), ["FANOUT-NO-SLICE"]);
  assert.equal(enforce.block, false, "only FANOUT-SCOPE-OVERLAP may block");
  const advisory = gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(overlapB1, "goldfish")], env: envFor(c, { mode: "advisory" }) });
  assert.deepEqual(codesOf(advisory), ["FANOUT-SCOPE-OVERLAP"]);
  assert.equal(advisory.block, false);
});

test("enforce + disjoint: admitted and launch appended", () => {
  const c = makeCase("enforce-disjoint");
  makeLive(c, "A1");
  const plan = gd.observeFanoutDispatches({ input: inputFor(c), entries: [entry(disjointC1, "goldfish")], env: envFor(c, { mode: "enforce" }) });
  assert.deepEqual(plan.findings, []);
  assert.equal(plan.block, false);
  assert.equal(gd.recordFanoutEvents(plan, plan.launchEvents), 1);
  assert.equal(ledger(c).filter((e) => e.type === "launch" && e.sliceId === "C1").length, 1);
});

test("one call with two dispatches is evaluated pairwise (Workflow fan-out round)", () => {
  const c = makeCase("pairwise");
  const plan = gd.observeFanoutDispatches({
    input: inputFor(c),
    entries: [entry("Slice: A1\n", "goldfish"), entry(overlapB1, "goldfish")],
    env: envFor(c, { mode: "enforce" }),
  });
  assert.deepEqual(codesOf(plan), ["FANOUT-SCOPE-OVERLAP"]);
  assert.equal(plan.findings[0].index, 1);
  assert.equal(plan.block, true);
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
let enrollmentFault = null;
const hookRepo = join(root, "hook-repo");
try {
  mkdirSync(join(hookRepo, ".claude"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: hookRepo });
  recordConsentGiven({ rootDir: hookRepo });
  if (observeGovernanceScope({ rootDir: hookRepo }).requiresEnforcement !== true) enrollmentFault = "fixture repository is not governance-enrolled";
} catch (error) {
  enrollmentFault = `fixture enrollment cannot be written on this platform (${error?.code ?? "error"})`;
}

function runHook(c, prompt, config) {
  writeFileSync(join(hookRepo, "slice-queue.json"), `${JSON.stringify(QUEUE, null, 2)}\n`);
  const payload = { tool_name: "Agent", tool_use_id: "toolu_fx", session_id: SESSION, cwd: hookRepo, tool_input: { subagent_type: "general-purpose", prompt } };
  const env = { ...process.env, CLAUDE_PROJECT_DIR: hookRepo, PIPELINE_FANOUT_CONFIG: JSON.stringify({ queuePath: "slice-queue.json", commonDir: c.commonDir, ...config }) };
  return spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), env, encoding: "utf8", cwd: hookRepo });
}

test("hook: shadow + overlap exits 0 and appends the launch", { skip: enrollmentFault ?? false }, () => {
  const c = makeCase("hook-shadow");
  makeLive(c, "A1");
  const result = runHook(c, overlapB1, {});
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /BLOCKED/u);
  assert.ok(ledger(c).some((e) => e.type === "launch" && e.sliceId === "B1"));
  assert.ok(ledger(c).some((e) => e.type === "stop-eval" && e.reason === "FANOUT-SCOPE-OVERLAP"));
});

test("hook: enforce + overlap exits 2 naming FANOUT-SCOPE-OVERLAP and appends no launch", { skip: enrollmentFault ?? false }, () => {
  const c = makeCase("hook-enforce");
  makeLive(c, "A1");
  const result = runHook(c, overlapB1, { mode: "enforce" });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /FANOUT-SCOPE-OVERLAP/u);
  assert.equal(ledger(c).filter((e) => e.type === "launch" && e.sliceId === "B1").length, 0);
});

test("hook: no config exits 0 and never touches the ledger", { skip: enrollmentFault ?? false }, () => {
  const c = makeCase("hook-noconfig");
  const payload = { tool_name: "Agent", session_id: SESSION, cwd: hookRepo, tool_input: { subagent_type: "general-purpose", prompt: overlapB1 } };
  const env = { ...process.env, CLAUDE_PROJECT_DIR: hookRepo };
  delete env.PIPELINE_FANOUT_CONFIG;
  const result = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), env, encoding: "utf8", cwd: hookRepo });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(ledgerPath(c)), false);
});
