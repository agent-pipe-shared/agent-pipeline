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
import { antigravityArtifactLayoutIsValid, artifactPathIsPhysical } from "../lib/current-session-artifact-export.mjs";
import { isCredentialReadTarget } from "../lib/passive-read-policy.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { resolveModelRoleHostSessionIdentity } from "../lib/model-role-host-identity.mjs";
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
// An id or label that is safe as a single path component and as an emitted value (no separator, no traversal, bounded).
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

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

function regularJsonlFiles(sessionsDirectory, maxCandidates = MAX_CANDIDATES, state = {}) {
  const files = [];
  const queue = [sessionsDirectory];
  while (queue.length > 0 && files.length < maxCandidates) {
    const directory = queue.pop();
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (files.length >= maxCandidates) { state.boundReached = true; break; }
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
  if (queue.length > 0 && files.length >= maxCandidates) state.boundReached = true;
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
  try { return { filePath, sessionId: uniqueSessionIds[0], mtimeMs: statSync(filePath).mtimeMs, spawn: spawnProvenance(metas) }; } catch { return null; }
}

/**
 * The parent a Codex session was SPAWNED from, as its own session_meta records it (`source.subagent.thread_spawn`; the same
 * spelling lib/runner-own-session-audit.mjs assumes -- not verified against a live store). A fork (`forked_from_id`) copies
 * history and is not a child. Null unless exactly one valid parent is declared.
 */
function spawnProvenance(metas) {
  const found = metas.map((meta) => {
    const body = meta.payload !== null && typeof meta.payload === "object" ? meta.payload : meta;
    const spawn = body?.source?.subagent?.thread_spawn;
    if (spawn === null || typeof spawn !== "object" || typeof spawn.parent_thread_id !== "string" || !SAFE_ID.test(spawn.parent_thread_id)) return null;
    const role = [body.agent_role, spawn.agent_role].find((value) => typeof value === "string" && SAFE_LABEL.test(value));
    return { parentId: spawn.parent_thread_id, depth: Number.isSafeInteger(spawn.depth) && spawn.depth >= 0 ? spawn.depth : null, role: role ?? null };
  }).filter((entry) => entry !== null);
  return found.length > 0 && found.every((entry) => entry.parentId === found[0].parentId) ? found[0] : null;
}

/**
 * A claimed current session (`--exclude-session`) is only a claim. When the host resolves its own
 * identity for this runner and it disagrees (or the host's own sources conflict), refuse with the
 * typed identity code instead of reading a transcript on the strength of a wrong claim. An identity the
 * host cannot supply is not a conflict: nothing is compared. `hostHookSessionId` is the identity the
 * Antigravity hook supplied (no environment variable carries it).
 */
function claimedSessionConflict({ runner, excludeSession, env = process.env, hostHookSessionId = null } = {}) {
  if (typeof excludeSession !== "string" || excludeSession.trim() === "") return null;
  const host = resolveModelRoleHostSessionIdentity({ runner, env, hostHookSessionId });
  if (host.code === "MODEL-ROLE-SESSION-IDENTITY-CONFLICT"
    || (host.ok && host.sessionId !== excludeSession)) {
    return unavailable(runner ?? "unknown", "MODEL-ROLE-SESSION-IDENTITY-CONFLICT");
  }
  return null;
}

function priorProjectMatchingCandidates({ rootDir, runner, excludeSession, env = process.env, homedirFn = homedir, limits } = {}) {
  if (runner !== CODEX_RUNNER) return { unavailable: unavailable(runner ?? "unknown", "runner-transcript-source-unavailable") };
  if (typeof excludeSession !== "string" || excludeSession.trim() === "") {
    return { unavailable: unavailable(runner, "current-session-identity-unavailable") };
  }
  const root = realDirectory(rootDir);
  if (root === null) return { unavailable: unavailable(runner, "project-root-unavailable") };
  const projectIdentity = repositoryPathIdentityOrSelf(root);
  const sessionsDirectory = resolveCodexSessionsDirectory(env, homedirFn);
  if (sessionsDirectory === null) return { unavailable: unavailable(runner, "runner-session-storage-unavailable") };
  const enumeration = {};
  const candidates = regularJsonlFiles(sessionsDirectory, limits?.maxCandidates ?? MAX_CANDIDATES, enumeration)
    .map((filePath) => candidateMetadata(filePath, projectIdentity))
    .filter((candidate) => candidate !== null && candidate.sessionId !== excludeSession)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (candidates.length === 0) {
    return { unavailable: unavailable(runner, "no-prior-project-matching-transcript") };
  }
  return { candidates, boundReached: enumeration.boundReached === true };
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
  const conflict = claimedSessionConflict(options);
  if (conflict !== null) return conflict;
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
  const conflict = claimedSessionConflict(options);
  if (conflict !== null) return conflict;
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
//                declare is this project. Child (sub-agent) sessions live beside it, never as segments:
//                <project directory>/<S>/subagents/agent-<agentId>.jsonl with agent-<agentId>.meta.json
//                ({agentType, toolUseId, spawnDepth}; the layout guard-dispatch-budget.mjs and
//                usage-ledger.mjs already rely on). A child is listed only when its own records declare
//                session S and this project; its turn span in S comes from the meta toolUseId matched to
//                the parent's tool_use / tool_result blocks.
//   codex        a child is a project-authenticated session whose own session_meta declares
//                source.subagent.thread_spawn.parent_thread_id = S (the spelling lib/runner-own-session-audit.mjs
//                assumes; not verified against a live store). Its turn span comes from the parent's
//                spawn_agent call/output and the last parent call or output naming the child.
//   antigravity  the established brain layout (lib/current-session-artifact-export.mjs): the artifact root
//                <...>/brain/<conversationId> and <artifactRoot>/.system_generated/logs/transcript.jsonl,
//                resolved ONLY from the host context the Antigravity pretool hook supplies
//                (`antigravityArtifactHost`, shaped by antigravityArtifactHostContext); no directory is listed or
//                guessed, and no environment variable carries it, so the CLI (which cannot receive it) names that
//                reason. The export is of the CURRENT conversation only. Child sessions are not recorded there.
//
// Turn model (emitted as `turns.model`): claude = one distinct assistant message.id (usage-ledger.mjs convention);
// codex = one event_msg task_started record; antigravity = one turn.started record. A child's startTurnIndex is the
// parent turn that issued it and endTurnIndex the parent turn in progress at the last parent record that names it
// (Claude: its tool_result; Codex: the last call or output naming it); null where the runner does not record it.
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

function claudeProjectCandidates({ rootDir, excludeSession, env = process.env, homedirFn = homedir, limits } = {}) {
  const maxCandidates = limits?.maxCandidates ?? MAX_CANDIDATES;
  let boundReached = false;
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
    // Never follow a storage symlink; direct children only.
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    if (candidates.length >= maxCandidates) { boundReached = true; break; }
    try {
      const real = realpathSync(join(projectDirectory, entry.name));
      if (!pathInside(projectDirectory, real) || !lstatSync(real).isFile()) continue;
      const candidate = claudeCandidateMetadata(real, projectIdentity);
      if (candidate !== null && candidate.sessionId !== excludeSession) candidates.push(candidate);
    } catch { /* An unreadable candidate is not evidence. */ }
  }
  if (candidates.length === 0) return { unavailable: unavailable(CLAUDE_RUNNER, "no-prior-project-matching-transcript") };
  return { candidates, boundReached, projectDirectory };
}

function exportCandidates(options) {
  // Codex, Antigravity and unknown runners resolve through the Codex adapter, which types every non-Codex
  // runner as `runner-transcript-source-unavailable`; only Claude has a second adapter.
  return options.runner === CLAUDE_RUNNER ? claudeProjectCandidates(options) : priorProjectMatchingCandidates(options);
}

/** Segment order: first timestamped record (none last), then mtime, then path. */
function compareSegments(left, right) {
  if ((left.firstMs === null) !== (right.firstMs === null)) return left.firstMs === null ? 1 : -1;
  if (left.firstMs !== right.firstMs) return left.firstMs - right.firstMs;
  return left.mtimeMs - right.mtimeMs
    || (left.filePath < right.filePath ? -1 : left.filePath > right.filePath ? 1 : 0);
}

const MAX_CHILD_SESSIONS = 256;
const MAX_TURN_MARKERS = 500;
const MAX_CHILD_META_BYTES = 64 * 1024;
const TURN_MODELS = { claude: "claude-assistant-message-id", codex: "codex-task-started", antigravity: "antigravity-turn-started" };

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Turn markers over the merged records. `turnAt[i]` is the turn in progress at record i (null before the first turn);
 * for a Claude assistant row it is the turn of its own message, so a message re-appearing in a later segment keeps its turn.
 */
function describeTurns(runner, records) {
  const markers = [];
  const turnAt = new Array(records.length).fill(null);
  let latest = null;
  if (runner === CLAUDE_RUNNER) {
    const ordinalOf = new Map();
    records.forEach((row, index) => {
      const message = row?.type === "assistant" && isObject(row.message) && row.message.model !== "<synthetic>" ? row.message : null;
      if (message !== null) {
        const id = typeof message.id === "string" && message.id !== "" ? message.id : null;
        let ordinal = id === null ? undefined : ordinalOf.get(id);
        if (ordinal === undefined) {
          ordinal = markers.length;
          if (id !== null) ordinalOf.set(id, ordinal);
          markers.push({ index: ordinal, record: index, timestamp: isoOrNull(recordTimestampMs(row)) });
          latest = ordinal;
        }
        turnAt[index] = ordinal;
      } else {
        turnAt[index] = latest;
      }
    });
  } else {
    const isTurnStart = runner === CODEX_RUNNER
      ? (row) => row?.type === "event_msg" && row.payload?.type === "task_started"
      : (row) => row?.type === "turn.started";
    records.forEach((row, index) => {
      if (isTurnStart(row)) {
        latest = markers.length;
        markers.push({ index: latest, record: index, timestamp: isoOrNull(recordTimestampMs(row)) });
      }
      turnAt[index] = latest;
    });
  }
  return {
    turns: { model: TURN_MODELS[runner] ?? "unknown", count: markers.length, markersTruncated: markers.length > MAX_TURN_MARKERS, markers: markers.slice(0, MAX_TURN_MARKERS) },
    turnAt,
  };
}

/** One regular, single-link file read under before/after physical-identity checks; throws when it is unsafe or changed. */
function readStableFile(filePath, maximumBytes = Infinity) {
  const before = lstatSync(filePath);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maximumBytes) throw new Error("file-unsafe");
  const bytes = readTranscriptBytes(filePath);
  const after = lstatSync(filePath);
  if (bytes === null || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length !== after.size
    || !after.isFile() || after.nlink !== 1) throw new Error("file-changed");
  return bytes;
}

