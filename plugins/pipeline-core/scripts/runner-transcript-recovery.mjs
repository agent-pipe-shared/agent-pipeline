#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Bounded, read-only recovery of a prior runner transcript.
 *
 * This is intentionally the only command boundary allowed to inspect Codex's private
 * session collection.  Callers cannot supply a session directory or transcript
 * pathname: the Codex location is derived here, candidates must identify the
 * current repository in their own `session_meta` record, and the current session
 * id is excluded before recency is considered.  A raw shell read of a runner
 * home remains outside the lifecycle guard's read scope.
 */
import {
  lstatSync, openSync, readFileSync, readdirSync, readSync, realpathSync, closeSync, statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { auditCurrentRunnerSession } from "../lib/runner-own-session-audit.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { repositoryPathIdentityOrSelf, windowsNotationCandidate } from "../lib/repository-path-identity.mjs";

const SCHEMA = "pipeline.runner-transcript-recovery.v1";
const CODEX_RUNNER = "codex";
const MAX_CANDIDATES = 2_000;
const MAX_METADATA_LINES = 256;
const MAX_METADATA_BYTES = 512 * 1024;
const MAX_EXCERPT_BYTES = 8 * 1024 * 1024;
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

function readTranscriptPrefix(filePath, maximumBytes) {
  let size;
  try {
    size = statSync(filePath).size;
    if (!Number.isSafeInteger(size) || size < 0) return null;
  } catch {
    return null;
  }
  const prefix = Buffer.alloc(Math.min(size, maximumBytes));
  let descriptor;
  try {
    descriptor = openSync(filePath, "r");
    const bytesRead = readSync(descriptor, prefix, 0, prefix.length, 0);
    return prefix.subarray(0, bytesRead);
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Best-effort close after a failed read. */ }
    }
  }
}

function readTranscriptMetadataBytes(filePath) {
  return readTranscriptPrefix(filePath, MAX_METADATA_BYTES);
}

function readTranscriptBytes(filePath) {
  try {
    const size = statSync(filePath).size;
    if (!Number.isSafeInteger(size) || size < 0) return null;
    return readFileSync(filePath);
  } catch {
    return null;
  }
}

function candidateMetadata(filePath, projectIdentity) {
  const metadataBytes = readTranscriptMetadataBytes(filePath);
  if (metadataBytes === null) return null;
  const records = parseJsonLines(metadataBytes, MAX_METADATA_LINES);
  const metas = records.map(sessionMetaRecord).filter((value) => value !== null);
  if (metas.length === 0) return null;
  const projectPaths = metas.flatMap((meta) => stringsAtKnownKeys(meta, PROJECT_PATH_KEYS));
  // Codex's declared session_meta schema uses payload.id (see runner-own-session-audit).
  // Only that metadata record's own id is accepted; arbitrary event ids are not selectors.
  const sessionIds = metas.flatMap((meta) => [
    ...stringsAtKnownKeys(meta, SESSION_ID_KEYS),
    ...[meta.id, meta.payload?.id].filter((id) => typeof id === "string" && id.trim() !== ""),
  ]);
  if (projectPaths.length === 0 || sessionIds.length === 0) return null;
  const identities = projectPaths.map(metadataIdentity);
  if (identities.some((identity) => identity === null) || !identities.every((identity) => identity === projectIdentity)) return null;
  const uniqueSessionIds = [...new Set(sessionIds)];
  if (uniqueSessionIds.length !== 1) return null;
  try { return { filePath, sessionId: uniqueSessionIds[0], mtimeMs: statSync(filePath).mtimeMs }; } catch { return null; }
}

