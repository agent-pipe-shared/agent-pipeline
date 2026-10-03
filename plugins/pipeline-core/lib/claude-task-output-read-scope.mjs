// SPDX-License-Identifier: SUL-1.0
/**
 * Binds Claude's native background-task result to the one canonical task
 * output file for that session, then exposes only that exact file to the
 * guarded reader. The task id is accepted only from PostToolUse's structured
 * `tool_response.backgroundTaskId`; transcript contents and stdout are never
 * parsed as authority.
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";

import { assertPrivateRegularFile, writePrivateFileNoReplaceAtomic } from "./private-boundary.mjs";
import { resolveGitCommonDir } from "./po-key-directory.mjs";

export const CLAUDE_TASK_OUTPUT_READ_SCOPE_SCHEMA = "pipeline.claude-task-output-read-scope.v1";
export const CLAUDE_TASK_OUTPUT_READ_SCOPE_MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_RECORD_BYTES = 8192;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const RECORD_KEYS = Object.freeze([
  "schema", "projectDir", "cwd", "sessionId", "transcriptPath", "toolUseId",
  "taskId", "taskOutputPath", "authorizedTaskDirectory",
]);
const RECORD_DIRECTORY = join("agent-pipeline", "claude-task-output-read-scope");

function unavailable(code) { return { status: "unavailable", code }; }
function absent(code = "CTORS-ABSENT") { return { status: "absent", code }; }
function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}
function sha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function identity(stat) { return `${stat.dev}:${stat.ino}`; }

function physical(path, { directory = false } = {}) {
  const absolute = resolve(path);
  let cursor = parse(absolute).root;
  const root = lstatSync(cursor);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("CTORS-ALIAS");
  const components = absolute.slice(cursor.length).split(sep).filter(Boolean);
  for (let index = 0; index < components.length; index += 1) {
    cursor = join(cursor, components[index]);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error("CTORS-ALIAS");
    if (index < components.length - 1 && !info.isDirectory()) throw new Error("CTORS-PARENT");
  }
  const info = lstatSync(absolute);
  if (directory && !info.isDirectory()) throw new Error("CTORS-DIRECTORY");
  if (!directory && !info.isFile()) throw new Error("CTORS-FILE");
  if (realpathSync(absolute) !== absolute) throw new Error("CTORS-ALIAS");
  return info;
}

function physicalDirectory(path) {
  try { physical(path, { directory: true }); return resolve(path); }
  catch { throw new Error("CTORS-DIRECTORY"); }
}

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function canonicalPaths(cwd, sessionId, taskId) {
  const authorizedTaskDirectory = resolve(
    tmpdir(), "claude", cwd.replace(/[^A-Za-z0-9]/gu, "-"), sessionId, "tasks",
  );
  return {
    authorizedTaskDirectory,
    taskOutputPath: join(authorizedTaskDirectory, `${taskId}.output`),
  };
}

function recordName(sessionId, taskId) {
  return `${sha256(`${sessionId}\0${taskId}`)}.json`;
}

function resolvePrivateStore(projectDir) {
  const commonDir = resolveGitCommonDir(projectDir);
  if (typeof commonDir !== "string") throw new Error("CTORS-GIT-COMMON-DIR");
  physicalDirectory(commonDir);
  return join(commonDir, RECORD_DIRECTORY);
}

function normalizedInputs({ projectDir, cwd, sessionId, transcriptPath, toolUseId, taskId } = {}) {
  if (typeof projectDir !== "string" || !isAbsolute(projectDir)
    || typeof cwd !== "string" || !isAbsolute(cwd)
    || typeof sessionId !== "string" || !SESSION_ID.test(sessionId)
    || typeof transcriptPath !== "string" || !isAbsolute(transcriptPath)
    || /[\x00-\x1f]/u.test(transcriptPath)
    || typeof toolUseId !== "string" || !ID.test(toolUseId)
    || typeof taskId !== "string" || !TASK_ID.test(taskId)) {
    throw new Error("CTORS-INPUT");
  }
  const physicalProjectDir = physicalDirectory(projectDir);
  const physicalCwd = physicalDirectory(cwd);
  if (!inside(physicalProjectDir, physicalCwd)) throw new Error("CTORS-CWD-OUTSIDE-PROJECT");
  return {
    projectDir: physicalProjectDir,
    cwd: physicalCwd,
    sessionId,
    transcriptPath: resolve(transcriptPath),
    toolUseId,
    taskId,
    ...canonicalPaths(physicalCwd, sessionId, taskId),
  };
}

function readBoundedPrivateRecord(path) {
  physicalDirectory(dirname(path));
  const before = assertPrivateRegularFile(path, "Claude task-output scope record");
  if (before.size < 1 || before.size > MAX_RECORD_BYTES) throw new Error("CTORS-RECORD-SIZE");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || identity(opened) !== identity(before)
      || opened.size !== before.size || realpathSync(path) !== resolve(path)) throw new Error("CTORS-RECORD-IDENTITY");
    const buffer = Buffer.alloc(MAX_RECORD_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(fd);
    const pathAfter = assertPrivateRegularFile(path, "Claude task-output scope record");
    if (offset > MAX_RECORD_BYTES || after.size !== opened.size || offset !== opened.size
      || identity(after) !== identity(opened) || identity(pathAfter) !== identity(opened)
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      throw new Error("CTORS-RECORD-CHANGED");
    }
    let value;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, offset))); }
    catch { throw new Error("CTORS-RECORD-MALFORMED"); }
    if (!exactKeys(value, RECORD_KEYS) || value.schema !== CLAUDE_TASK_OUTPUT_READ_SCOPE_SCHEMA) {
      throw new Error("CTORS-RECORD-SHAPE");
    }
    return value;
  } finally {
    closeSync(fd);
  }
}

function assertTaskOutput(path, authorizedTaskDirectory) {
  const physicalDirectoryPath = physical(authorizedTaskDirectory, { directory: true });
  if (physicalDirectoryPath.isSymbolicLink()) throw new Error("CTORS-TASK-DIRECTORY-ALIAS");
  const before = physical(path);
  if (before.nlink !== 1 || before.size > CLAUDE_TASK_OUTPUT_READ_SCOPE_MAX_OUTPUT_BYTES) {
    throw new Error("CTORS-OUTPUT-BOUNDS");
  }
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || identity(opened) !== identity(before)
      || opened.size !== before.size || opened.size > CLAUDE_TASK_OUTPUT_READ_SCOPE_MAX_OUTPUT_BYTES) {
      throw new Error("CTORS-OUTPUT-IDENTITY");
    }
    const after = fstatSync(fd);
    const pathAfter = physical(path);
    if (identity(after) !== identity(opened) || identity(pathAfter) !== identity(opened)
      || after.nlink !== 1 || pathAfter.nlink !== 1 || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      throw new Error("CTORS-OUTPUT-CHANGED");
    }
  } finally {
    closeSync(fd);
  }
}

/**
 * Called only by the native PostToolUse hook for Claude's structured
 * `tool_response.backgroundTaskId`. The immutable no-replace record carries
 * the canonical output path and the exact session/tool invocation binding.
 */