/** The recorded fields of a child transcript; counts, digest and timestamps only. */
function childTranscriptSummary(runner, chunks) {
  const bytes = Buffer.concat(chunks);
  const { records, unparsedLineCount } = parseJsonLinesCounted(bytes);
  const stamps = records.map(recordTimestampMs).filter((ms) => ms !== null);
  return {
    records,
    transcript: {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
      recordCount: records.length,
      unparsedLineCount,
      firstTimestamp: isoOrNull(stamps.length > 0 ? stamps[0] : null),
      lastTimestamp: isoOrNull(stamps.length > 0 ? stamps[stamps.length - 1] : null),
    },
    usage: extractRunnerUsage(runner, records),
  };
}

function childEntry(childId, agentType, spawnDepth, span, summary) {
  return {
    childId, agentType, spawnDepth,
    startTurnIndex: span.start, endTurnIndex: span.end,
    transcript: summary.transcript, usage: summary.usage,
  };
}

function sortedChildren(children) {
  return children.sort((left, right) => {
    if ((left.startTurnIndex === null) !== (right.startTurnIndex === null)) return left.startTurnIndex === null ? 1 : -1;
    if (left.startTurnIndex !== right.startTurnIndex) return left.startTurnIndex - right.startTurnIndex;
    return left.childId < right.childId ? -1 : left.childId > right.childId ? 1 : 0;
  });
}