function priorProjectMatchingCandidates({ rootDir, runner, excludeSession, env = process.env, homedirFn = homedir } = {}) {
  if (runner !== CODEX_RUNNER) return { unavailable: unavailable(runner ?? "unknown", "runner-transcript-source-unavailable") };
  if (typeof excludeSession !== "string" || excludeSession.trim() === "") {
    return { unavailable: unavailable(runner, "current-session-identity-unavailable") };
  }
  const root = realDirectory(rootDir);
  if (root === null) return { unavailable: unavailable(runner, "project-root-unavailable") };
  const projectIdentity = repositoryPathIdentityOrSelf(root);
  const sessionsDirectory = resolveCodexSessionsDirectory(env, homedirFn);
  if (sessionsDirectory === null) return { unavailable: unavailable(runner, "runner-session-storage-unavailable") };
  const candidates = regularJsonlFiles(sessionsDirectory)
    .map((filePath) => candidateMetadata(filePath, projectIdentity))
    .filter((candidate) => candidate !== null && candidate.sessionId !== excludeSession)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (candidates.length === 0) {
    return { unavailable: unavailable(runner, "no-prior-project-matching-transcript") };
  }
  return { candidates };
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
  const found = priorProjectMatchingCandidates({ rootDir, runner, excludeSession, env, homedirFn });
  if (found.unavailable) return found.unavailable;
  const selected = found.candidates[0];
  const bytes = readTranscriptPrefix(selected.filePath, MAX_EXCERPT_BYTES);
  const excerpt = bytes === null ? [] : operationalExcerpt(bytes);
  if (excerpt.length === 0) return unavailable(runner, "prior-project-matching-transcript-has-no-operational-excerpt");
  return {
    schema: SCHEMA,
    status: "available",
    runner,
    selectedSessionId: selected.sessionId,
    excerpt,
  };
}

/**
 * List every metadata-authenticated prior session.  This deliberately exposes
 * neither storage paths nor transcript bodies; an empty excerpt is meaningful
 * and does not make an otherwise authenticated session disappear.
 */
export function listRunnerTranscripts(options = {}) {
  const found = priorProjectMatchingCandidates(options);
  if (found.unavailable) return found.unavailable;
  return {
    schema: SCHEMA,
    status: "available",
    runner: CODEX_RUNNER,
    sessions: found.candidates.map((candidate) => ({
      sessionId: candidate.sessionId,
      excerpt: operationalExcerpt(readTranscriptPrefix(candidate.filePath, MAX_EXCERPT_BYTES) ?? Buffer.alloc(0)),
    })),
  };
}

/**
 * Read every project-authenticated segment selected by one public session id.
 * Storage mtime, then pathname, gives a deterministic storage order, not a claim
 * about event chronology. No unrelated/current session or child session is inferred.
 * This explicit read has no transcript size cap. Raw `bytes` are only emitted by
 * the CLI's requested `read` operation; recovery/list stay bounded excerpts.
 */
export function readRunnerTranscript({ sessionId, ...options } = {}) {
  const found = priorProjectMatchingCandidates(options);
  if (found.unavailable) return found.unavailable;
  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    return unavailable(CODEX_RUNNER, "requested-session-unavailable");
  }
  const matches = found.candidates.filter((candidate) => candidate.sessionId === sessionId);
  if (matches.length === 0) return unavailable(CODEX_RUNNER, "requested-session-unavailable");
  const currentRoot = realDirectory(options.rootDir);
  if (currentRoot === null) return unavailable(CODEX_RUNNER, "requested-session-unavailable");
  const projectIdentity = repositoryPathIdentityOrSelf(currentRoot);
  const segments = [...matches].sort((left, right) => left.mtimeMs - right.mtimeMs
    || (left.filePath < right.filePath ? -1 : left.filePath > right.filePath ? 1 : 0));
  const snapshots = [];
  try {
    for (const segment of segments) {
      const before = lstatSync(segment.filePath);
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error("segment-unsafe");
      const identity = candidateMetadata(segment.filePath, projectIdentity);
      if (identity?.sessionId !== sessionId) throw new Error("segment-identity-changed");
      const bytes = readTranscriptBytes(segment.filePath);
      const after = lstatSync(segment.filePath);
      if (bytes === null || before.dev !== after.dev || before.ino !== after.ino
        || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
        || bytes.length !== after.size || !after.isFile() || after.nlink !== 1) throw new Error("segment-changed");
      snapshots.push({ segment, identity: after, bytes });
    }
    // Conserved membership and all physical snapshots are rechecked before any output.
    const fresh = priorProjectMatchingCandidates(options);
    const selectedPaths = fresh.candidates?.filter((candidate) => candidate.sessionId === sessionId)
      .map((candidate) => candidate.filePath).sort();
    if (JSON.stringify(selectedPaths) !== JSON.stringify(segments.map((segment) => segment.filePath).sort())) throw new Error("segments-changed");
    for (const snapshot of snapshots) {
      const after = lstatSync(snapshot.segment.filePath), before = snapshot.identity;
      if (!after.isFile() || after.nlink !== 1 || before.dev !== after.dev || before.ino !== after.ino
        || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error("segment-changed");
    }
  } catch { return unavailable(CODEX_RUNNER, "requested-session-unavailable"); }
  const chunks = [];
  for (const snapshot of snapshots) {
    if (chunks.length > 0 && chunks[chunks.length - 1].at(-1) !== 10) chunks.push(Buffer.from("\n"));
    chunks.push(snapshot.bytes);
  }
  return { schema: SCHEMA, status: "available", runner: CODEX_RUNNER,
    segmentCount: snapshots.length, segmentOrder: "storage-mtime-then-path", bytes: Buffer.concat(chunks) };
}

