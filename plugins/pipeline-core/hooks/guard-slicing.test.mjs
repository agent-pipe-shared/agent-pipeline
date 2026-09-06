#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-slicing.mjs -- hook-level suite (NVA-B-SLICINGBUILD-2).
 *
 * Most cases import the module's exported pure functions directly, at the
 * top level -- SAFE here because guard-slicing.mjs's own top-level CLI body
 * is gated behind `isDirectInvocation(import.meta.url)`, exactly like its
 * sibling `guard-dispatch-budget.mjs` (which `guard-dispatch-budget.test.mjs`
 * already imports the same way). A handful of cases that specifically
 * exercise ENTRYPOINT behaviour (malformed stdin, the real end-to-end stdout
 * bytes, a real ledger file on a real git repo) go through `spawnSync`
 * instead, per this dispatch's briefing: "prefer a subprocess probe for
 * anything that exercises entrypoint behaviour."
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DISPATCH_TOOL_NAMES,
  LEDGER_EVENT_DISPATCH,
  LEDGER_EVENT_FANOUT,
  LEDGER_EVENT_TODO_PLAN,
  NUDGE_CHANNEL,
  SLICING_THRESHOLD,
  canonicalize,
  classifyGroup,
  computeBatchHash,
  computeTrailingSingleRun,
  evaluateSlicingGuard,
  excludeInFlightGroup,
  groupDispatchMessages,
  ledgerPath,
  readLedgerRecords,
  readTranscriptRows,
  sha256Hex,
} from "./guard-slicing.mjs";

const GUARD = fileURLToPath(new URL("./guard-slicing.mjs", import.meta.url));

const ORCH_TRANSCRIPT = "/fake/session/top.jsonl";
const SUBAGENT_TRANSCRIPT = "/fake/session/subagents/agent-abc.jsonl";
const SUBAGENT_META = "/fake/session/subagents/agent-abc.meta.json";
const COMMON_DIR = "/fake/.git";

/** An in-memory fs double -- no real disk I/O. Mirrors guard-dispatch-budget.test.mjs's makeStore(). */
function makeStore(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    existsSyncFn: (p) => files.has(p),
    readFileSyncFn: (p) => {
      if (!files.has(p)) { const err = new Error(`ENOENT ${p}`); err.code = "ENOENT"; throw err; }
      return files.get(p);
    },
    mkdirSyncFn: () => {},
    appendFileSyncFn: (p, content) => { files.set(p, (files.get(p) ?? "") + content); },
  };
}

function baseOptions(store, overrides = {}) {
  return {
    rootDir: "/fake/root",
    resolveGitCommonDirFn: () => COMMON_DIR,
    nowFn: () => "2026-09-06T00:00:00.000Z",
    ...store,
    ...overrides,
  };
}

/** One transcript row carrying a single dispatch tool_use block for the given message id. */
function dispatchRow(msgId, toolName, input = { agentType: "goldfish-implementor" }) {
  return { message: { id: msgId, content: [{ type: "tool_use", name: toolName, id: `tu-${msgId}`, input }] }, timestamp: "t" };
}

/** One transcript row carrying TWO dispatch tool_use blocks under the same message id (a fan-out). */
function fanoutRow(msgId, entries) {
  return {
    message: {
      id: msgId,
      content: entries.map(([toolName, input], i) => ({ type: "tool_use", name: toolName, id: `tu-${msgId}-${i}`, input })),
    },
    timestamp: "t",
  };
}

function transcriptText(rows) {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

// --- Orchestrator vs. subagent targeting --------------------------------

test("GS1: a subagent identity (transcript under subagents/, valid meta) produces no output", () => {
  const store = makeStore({
    [SUBAGENT_META]: JSON.stringify({ agentType: "pipeline-core:goldfish-deep", description: "x", toolUseId: "t1", spawnDepth: 1 }),
  });
  const result = evaluateSlicingGuard(
    { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Task", tool_input: { subagent_type: "x", prompt: "y" } },
    baseOptions(store),
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "");
});

test("GS2: an unresolved identity (subagents/ dir, missing meta.json) produces no output, never crashes", () => {
  const store = makeStore({});
  const result = evaluateSlicingGuard(
    { transcript_path: SUBAGENT_TRANSCRIPT, tool_name: "Task", tool_input: {} },
    baseOptions(store),
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "");
});

test("GS3: an orchestrator identity on a tool this hook has no opinion on (Read) produces no output", () => {
  const store = makeStore({});
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, tool_name: "Read", tool_input: { file_path: "x" } },
    baseOptions(store),
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "");
});

