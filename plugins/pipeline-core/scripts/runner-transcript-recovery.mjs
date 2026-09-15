#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Bounded, read-only recovery of a prior runner transcript.
 *
 * This is intentionally the only component allowed to inspect Codex's private
 * session collection.  Callers cannot supply a session directory or transcript
 * pathname: the Codex location is derived here, candidates must identify the
 * current repository in their own `session_meta` record, and the current session
 * id is excluded before recency is considered.  A raw shell read of a runner
 * home remains outside the lifecycle guard's read scope.
 */
import {
  lstatSync, openSync, readFileSync, readdirSync, readSync, realpathSync, closeSync, statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { repositoryPathIdentityOrSelf, windowsNotationCandidate } from "../lib/repository-path-identity.mjs";

const SCHEMA = "pipeline.runner-transcript-recovery.v1";
const CODEX_RUNNER = "codex";
const MAX_CANDIDATES = 2_000;
const MAX_METADATA_LINES = 256;
const MAX_METADATA_BYTES = 512 * 1024;
const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;
const MAX_EXCERPT_ENTRIES = 8;
const MAX_EXCERPT_DETAIL_BYTES = 600;
const PROJECT_PATH_KEYS = new Set(["cwd", "workspace", "workspace_path", "workspacePath", "project_root", "projectRoot"]);
const SESSION_ID_KEYS = new Set(["session_id", "sessionId", "thread_id", "threadId"]);

function unavailable(runner, reason) {
  return { schema: SCHEMA, status: "unavailable", runner, reason };
}

function pathInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel));
}

function realDirectory(path) {
  try {
    const real = realpathSync(path);
    return statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

function resolveCodexSessionsDirectory(env, homeDirectory) {
  const configured = env?.CODEX_HOME;
  const codexHome = typeof configured === "string" && isAbsolute(configured)
    ? configured
    : join(homeDirectory(), ".codex");
  return realDirectory(join(codexHome, "sessions"));
}

function regularJsonlFiles(sessionsDirectory) {
  const files = [];
  const queue = [sessionsDirectory];
  while (queue.length > 0 && files.length < MAX_CANDIDATES) {
    const directory = queue.pop();
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (files.length >= MAX_CANDIDATES) break;
      // Never follow a session-storage symlink: it could point at arbitrary host data.
      if (entry.isSymbolicLink()) continue;
      const candidate = join(directory, entry.name);
      if (entry.isDirectory()) {
        queue.push(candidate);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        try {
          const real = realpathSync(candidate);
          if (pathInside(sessionsDirectory, real) && lstatSync(real).isFile()) files.push(real);
        } catch { /* An unreadable candidate is not evidence. */ }
      }
    }
  }
  return files;
}

function parseJsonLines(bytes, lineLimit = Infinity) {
  const parsed = [];
  const lines = bytes.toString("utf8").split("\n");
  for (const line of lines) {
    if (parsed.length >= lineLimit) break;
    if (line.trim() === "") continue;
    try { parsed.push(JSON.parse(line)); } catch { /* A damaged line cannot authenticate a candidate. */ }
  }
  return parsed;
}

function sessionMetaRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.type === "session_meta") return value;
  if (value.payload && typeof value.payload === "object" && value.payload.type === "session_meta") return value.payload;
  return null;
}

function stringsAtKnownKeys(value, keys, found = [], depth = 0) {
  if (depth > 6 || value === null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const child of value) stringsAtKnownKeys(child, keys, found, depth + 1);
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && typeof child === "string" && child.trim() !== "") found.push(child);
    if (child && typeof child === "object") stringsAtKnownKeys(child, keys, found, depth + 1);
  }
  return found;
}

function metadataIdentity(path) {
  if (typeof path !== "string" || path.trim() === "" || path.includes("\0")) return null;
  if (windowsNotationCandidate(path) !== null) return repositoryPathIdentityOrSelf(path);
  if (!isAbsolute(path)) return null;
  try { return repositoryPathIdentityOrSelf(realpathSync(path)); } catch { return null; }
}