// ---------------------------------------------------------------------------------------------
// export (ALF-C-N1-02C; item pipeline.forensics-and-audit-evidence-not-reconstructable)
//
// A project-bound, data-minimising export of ONE session: its project-authenticated segments are
// merged and described by counts, per-segment sha256, record counts and first/last timestamps,
// plus the token usage the host recorded. Neither a storage path nor a transcript body is emitted.
//
// Storage adapters (the only runner-specific part):
//   codex        the existing Codex session collection (same candidate authentication as read).
//   claude       <CLAUDE_CONFIG_DIR or ~/.claude>/projects/<project path, every non-alphanumeric
//                character replaced by "-">/<id>.jsonl, direct children only. A file is a segment of
//                session S when its records declare exactly one sessionId, S, and every cwd they
//                declare is this project. Child (sub-agent) sessions are not inferred.
//   antigravity  typed unavailable: its transcript layout is not established, so none is invented.
//                Its usage extractor below is still pure and exported.
// ---------------------------------------------------------------------------------------------
const CLAUDE_RUNNER = "claude";
const ANTIGRAVITY_RUNNER = "antigravity";
const EXPORT_SEGMENT_ORDER = "first-record-timestamp-then-mtime-then-path";
const CODEX_USAGE_KEYS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];
const CLAUDE_USAGE_KEYS = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"];
const ANTIGRAVITY_USAGE_KEYS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"];
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/u;

const noUsage = () => ({ status: "unavailable", reason: "transcript-carries-no-usage" });
const isCounter = (value) => Number.isSafeInteger(value) && value >= 0;

/** The counters a usage object reports, restricted to `keys`; null unless at least one is present and every present one is valid. */
function observedCounters(usage, keys) {
  if (usage === null || typeof usage !== "object" || Array.isArray(usage)) return null;
  const counters = {};
  for (const key of keys) {
    if (usage[key] === undefined) continue;
    if (!isCounter(usage[key])) return null;
    counters[key] = usage[key];
  }
  return Object.keys(counters).length === 0 ? null : counters;
}

function summedUsage(source, observations) {
  if (observations.length === 0) return noUsage();
  const counters = {};
  for (const observation of observations) {
    for (const [key, value] of Object.entries(observation)) counters[key] = (counters[key] ?? 0) + value;
  }
  return Object.values(counters).every(isCounter)
    ? { status: "available", source, observations: observations.length, counters }
    : noUsage();
}

/** Codex: the last COMPLETE token_count total_token_usage; an invalid one never replaces a valid one. */
function codexUsage(records) {
  let last = null;
  for (const row of records) {
    if (row?.type !== "event_msg" || row.payload?.type !== "token_count") continue;
    const usage = row.payload.info?.total_token_usage;
    if (usage && typeof usage === "object" && CODEX_USAGE_KEYS.every((key) => isCounter(usage[key]))) {
      last = Object.fromEntries(CODEX_USAGE_KEYS.map((key) => [key, usage[key]]));
    }
  }
  return last === null ? noUsage() : { status: "available", source: "codex-token-count-total", observations: 1, counters: last };
}

/**
 * Claude: assistant message.usage, counted ONCE per unique message.id across the merged segments (a
 * message is streamed as several rows and re-appears in a continuation segment); the last row of an
 * id carries its final figures. Synthetic messages and rows without an id or usage are never counted.
 */