// --- Trigger A: consecutive single-dispatch runs -------------------------

test("GS4: two completed single-dispatch turns in history is NOT enough -- no nudge yet", () => {
  const rows = [dispatchRow("m1", "Task"), dispatchRow("m2", "Task")];
  const store = makeStore({ [ORCH_TRANSCRIPT]: transcriptText(rows) });
  const current = { subagent_type: "pipeline-core:goldfish-mechanic", prompt: "third one" };
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s1", tool_name: "Task", tool_input: current },
    baseOptions(store),
  );
  assert.equal(result.stdout, "", "two singles must not fire the nudge");
});

test("GS5: three completed single-dispatch turns fires the nudge on the NEXT dispatch call", () => {
  const rows = [dispatchRow("m1", "Task"), dispatchRow("m2", "Task"), dispatchRow("m3", "Task")];
  const store = makeStore({ [ORCH_TRANSCRIPT]: transcriptText(rows) });
  const current = { subagent_type: "pipeline-core:goldfish-mechanic", prompt: "fourth one" };
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s1", tool_name: "Task", tool_input: current },
    baseOptions(store),
  );
  assert.notEqual(result.stdout, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "allow");
  assert.match(parsed.hookSpecificOutput.additionalContext, /3 consecutive/);
});

test("GS5b: SLICING_THRESHOLD is the single source of the count used by trigger A", () => {
  assert.equal(SLICING_THRESHOLD, 3);
});

// --- In-flight-turn exclusion (the correctness crux) ---------------------

test("GS6a: in-flight turn already written to the transcript is excluded by identity, not counted as a 4th single", () => {
  // History has 3 real completed singles (m1..m3), PLUS the in-flight call itself already
  // recorded as its own message m4 (one write-timing possibility). Excluding m4 by identity
  // must leave exactly the 3 completed singles -> still fires (not 4, not 0).
  const current = { subagent_type: "pipeline-core:goldfish-implementor", prompt: "in-flight" };
  const rows = [
    dispatchRow("m1", "Task"), dispatchRow("m2", "Task"), dispatchRow("m3", "Task"),
    dispatchRow("m4", "Task", current),
  ];
  const store = makeStore({ [ORCH_TRANSCRIPT]: transcriptText(rows) });
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s2", tool_name: "Task", tool_input: current },
    baseOptions(store),
  );
  assert.notEqual(result.stdout, "", "the in-flight message must be dropped, not counted, leaving exactly 3");
});

test("GS6b: in-flight turn NOT yet written to the transcript (the other write-timing possibility) still fires correctly", () => {
  const current = { subagent_type: "pipeline-core:goldfish-implementor", prompt: "in-flight-not-yet-visible" };
  const rows = [dispatchRow("m1", "Task"), dispatchRow("m2", "Task"), dispatchRow("m3", "Task")];
  const store = makeStore({ [ORCH_TRANSCRIPT]: transcriptText(rows) });
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s3", tool_name: "Task", tool_input: current },
    baseOptions(store),
  );
  assert.notEqual(result.stdout, "", "both write-timing possibilities must produce the same verdict");
});

test("excludeInFlightGroup: only ever inspects the LAST group, never an earlier byte-identical one", () => {
  const current = { subagent_type: "x", prompt: "dup" };
  const groups = groupDispatchMessages([dispatchRow("m1", "Task", current), dispatchRow("m2", "Task")]);
  const { groups: after } = excludeInFlightGroup(groups, "Task", current);
  assert.equal(after.length, 2, "the earlier, non-latest group with identical content must not be dropped");
});

// --- Run resets on fan-out ------------------------------------------------

