#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Tests NVA-W4-02B: usage-ledger.mjs's turn-count / tool-call-count surfacing
// (per session/subagent, in --row mode), on top of its existing token
// aggregation. Fixture transcripts are hand-built JSONL, following the
// schema documented in usage-ledger.mjs's own doc comment.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readProjectRouting } from "../lib/runner-profiles-v3.mjs";

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

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8", ...options });
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
    assert.deepEqual(data.totals, { grossMs: 90000, humanWaitMs: 60000, signatureWaitMs: 0, netMs: 30000, refusals: 1, humanTurns: 2 });
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
    assert.deepEqual(data.totals, { grossMs: 121000, humanWaitMs: 60000, signatureWaitMs: 0, netMs: 61000, refusals: 0, humanTurns: 3 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// C29 (Codex run 3, C9): the agent waited on a human signature inside its own turn; proof-wait labels that time po-wait, and the
// timeline counts it as human wait (and names it) instead of active run time. A timeout result (is_error) and a present result both count.
test("C29-C9 usage-ledger --timeline counts a proof-wait result's waited time as human wait, not as run time", () => {
  const wait = (seconds, status) => JSON.stringify({ schema: "pipeline.signed-proof-wait.v1", status, proofPath: "scratch/p.json", waitedSeconds: seconds, waitClass: "po-wait" });
  const { dir, file } = timelineFile([
    claudeUser("2026-08-19T10:00:00.000Z", "push please"),
    claudeAssistant("2026-08-19T10:00:05.000Z", "msg_a", { input_tokens: 1, output_tokens: 1 }),
    claudeUser("2026-08-19T10:09:35.000Z", [{ type: "tool_result", tool_use_id: "toolu_w1", is_error: true, content: `Exit code 2\n${wait(570, "refused")}` }]),
    claudeUser("2026-08-19T10:09:45.000Z", [{ type: "tool_result", tool_use_id: "toolu_w2", content: wait(10, "proof-present") }]),
    claudeUser("2026-08-19T10:09:46.000Z", [{ type: "tool_result", tool_use_id: "toolu_x", content: "a document quoting pipeline.signed-proof-wait.v1 in prose" }]),
    claudeAssistant("2026-08-19T10:10:00.000Z", "msg_b", { input_tokens: 1, output_tokens: 1 }),
  ]);
  try {
    const result = run(["--timeline", file, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.deepEqual(data.totals, { grossMs: 600000, humanWaitMs: 580000, signatureWaitMs: 580000, netMs: 20000, refusals: 0, humanTurns: 1 });
    const text = run(["--timeline", file]);
    assert.match(text.stdout, /human wait 580\.0 s \(of it signature wait 580\.0 s\) \| run time net 20\.0 s/u);
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
    assert.deepEqual(data.totals, { grossMs: 30000, humanWaitMs: 20000, signatureWaitMs: 0, netMs: 10000, refusals: 0, humanTurns: 2 });
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

// --- C31-B5 (AC-112, lane L17): `--row <label> --antigravity-transcript <file>` prints a token-only close row. ---
// The brain transcript names no model, so the dollar half is marked unavailable and never estimated; the path and the text stay out.
const agyStep = (index, at, type, extra) => ({ step_index: index, source: "MODEL", type, status: "DONE", created_at: at, ...extra });
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// C31-B11 restates this B5 case under QG-04 (the criterion AC-112 is unchanged; the PO decision of 2026-11-19 replaced "never estimated"
// by a labelled list-price estimate). With no model argument and no project routing in the working directory (a fresh temporary
// directory), the row still sums the steps and keeps the dollar half unavailable, now saying how to name a model.
test("C31-B5 usage-ledger --row --antigravity-transcript sums the model steps' tokens into one row with the dollar half unavailable", () => {
  const { dir, file } = timelineFile([
    { step_index: 0, source: "USER_EXPLICIT", type: "USER_INPUT", status: "DONE", created_at: "2026-08-19T10:00:00Z", content: HUMAN_TEXT },
    agyStep(1, "2026-08-19T10:00:02Z", "PLANNER_RESPONSE", { input_tokens: 1200, cache_read_tokens: 30, output_tokens: 7, content: SECRET_MARKER }),
    agyStep(2, "2026-08-19T10:00:04Z", "GENERIC", { content: `tool result ${SECRET_MARKER}` }),
    agyStep(3, "2026-08-19T10:00:10Z", "PLANNER_RESPONSE", { input_tokens: 2300, cache_read_tokens: 1150, output_tokens: 9 }),
  ]);
  try {
    const result = run(["--row", "S1/B5", "--antigravity-transcript", file], { cwd: dir });
    assert.equal(result.status, 0, result.stderr);
    const out = result.stdout;
    assert.match(out, /^Session\/Block: S1\/B5$/m);
    assert.match(out, /^- antigravity-unrecorded: 3\.500 in \/ 16 out \/ n\/a cache-write \/ 1\.180 cache-read -> \$ unavailable \(model not recorded; pass --model <name>\)$/m);
    assert.match(out, /TOTAL: n\/a \(no model recorded in this transcript, no dollar estimate\)/);
    assert.doesNotMatch(out, /estimated|≈/, "no dollar figure is ever estimated for an unrecorded model");
    for (const text of [out, result.stderr]) {
      assert.doesNotMatch(text, new RegExp(`${SECRET_MARKER}|please do|${escapeRe(dir)}|session\\.jsonl`), "no transcript text and no path");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B5 usage-ledger --row --antigravity-transcript prints the skip sentence and exits 0 when the file holds no model step", () => {
  const stepsOnly = timelineFile([
    { step_index: 0, source: "USER_EXPLICIT", type: "USER_INPUT", status: "DONE", created_at: "2026-08-19T10:00:00Z", content: HUMAN_TEXT },
    agyStep(1, "2026-08-19T10:00:04Z", "GENERIC", { content: "ok" }),
  ]);
  const claudeLayout = timelineFile(claudeTimelineRecords());
  try {
    for (const { file } of [stepsOnly, claudeLayout]) {
      const result = run(["--row", "S1/B5", "--antigravity-transcript", file]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^Session\/Block: S1\/B5$/m);
      assert.match(result.stdout, /Tokens per `\/usage` \(collected, script\): no records found for the selected session\/filter\./);
      assert.doesNotMatch(result.stdout, /antigravity-unrecorded/);
    }
  } finally {
    rmSync(stepsOnly.dir, { recursive: true, force: true });
    rmSync(claudeLayout.dir, { recursive: true, force: true });
  }
});

// The same shape for a Codex rollout: the last complete cumulative `total_token_usage`, the model from `turn_context`; no Codex price exists.
const codexCounters = (input, cached, output) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: 1, total_tokens: input + output });
const codexTokenCount = (at, total) => ({ timestamp: at, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: total } } });

// C31-B11 restates this B5 case under QG-04: the model of this fixture (gpt-5.1-codex) has no entry in the list-price table, so the
// dollar half stays unavailable, now with the reason "no list price for <model>" instead of "n/a (price unknown)".
test("C31-B5 usage-ledger --row --codex-rollout prints the last complete cumulative total under the recorded model with no dollar figure", () => {
  const { dir, file } = timelineFile([
    { timestamp: "2026-11-18T10:00:00Z", type: "session_meta", payload: { id: SESSION_ID, cwd: "/work/project" } },
    { timestamp: "2026-11-18T10:00:01Z", type: "turn_context", payload: { model: "gpt-5.1-codex" } },
    { timestamp: "2026-11-18T10:00:02Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: SECRET_MARKER }] } },
    codexTokenCount("2026-11-18T10:00:03Z", codexCounters(1000, 400, 50)),
    codexTokenCount("2026-11-18T10:00:09Z", codexCounters(3000, 1500, 120)),
    codexTokenCount("2026-11-18T10:00:10Z", { ...codexCounters(9000, 9000, 900), input_tokens: -1 }),
  ]);
  try {
    const result = run(["--row", "S1/B5", "--codex-rollout", file]);
    assert.equal(result.status, 0, result.stderr);
    const out = result.stdout;
    assert.match(out, /^Session\/Block: S1\/B5$/m);
    assert.match(out, /^- gpt-5\.1-codex \(model source: observed\): 3\.000 in \/ 120 out \/ n\/a cache-write \/ 1\.500 cache-read -> \$ unavailable \(no list price for gpt-5\.1-codex\)$/m);
    assert.match(out, /^TOTAL: n\/a \(no model with known price\)$/m);
    assert.match(out, /no dollar figure is computed/);
    assert.doesNotMatch(out, /estimated|≈/, "no dollar figure is ever estimated for a model without a price");
    for (const text of [out, result.stderr]) assert.doesNotMatch(text, new RegExp(`${SECRET_MARKER}|/work/project|${escapeRe(dir)}|session\\.jsonl`), "no transcript text and no path");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B5 usage-ledger --row --codex-rollout prints the skip sentence for a rollout without a complete total and refuses a mixed or unreadable call", () => {
  const noTotal = timelineFile([{ type: "session_meta", payload: { id: SESSION_ID } }, codexTokenCount("2026-11-18T10:00:03Z", { input_tokens: 1, output_tokens: 2 })]);
  try {
    const skipped = run(["--row", "S1", "--codex-rollout", noTotal.file]);
    assert.equal(skipped.status, 0, skipped.stderr);
    assert.match(skipped.stdout, /Tokens per `\/usage` \(collected, script\): no records found for the selected session\/filter\./);
    const mixed = run(["--row", "S1", "--codex-rollout", noTotal.file, "--antigravity-transcript", noTotal.file]);
    const missing = run(["--row", "S1", "--codex-rollout", join(noTotal.dir, "absent.jsonl")]);
    for (const result of [mixed, missing]) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /--codex-rollout/);
      assert.doesNotMatch(result.stderr, new RegExp(escapeRe(noTotal.dir)));
    }
    assert.match(missing.stderr, /codex-rollout-unreadable/);
    assert.match(missing.stderr, /usage-ledger\.mjs --row "<label>" --codex-rollout <transcript-file>/);
  } finally {
    rmSync(noTotal.dir, { recursive: true, force: true });
  }
});

test("C31-B5 usage-ledger --antigravity-transcript is an exclusive row mode and its refusals name the runnable form without a path", () => {
  const { dir, file } = timelineFile([agyStep(1, "2026-08-19T10:00:02Z", "PLANNER_RESPONSE", { input_tokens: 5, cache_read_tokens: 1, output_tokens: 2 })]);
  try {
    const missing = run(["--row", "S1", "--antigravity-transcript", join(dir, "absent.jsonl")]);
    const bare = run(["--row", "S1", "--antigravity-transcript"]);
    const withRoot = run([dir, "--row", "S1", "--antigravity-transcript", file]);
    const withTimeline = run(["--timeline", file, "--antigravity-transcript", file]);
    const withSession = run(["--row", "S1", "--antigravity-transcript", file, "--session", SESSION_ID]);
    const noRow = run(["--antigravity-transcript", file]);
    for (const result of [missing, bare, withRoot, withTimeline, withSession, noRow]) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /--antigravity-transcript/);
      assert.doesNotMatch(result.stderr, new RegExp(escapeRe(dir)));
    }
    assert.match(missing.stderr, /antigravity-transcript-unreadable/);
    assert.match(missing.stderr, /usage-ledger\.mjs --row "<label>" --antigravity-transcript <transcript-file>/);
    assert.match(withRoot.stderr, /exclusive/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- C31-B11 (AC-112, lane L17; PO decision 2026-11-19): the Antigravity and Codex token rows ESTIMATE the dollar half from the
// labelled list-price table plugins/pipeline-core/config/model-list-prices.json. The word "approx" and the asOf date are mandatory;
// the model of an Antigravity row comes from --model, else from the project's configured implement route; Codex uses the model
// observed in the rollout. Arithmetic below is worked by hand from the table (US dollars per million tokens).
const PRICE_TABLE_PATH = join(dirname(CLI_PATH), "..", "config", "model-list-prices.json");
const agyUsageSteps = (...triples) => triples.map(([input, cacheRead, output], index) => agyStep(index + 1, `2026-11-19T10:00:0${index}Z`, "PLANNER_RESPONSE", { input_tokens: input, cache_read_tokens: cacheRead, output_tokens: output }));
const codexRollout = (model, total) => [
  { timestamp: "2026-11-19T10:00:00Z", type: "session_meta", payload: { id: SESSION_ID, cwd: "/work/project" } },
  { timestamp: "2026-11-19T10:00:01Z", type: "turn_context", payload: { model } },
  codexTokenCount("2026-11-19T10:00:09Z", total),
];

test("C31-B11 the list-price table is labelled as an estimate and holds the decided entries", () => {
  const table = JSON.parse(readFileSync(PRICE_TABLE_PATH, "utf8"));
  assert.equal(table.asOf, "2026-11-19");
  assert.match(table.source, /third-party list-price trackers, 2026-11-19; not verified against the vendor page; estimate/);
  assert.match(table.note, /vendor pages win/i);
  const expected = {
    "gpt-5.3-codex": [1.75, 0.175, 14], "gpt-5.2-codex": [1.75, 0.175, 14], "gpt-5-codex": [1.25, null, 10],
    "gemini-3.8-flash": [1.5, 0.15, 7.5], "gemini-3.6-flash": [1.5, 0.15, 7.5], "gemini-3.1-pro": [2, 0.2, 12], "gemini-3.1-flash-lite": [0.25, 0.025, 1.5],
  };
  assert.deepEqual(Object.keys(table.models).sort(), Object.keys(expected).sort());
  for (const [name, [input, cachedInput, output]] of Object.entries(expected)) {
    assert.deepEqual({ input: table.models[name].input, cachedInput: table.models[name].cachedInput, output: table.models[name].output }, { input, cachedInput, output }, name);
    assert.match(table.models[name].note, /low confidence/i, `${name}: the entry says it is low confidence`);
  }
});

test("C31-B11 usage-ledger --row --codex-rollout estimates the dollar half of a listed model from the list price, with cached tokens inside the input", () => {
  // 4M input of which 2M cached, 1M output: 2M x 1.75 + 2M x 0.175 + 1M x 14 = 3.50 + 0.35 + 14.00 = 17.85
  const { dir, file } = timelineFile(codexRollout("gpt-5.3-codex", codexCounters(4_000_000, 2_000_000, 1_000_000)));
  try {
    const result = run(["--row", "S1/B11", "--codex-rollout", file], { cwd: dir });
    assert.equal(result.status, 0, result.stderr);
    const out = result.stdout;
    assert.match(out, /^- gpt-5\.3-codex \(model source: observed\): 4\.000\.000 in \/ 1\.000\.000 out \/ n\/a cache-write \/ 2\.000\.000 cache-read -> approx \$17,85 \(estimate from list price, 2026-11-19; cached tokens at 0\.175 USD per 1M \(listed cached-input price\)\)$/m);
    assert.match(out, /^TOTAL approx \$17,85 \(estimate from list price, 2026-11-19\)$/m);
    assert.match(out, /ESTIMATE from third-party list prices/);
    assert.doesNotMatch(out, /unavailable|price unknown/);
    for (const text of [out, result.stderr]) assert.doesNotMatch(text, new RegExp(`${escapeRe(dir)}|/work/project|session\\.jsonl`), "no path");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B11 usage-ledger --row --codex-rollout drops the effort suffix and prices cached tokens at the input price when no cached price is listed", () => {
  // gpt-5-codex-high matches gpt-5-codex (1.25 / null / 10.00). 2M input of which 1M cached, 1M output: 1M x 1.25 + 1M x 1.25 + 1M x 10 = 12.50
  const { dir, file } = timelineFile(codexRollout("gpt-5-codex-high", codexCounters(2_000_000, 1_000_000, 1_000_000)));
  try {
    const result = run(["--row", "S1/B11", "--codex-rollout", file], { cwd: dir });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^- gpt-5-codex-high \(model source: observed\): .* -> approx \$12,50 \(estimate from list price, 2026-11-19; cached tokens at the input price, 1\.25 USD per 1M \(no cached price listed, upper bound\)\)$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B11 usage-ledger --row --codex-rollout keeps the dollar half unavailable, with the reason, for several models in one rollout", () => {
  const records = [...codexRollout("gpt-5.3-codex", codexCounters(1000, 100, 10)), { timestamp: "2026-11-19T10:00:02Z", type: "turn_context", payload: { model: "gpt-5.2-codex" } }];
  const { dir, file } = timelineFile(records);
  try {
    const result = run(["--row", "S1/B11", "--codex-rollout", file], { cwd: dir });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /-> \$ unavailable \(several models in one rollout, no per-model split\)/);
    assert.doesNotMatch(result.stdout, /approx/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B11 usage-ledger --row --antigravity-transcript --model prices the step sums with the listed model, tier suffix dropped, source 'argument'", () => {
  // 2M input, 1M cache-read, 1M output at gemini-3.8-flash 1.50 / 0.15 / 7.50: 3.00 + 0.15 + 7.50 = 10.65
  const { dir, file } = timelineFile(agyUsageSteps([1_500_000, 600_000, 400_000], [500_000, 400_000, 600_000]));
  try {
    const result = run(["--row", "S1/B11", "--antigravity-transcript", file, "--model", "gemini-3.8-flash-medium"], { cwd: dir });
    assert.equal(result.status, 0, result.stderr);
    const out = result.stdout;
    assert.match(out, /^- gemini-3\.8-flash-medium \(model source: argument\): 2\.000\.000 in \/ 1\.000\.000 out \/ n\/a cache-write \/ 1\.000\.000 cache-read -> approx \$10,65 \(estimate from list price, 2026-11-19; cached tokens at 0\.15 USD per 1M \(listed cached-input price\), counted in addition to input\)$/m);
    assert.match(out, /^TOTAL approx \$10,65 \(estimate from list price, 2026-11-19\)$/m);
    assert.match(out, /ESTIMATE from third-party list prices/);
    assert.doesNotMatch(out, /unavailable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B11 usage-ledger --row --antigravity-transcript picks the LONGEST listed name that prefixes the model (flash-lite is not the pro price)", () => {
  // gemini-3.1-flash-lite-low -> 0.25 / 0.025 / 1.50: 1M x 0.25 + 4M x 0.025 + 1M x 1.50 = 0.25 + 0.10 + 1.50 = 1.85
  const { dir, file } = timelineFile(agyUsageSteps([1_000_000, 4_000_000, 1_000_000]));
  try {
    const result = run(["--row", "S1/B11", "--antigravity-transcript", file, "--model", "gemini-3.1-flash-lite-low"], { cwd: dir });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /-> approx \$1,85 \(estimate from list price, 2026-11-19; cached tokens at 0\.025 USD per 1M/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B11 usage-ledger --row --antigravity-transcript keeps the dollar half unavailable, with the reason, for a model without a list price", () => {
  const { dir, file } = timelineFile(agyUsageSteps([1000, 100, 10]));
  try {
    for (const model of ["gemini-9-ultra", "gemini-3.8-flashy", "flash"]) {
      const result = run(["--row", "S1/B11", "--antigravity-transcript", file, "--model", model], { cwd: dir });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`^- ${model} \\(model source: argument\\): 1\\.000 in / 10 out / n/a cache-write / 100 cache-read -> \\$ unavailable \\(no list price for ${model}\\)$`, "m"));
      assert.match(result.stdout, /^TOTAL: n\/a \(no model with known price\)$/m);
      assert.doesNotMatch(result.stdout, /approx/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B11 usage-ledger --row --antigravity-transcript names the configured implement route as the model source when no --model is passed", (t) => {
  const root = join(dirname(CLI_PATH), "..", "..", "..");
  const routing = readProjectRouting(root);
  if (routing.source !== "project") return t.skip("this checkout has no valid pipeline.user.yaml, so there is no configured route to read");
  const model = routing.routing.duties.implement.antigravity.selector.value;
  const { dir, file } = timelineFile(agyUsageSteps([1_000_000, 0, 1_000_000]));
  try {
    const result = run(["--row", "S1/B11", "--antigravity-transcript", file], { cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`^- ${escapeRe(model)} \\(model source: configured route\\): `, "m"));
    assert.match(result.stdout, /-> (approx \$[0-9.,]+ \(estimate from list price, 2026-11-19;|\$ unavailable \(no list price for )/);
    const overridden = run(["--row", "S1/B11", "--antigravity-transcript", file, "--model", "gemini-3.1-pro"], { cwd: root });
    assert.match(overridden.stdout, /^- gemini-3\.1-pro \(model source: argument\): .* -> approx \$14,00 \(estimate/m, "the argument wins over the configured route: 1M x 2.00 + 0 + 1M x 12.00 = 14.00");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B11 usage-ledger --model is refused for a Codex row and for a malformed value, naming the runnable form", () => {
  const { dir, file } = timelineFile(agyUsageSteps([10, 1, 2]));
  try {
    const withCodex = run(["--row", "S1", "--codex-rollout", file, "--model", "gemini-3.8-flash"], { cwd: dir });
    const noValue = run(["--row", "S1", "--antigravity-transcript", file, "--model"], { cwd: dir });
    const badValue = run(["--row", "S1", "--antigravity-transcript", file, "--model", "bad name!"], { cwd: dir });
    const twice = run(["--row", "S1", "--antigravity-transcript", file, "--model", "a", "--model", "b"], { cwd: dir });
    for (const result of [withCodex, noValue, badValue, twice]) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /--model/);
      assert.match(result.stderr, /Runnable form: node plugins\/pipeline-core\/scripts\/usage-ledger\.mjs --row "<label>"/);
      assert.doesNotMatch(result.stderr, new RegExp(escapeRe(dir)));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B11 the default Claude --row output stays byte-identical", () => {
  const root = buildFixture();
  try {
    const result = run([root, "--session", SESSION_ID, "--row", "Test Row"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, [
      "Session/Block: Test Row",
      "Tokens per `/usage` (collected, script):",
      "- claude-sonnet-5: 40 in / 16 out / 0 cache-write / 0 cache-read -> $0,00 (estimated)",
      "TOTAL ≈ $0,00 (estimated)",
      "",
      "Notes: $ values estimated, price table asOf 2026-07-02 (model-prices.json); cache TTL per model taken from the transcript (ephemeral_5m/1h) where present, otherwise 5m rate assumed (declared assumption).",
      "",
      "Turns / tool calls per `/usage` (collected, script):",
      "- claude-sonnet-5 / main: 3 turn(s) / 3 tool call(s)",
      "- claude-sonnet-5 / subagent:agent-abc123: 1 turn(s) / 1 tool call(s)",
      "TOTAL: 4 turn(s) / 4 tool call(s)",
      "",
    ].join("\n"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- C31-B9 (AC-112, M0 of the main-context recon): `--timeline` also prints the bytes of every tool result, grouped by the script
// the call ran (else the tool name) and by refusal code. Derived at read time; the unit is UTF-8 bytes of the result TEXT (not tokens,
// not the JSONL record). The existing lines stay as they are; the table follows the TOTAL line. Fixtures give every result a known size.
const sizedText = (prefix, bytes) => {
  const pad = bytes - Buffer.byteLength(prefix, "utf8");
  assert.ok(pad >= 0, "the fixture prefix is longer than its size");
  return prefix + "y".repeat(pad);
};
const SCRIPT_ALPHA = (extra = "") => `node "/some/where/plugins/pipeline-core/scripts/alpha-tool.mjs" --arg ${SECRET_MARKER}${extra}`;
const SCRIPT_BETA = "node plugins/pipeline-core/scripts/beta-tool.mjs --json";
const READ_TEXT = `\u00e9${"y".repeat(48)}`; // 49 characters, 50 UTF-8 bytes: tells characters from bytes
const CLAUDE_REFUSAL = sizedText("PreToolUse:Bash hook error: BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-READ-COMMAND-UNSUPPORTED: ", 200);
const CODEX_REFUSAL = sizedText("Script error:\nCommand blocked by PreToolUse hook: BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-GRAMMAR-REDIRECT-REFUSED: ", 200);
const AGY_REFUSAL = sizedText("BLOCKED (Antigravity native child): AGY-NATIVE-BRAIN-WRITE: ", 200);
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });
const toolResult = (id, content, extra = {}) => ({ type: "tool_result", tool_use_id: id, content, ...extra });

function claudeToolResultRecords() {
  return [
    claudeUser("2026-08-19T10:00:00.000Z", "go"),
    claudeAssistant("2026-08-19T10:00:10.000Z", "msg_1", { input_tokens: 1, output_tokens: 1 }, [toolUse("toolu_a", "Bash", { command: SCRIPT_ALPHA() }), toolUse("toolu_b", "Bash", { command: SCRIPT_BETA })]),
    claudeUser("2026-08-19T10:00:11.000Z", [toolResult("toolu_a", sizedText(`alpha ${SECRET_MARKER} `, 500))]),
    claudeUser("2026-08-19T10:00:12.000Z", [toolResult("toolu_b", sizedText("beta ", 250))]),
    claudeAssistant("2026-08-19T10:00:20.000Z", "msg_2", { input_tokens: 1, output_tokens: 1 }, [toolUse("toolu_c", "Read", { file_path: `/some/where/${SECRET_MARKER}.txt` }), toolUse("toolu_d", "Bash", { command: "rg -n x y" })]),
    claudeUser("2026-08-19T10:00:21.000Z", [toolResult("toolu_c", READ_TEXT)]),
    claudeUser("2026-08-19T10:00:22.000Z", [toolResult("toolu_d", CLAUDE_REFUSAL, { is_error: true })]),
  ];
}

function assertToolResultTable(out, { refusalCode, refusalGroup, refusalBytes }) {
  const lines = out.split("\n");
  assert.ok(lines.indexOf("Tool results (UTF-8 bytes of the result text):") > lines.findIndex((line) => line.startsWith("TOTAL:")), "the table follows the existing TOTAL line");
  assert.ok(lines.includes("- script:alpha-tool | count 1 | bytes 500 | largest 500 | share 50.0 %"), out);
  assert.ok(lines.includes("- script:beta-tool | count 1 | bytes 250 | largest 250 | share 25.0 %"), out);
  assert.ok(lines.includes("- tool:Read | count 1 | bytes 50 | largest 50 | share 5.0 %") || lines.includes("- tool:read_file | count 1 | bytes 50 | largest 50 | share 5.0 %"), out);
  assert.ok(lines.includes(`- ${refusalGroup} | count 1 | bytes ${refusalBytes} | largest ${refusalBytes} | share 20.0 %`), out);
  assert.ok(lines.includes("By refusal code (a refused result is also counted above):"), out);
  assert.ok(lines.includes(`- ${refusalCode} | count 1 | bytes ${refusalBytes} | largest ${refusalBytes} | share 20.0 %`), out);
  assert.ok(lines.includes(`- ${refusalCode}: 1`), "the code row matches the existing Refusals section");
  assert.doesNotMatch(out, new RegExp(SECRET_MARKER), "no transcript content");
  assert.doesNotMatch(out, /\/some\/where|"\/some|usage-ledger-timeline-/u, "no path");
}

test("C31-B9 usage-ledger --timeline (claude) lists the bytes of every tool result by script, by tool and by refusal code", () => {
  const { dir, file } = timelineFile(claudeToolResultRecords());
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    assertToolResultTable(result.stdout, { refusalCode: "GUARD-READ-COMMAND-UNSUPPORTED", refusalGroup: "tool:Bash", refusalBytes: 200 });
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(escapeRe(dir)), "no absolute path");
    const json = run(["--timeline", file, "--json"]);
    const data = JSON.parse(json.stdout);
    assert.deepEqual(data.toolResults, {
      count: 4, bytes: 1000,
      groups: [
        { name: "script:alpha-tool", count: 1, bytes: 500, largest: 500 },
        { name: "script:beta-tool", count: 1, bytes: 250, largest: 250 },
        { name: "tool:Bash", count: 1, bytes: 200, largest: 200 },
        { name: "tool:Read", count: 1, bytes: 50, largest: 50 },
      ],
      refusalCodes: [{ name: "GUARD-READ-COMMAND-UNSUPPORTED", count: 1, bytes: 200, largest: 200 }],
    });
    assert.deepEqual(data.refusals, { "GUARD-READ-COMMAND-UNSUPPORTED": 1 }, "the existing refusal figure is untouched");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B9 usage-ledger --timeline (claude) prints no table for a transcript without tool results", () => {
  const { dir, file } = timelineFile([
    claudeUser("2026-08-19T10:00:00.000Z", HUMAN_TEXT),
    claudeAssistant("2026-08-19T10:00:10.000Z", "msg_1", { input_tokens: 1, output_tokens: 1 }),
  ]);
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Tool results/u);
    assert.doesNotMatch(result.stdout, /share \d/u);
    assert.deepEqual(JSON.parse(run(["--timeline", file, "--json"]).stdout).toolResults, { count: 0, bytes: 0, groups: [], refusalCodes: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B9 usage-ledger --timeline (claude) attributes streamed, array, orphan, Windows-path and sidechain results without printing a path or a name outside the closed set", () => {
  const sub = (content) => ({ ...content, isSidechain: true });
  const { dir, file } = timelineFile([
    // the same assistant message streamed twice repeats its tool_use blocks: one call, one group
    claudeAssistant("2026-08-19T10:00:10.000Z", "msg_1", { input_tokens: 1, output_tokens: 1 }, [toolUse("toolu_w", "Bash", { command: String.raw`node C:\Users\x\proj\plugins\pipeline-core\scripts\win-tool.mjs` })]),
    claudeAssistant("2026-08-19T10:00:11.000Z", "msg_1", { input_tokens: 1, output_tokens: 1 }, [toolUse("toolu_w", "Bash", { command: String.raw`node C:\Users\x\proj\plugins\pipeline-core\scripts\win-tool.mjs` }), toolUse("toolu_n", "Bash", { command: `echo ${SECRET_MARKER}` }), toolUse("toolu_x", "bad name with spaces", {})]),
    // a result whose content is a list of text blocks sums the blocks (no separator bytes), a sidechain result still counts
    sub(claudeUser("2026-08-19T10:00:12.000Z", [toolResult("toolu_w", [{ type: "text", text: "aaaa" }, { type: "text", text: "bbbbbb" }])])),
    claudeUser("2026-08-19T10:00:13.000Z", [toolResult("toolu_n", "12345", { is_error: true })]),
    claudeUser("2026-08-19T10:00:14.000Z", [toolResult("toolu_x", "123")]),
    claudeUser("2026-08-19T10:00:15.000Z", [toolResult("toolu_orphan", "1234567")]),
  ]);
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.split("\n");
    assert.ok(lines.includes("- script:win-tool | count 1 | bytes 10 | largest 10 | share 40.0 %"), result.stdout);
    assert.ok(lines.includes("- tool:Bash | count 1 | bytes 5 | largest 5 | share 20.0 %"), result.stdout);
    assert.ok(lines.includes("- tool:other | count 1 | bytes 3 | largest 3 | share 12.0 %"), result.stdout);
    assert.ok(lines.includes("- tool:unknown | count 1 | bytes 7 | largest 7 | share 28.0 %"), result.stdout);
    assert.doesNotMatch(result.stdout, new RegExp(`${SECRET_MARKER}|bad name|Users`), "no content, no path, no free tool name");
    assert.doesNotMatch(result.stdout, /By refusal code/u, "a result that names no code adds no code row");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B9 usage-ledger --timeline (codex rollout) lists the bytes of every tool output by script, by tool and by refusal code", () => {
  const rec = (timestamp, type, payload) => ({ timestamp, type, payload });
  const { dir, file } = timelineFile([
    rec("2026-08-19T10:00:00.000Z", "session_meta", { id: "thread-1", cwd: "/some/where" }),
    rec("2026-08-19T10:00:01.000Z", "event_msg", { type: "user_message", message: "go" }),
    rec("2026-08-19T10:00:02.000Z", "response_item", { type: "function_call", name: "shell", call_id: "c1", arguments: JSON.stringify({ command: ["bash", "-lc", SCRIPT_ALPHA()] }) }),
    rec("2026-08-19T10:00:03.000Z", "response_item", { type: "function_call_output", call_id: "c1", output: sizedText(`alpha ${SECRET_MARKER} `, 500) }),
    rec("2026-08-19T10:00:04.000Z", "response_item", { type: "custom_tool_call", name: "exec", call_id: "c2", input: SCRIPT_BETA }),
    rec("2026-08-19T10:00:05.000Z", "response_item", { type: "custom_tool_call_output", call_id: "c2", output: sizedText("beta ", 250) }),
    rec("2026-08-19T10:00:06.000Z", "response_item", { type: "function_call", name: "read_file", call_id: "c3", arguments: JSON.stringify({ path: `/some/where/${SECRET_MARKER}` }) }),
    rec("2026-08-19T10:00:07.000Z", "response_item", { type: "function_call_output", call_id: "c3", output: READ_TEXT }),
    rec("2026-08-19T10:00:08.000Z", "response_item", { type: "function_call", name: "shell", call_id: "c4", arguments: JSON.stringify({ cmd: "rg -n x y" }) }),
    rec("2026-08-19T10:00:09.000Z", "response_item", { type: "function_call_output", call_id: "c4", output: CODEX_REFUSAL }),
  ]);
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    assertToolResultTable(result.stdout, { refusalCode: "GUARD-GRAMMAR-REDIRECT-REFUSED", refusalGroup: "tool:shell", refusalBytes: 200 });
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(escapeRe(dir)), "no absolute path");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B9 usage-ledger --timeline (antigravity brain transcript) lists result bytes and codes and says it cannot name the script", () => {
  const { dir, file } = timelineFile([
    { step_index: 0, source: "USER_EXPLICIT", type: "USER_INPUT", status: "DONE", created_at: "2026-08-19T10:00:00Z", content: "go" },
    agyStep(1, "2026-08-19T10:00:02Z", "PLANNER_RESPONSE", { input_tokens: 5, cache_read_tokens: 1, output_tokens: 2, tool_calls: [] }),
    agyStep(2, "2026-08-19T10:00:03Z", "GENERIC", { content: sizedText(`alpha ${SECRET_MARKER} `, 500) }),
    agyStep(3, "2026-08-19T10:00:04Z", "GENERIC", { content: sizedText("beta ", 250) }),
    agyStep(4, "2026-08-19T10:00:05Z", "GENERIC", { content: READ_TEXT }),
    agyStep(5, "2026-08-19T10:00:06Z", "GENERIC", { status: "ERROR", content: "", error: AGY_REFUSAL }),
    agyStep(6, "2026-08-19T10:00:07Z", "GENERIC", {}),
  ]);
  try {
    const result = run(["--timeline", file]);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.split("\n");
    assert.ok(lines.indexOf("Tool results (UTF-8 bytes of the result text):") > lines.findIndex((line) => line.startsWith("TOTAL:")));
    assert.ok(lines.includes("- tool:not-recorded | count 4 | bytes 1000 | largest 500 | share 100.0 %"), result.stdout);
    assert.ok(lines.includes("- AGY-NATIVE-BRAIN-WRITE | count 1 | bytes 200 | largest 200 | share 20.0 %"), result.stdout);
    assert.ok(lines.includes("- AGY-NATIVE-BRAIN-WRITE: 1"));
    assert.ok(lines.includes("Note: this transcript layout does not record which tool produced a result, so results are not grouped by script."), result.stdout);
    assert.doesNotMatch(result.stdout, new RegExp(SECRET_MARKER));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C31-B9 usage-ledger --timeline prints the unavailable line, not zeros, for the older Antigravity form and no table for a brain transcript without results", () => {
  const old = timelineFile([
    { type: "turn.started", timestamp: "2026-08-19T10:00:00.000Z" },
    { type: "turn.completed", timestamp: "2026-08-19T10:00:30.000Z", usage: { input_tokens: 50, output_tokens: 6, cached_tokens: 20 } },
  ]);
  const none = timelineFile([agyStep(1, "2026-08-19T10:00:02Z", "PLANNER_RESPONSE", { input_tokens: 5, cache_read_tokens: 1, output_tokens: 2 })]);
  try {
    const oldOut = run(["--timeline", old.file]);
    assert.equal(oldOut.status, 0, oldOut.stderr);
    assert.ok(oldOut.stdout.split("\n").includes("Tool results: n/a (this format records no tool result)"), oldOut.stdout);
    assert.doesNotMatch(oldOut.stdout, /share \d/u);
    assert.equal(JSON.parse(run(["--timeline", old.file, "--json"]).stdout).toolResults, null);
    const noneOut = run(["--timeline", none.file]);
    assert.equal(noneOut.status, 0, noneOut.stderr);
    assert.doesNotMatch(noneOut.stdout, /Tool results/u);
  } finally {
    rmSync(old.dir, { recursive: true, force: true });
    rmSync(none.dir, { recursive: true, force: true });
  }
});