function claudeUsage(records) {
  const byMessage = new Map();
  for (const row of records) {
    const message = row?.type === "assistant" ? row.message : null;
    if (message === null || typeof message !== "object" || typeof message.id !== "string" || message.id === ""
      || message.model === "<synthetic>") continue;
    const counters = observedCounters(message.usage, CLAUDE_USAGE_KEYS);
    if (counters !== null) byMessage.set(message.id, counters);
  }
  return summedUsage("claude-assistant-message-usage", [...byMessage.values()]);
}

/** Antigravity: the sum of every turn.completed usage. Pure; no storage adapter exists for this runner yet. */
function antigravityUsage(records) {
  const turns = [];
  for (const row of records) {
    if (row?.type !== "turn.completed") continue;
    const counters = observedCounters(row.usage, ANTIGRAVITY_USAGE_KEYS);
    if (counters !== null) turns.push(counters);
  }
  return summedUsage("antigravity-turn-completed", turns);
}

/** Per-runner usage over already-parsed, merged records; `{status:"unavailable"}` when the transcript carries none. */
export function extractRunnerUsage(runner, records) {
  if (!Array.isArray(records)) return noUsage();
  if (runner === CODEX_RUNNER) return codexUsage(records);
  if (runner === CLAUDE_RUNNER) return claudeUsage(records);
  if (runner === ANTIGRAVITY_RUNNER) return antigravityUsage(records);
  return noUsage();
}

function parseJsonLinesCounted(bytes) {
  const records = [];
  let unparsedLineCount = 0;
  for (const line of bytes.toString("utf8").split("\n")) {
    if (line.trim() === "") continue;
    try { records.push(JSON.parse(line)); } catch { unparsedLineCount += 1; }
  }
  return { records, unparsedLineCount };
}