test("GS7: a message.id fan-out (>=2 Task/Agent blocks in one message) resets the run", () => {
  const rows = [
    dispatchRow("m1", "Task"), dispatchRow("m2", "Task"),
    fanoutRow("m3", [["Task", { a: 1 }], ["Agent", { b: 2 }]]),
    dispatchRow("m4", "Task"), dispatchRow("m5", "Task"),
  ];
  const store = makeStore({ [ORCH_TRANSCRIPT]: transcriptText(rows) });
  const current = { subagent_type: "x", prompt: "sixth" };
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s4", tool_name: "Task", tool_input: current },
    baseOptions(store),
  );
  assert.equal(result.stdout, "", "only 2 singles follow the fan-out (m4, m5) -- must not reach threshold 3");
});

test("classifyGroup: a two-Task message is 'reset', a one-Task message is 'single'", () => {
  const single = groupDispatchMessages([dispatchRow("a", "Task")])[0];
  const fanout = groupDispatchMessages([fanoutRow("b", [["Task", {}], ["Task", {}]])])[0];
  assert.equal(classifyGroup(single), "single");
  assert.equal(classifyGroup(fanout), "reset");
});

// --- Run resets on a Workflow call regardless of recovered count ----------

test("GS8: a Workflow call whose script recovers ZERO dispatches still resets the run (the DoD-pinned decision)", () => {
  // A script with ${...} interpolation is, by extractWorkflowDispatches()'s own design,
  // NOT statically resolvable -- it recovers 0 dispatches from this script. The reset must
  // fire anyway, because it is based on the tool NAME "Workflow" being present, never on the
  // recovered count.
  const dynamicScript = "agent({ agentType: `${dynamicRole}`, prompt: `${dynamicPrompt}` })";
  const rows = [
    dispatchRow("m1", "Task"), dispatchRow("m2", "Task"),
    dispatchRow("m3", "Workflow", { script: dynamicScript }),
  ];
  const store = makeStore({ [ORCH_TRANSCRIPT]: transcriptText(rows) });
  const current = { subagent_type: "x", prompt: "after-workflow" };
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s5", tool_name: "Task", tool_input: current },
    baseOptions(store),
  );
  assert.equal(result.stdout, "", "the two singles before the Workflow call must not survive its reset");
});

test("GS8b: the ledger's workflowRecoveredCount reflects extractWorkflowDispatches(), for observability only", () => {
  const script = "agent({ agentType: 'pipeline-core:goldfish-mechanic', prompt: `hello` })\n"
    + "agent({ agentType: 'pipeline-core:critic', prompt: `world` })";
  const store = makeStore({ [ORCH_TRANSCRIPT]: transcriptText([dispatchRow("m1", "Task")]) });
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s6", tool_name: "Workflow", tool_input: { script } },
    baseOptions(store),
  );
  const raw = store.files.get(ledgerPath(COMMON_DIR, "s6"));
  const record = JSON.parse(raw.trim().split("\n").pop());
  assert.equal(record.workflowRecoveredCount, 2);
  assert.equal(record.event, LEDGER_EVENT_FANOUT, "a Workflow call is itself recorded as fanout, not plain dispatch");
});

// --- Trigger B: TodoWrite >= threshold pending, rate-limited per batch ----

test("GS9: fewer than SLICING_THRESHOLD pending items does not fire", () => {
  const store = makeStore({});
  const result = evaluateSlicingGuard(
    {
      transcript_path: ORCH_TRANSCRIPT, session_id: "s7", tool_name: "TodoWrite",
      tool_input: { todos: [{ content: "a", status: "pending" }, { content: "b", status: "pending" }] },
    },
    baseOptions(store),
  );
  assert.equal(result.stdout, "");
});

test("GS10: >= SLICING_THRESHOLD pending items fires once, then is rate-limited by batch hash on repeat", () => {
  const store = makeStore({});
  const todos = [
    { content: "a", status: "pending" }, { content: "b", status: "pending" }, { content: "c", status: "pending" },
  ];
  const payload = { transcript_path: ORCH_TRANSCRIPT, session_id: "s8", tool_name: "TodoWrite", tool_input: { todos } };

  const first = evaluateSlicingGuard(payload, baseOptions(store));
  assert.notEqual(first.stdout, "", "first sighting of this batch must fire");
  const parsed = JSON.parse(first.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "allow");
  assert.match(parsed.hookSpecificOutput.additionalContext, /3 pending/);

  const second = evaluateSlicingGuard(payload, baseOptions(store));
  assert.equal(second.stdout, "", "the identical batch must never nudge twice");

  const raw = store.files.get(ledgerPath(COMMON_DIR, "s8"));
  const records = raw.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(records.length, 2);
  assert.equal(records[0].advisoryEmitted, true);
  assert.equal(records[1].advisoryEmitted, false);
  assert.equal(records[0].batchHash, records[1].batchHash);
});