export function recordClaudeTaskOutputReadScope({ projectDir, cwd, sessionId, transcriptPath, toolUseId, taskId } = {}) {
  let normalized;
  try { normalized = normalizedInputs({ projectDir, cwd, sessionId, transcriptPath, toolUseId, taskId }); }
  catch (error) { return unavailable(error?.message ?? "CTORS-INPUT"); }
  try {
    const directory = resolvePrivateStore(normalized.projectDir);
    const path = join(directory, recordName(normalized.sessionId, normalized.taskId));
    const record = {
      schema: CLAUDE_TASK_OUTPUT_READ_SCOPE_SCHEMA,
      projectDir: normalized.projectDir,
      cwd: normalized.cwd,
      sessionId: normalized.sessionId,
      transcriptPath: normalized.transcriptPath,
      toolUseId: normalized.toolUseId,
      taskId: normalized.taskId,
      taskOutputPath: normalized.taskOutputPath,
      authorizedTaskDirectory: normalized.authorizedTaskDirectory,
    };
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
    const published = writePrivateFileNoReplaceAtomic(path, bytes);
    const existing = readBoundedPrivateRecord(path);
    if (JSON.stringify(existing) !== JSON.stringify(record)) return unavailable("CTORS-RECORD-CONFLICT");
    return {
      status: "recorded",
      code: published.created ? "CTORS-RECORDED" : "CTORS-ALREADY-RECORDED",
      taskId: normalized.taskId,
      sessionId: normalized.sessionId,
      toolUseId: normalized.toolUseId,
    };
  } catch (error) {
    return unavailable(error?.message ?? "CTORS-STORE-UNAVAILABLE");
  }
}

