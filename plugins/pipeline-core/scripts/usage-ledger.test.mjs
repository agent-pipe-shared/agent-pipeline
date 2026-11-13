#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Tests NVA-W4-02B: usage-ledger.mjs's turn-count / tool-call-count surfacing
// (per session/subagent, in --row mode), on top of its existing token
// aggregation. Fixture transcripts are hand-built JSONL, following the
// schema documented in usage-ledger.mjs's own doc comment.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(new URL("./usage-ledger.mjs", import.meta.url));
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_DIR = "myproject";
const SECRET_MARKER = "SECRET_CONTENT_MARKER_do_not_leak";

function jsonl(records) {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

// Builds a fixture transcripts root with one main-session file and one
// subagent-transcript file, both sharing SESSION_ID, designed to exercise:
//   - turn dedup by message.id (msg_1 repeated across two stream-update
//     records, must count as ONE turn)
//   - tool_use dedup by block id, found ONLY on the second stream-update
//     record of msg_1 (proves tool-call counting scans every raw record, not
//     only the deduped-last one)
//   - an idless record (no message.id) counted as its own turn
//   - a subagent transcript counted under its own "subagent:<basename>" actor
function buildFixture() {
  const root = mkdtempSync(join(tmpdir(), "usage-ledger-test-"));
  const projectDir = join(root, PROJECT_DIR);
  mkdirSync(projectDir, { recursive: true });

  const mainRecords = [
    // msg_1, first stream-update: text only, no tool_use yet.
    {
      type: "assistant",
      sessionId: SESSION_ID,
      timestamp: "2026-08-19T10:00:00.000Z",
      message: {
        id: "msg_1",
        model: "claude-sonnet-5",
        usage: { input_tokens: 10, output_tokens: 5 },
        content: [{ type: "text", text: `hello ${SECRET_MARKER}` }],
      },
    },
    // msg_1, second stream-update: SAME message.id (byte-identical usage per
    // the file's own proven-duplication fact), but this is where tool_use
    // toolu_1 first appears -- must still be counted.
    {
      type: "assistant",
      sessionId: SESSION_ID,
      timestamp: "2026-08-19T10:00:01.000Z",
      message: {
        id: "msg_1",
        model: "claude-sonnet-5",
        usage: { input_tokens: 10, output_tokens: 5 },
        content: [
          { type: "text", text: `hello ${SECRET_MARKER}` },
          { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: SECRET_MARKER } },
        ],
      },
    },
    // msg_2: a second, distinct turn with its own tool call.
    {
      type: "assistant",
      sessionId: SESSION_ID,
      timestamp: "2026-08-19T10:00:02.000Z",
      message: {
        id: "msg_2",
        model: "claude-sonnet-5",
        usage: { input_tokens: 20, output_tokens: 8 },
        content: [{ type: "tool_use", id: "toolu_2", name: "Read", input: { file_path: SECRET_MARKER } }],
      },
    },
    // Idless record: no message.id at all -- must count as its own turn
    // (declared fallback, same convention as the token half).
    {
      type: "assistant",
      sessionId: SESSION_ID,
      timestamp: "2026-08-19T10:00:03.000Z",
      message: {
        model: "claude-sonnet-5",
        usage: { input_tokens: 3, output_tokens: 1 },
        content: [{ type: "tool_use", id: "toolu_3", name: "Grep", input: {} }],
      },
    },
  ];
  writeFileSync(join(projectDir, `${SESSION_ID}.jsonl`), jsonl(mainRecords));

  const subagentDir = join(projectDir, SESSION_ID, "subagents");
  mkdirSync(subagentDir, { recursive: true });
  const subagentRecords = [
    {
      type: "assistant",
      sessionId: SESSION_ID,
      timestamp: "2026-08-19T10:00:04.000Z",
      message: {
        id: "sub_msg_1",
        model: "claude-sonnet-5",
        usage: { input_tokens: 7, output_tokens: 2 },
        content: [{ type: "tool_use", id: "toolu_sub_1", name: "Grep", input: {} }],
      },
    },
  ];
  writeFileSync(join(subagentDir, "agent-abc123.jsonl"), jsonl(subagentRecords));

  return root;
}

function listAllFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out.sort();
}

function run(args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8" });
  return result;
}

test("usage-ledger --row surfaces turn count and tool-call count per session/subagent actor", () => {
  const root = buildFixture();
  const before = listAllFiles(root);
  try {
    const result = run([root, "--session", SESSION_ID, "--row", "Test Row"]);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const out = result.stdout;

    // The new activity section exists and is per (model, actor).
    assert.match(out, /Turns \/ tool calls per `\/usage` \(collected, script\):/);
    assert.match(out, /- claude-sonnet-5 \/ main: 3 turn\(s\) \/ 3 tool call\(s\)/);
    assert.match(out, /- claude-sonnet-5 \/ subagent:agent-abc123: 1 turn\(s\) \/ 1 tool call\(s\)/);
    assert.match(out, /TOTAL: 4 turn\(s\) \/ 4 tool call\(s\)/);

    // Turn dedup: msg_1's two stream-update records collapse into ONE turn,
    // not two -- proven by the "3 turn(s)" assertion above (msg_1 + msg_2 +
    // 1 idless record = 3, not 4).

    // Tool-call dedup-by-scan: toolu_1 only appears on msg_1's SECOND
    // stream-update record, yet is still counted -- proven by "3 tool
    // call(s)" for main (toolu_1, toolu_2, toolu_3), not fewer.

    // No-content/no-export discipline: nothing written to disk...
    const after = listAllFiles(root);
    assert.deepEqual(after, before, "usage-ledger.mjs must never write/export anything under the transcripts root");
    // ...and no transcript content (text or tool input) leaks into the row output.
    assert.doesNotMatch(out, new RegExp(SECRET_MARKER), "row output must never leak transcript content");
    // ...and no absolute filesystem path leaks into the row output (path-free discipline).
    assert.doesNotMatch(out, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "row output must never leak an absolute path");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("usage-ledger default full-table mode is unaffected: no turn/tool-call columns, no activity section", () => {
  const root = buildFixture();
  try {
    const result = run([root]);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const out = result.stdout;

    // Existing table format/columns are byte-for-byte unchanged (module doc:
    // "only the CLI/flag/format contract still holds byte-for-byte").
    assert.match(out, /\| Project \| Session \| Model \| Msgs \| Input \| Output \| Cache-Create \| Cache-Read \| Total \| First seen \|/);
    assert.doesNotMatch(out, /Turns \/ tool calls/, "the default table must not gain the new activity section");

    // Same no-leak discipline in the default mode.
    assert.doesNotMatch(out, new RegExp(SECRET_MARKER), "table output must never leak transcript content");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("usage-ledger --row omits the activity section when the session filter matches nothing", () => {
  const root = buildFixture();
  try {
    const result = run([root, "--session", "22222222-2222-4222-8222-222222222222", "--row", "Empty"]);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    assert.match(result.stdout, /no records found for the selected session\/filter/);
    assert.doesNotMatch(result.stdout, /Turns \/ tool calls/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function meteringBundle(runner, taskId = "same-task") {
  const source = runner === "codex"
    ? { kind: "codex-turn-completed-usage", version: "codex-exec-json.v1", eventSha256: "a".repeat(64), threadId: "sanitized-thread", turnId: "sanitized-turn" }
    : { kind: "antigravity-exec-json", version: "antigravity-exec-json.v1", eventSha256: "b".repeat(64), threadId: "sanitized-thread", turnId: "sanitized-turn" };
  const raw = runner === "codex"
    ? { input_tokens: 4, output_tokens: 2, cached_input_tokens: 1, reasoning_output_tokens: 1 }
    : { input_tokens: 4, output_tokens: 2, cached_tokens: 1 };
  const unavailable = { status: "unavailable", reasonCode: "runner-does-not-emit" };
  const omitted = { status: "unknown", reasonCode: "source-omitted" };
  const common = {
    inputTokens: { status: "observed", value: 4, sourceField: "input_tokens", comparison: "same-runner-only" },
    outputTokens: { status: "observed", value: 2, sourceField: "output_tokens", comparison: "same-runner-only" },
    cachedInputTokens: { status: "observed", value: 1, sourceField: runner === "codex" ? "cached_input_tokens" : "cached_tokens", comparison: "same-runner-only" },
    cacheCreationInputTokens: unavailable,
    cacheReadInputTokens: unavailable,
    reasoningOutputTokens: runner === "codex" ? { status: "observed", value: 1, sourceField: "reasoning_output_tokens", comparison: "same-runner-only" } : omitted,
    billedCost: { status: "unknown", reasonCode: "scope-unbound" },
    estimatedCost: { status: "unknown", reasonCode: "scope-unbound" },
  };
  const envelope = {
    schema: "pipeline.runner-usage.v1", runner, source,
    scope: { kind: "turn", dispatchId: "sanitized-dispatch" },
    route: { status: "unbound", effective: { status: "unknown", reasonCode: "receipt-missing" } }, raw, common,
  };
  return {
    schema: "pipeline.usage-attribution-bundle.v1", runner, taskId,
    taskEvidenceSha256: "f".repeat(64), scopeKind: "turn",
    events: [{ envelope, attribution: { eventSha256: source.eventSha256, class: "administration", provenance: { kind: "sanitized-control-evidence", evidenceSha256: "e".repeat(64) } } }],
  };
}

test("usage-ledger --metering reads only selected sanitized bundles and reports insufficient one-runner coverage", () => {
  const root = mkdtempSync(join(tmpdir(), "usage-ledger-metering-"));
  const bundlePath = join(root, "bundle.json");
  writeFileSync(bundlePath, JSON.stringify(meteringBundle("codex")));
  try {
    const result = run(["--metering", bundlePath]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.comparison.status, "insufficient-runner-coverage");
    assert.equal(output.comparison.runnerCoverage, 1);
    assert.equal(output.runners[0].toolCalls.status, "unavailable");
    assert.doesNotMatch(result.stdout, /sanitized-thread|sanitized-dispatch|SECRET_CONTENT_MARKER/);
    assert.doesNotMatch(result.stdout, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("usage-ledger --metering accepts matching two-runner bundles and rejects a task mismatch", () => {
  const root = mkdtempSync(join(tmpdir(), "usage-ledger-metering-"));
  const codexPath = join(root, "codex.json");
  const antigravityPath = join(root, "antigravity.json");
  writeFileSync(codexPath, JSON.stringify(meteringBundle("codex")));
  writeFileSync(antigravityPath, JSON.stringify(meteringBundle("antigravity")));
  try {
    const matching = run(["--metering", codexPath, antigravityPath]);
    assert.equal(matching.status, 0, matching.stderr);
    assert.equal(JSON.parse(matching.stdout).comparison.runnerCoverage, 2);
    writeFileSync(antigravityPath, JSON.stringify(meteringBundle("antigravity", "different-task")));
    const mismatched = run(["--metering", codexPath, antigravityPath]);
    assert.notEqual(mismatched.status, 0);
    assert.match(mismatched.stderr, /comparison-task-mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("usage-ledger --metering rejects nonregular, oversized, and excess selected inputs before parsing", () => {
  const root = mkdtempSync(join(tmpdir(), "usage-ledger-metering-"));
  const oversized = join(root, "oversized.json");
  writeFileSync(oversized, "x".repeat(1_000_001));
  try {
    const directory = run(["--metering", root]);
    assert.notEqual(directory.status, 0);
    assert.match(directory.stderr, /usage-attribution-input-invalid/);
    const tooLarge = run(["--metering", oversized]);
    assert.notEqual(tooLarge.status, 0);
    assert.match(tooLarge.stderr, /usage-attribution-input-invalid/);
    const excess = run(["--metering", ...Array.from({ length: 17 }, (_, index) => join(root, `missing-${index}.json`))]);
    assert.notEqual(excess.status, 0);
    assert.match(excess.stderr, /bounded list of sanitized bundle files/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- C28-FORENSICS-TIMELINE (AC-108): `--timeline <file>` prints one session's run timeline for all three runner formats. ---
// Fixtures are small fakes written here; no real transcript is opened.
function timelineFile(records, relative = "session.jsonl") {
  const dir = mkdtempSync(join(tmpdir(), "usage-ledger-timeline-"));
  const file = join(dir, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, jsonl(records));
  return { dir, file };
}

const HUMAN_TEXT = `please do ${SECRET_MARKER}`;
const claudeUser = (timestamp, content, extra = {}) => ({ type: "user", sessionId: SESSION_ID, timestamp, message: { role: "user", content }, ...extra });
const claudeAssistant = (timestamp, id, usage, content = [{ type: "text", text: SECRET_MARKER }]) => ({
  type: "assistant", sessionId: SESSION_ID, timestamp, message: { id, model: "claude-sonnet-5", usage, content },
});

function claudeTimelineRecords() {
  return [
    claudeUser("2026-08-19T10:00:00.000Z", HUMAN_TEXT),
    claudeUser("2026-08-19T10:00:01.000Z", "meta text", { isMeta: true }),
    claudeAssistant("2026-08-19T10:00:10.000Z", "msg_1", { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 }),
    claudeAssistant("2026-08-19T10:00:11.000Z", "msg_1", { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 }),
    claudeUser("2026-08-19T10:00:13.000Z", [{ type: "tool_result", tool_use_id: "toolu_1", is_error: true, content: `PreToolUse hook error: BLOCKED GUARD-READ-SCOPE-OUTSIDE-ROOT ${SECRET_MARKER}` }]),
    claudeUser("2026-08-19T10:00:14.000Z", [{ type: "tool_result", tool_use_id: "toolu_2", content: "a loaded document naming OTHER-LOADED-CODE only" }]),
    claudeAssistant("2026-08-19T10:00:20.000Z", "msg_2", { input_tokens: 20, output_tokens: 8 }),
    claudeUser("2026-08-19T10:01:20.000Z", [{ type: "text", text: "second human" }]),
    claudeAssistant("2026-08-19T10:01:30.000Z", "msg_3", { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }),
  ];
}

test("usage-ledger --timeline (claude) prints human turns, net run time, usage with actor and coded refusals, without content", () => {
  const { dir, file } = timelineFile(claudeTimelineRecords());
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    const out = result.stdout;
    assert.match(out, /Run timeline \(claude\)/);
    assert.match(out, new RegExp(`- turn 1 \\| 2026-08-19T10:00:00.000Z \\| ${HUMAN_TEXT.length} chars \\| duration 20.0 s \\| human wait after 60.0 s`));
    assert.match(out, /- turn 2 \| 2026-08-19T10:01:20.000Z \| 12 chars \| duration 10.0 s \| human wait after none/);
    assert.match(out, /- 2026-08-19T10:00:20.000Z \| main \| claude-sonnet-5 \| input 20 \| output 8 \| cache-write n\/a \| cache-read n\/a/);
    assert.equal((out.match(/\| main \| claude-sonnet-5 \|/g) ?? []).length, 3, "msg_1 repeated twice is ONE response");
    assert.match(out, /- GUARD-READ-SCOPE-OUTSIDE-ROOT: 1/);
    assert.doesNotMatch(out, /OTHER-LOADED-CODE/, "a code in a non-error tool result is not a refusal");
    assert.match(out, /TOTAL: run time gross 90.0 s \| human wait 60.0 s \| run time net 30.0 s \| refusals 1 \| human turns 2/);
    assert.doesNotMatch(out, new RegExp(SECRET_MARKER), "no transcript content");
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "no absolute path");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("usage-ledger --timeline --json emits pipeline.usage-timeline.v1 with the same figures", () => {
  const { dir, file } = timelineFile(claudeTimelineRecords());
  try {
    const result = run(["--timeline", file, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.schema, "pipeline.usage-timeline.v1");
    assert.equal(data.runner, "claude");
    assert.deepEqual(data.totals, { grossMs: 90000, humanWaitMs: 60000, netMs: 30000, refusals: 1, humanTurns: 2 });
    assert.deepEqual(data.refusals, { "GUARD-READ-SCOPE-OUTSIDE-ROOT": 1 });
    assert.equal(data.humanTurns.length, 2);
    assert.equal(data.humanTurns[0].chars, HUMAN_TEXT.length);
    assert.equal(data.humanTurns[0].durationMs, 20000);
    assert.equal(data.responses.length, 3);
    assert.equal(data.responses[0].actor, "main");
    assert.equal(data.responses[0].usage.cacheReadTokens, 3);
    assert.doesNotMatch(result.stdout, new RegExp(SECRET_MARKER));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Measured on a real Claude run (candidate 28): a compact summary and a task notification are user rows, and a human
// can write twice before any answer; none of the first two is a human turn, and the double message must not void the wait total.
test("usage-ledger --timeline (claude) skips compact summaries and system notifications and keeps the wait total over a queued message", () => {
  const { dir, file } = timelineFile([
    claudeUser("2026-08-19T10:00:00.000Z", "first human"),
    claudeAssistant("2026-08-19T10:00:10.000Z", "msg_a", { input_tokens: 1, output_tokens: 1 }),
    claudeUser("2026-08-19T10:00:20.000Z", "summary of the earlier context", { isCompactSummary: true, isVisibleInTranscriptOnly: true }),
    claudeAssistant("2026-08-19T10:00:30.000Z", "msg_b", { input_tokens: 1, output_tokens: 1 }),
    claudeUser("2026-08-19T10:00:40.000Z", "<task-notification>done</task-notification>", { origin: { kind: "task-notification" }, promptSource: "system" }),
    claudeAssistant("2026-08-19T10:00:50.000Z", "msg_c", { input_tokens: 1, output_tokens: 1 }),
    claudeUser("2026-08-19T10:01:50.000Z", "oh stop", { origin: { kind: "human" } }),
    claudeUser("2026-08-19T10:01:51.000Z", "do this instead", { origin: { kind: "human" } }),
    claudeAssistant("2026-08-19T10:02:01.000Z", "msg_d", { input_tokens: 1, output_tokens: 1 }),
  ]);
  try {
    const result = run(["--timeline", file, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.humanTurns.length, 3, "the compact summary and the task notification are not human turns");
    assert.equal(data.humanTurns[0].durationMs, 50000, "the first turn runs through the system rows to its last answer");
    assert.equal(data.humanTurns[1].humanWaitAfterMs, 0, "a message written before any answer leaves no wait");
    assert.deepEqual(data.totals, { grossMs: 121000, humanWaitMs: 60000, netMs: 61000, refusals: 0, humanTurns: 3 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("usage-ledger --timeline names a subagent transcript's actor from its location", () => {
  const { dir, file } = timelineFile(
    [claudeAssistant("2026-08-19T10:00:04.000Z", "sub_1", { input_tokens: 7, output_tokens: 2 })],
    join(SESSION_ID, "subagents", "agent-abc123.jsonl"),
  );
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\| subagent:agent-abc123 \| claude-sonnet-5 \|/);
    assert.match(result.stdout, /human turns n\/a|human turns 0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Measured on a real Codex rollout (candidate 28): the human's input is a response_item user message with provenance "user" and
// there is no user_message event; harness inserts (AGENTS.md, hook context) are user messages with another provenance.
test("usage-ledger --timeline (codex rollout) counts provenance-user messages as human turns and skips harness inserts", () => {
  const rec = (timestamp, type, payload) => ({ timestamp, type, payload });
  const userItem = (text, provenance) => ({ type: "message", role: "user", content: [{ type: "input_text", text }],
    internal_chat_message_metadata_passthrough: { content_item_metadata: [{ provenance: { type: provenance } }] } });
  const { dir, file } = timelineFile([
    rec("2026-08-19T10:00:00.000Z", "session_meta", { id: "thread-1" }),
    rec("2026-08-19T10:00:00.500Z", "response_item", userItem("# AGENTS.md instructions", "harness")),
    rec("2026-08-19T10:00:01.000Z", "response_item", userItem("start", "user")),
    rec("2026-08-19T10:00:05.000Z", "response_item", { type: "message", role: "assistant", content: [] }),
    rec("2026-08-19T10:00:25.000Z", "response_item", userItem("go on", "user")),
    rec("2026-08-19T10:00:30.000Z", "response_item", { type: "message", role: "assistant", content: [] }),
  ]);
  try {
    const result = run(["--timeline", file, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.humanTurns.length, 2, "the harness insert is not a human turn");
    assert.equal(data.humanTurns[0].chars, 5);
    assert.deepEqual(data.totals, { grossMs: 30000, humanWaitMs: 20000, netMs: 10000, refusals: 0, humanTurns: 2 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("usage-ledger --timeline (codex rollout) reads user_message, token_count and coded tool output", () => {
  const rec = (timestamp, type, payload) => ({ timestamp, type, payload });
  const { dir, file } = timelineFile([
    rec("2026-08-19T10:00:00.000Z", "session_meta", { id: "thread-1", cwd: "/somewhere" }),
    rec("2026-08-19T10:00:01.000Z", "event_msg", { type: "user_message", message: HUMAN_TEXT }),
    rec("2026-08-19T10:00:05.000Z", "response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: SECRET_MARKER }] }),
    rec("2026-08-19T10:00:05.500Z", "event_msg", { type: "token_count", info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 9, reasoning_output_tokens: 4, total_tokens: 109 }, total_token_usage: { total_tokens: 109 } } }),
    // QG-04 restated in place: the denial now has the shape a real Codex rollout records (measured candidate 28), not an invented one;
    // a success output carrying a code and the word "blocked" in prose must not count.
    rec("2026-08-19T10:00:06.000Z", "response_item", { type: "function_call_output", call_id: "c1", output: `Script error:\nCommand blocked by PreToolUse hook: BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-GRAMMAR-REDIRECT-REFUSED: ${SECRET_MARKER}` }),
    rec("2026-08-19T10:00:07.000Z", "response_item", { type: "function_call_output", call_id: "c2", output: "a file that mentions DOC-ONLY-CODE" }),
    rec("2026-08-19T10:00:07.500Z", "response_item", { type: "custom_tool_call_output", call_id: "c3", output: "{\"exit_code\":0,\"output\":\"{\\n \\\"status\\\": \\\"committed\\\",\\n \\\"code\\\": \\\"GHCR-COMMITTED\\\", \\\"note\\\": \\\"nothing blocked\\\"\"}" }),
    rec("2026-08-19T10:00:09.000Z", "event_msg", { type: "task_complete" }),
    rec("2026-08-19T10:00:39.000Z", "event_msg", { type: "user_message", message: "again" }),
    rec("2026-08-19T10:00:42.000Z", "response_item", { type: "message", role: "assistant", content: [] }),
  ]);
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    const out = result.stdout;
    assert.match(out, /Run timeline \(codex\)/);
    assert.match(out, new RegExp(`- turn 1 \\| 2026-08-19T10:00:01.000Z \\| ${HUMAN_TEXT.length} chars \\| duration 8.0 s \\| human wait after 30.0 s`));
    assert.match(out, /\| main \| n\/a \| input 100 \| output 9 \| cache-write n\/a \| cache-read 40/);
    assert.match(out, /- GUARD-GRAMMAR-REDIRECT-REFUSED: 1/);
    assert.doesNotMatch(out, /DOC-ONLY-CODE/);
    assert.doesNotMatch(out, /GHCR-COMMITTED/, "a success code is not a refusal");
    assert.match(out, /TOTAL: run time gross 42.0 s \| human wait 30.0 s \| run time net 12.0 s \| refusals 1 \| human turns 2/);
    assert.doesNotMatch(out, new RegExp(`${SECRET_MARKER}|/somewhere`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("usage-ledger --timeline (antigravity transcript) prints n/a for what the format does not carry", () => {
  const { dir, file } = timelineFile([
    { type: "turn.started", timestamp: "2026-08-19T10:00:00.000Z" },
    { type: "turn.completed", timestamp: "2026-08-19T10:00:30.000Z", usage: { input_tokens: 50, output_tokens: 6, cached_tokens: 20 } },
  ]);
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Run timeline \(antigravity\)/);
    assert.match(result.stdout, /\| main \| n\/a \| input 50 \| output 6 \| cache-write n\/a \| cache-read 20/);
    assert.match(result.stdout, /TOTAL: run time gross 30.0 s \| human wait n\/a \| run time net n\/a \| refusals n\/a \| human turns n\/a/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Candidate 29 (AGY run 3, R3): the record family a real Antigravity brain transcript carries (shape measured on a run).
test("usage-ledger --timeline (antigravity brain transcript) reads human turns, per-step tokens and hook refusals", () => {
  const step = (index, at, type, extra) => ({ step_index: index, source: "MODEL", type, status: "DONE", created_at: at, ...extra });
  const { dir, file } = timelineFile([
    { step_index: 0, source: "USER_EXPLICIT", type: "USER_INPUT", status: "DONE", created_at: "2026-08-19T10:00:00Z", content: HUMAN_TEXT },
    step(1, "2026-08-19T10:00:02Z", "PLANNER_RESPONSE", { input_tokens: 120, cache_read_tokens: 30, output_tokens: 7, tool_calls: [] }),
    step(2, "2026-08-19T10:00:04Z", "GENERIC", { status: "ERROR", content: "x", error: `BLOCKED (Antigravity native child): AGY-NATIVE-BRAIN-WRITE: ${SECRET_MARKER}` }),
    step(3, "2026-08-19T10:00:05Z", "GENERIC", { content: "ok GHCR-COMMITTED" }),
    { step_index: 4, source: "SYSTEM", type: "SYSTEM_MESSAGE", status: "DONE", created_at: "2026-08-19T10:00:06Z", content: "system note" },
    step(5, "2026-08-19T10:00:10Z", "PLANNER_RESPONSE", { input_tokens: 200, cache_read_tokens: 150, output_tokens: 9, content: "done" }),
    { step_index: 6, source: "USER_EXPLICIT", type: "USER_INPUT", status: "DONE", created_at: "2026-08-19T10:00:40Z", content: "again" },
    step(7, "2026-08-19T10:00:42Z", "PLANNER_RESPONSE", { input_tokens: 210, cache_read_tokens: 200, output_tokens: 3 }),
  ]);
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    const out = result.stdout;
    assert.match(out, /Run timeline \(antigravity\)/);
    assert.match(out, new RegExp(`- turn 1 \\| 2026-08-19T10:00:00.000Z \\| ${HUMAN_TEXT.length} chars \\| duration 10.0 s \\| human wait after 30.0 s`));
    assert.match(out, /\| main \| n\/a \| input 120 \| output 7 \| cache-write n\/a \| cache-read 30/);
    assert.match(out, /- AGY-NATIVE-BRAIN-WRITE: 1/);
    assert.doesNotMatch(out, /GHCR-COMMITTED/, "a success code is not a refusal");
    assert.match(out, /TOTAL: run time gross 42.0 s \| human wait 30.0 s \| run time net 12.0 s \| refusals 1 \| human turns 2/);
    assert.doesNotMatch(out, new RegExp(`${SECRET_MARKER}|system note`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("usage-ledger --timeline is exclusive with --row and --metering and refuses unreadable or unknown input without a path", () => {
  const { dir, file } = timelineFile([{ type: "something-else", note: "x" }]);
  try {
    const row = run(["--timeline", file, "--row"]);
    assert.notEqual(row.status, 0);
    assert.match(row.stderr, /--timeline is exclusive/);
    const metering = run(["--timeline", file, "--metering", file]);
    assert.notEqual(metering.status, 0);
    assert.match(metering.stderr, /--timeline is exclusive/);
    const unknown = run(["--timeline", file]);
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /timeline-format-unknown/);
    const missing = run(["--timeline", join(dir, "absent.jsonl")]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /timeline-input-unreadable/);
    const bare = run(["--timeline"]);
    assert.notEqual(bare.status, 0);
    for (const result of [row, metering, unknown, missing]) assert.doesNotMatch(result.stderr, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