test("GS11: a DIFFERENT pending set (different batch hash) fires again, independent of an earlier rate-limited one", () => {
  const store = makeStore({});
  const first = { content: "a", status: "pending" }, second = { content: "b", status: "pending" }, third = { content: "c", status: "pending" };
  evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s9", tool_name: "TodoWrite", tool_input: { todos: [first, second, third] } },
    baseOptions(store),
  );
  const differentBatch = { content: "d", status: "pending" };
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s9", tool_name: "TodoWrite", tool_input: { todos: [first, second, differentBatch] } },
    baseOptions(store),
  );
  assert.notEqual(result.stdout, "", "a genuinely different pending set is not the same batch");
});

test("computeBatchHash: order-insensitive over the pending set", () => {
  const a = [{ content: "x" }, { content: "y" }];
  const b = [{ content: "y" }, { content: "x" }];
  assert.equal(computeBatchHash(a), computeBatchHash(b));
});

// --- Exact stdout JSON shape ----------------------------------------------

test("the emitted stdout is EXACTLY {hookSpecificOutput:{hookEventName,permissionDecision,additionalContext}}", () => {
  const store = makeStore({});
  const todos = [{ content: "a", status: "pending" }, { content: "b", status: "pending" }, { content: "c", status: "pending" }];
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "sshape", tool_name: "TodoWrite", tool_input: { todos } },
    baseOptions(store),
  );
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(parsed), ["hookSpecificOutput"]);
  assert.deepEqual(
    Object.keys(parsed.hookSpecificOutput).sort(),
    ["additionalContext", "hookEventName", "permissionDecision"].sort(),
  );
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(typeof parsed.hookSpecificOutput.additionalContext, "string");
  assert.ok(parsed.hookSpecificOutput.additionalContext.length > 0);
});

// --- Ledger record shape ---------------------------------------------------

test("the ledger record carries every documented field, for a dispatch event", () => {
  const store = makeStore({ [ORCH_TRANSCRIPT]: transcriptText([]) });
  evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "sled", tool_name: "Task", tool_input: { subagent_type: "pipeline-core:goldfish-mechanic", prompt: "x" } },
    baseOptions(store),
  );
  const raw = store.files.get(ledgerPath(COMMON_DIR, "sled"));
  const record = JSON.parse(raw.trim());
  for (const key of [
    "schema", "ts", "sessionId", "event", "tool", "agentType", "fanout",
    "pendingCount", "batchHash", "advisoryEmitted", "channel", "workflowRecoveredCount",
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(record, key), `ledger record missing "${key}"`);
  }
  assert.equal(record.event, LEDGER_EVENT_DISPATCH);
  assert.equal(record.tool, "Task");
  assert.equal(record.sessionId, "sled");
  assert.equal(record.agentType, "pipeline-core:goldfish-mechanic");
});

test("readLedgerRecords: tolerates a corrupt line without losing the valid ones", () => {
  const store = makeStore({
    [ledgerPath(COMMON_DIR, "scorrupt")]: '{"a":1}\nnot json at all\n{"b":2}\n',
  });
  const records = readLedgerRecords(ledgerPath(COMMON_DIR, "scorrupt"), store);
  assert.deepEqual(records, [{ a: 1 }, { b: 2 }]);
});

// --- Fail-open on malformed input classes ----------------------------------

test("GS12: an unreadable transcript file fails open -- no crash, no nudge", () => {
  const store = makeStore({}); // ORCH_TRANSCRIPT deliberately absent -> ENOENT on read
  const rows = readTranscriptRows(ORCH_TRANSCRIPT, store);
  assert.equal(rows, null);
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s10", tool_name: "Task", tool_input: {} },
    baseOptions(store),
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "");
});

