// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import {
  CLAUDE_TASK_OUTPUT_READ_SCOPE_SCHEMA,
  readClaudeTaskOutputReadScope,
  recordClaudeTaskOutputReadScope,
} from "./claude-task-output-read-scope.mjs";
const completionCases = [];
function test(name, optionsOrRun, possibleRun) {
  const options = typeof optionsOrRun === "function" ? {} : optionsOrRun ?? {};
  const run = typeof optionsOrRun === "function" ? optionsOrRun : possibleRun;
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  const entry = { id: "CTOS" + String(completionCases.length + 1).padStart(3, "0"), name, run };
  if (options.skip === true) entry.mode = "skip";
  completionCases.push(entry);
}


function repository() {
  const projectDir = mkdtempSync(join(tmpdir(), "claude-task-output-scope-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: projectDir, stdio: ["ignore", "ignore", "pipe"] });
  return projectDir;
}

function taskOutputPath(cwd, sessionId, taskId) {
  return join(tmpdir(), "claude", cwd.replace(/[^A-Za-z0-9]/gu, "-"), sessionId, "tasks", `${taskId}.output`);
}

function eventBinding(projectDir, extra = {}) {
  return {
    projectDir,
    cwd: projectDir,
    sessionId: "session-claude-001",
    transcriptPath: join(projectDir, "transcript.jsonl"),
    toolUseId: "toolu_01abc123",
    taskId: "bg-task-001",
    ...extra,
  };
}

function writeTaskOutput(cwd, sessionId, taskId, contents = "task result\n") {
  const path = taskOutputPath(cwd, sessionId, taskId);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents, { mode: 0o644 });
  return path;
}

function cleanupTaskOutput(cwd, sessionId) {
  rmSync(join(tmpdir(), "claude", cwd.replace(/[^A-Za-z0-9]/gu, "-"), sessionId), { recursive: true, force: true });
}

test("native task binding resolves only its exact canonical output and is immutable", () => {
  const projectDir = repository();
  try {
    const input = eventBinding(projectDir);
    const path = writeTaskOutput(input.cwd, input.sessionId, input.taskId);
    const written = recordClaudeTaskOutputReadScope(input);
    assert.equal(written.status, "recorded");
    assert.equal(written.code, "CTORS-RECORDED");
    assert.equal(written.taskId, input.taskId);
    assert.equal(written.sessionId, input.sessionId);
    assert.equal(written.toolUseId, input.toolUseId);

    const available = readClaudeTaskOutputReadScope({
      projectDir,
      sessionId: input.sessionId,
      transcriptPath: input.transcriptPath,
      requestedPath: path,
    });
    assert.deepEqual(available, {
      status: "available",
      path,
      taskId: input.taskId,
      sessionId: input.sessionId,
      toolUseId: input.toolUseId,
      authorizedTaskDirectory: join(path, ".."),
    });
    assert.equal(recordClaudeTaskOutputReadScope(input).code, "CTORS-ALREADY-RECORDED");
    assert.equal(CLAUDE_TASK_OUTPUT_READ_SCOPE_SCHEMA, "pipeline.claude-task-output-read-scope.v1");
  } finally {
    cleanupTaskOutput(projectDir, "session-claude-001");
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("session, transcript, task and requested-path mismatches never borrow another task scope", () => {
  const projectDir = repository();
  try {
    const input = eventBinding(projectDir);
    const path = writeTaskOutput(input.cwd, input.sessionId, input.taskId);
    assert.equal(recordClaudeTaskOutputReadScope(input).status, "recorded");
    assert.equal(readClaudeTaskOutputReadScope({
      projectDir,
      sessionId: "other-session",
      transcriptPath: input.transcriptPath,
      requestedPath: path,
    }).status, "absent");
    assert.equal(readClaudeTaskOutputReadScope({
      projectDir,
      sessionId: input.sessionId,
      transcriptPath: join(projectDir, "other-transcript.jsonl"),
      requestedPath: path,
    }).status, "unavailable");
    assert.equal(readClaudeTaskOutputReadScope({
      projectDir,
      sessionId: input.sessionId,
      transcriptPath: input.transcriptPath,
      requestedPath: taskOutputPath(input.cwd, input.sessionId, "other-task"),
    }).status, "absent");
    assert.equal(readClaudeTaskOutputReadScope({
      projectDir,
      sessionId: input.sessionId,
      transcriptPath: input.transcriptPath,
      requestedPath: join(projectDir, "not-a-task-output.txt"),
    }).status, "absent");
    assert.equal(recordClaudeTaskOutputReadScope({ ...input, toolUseId: "toolu_other" }).code, "CTORS-RECORD-CONFLICT");
  } finally {
    cleanupTaskOutput(projectDir, "session-claude-001");
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("symlinked and hard-linked task outputs have no read scope", { skip: process.platform === "win32" }, () => {
  const projectDir = repository();
  try {
    const input = eventBinding(projectDir);
    const path = taskOutputPath(input.cwd, input.sessionId, input.taskId);
    mkdirSync(join(path, ".."), { recursive: true });
    const external = join(projectDir, "outside-output.txt");
    writeFileSync(external, "not the task output\n");
    symlinkSync(external, path);
    assert.equal(recordClaudeTaskOutputReadScope(input).status, "recorded");
    assert.equal(readClaudeTaskOutputReadScope({
      projectDir,
      sessionId: input.sessionId,
      transcriptPath: input.transcriptPath,
      requestedPath: path,
    }).status, "unavailable");

    rmSync(path);
    writeFileSync(path, "task output\n");
    const otherLink = join(projectDir, "task-output-hardlink.txt");
    linkSync(path, otherLink);
    assert.equal(readClaudeTaskOutputReadScope({
      projectDir,
      sessionId: input.sessionId,
      transcriptPath: input.transcriptPath,
      requestedPath: path,
    }).status, "unavailable");
  } finally {
    cleanupTaskOutput(projectDir, "session-claude-001");
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("output parent aliases and oversized files fail closed", { skip: process.platform === "win32" }, () => {
  const projectDir = repository();
  try {
    const input = eventBinding(projectDir);
    const path = taskOutputPath(input.cwd, input.sessionId, input.taskId);
    const taskDir = join(path, "..");
    mkdirSync(join(projectDir, "actual-tasks"), { recursive: true });
    writeFileSync(join(projectDir, "actual-tasks", "bg-task-001.output"), "result\n");
    mkdirSync(join(taskDir, ".."), { recursive: true });
    symlinkSync(join(projectDir, "actual-tasks"), taskDir);
    assert.equal(recordClaudeTaskOutputReadScope(input).status, "recorded");
    assert.equal(readClaudeTaskOutputReadScope({
      projectDir,
      sessionId: input.sessionId,
      transcriptPath: input.transcriptPath,
      requestedPath: path,
    }).status, "unavailable");

    rmSync(taskDir);
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(path, Buffer.alloc(1024 * 1024 + 1, 0x61));
    assert.equal(readClaudeTaskOutputReadScope({
      projectDir,
      sessionId: input.sessionId,
      transcriptPath: input.transcriptPath,
      requestedPath: path,
    }).status, "unavailable");
  } finally {
    cleanupTaskOutput(projectDir, "session-claude-001");
    rmSync(projectDir, { recursive: true, force: true });
  }
});

if (completionCases.length !== 4) throw new Error("case completion count drift: expected 4, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