function candidateMetadata(filePath, projectIdentity) {
  let bytes;
  try {
    if (statSync(filePath).size > MAX_TRANSCRIPT_BYTES) return null;
    bytes = readFileSync(filePath);
  } catch { return null; }
  const records = parseJsonLines(bytes.subarray(0, MAX_METADATA_BYTES), MAX_METADATA_LINES);
  const metas = records.map(sessionMetaRecord).filter((value) => value !== null);
  if (metas.length === 0) return null;
  const projectPaths = metas.flatMap((meta) => stringsAtKnownKeys(meta, PROJECT_PATH_KEYS));
  const sessionIds = metas.flatMap((meta) => stringsAtKnownKeys(meta, SESSION_ID_KEYS));
  if (projectPaths.length === 0 || sessionIds.length === 0) return null;
  const identities = projectPaths.map(metadataIdentity);
  if (identities.some((identity) => identity === null) || !identities.every((identity) => identity === projectIdentity)) return null;
  const uniqueSessionIds = [...new Set(sessionIds)];
  if (uniqueSessionIds.length !== 1) return null;
  try { return { filePath, sessionId: uniqueSessionIds[0], mtimeMs: statSync(filePath).mtimeMs, bytes }; } catch { return null; }
}

function boundedDetail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replaceAll("\n", " ").replaceAll("\r", " ").trim();
  return normalized === "" ? null : Buffer.from(normalized).subarray(0, MAX_EXCERPT_DETAIL_BYTES).toString("utf8");
}

function firstString(value, keys, depth = 0) {
  if (depth > 5 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = firstString(child, keys, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && typeof child === "string") return child;
    if (child && typeof child === "object") {
      const found = firstString(child, keys, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function operationalExcerpt(bytes) {
  const records = parseJsonLines(bytes);
  const entries = [];
  for (const record of records) {
    const kind = firstString(record, new Set(["type", "event_type", "eventType"]));
    const serializedKind = kind ?? "";
    const tool = firstString(record, new Set(["tool_name", "toolName", "name"]));
    const error = firstString(record, new Set(["error", "error_message", "errorMessage"]));
    const message = firstString(record, new Set(["message"]));
    const relevant = /(?:tool|function|error|failure)/iu.test(serializedKind)
      || error !== null || Boolean(record?.is_error);
    if (!relevant) continue;
    const entry = { kind: serializedKind || (error !== null || record?.is_error ? "error" : "tool-event") };
    if (tool !== null) entry.tool = boundedDetail(tool);
    if (record?.is_error === true || error !== null) entry.outcome = "error";
    const detail = boundedDetail(error ?? message ?? "");
    if (detail !== null) entry.detail = detail;
    entries.push(entry);
  }
  return entries.slice(-MAX_EXCERPT_ENTRIES);
}

/**
 * Recover an excerpt for a known runner.  The explicit `excludeSession` is a
 * required safety proof: without the current session id, this script cannot
 * distinguish a prior matching transcript from the file the caller is writing.
 */
export function recoverRunnerTranscript({ rootDir, runner, excludeSession, env = process.env, homedirFn = homedir } = {}) {
  if (runner !== CODEX_RUNNER) return unavailable(runner ?? "unknown", "runner-transcript-source-unavailable");
  if (typeof excludeSession !== "string" || excludeSession.trim() === "") {
    return unavailable(runner, "current-session-identity-unavailable");
  }
  const root = realDirectory(rootDir);
  if (root === null) return unavailable(runner, "project-root-unavailable");
  const projectIdentity = repositoryPathIdentityOrSelf(root);
  const sessionsDirectory = resolveCodexSessionsDirectory(env, homedirFn);
  if (sessionsDirectory === null) return unavailable(runner, "runner-session-storage-unavailable");
  const candidates = regularJsonlFiles(sessionsDirectory)
    .map((filePath) => candidateMetadata(filePath, projectIdentity))
    .filter((candidate) => candidate !== null && candidate.sessionId !== excludeSession)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (candidates.length === 0) return unavailable(runner, "no-prior-project-matching-transcript");
  const selected = candidates[0];
  const excerpt = operationalExcerpt(selected.bytes);
  if (excerpt.length === 0) return unavailable(runner, "prior-project-matching-transcript-has-no-operational-excerpt");
  return {
    schema: SCHEMA,
    status: "available",
    runner,
    selectedSessionId: selected.sessionId,
    excerpt,
  };
}

function parseArgs(argv) {
  if (argv.length !== 6) return null;
  const fields = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--root", "--runner", "--exclude-session"].includes(flag)
      || typeof value !== "string" || value === "" || fields.has(flag)) return null;
    fields.set(flag, value);
  }
  return {
    rootDir: fields.get("--root"),
    runner: fields.get("--runner"),
    excludeSession: fields.get("--exclude-session"),
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = args === null
    ? unavailable("unknown", "invalid-invocation")
    : recoverRunnerTranscript(args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (isDirectInvocation(import.meta.url)) main();