test("GS13: malformed JSON lines interleaved with valid ones do not crash the transcript reader", () => {
  const goodRow = dispatchRow("m1", "Task");
  const raw = `${JSON.stringify(goodRow)}\nnot valid json {{{\n\n${JSON.stringify(dispatchRow("m2", "Task"))}\n`;
  const store = makeStore({ [ORCH_TRANSCRIPT]: raw });
  const rows = readTranscriptRows(ORCH_TRANSCRIPT, store);
  assert.equal(rows.length, 2);
  const groups = groupDispatchMessages(rows);
  assert.equal(groups.length, 2);
});

test("GS14: a Task call with an undefined tool_input never throws (hash-failure fail-open)", () => {
  const store = makeStore({ [ORCH_TRANSCRIPT]: transcriptText([dispatchRow("m1", "Task")]) });
  assert.doesNotThrow(() => {
    evaluateSlicingGuard(
      { transcript_path: ORCH_TRANSCRIPT, session_id: "s11", tool_name: "Task", tool_input: undefined },
      baseOptions(store),
    );
  });
});

test("GS15: a TodoWrite call whose tool_input.todos is not an array never throws and counts zero pending", () => {
  const store = makeStore({});
  const result = evaluateSlicingGuard(
    { transcript_path: ORCH_TRANSCRIPT, session_id: "s12", tool_name: "TodoWrite", tool_input: { todos: "not-an-array" } },
    baseOptions(store),
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "");
});

test("GS16: a transcript row with malformed message.content (not an array) is skipped, not fatal", () => {
  const raw = `${JSON.stringify({ message: { id: "m1", content: "not-an-array" } })}\n${JSON.stringify(dispatchRow("m2", "Task"))}\n`;
  const store = makeStore({ [ORCH_TRANSCRIPT]: raw });
  const rows = readTranscriptRows(ORCH_TRANSCRIPT, store);
  const groups = groupDispatchMessages(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].msgId, "m2");
});

test("canonicalize/sha256Hex: key order does not change the hash (canonical, sorted-key semantics)", () => {
  assert.equal(sha256Hex({ a: 1, b: 2 }), sha256Hex({ b: 2, a: 1 }));
  assert.notEqual(canonicalize({ a: 1 }), canonicalize({ a: 2 }));
});

test("DISPATCH_TOOL_NAMES names exactly Task, Agent, Workflow -- no more, no fewer", () => {
  assert.deepEqual([...DISPATCH_TOOL_NAMES].sort(), ["Agent", "Task", "Workflow"]);
});

test("computeTrailingSingleRun: an empty group list is a run of zero, not a crash", () => {
  assert.equal(computeTrailingSingleRun([]), 0);
  assert.equal(computeTrailingSingleRun(undefined), 0);
});

// --- Entrypoint behaviour: subprocess only (per this dispatch's briefing) -

test("GS17 (subprocess): malformed JSON on stdin fails open -- exit 0, empty stdout, no crash", () => {
  const res = spawnSync(process.execPath, [GUARD], { input: "{ not json", encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.equal((res.stdout ?? "").trim(), "");
});

test("GS18 (subprocess): end-to-end real invocation -- exact stdout bytes and a real ledger file, real git, real fs", () => {
  const repo = mkdtempSync(join(tmpdir(), "guard-slicing-e2e-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repo });
    const payload = {
      transcript_path: join(repo, "session.jsonl"),
      session_id: "sess-e2e",
      tool_name: "TodoWrite",
      tool_input: {
        todos: [
          { content: "one", status: "pending", activeForm: "Doing one" },
          { content: "two", status: "pending", activeForm: "Doing two" },
          { content: "three", status: "pending", activeForm: "Doing three" },
        ],
      },
    };
    const res = spawnSync(process.execPath, [GUARD], {
      cwd: repo,
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
      input: JSON.stringify(payload),
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    const parsed = JSON.parse(res.stdout.trim());
    assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(parsed.hookSpecificOutput.permissionDecision, "allow");
    assert.match(parsed.hookSpecificOutput.additionalContext, /3 pending/);

    const ledger = join(repo, ".git", "agent-pipeline", "dispatch-slicing", "sess-e2e.jsonl");
    const record = JSON.parse(readFileSync(ledger, "utf8").trim());
    assert.equal(record.event, LEDGER_EVENT_TODO_PLAN);
    assert.equal(record.advisoryEmitted, true);
    assert.equal(record.pendingCount, 3);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
