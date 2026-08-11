// SPDX-License-Identifier: SUL-1.0
// Unit-level tests for NVA-A8-RUNNER: proves the five workload fixtures behave exactly as
// specified when run directly (node task.mjs), and exercises the runner's pure CLI-dispatch
// helpers (arg-building, prompt-building, stream-json/tool-result parsing) against mock/stub
// data -- never a real `claude -p` call. The real end-to-end run is a separate, manually
// invoked step (see the runner's own module docstring), not part of this suite.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildNativeArgs,
  buildPrompt,
  findLastBashToolResult,
  parseStreamJsonEvents,
} from "./nova-a8-benchmark-runner.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKLOADS_DIR = join(SCRIPT_DIR, "fixtures", "nova-benchmark", "workloads");

let n = 0;
const check = (name, fn) => {
  fn();
  console.log(`PASS NVA${String(++n).padStart(2, "0")} ${name}`);
};

function runTask(cls, args = []) {
  const taskPath = join(WORKLOADS_DIR, cls, "task.mjs");
  return spawnSync("node", [taskPath, ...args], { encoding: "utf8" });
}

function resultTextFor(cls) {
  return readFileSync(join(WORKLOADS_DIR, cls, "result.txt"), "utf8");
}

check("mini workload writes the exact canonical JSON result and exits 0", () => {
  const res = runTask("mini");
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resultTextFor("mini"), JSON.stringify({ sum: 4, product: 42 }));
});

check("feature workload asserts against its sibling lib.mjs and exits 0", () => {
  const res = runTask("feature");
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resultTextFor("feature"), "feature:ok");
});

check("review workload finds zero violations in the clean-by-construction sample tree", () => {
  const res = runTask("review");
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resultTextFor("review"), "review:0-violations");
});

check("migration workload's fixed transform matches expected.json byte-for-byte", () => {
  const res = runTask("migration");
  assert.equal(res.status, 0, res.stderr);
  assert.equal(resultTextFor("migration"), "migration:match");
});

check("failure-recovery workload fails once then recovers on the immediate retry", () => {
  const dir = mkdtempSync(join(tmpdir(), "nva-a8-fr-unit-"));
  const counterPath = join(dir, "counter.txt");
  try {
    assert.equal(existsSync(counterPath), false);
    const first = runTask("failure-recovery", [counterPath]);
    assert.equal(first.status, 1, first.stderr);
    assert.equal(existsSync(counterPath), true);
    const second = runTask("failure-recovery", [counterPath]);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(resultTextFor("failure-recovery"), "failure-recovery:recovered");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- runner pure-function tests (mock/stub data, no real `claude -p` call) ---------------

check("buildNativeArgs sends -p/--add-dir/stream-json/--verbose plus a scoped Bash allow-list", () => {
  const args = buildNativeArgs({ promptText: "hello", repoAbs: "/tmp/repo" });
  assert.deepEqual(args, [
    "-p",
    "hello",
    "--add-dir",
    "/tmp/repo",
    "--output-format",
    "stream-json",
    "--model",
    "haiku",
    "--no-session-persistence",
    "--verbose",
    "--allowedTools",
    "Bash(node *)",
  ]);
});

check("buildPrompt names the exact command and nothing else", () => {
  const prompt = buildPrompt("node /abs/task.mjs");
  assert.match(prompt, /node \/abs\/task\.mjs/u);
  assert.match(prompt, /single word: done/u);
});

check("parseStreamJsonEvents parses NDJSON and skips malformed lines", () => {
  const text = [JSON.stringify({ type: "system" }), "{ not json", JSON.stringify({ type: "result", result: "{}" })].join(
    "\n",
  );
  const { events, parseErrors } = parseStreamJsonEvents(text);
  assert.equal(events.length, 2);
  assert.equal(parseErrors.length, 1);
});

check("findLastBashToolResult reads the last tool_use_result-bearing user event", () => {
  const events = [
    { type: "user", tool_use_result: { stdout: "old", stderr: "" }, message: { content: [{ is_error: false }] } },
    { type: "assistant" },
    { type: "user", tool_use_result: { stdout: "", stderr: "" }, message: { content: [{ is_error: false }] } },
  ];
  const found = findLastBashToolResult(events);
  assert.deepEqual(found, { stdout: "", stderr: "", isError: false });
});

check("findLastBashToolResult reports is_error true when the Bash call failed", () => {
  const events = [
    { type: "user", tool_use_result: { stdout: "", stderr: "boom" }, message: { content: [{ is_error: true }] } },
  ];
  const found = findLastBashToolResult(events);
  assert.equal(found.isError, true);
});

check("findLastBashToolResult returns undefined when no tool ran", () => {
  const events = [{ type: "assistant" }, { type: "result", result: "done" }];
  assert.equal(findLastBashToolResult(events), undefined);
});

console.log(`${n}/${n} checks passed.`);