/**
 * Resolves one exact requested Claude task-output path to the private native
 * PostToolUse record that authorized it. This never scans a tasks directory.
 */
export function readClaudeTaskOutputReadScope({ projectDir, sessionId, transcriptPath, requestedPath } = {}) {
  if (typeof projectDir !== "string" || !isAbsolute(projectDir)
    || typeof sessionId !== "string" || !SESSION_ID.test(sessionId)
    || typeof transcriptPath !== "string" || !isAbsolute(transcriptPath)
    || typeof requestedPath !== "string" || !isAbsolute(requestedPath)) return unavailable("CTORS-INPUT");
  const requested = resolve(requestedPath);
  const taskId = basename(requested).endsWith(".output")
    ? basename(requested).slice(0, -".output".length)
    : "";
  if (!TASK_ID.test(taskId)) return absent("CTORS-NOT-TASK-OUTPUT");
  const expectedContainer = resolve(tmpdir(), "claude");
  const rel = relative(expectedContainer, requested);
  const components = rel.split(sep).filter(Boolean);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`) || components.length !== 4
    || components[1] !== sessionId || components[2] !== "tasks"
    || !/^[A-Za-z0-9-]+$/u.test(components[0])) return absent("CTORS-NOT-CANONICAL-SHAPE");
  let physicalProjectDir;
  try { physicalProjectDir = physicalDirectory(projectDir); }
  catch (error) { return unavailable(error?.message ?? "CTORS-PROJECT-DIRECTORY"); }
  let directory;
  try { directory = resolvePrivateStore(physicalProjectDir); }
  catch (error) { return unavailable(error?.message ?? "CTORS-GIT-COMMON-DIR"); }
  const recordPath = join(directory, recordName(sessionId, taskId));
  if (!existsSync(recordPath)) return absent("CTORS-RECORD-ABSENT");
  let record;
  try { record = readBoundedPrivateRecord(recordPath); }
  catch (error) { return unavailable(error?.message ?? "CTORS-RECORD-UNAVAILABLE"); }
  let expected;
  try {
    if (record.projectDir !== physicalProjectDir || record.sessionId !== sessionId
      || record.transcriptPath !== resolve(transcriptPath) || record.taskId !== taskId
      || !ID.test(record.toolUseId) || typeof record.cwd !== "string" || !isAbsolute(record.cwd)) {
      return unavailable("CTORS-BINDING-MISMATCH");
    }
    const physicalCwd = physicalDirectory(record.cwd);
    if (!inside(physicalProjectDir, physicalCwd)) return unavailable("CTORS-CWD-OUTSIDE-PROJECT");
    expected = canonicalPaths(physicalCwd, sessionId, taskId);
  } catch (error) {
    return unavailable(error?.message ?? "CTORS-RECORD-INVALID");
  }
  if (record.taskOutputPath !== expected.taskOutputPath
    || record.authorizedTaskDirectory !== expected.authorizedTaskDirectory
    || requested !== expected.taskOutputPath) return unavailable("CTORS-PATH-MISMATCH");
  try { assertTaskOutput(expected.taskOutputPath, expected.authorizedTaskDirectory); }
  catch (error) { return unavailable(error?.message ?? "CTORS-OUTPUT-UNAVAILABLE"); }
  return {
    status: "available",
    path: expected.taskOutputPath,
    taskId,
    sessionId,
    toolUseId: record.toolUseId,
    authorizedTaskDirectory: expected.authorizedTaskDirectory,
  };
}