function recordTimestampMs(record) {
  if (record === null || typeof record !== "object") return null;
  for (const candidate of [record.timestamp, record.payload?.timestamp]) {
    if (typeof candidate !== "string" || !ISO_TIMESTAMP.test(candidate)) continue;
    const ms = Date.parse(candidate);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

const isoOrNull = (ms) => (ms === null ? null : new Date(ms).toISOString());

function claudeCandidateMetadata(filePath, projectIdentity) {
  const metadataBytes = readTranscriptMetadataBytes(filePath);
  if (metadataBytes === null) return null;
  const sessionIds = [];
  const projectPaths = [];
  for (const record of parseJsonLines(metadataBytes, MAX_METADATA_LINES)) {
    if (record === null || typeof record !== "object") continue;
    if (typeof record.sessionId === "string" && record.sessionId.trim() !== "") sessionIds.push(record.sessionId);
    if (typeof record.cwd === "string" && record.cwd.trim() !== "") projectPaths.push(record.cwd);
  }
  if (sessionIds.length === 0 || projectPaths.length === 0) return null;
  const identities = projectPaths.map(metadataIdentity);
  if (identities.some((identity) => identity === null) || !identities.every((identity) => identity === projectIdentity)) return null;
  const uniqueSessionIds = [...new Set(sessionIds)];
  if (uniqueSessionIds.length !== 1) return null;
  try { return { filePath, sessionId: uniqueSessionIds[0], mtimeMs: statSync(filePath).mtimeMs }; } catch { return null; }
}

function claudeProjectCandidates({ rootDir, excludeSession, env = process.env, homedirFn = homedir } = {}) {
  if (typeof excludeSession !== "string" || excludeSession.trim() === "") {
    return { unavailable: unavailable(CLAUDE_RUNNER, "current-session-identity-unavailable") };
  }
  const root = realDirectory(rootDir);
  if (root === null) return { unavailable: unavailable(CLAUDE_RUNNER, "project-root-unavailable") };
  const configured = env?.CLAUDE_CONFIG_DIR;
  const claudeHome = typeof configured === "string" && isAbsolute(configured) ? configured : join(homedirFn(), ".claude");
  const projectDirectory = realDirectory(join(claudeHome, "projects", root.replace(/[^A-Za-z0-9]/gu, "-")));
  if (projectDirectory === null) return { unavailable: unavailable(CLAUDE_RUNNER, "runner-session-storage-unavailable") };
  const projectIdentity = repositoryPathIdentityOrSelf(root);
  let entries;
  try { entries = readdirSync(projectDirectory, { withFileTypes: true }); } catch { entries = []; }
  const candidates = [];
  for (const entry of entries) {
    if (candidates.length >= MAX_CANDIDATES) break;
    // Never follow a storage symlink; direct children only.
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    try {
      const real = realpathSync(join(projectDirectory, entry.name));
      if (!pathInside(projectDirectory, real) || !lstatSync(real).isFile()) continue;
      const candidate = claudeCandidateMetadata(real, projectIdentity);
      if (candidate !== null && candidate.sessionId !== excludeSession) candidates.push(candidate);
    } catch { /* An unreadable candidate is not evidence. */ }
  }
  if (candidates.length === 0) return { unavailable: unavailable(CLAUDE_RUNNER, "no-prior-project-matching-transcript") };
  return { candidates };
}

function exportCandidates(options) {
  // Codex, Antigravity and unknown runners resolve through the Codex adapter, which types every non-Codex
  // runner as `runner-transcript-source-unavailable`; only Claude has a second adapter.
  return options.runner === CLAUDE_RUNNER ? claudeProjectCandidates(options) : priorProjectMatchingCandidates(options);
}

/** Read every segment under physical-identity checks, then recheck membership and identity before any output. */
function snapshotExportSegments({ segments, sessionId, authenticate, refreshedPaths }) {
  const snapshots = [];
  for (const segment of segments) {
    const before = lstatSync(segment.filePath);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error("segment-unsafe");
    if (authenticate(segment.filePath)?.sessionId !== sessionId) throw new Error("segment-identity-changed");
    const bytes = readTranscriptBytes(segment.filePath);
    const after = lstatSync(segment.filePath);
    if (bytes === null || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || bytes.length !== after.size || !after.isFile() || after.nlink !== 1) throw new Error("segment-changed");
    snapshots.push({ segment, identity: after, bytes });
  }
  if (JSON.stringify([...refreshedPaths()].sort()) !== JSON.stringify(segments.map((segment) => segment.filePath).sort())) {
    throw new Error("segments-changed");
  }
  for (const snapshot of snapshots) {
    const after = lstatSync(snapshot.segment.filePath), before = snapshot.identity;
    if (!after.isFile() || after.nlink !== 1 || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error("segment-changed");
  }
  return snapshots;
}

/**
 * Export one prior project-matching session: counts, per-segment sha256, record counts, first/last
 * timestamps and per-runner usage; no path and no content. Segments are ordered by the timestamp of
 * their first timestamped record (a segment with none sorts last), then by mtime, then by path, so a
 * touched earlier segment does not reorder the session. Like `read`, this has no transcript size cap.
 */
export function exportRunnerTranscript({ sessionId, ...options } = {}) {
  const runner = typeof options.runner === "string" && options.runner !== "" ? options.runner : "unknown";
  const found = exportCandidates(options);
  if (found.unavailable) return found.unavailable;
  const failed = () => unavailable(runner, "requested-session-unavailable");
  if (typeof sessionId !== "string" || sessionId.trim() === "") return failed();
  const matches = found.candidates.filter((candidate) => candidate.sessionId === sessionId);
  const currentRoot = realDirectory(options.rootDir);
  if (matches.length === 0 || currentRoot === null) return failed();
  const projectIdentity = repositoryPathIdentityOrSelf(currentRoot);
  const authenticate = (filePath) => (runner === CLAUDE_RUNNER ? claudeCandidateMetadata : candidateMetadata)(filePath, projectIdentity);
  let snapshots;
  try {
    snapshots = snapshotExportSegments({
      segments: matches,
      sessionId,
      authenticate,
      refreshedPaths: () => (exportCandidates(options).candidates ?? [])
        .filter((candidate) => candidate.sessionId === sessionId).map((candidate) => candidate.filePath),
    });
  } catch { return failed(); }
  const parsed = snapshots.map((snapshot) => {
    const { records, unparsedLineCount } = parseJsonLinesCounted(snapshot.bytes);
    const stamps = records.map(recordTimestampMs).filter((ms) => ms !== null);
    return {
      records,
      unparsedLineCount,
      filePath: snapshot.segment.filePath,
      mtimeMs: snapshot.identity.mtimeMs,
      sha256: createHash("sha256").update(snapshot.bytes).digest("hex"),
      byteLength: snapshot.bytes.length,
      firstMs: stamps.length > 0 ? stamps[0] : null,
      lastMs: stamps.length > 0 ? stamps[stamps.length - 1] : null,
    };
  });
  parsed.sort((left, right) => {
    if ((left.firstMs === null) !== (right.firstMs === null)) return left.firstMs === null ? 1 : -1;
    if (left.firstMs !== right.firstMs) return left.firstMs - right.firstMs;
    return left.mtimeMs - right.mtimeMs
      || (left.filePath < right.filePath ? -1 : left.filePath > right.filePath ? 1 : 0);
  });
  const firsts = parsed.map((segment) => segment.firstMs).filter((ms) => ms !== null);
  const lasts = parsed.map((segment) => segment.lastMs).filter((ms) => ms !== null);
  return {
    schema: SCHEMA,
    status: "available",
    runner,
    sessionId,
    segmentCount: parsed.length,
    segmentOrder: EXPORT_SEGMENT_ORDER,
    recordCount: parsed.reduce((total, segment) => total + segment.records.length, 0),
    unparsedLineCount: parsed.reduce((total, segment) => total + segment.unparsedLineCount, 0),
    firstTimestamp: isoOrNull(firsts.length > 0 ? Math.min(...firsts) : null),
    lastTimestamp: isoOrNull(lasts.length > 0 ? Math.max(...lasts) : null),
    segments: parsed.map((segment, ordinal) => ({
      ordinal,
      sha256: segment.sha256,
      byteLength: segment.byteLength,
      recordCount: segment.records.length,
      unparsedLineCount: segment.unparsedLineCount,
      firstTimestamp: isoOrNull(segment.firstMs),
      lastTimestamp: isoOrNull(segment.lastMs),
    })),
    usage: extractRunnerUsage(runner, parsed.flatMap((segment) => segment.records)),
  };
}

function parseArgs(argv) {
  if (argv[0] === "audit-current") {
    if (argv.length !== 7) return null;
    const fields = new Map();
    for (let index = 1; index < argv.length; index += 2) {
      const flag = argv[index], value = argv[index + 1];
      if (!["--root", "--runner", "--metadata-consent"].includes(flag)
        || typeof value !== "string" || !value || value.startsWith("-") || fields.has(flag)) return null;
      fields.set(flag, value);
    }
    return { operation: "audit-current", rootDir: fields.get("--root"), runner: fields.get("--runner"), metadataConsent: fields.get("--metadata-consent") };
  }
  const operation = argv[0] === "list" || argv[0] === "read" || argv[0] === "export" ? argv[0] : "legacy";
  const values = operation === "legacy" ? argv : argv.slice(1);
  const takesSessionId = operation === "read" || operation === "export";
  const expectedLength = takesSessionId ? 8 : 6;
  if (values.length !== expectedLength) return null;
  const fields = new Map();
  const permitted = takesSessionId
    ? ["--root", "--runner", "--exclude-session", "--session-id"]
    : ["--root", "--runner", "--exclude-session"];
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!permitted.includes(flag) || typeof value !== "string" || value === "" || value.startsWith("-") || fields.has(flag)) return null;
    fields.set(flag, value);
  }
  return {
    operation,
    rootDir: fields.get("--root"),
    runner: fields.get("--runner"),
    excludeSession: fields.get("--exclude-session"),
    sessionId: fields.get("--session-id"),
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = args === null ? unavailable("unknown", "invalid-invocation") : (() => {
    if (args.operation === "audit-current") return auditCurrentRunnerSession(args);
    if (args.operation === "list") return listRunnerTranscripts(args);
    if (args.operation === "read") return readRunnerTranscript(args);
    if (args.operation === "export") return exportRunnerTranscript(args);
    return recoverRunnerTranscript(args);
  })();
  if (args?.operation === "read" && result.status === "available") process.stdout.write(result.bytes);
  else process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (isDirectInvocation(import.meta.url)) main();