function childResult(children, flags) {
  const reasons = [
    ...(flags.rejected > 0 ? ["child-session-rejected"] : []),
    ...(flags.boundReached ? ["child-bound-reached"] : []),
    ...(flags.skippedRecords ? ["child-records-skipped"] : []),
    ...(flags.nested ? ["nested-workflow-children-not-listed"] : []),
  ];
  return { value: sortedChildren(children), incompleteReasons: reasons };
}

const typedChildren = (reason) => ({ value: reason, incompleteReasons: [] });

/**
 * Claude: the parent's own tool_use / tool_result blocks locate the child in the parent's turns through the meta toolUseId.
 * Returns where the call (`start`) and its first result (`end`) sit, by turn.
 */
function claudeToolSpans(records, turnAt) {
  const calls = new Map();
  const results = new Map();
  records.forEach((row, index) => {
    const content = isObject(row?.message) && Array.isArray(row.message.content) ? row.message.content : [];
    for (const block of content) {
      if (!isObject(block)) continue;
      if (row.type === "assistant" && block.type === "tool_use" && typeof block.id === "string" && !calls.has(block.id)) calls.set(block.id, index);
      if (row.type === "user" && block.type === "tool_result" && typeof block.tool_use_id === "string" && !results.has(block.tool_use_id)) results.set(block.tool_use_id, index);
    }
  });
  return (toolUseId) => {
    if (toolUseId === null || !calls.has(toolUseId)) return { start: null, end: null };
    return { start: turnAt[calls.get(toolUseId)], end: results.has(toolUseId) ? turnAt[results.get(toolUseId)] : null };
  };
}

