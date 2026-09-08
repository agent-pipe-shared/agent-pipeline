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
import { join } from "node:path";
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
