// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import { readClaudeTaskOutputReadScope } from "../lib/claude-task-output-read-scope.mjs";
import { recordConsentGiven } from "../lib/onboarding-consent-marker.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
const completionCases = [];
function test(name, optionsOrRun, possibleRun) {
  const options = typeof optionsOrRun === "function" ? {} : optionsOrRun ?? {};
  const run = typeof optionsOrRun === "function" ? optionsOrRun : possibleRun;
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  const entry = { id: "CTPH" + String(completionCases.length + 1).padStart(3, "0"), name, run };
  if (options.skip === true) entry.mode = "skip";
  completionCases.push(entry);
}


const HOOK = fileURLToPath(new URL("./claude-task-output-scope-posttool.mjs", import.meta.url));

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), "claude-task-output-posttool-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: projectDir });
  recordConsentGiven({ rootDir: projectDir });
  assert.equal(observeGovernanceScope({ rootDir: projectDir }).requiresEnforcement, true,
    "hook fixture must be admitted through canonical governance enrollment");
  return projectDir;
}

function outputPath(cwd, sessionId, taskId) {
  return join(tmpdir(), "claude", cwd.replace(/[^A-Za-z0-9]/gu, "-"), sessionId, "tasks", `${taskId}.output`);
}

function invokeHook(projectDir, input) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: projectDir,
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
}

function cleanup(projectDir, sessionId) {
  if (sessionId) rmSync(join(tmpdir(), "claude", projectDir.replace(/[^A-Za-z0-9]/gu, "-"), sessionId), { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
}

test("native Bash PostToolUse backgroundTaskId creates a private exact task-output scope", () => {
  const projectDir = fixture();
  const sessionId = "posttool-session-001";
  const taskId = "background-task-001";
  const transcriptPath = join(projectDir, "session.jsonl");
  const toolUseId = "toolu_posttool_001";
  const path = outputPath(projectDir, sessionId, taskId);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "native task output\n");
  try {
    const result = invokeHook(projectDir, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      cwd: projectDir,
      session_id: sessionId,
      transcript_path: transcriptPath,
      tool_use_id: toolUseId,
      tool_response: { backgroundTaskId: taskId, stdout: "untrusted output path should not be parsed" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "", "the observer does not emit output-derived authority");
    assert.equal(result.stderr, "", "the non-blocking PostToolUse observer stays quiet");
    assert.deepEqual(readClaudeTaskOutputReadScope({ projectDir, sessionId, transcriptPath, requestedPath: path }), {
      status: "available",
      path,
      taskId,
      sessionId,
      toolUseId,
      authorizedTaskDirectory: join(path, ".."),
    });
  } finally {
    cleanup(projectDir, sessionId);
  }
});

test("non-background, wrong-tool, and stdout-only identifiers create no scope", () => {
  const projectDir = fixture();
  const sessionId = "posttool-session-002";
  const transcriptPath = join(projectDir, "session.jsonl");
  const taskId = "stdout-task-002";
  const path = outputPath(projectDir, sessionId, taskId);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "output-looking text\n");
  try {
    const base = {
      hook_event_name: "PostToolUse",
      cwd: projectDir,
      session_id: sessionId,
      transcript_path: transcriptPath,
      tool_use_id: "toolu_posttool_002",
    };
    for (const input of [
      { ...base, tool_name: "Bash", tool_response: { stdout: taskId } },
      { ...base, tool_name: "Task", tool_response: { backgroundTaskId: taskId } },
      { ...base, tool_name: "PowerShell", tool_response: { backgroundTaskId: "../escape" } },
    ]) {
      const result = invokeHook(projectDir, input);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
    }
    assert.equal(readClaudeTaskOutputReadScope({ projectDir, sessionId, transcriptPath, requestedPath: path }).status, "absent");
  } finally {
    cleanup(projectDir, sessionId);
  }
});

if (completionCases.length !== 2) throw new Error("case completion count drift: expected 2, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