function claudeChildMeta(directory, agentId) {
  const none = { agentType: null, toolUseId: null, spawnDepth: null };
  try {
    const meta = JSON.parse(readStableFile(join(directory, `agent-${agentId}.meta.json`), MAX_CHILD_META_BYTES).toString("utf8"));
    if (!isObject(meta)) return none;
    return {
      agentType: typeof meta.agentType === "string" && SAFE_LABEL.test(meta.agentType) ? meta.agentType : null,
      toolUseId: typeof meta.toolUseId === "string" && SAFE_LABEL.test(meta.toolUseId) ? meta.toolUseId : null,
      spawnDepth: Number.isSafeInteger(meta.spawnDepth) && meta.spawnDepth >= 0 ? meta.spawnDepth : null,
    };
  } catch { return none; }
}

/** Claude child sessions of `sessionId`: <project directory>/<sessionId>/subagents/agent-<id>.jsonl, never followed through a link. */
function claudeChildSessions({ projectDirectory, sessionId, records, turnView, projectIdentity }) {
  const unavailableStorage = typedChildren("child-storage-unavailable");
  if (typeof projectDirectory !== "string" || !SAFE_ID.test(sessionId)) return unavailableStorage;
  const sessionDirectory = join(projectDirectory, sessionId);
  const subagents = join(sessionDirectory, "subagents");
  let directory;
  try {
    for (const candidate of [sessionDirectory, subagents]) {
      let stat;
      try { stat = lstatSync(candidate); } catch (error) { if (error?.code === "ENOENT") return childResult([], {}); throw error; }
      if (stat.isSymbolicLink() || !stat.isDirectory()) return unavailableStorage;
    }
    directory = realpathSync(subagents);
    if (!pathInside(projectDirectory, directory) || directory === projectDirectory) return unavailableStorage;
  } catch { return unavailableStorage; }
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return unavailableStorage; }
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  const flags = { rejected: 0, boundReached: false, skippedRecords: false, nested: false };
  const spanOf = claudeToolSpans(records, turnView.turnAt);
  const children = [];
  for (const entry of entries) {
    if (entry.name === "workflows" && entry.isDirectory()) { flags.nested = true; continue; }
    const named = /^agent-([A-Za-z0-9][A-Za-z0-9_.-]{0,127})\.jsonl$/u.exec(entry.name);
    // A linked entry is skipped, never read.
    if (named === null || entry.isSymbolicLink() || !entry.isFile()) continue;
    if (children.length + flags.rejected >= MAX_CHILD_SESSIONS) { flags.boundReached = true; break; }
    const agentId = named[1];
    let bytes;
    try { bytes = readStableFile(join(directory, entry.name)); } catch { flags.rejected += 1; continue; }
    const summary = childTranscriptSummary(CLAUDE_RUNNER, [bytes]);
    const declaredSessions = summary.records.flatMap((row) => (typeof row?.sessionId === "string" ? [row.sessionId] : []));
    const declaredAgents = summary.records.flatMap((row) => (typeof row?.agentId === "string" ? [row.agentId] : []));
    const declaredPaths = summary.records.flatMap((row) => (typeof row?.cwd === "string" && row.cwd.trim() !== "" ? [row.cwd] : []));
    const authentic = declaredSessions.length > 0 && declaredSessions.every((id) => id === sessionId)
      && declaredAgents.every((id) => id === agentId)
      && declaredPaths.length > 0 && declaredPaths.map(metadataIdentity).every((identity) => identity !== null && identity === projectIdentity);
    if (!authentic) { flags.rejected += 1; continue; }
    if (summary.transcript.unparsedLineCount > 0) flags.skippedRecords = true;
    const meta = claudeChildMeta(directory, agentId);
    children.push(childEntry(agentId, meta.agentType, meta.spawnDepth, spanOf(meta.toolUseId), summary));
  }
  return childResult(children, flags);
}

/** The text of a function-call payload as parsed JSON when it is JSON, else the raw string. */
function payloadValue(raw) {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

/** Codex child sessions: project-authenticated candidates whose own session_meta names `sessionId` as the spawning parent. */
function codexChildSessions({ found, sessionId, records, turnView, projectIdentity }) {
  const spawned = (found?.candidates ?? []).filter((candidate) => candidate.spawn?.parentId === sessionId && candidate.sessionId !== sessionId);
  const byChild = new Map();
  for (const candidate of spawned) byChild.set(candidate.sessionId, [...(byChild.get(candidate.sessionId) ?? []), candidate]);
  const spawnCalls = new Map();
  const spawnOutputs = new Map();
  records.forEach((row, index) => {
    const payload = row?.type === "response_item" && isObject(row.payload) ? row.payload : null;
    if (payload === null) return;
    if (payload.type === "function_call" && payload.name === "spawn_agent" && typeof payload.call_id === "string") spawnCalls.set(payload.call_id, index);
    if (payload.type === "function_call_output") {
      const value = payloadValue(payload.output);
      const agentId = isObject(value) && typeof value.agent_id === "string" ? value.agent_id : null;
      if (agentId !== null && !spawnOutputs.has(agentId)) spawnOutputs.set(agentId, { index, callId: payload.call_id });
    }
  });
  const spanOf = (childId) => {
    const output = spawnOutputs.get(childId);
    if (output === undefined) return { start: null, end: null };
    const startRecord = spawnCalls.get(output.callId) ?? output.index;
    let lastRecord = output.index;
    records.forEach((row, index) => {
      const payload = row?.type === "response_item" && isObject(row.payload) ? row.payload : null;
      if (payload !== null && (payload.type === "function_call" || payload.type === "function_call_output")
        && index > lastRecord && JSON.stringify(payload).includes(childId)) lastRecord = index;
    });
    return { start: turnView.turnAt[startRecord], end: turnView.turnAt[lastRecord] };
  };
  const flags = { rejected: 0, boundReached: false, skippedRecords: false, nested: false };
  const children = [];
  for (const [childId, segments] of [...byChild.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
    if (children.length + flags.rejected >= MAX_CHILD_SESSIONS) { flags.boundReached = true; break; }
    try {
      const read = segments.map((segment) => {
        const bytes = readStableFile(segment.filePath);
        if (candidateMetadata(segment.filePath, projectIdentity)?.sessionId !== childId) throw new Error("segment-identity-changed");
        const summary = childTranscriptSummary(CODEX_RUNNER, [bytes]);
        return { bytes, mtimeMs: statSync(segment.filePath).mtimeMs, filePath: segment.filePath, firstMs: recordTimestampMs(summary.records[0]), spawn: segment.spawn };
      }).sort(compareSegments);
      const chunks = [];
      for (const segment of read) {
        if (chunks.length > 0 && chunks[chunks.length - 1].at(-1) !== 10) chunks.push(Buffer.from("\n"));
        chunks.push(segment.bytes);
      }
      const summary = childTranscriptSummary(CODEX_RUNNER, chunks);
      if (summary.transcript.unparsedLineCount > 0) flags.skippedRecords = true;
      children.push(childEntry(childId, read[0].spawn.role, read[0].spawn.depth, spanOf(childId), summary));
    } catch { flags.rejected += 1; }
  }
  return childResult(children, flags);
}

/** Child provenance per runner: a list where the runner records children, otherwise a typed reason. */
function childProvenance({ runner, sessionId, found, options, records, turnView }) {
  if (runner === ANTIGRAVITY_RUNNER) return typedChildren("antigravity-child-sessions-not-recorded");
  const root = realDirectory(options.rootDir);
  if (root === null) return typedChildren("child-storage-unavailable");
  const projectIdentity = repositoryPathIdentityOrSelf(root);
  if (runner === CLAUDE_RUNNER) return claudeChildSessions({ projectDirectory: found.projectDirectory, sessionId, records, turnView, projectIdentity });
  if (runner === CODEX_RUNNER) return codexChildSessions({ found, sessionId, records, turnView, projectIdentity });
  return typedChildren("child-storage-unavailable");
}

/**
 * Antigravity: the CURRENT conversation only. The brain root and transcript come from the host context the pretool hook supplies
 * and from nowhere else: no directory is listed or guessed, the layout is the one shared with the artifact-copy route, and the
 * transcript must be a physical (non-symlink) regular file outside every credential root.
 */
function exportAntigravityTranscript(sessionId, options) {
  const host = options.antigravityArtifactHost;
  if (!isObject(host)) return unavailable(ANTIGRAVITY_RUNNER, "antigravity-host-context-unavailable");
  if (typeof options.excludeSession !== "string" || options.excludeSession.trim() === "") {
    return unavailable(ANTIGRAVITY_RUNNER, "current-session-identity-unavailable");
  }
  const root = realDirectory(options.rootDir);
  if (root === null) return unavailable(ANTIGRAVITY_RUNNER, "project-root-unavailable");
  const invalid = () => unavailable(ANTIGRAVITY_RUNNER, "antigravity-host-context-invalid");
  const homeDirectory = typeof options.homedirFn === "function" ? options.homedirFn : homedir;
  // The credential screen is the shared one (PASSIVE_READ_CREDENTIAL_ROOTS); only its two machine-plane lookups are seams, so a
  // test never touches a real machine plane. Any failure of the screen counts as "credential" (fail closed).
  const seams = isObject(options.credentialScreen) ? options.credentialScreen : {};
  let credential = true;
  try {
    credential = [host.transcriptPath, host.artifactDirectoryPath].some((target) => isCredentialReadTarget(target, {
      rootDir: root, homeDir: homeDirectory(),
      ...(typeof seams.machinePlaneRead === "function" ? { machinePlaneRead: seams.machinePlaneRead } : {}),
      ...(typeof seams.repoKeyDirectory === "function" ? { repoKeyDirectory: seams.repoKeyDirectory } : {}),
    }));
  } catch { credential = true; }
  if (!antigravityArtifactLayoutIsValid(host, root) || !artifactPathIsPhysical(host.transcriptPath, "file") || credential) return invalid();
  const conflict = claimedSessionConflict({ ...options, runner: ANTIGRAVITY_RUNNER, hostHookSessionId: host.conversationId });
  if (conflict !== null) return conflict;
  if (sessionId !== host.conversationId) return unavailable(ANTIGRAVITY_RUNNER, "requested-session-unavailable");
  let snapshots;
  try {
    snapshots = snapshotExportSegments({
      segments: [{ filePath: host.transcriptPath, sessionId }],
      sessionId,
      authenticate: (filePath) => (artifactPathIsPhysical(filePath, "file") ? { sessionId } : null),
      refreshedPaths: () => (artifactPathIsPhysical(host.transcriptPath, "file") ? [host.transcriptPath] : []),
    });
  } catch { return unavailable(ANTIGRAVITY_RUNNER, "requested-session-unavailable"); }
  return describeExport({ runner: ANTIGRAVITY_RUNNER, sessionId, snapshots, options, found: {} });
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
  if (runner === ANTIGRAVITY_RUNNER) return exportAntigravityTranscript(sessionId, options);
  const conflict = claimedSessionConflict(options);
  if (conflict !== null) return conflict;
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
  return describeExport({ runner, sessionId, snapshots, options, found });
}

/** The data-minimised description of one authenticated session: merged-segment counts, turns, child provenance and usage. */
function describeExport({ runner, sessionId, snapshots, options, found }) {
  const parsed = snapshots.map((snapshot) => {
    // Optional seam ceiling: only the whole lines inside the ceiling are described; the digest and length
    // still identify the whole file, and the export is marked partial instead of failing or truncating silently.
    const ceiling = options.limits?.maxSegmentBytes;
    const overCeiling = Number.isSafeInteger(ceiling) && ceiling >= 0 && snapshot.bytes.length > ceiling;
    const described = overCeiling
      ? snapshot.bytes.subarray(0, snapshot.bytes.subarray(0, ceiling).lastIndexOf(10) + 1)
      : snapshot.bytes;
    const { records, unparsedLineCount } = parseJsonLinesCounted(described);
    const stamps = records.map(recordTimestampMs).filter((ms) => ms !== null);
    return {
      records,
      unparsedLineCount,
      overCeiling,
      filePath: snapshot.segment.filePath,
      mtimeMs: snapshot.identity.mtimeMs,
      sha256: createHash("sha256").update(snapshot.bytes).digest("hex"),
      byteLength: snapshot.bytes.length,
      firstMs: stamps.length > 0 ? stamps[0] : null,
      lastMs: stamps.length > 0 ? stamps[stamps.length - 1] : null,
    };
  });
  parsed.sort(compareSegments);
  const firsts = parsed.map((segment) => segment.firstMs).filter((ms) => ms !== null);
  const lasts = parsed.map((segment) => segment.lastMs).filter((ms) => ms !== null);
  const mergedRecords = parsed.flatMap((segment) => segment.records);
  const turnView = describeTurns(runner, mergedRecords);
  const children = childProvenance({ runner, sessionId, found, options, records: mergedRecords, turnView });
  const incompleteReasons = [
    ...(parsed.some((segment) => segment.unparsedLineCount > 0) ? ["records-skipped"] : []),
    ...(found.boundReached === true ? ["candidate-bound-reached"] : []),
    ...(parsed.some((segment) => segment.overCeiling) ? ["byte-ceiling"] : []),
    ...children.incompleteReasons,
  ];
  return {
    schema: SCHEMA,
    status: "available",
    runner,
    sessionId,
    // Totals below are only totals of what was read: a consumer must read this field with them.
    completeness: incompleteReasons.length === 0 ? "complete" : "partial",
    incompleteReasons,
    // A list when the runner records its children (empty when none), otherwise a typed reason; never a guess.
    childSessions: children.value,
    turns: turnView.turns,
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
    usage: extractRunnerUsage(runner, mergedRecords),
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
