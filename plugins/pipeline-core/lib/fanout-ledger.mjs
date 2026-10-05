// SPDX-License-Identifier: SUL-1.0
/**
 * FANOUT slice S2: the fan-out slot ledger.
 *
 * Design: specs/sprint-alfred-epic/design/fanout-enforcement-design.md section 3.2.
 *
 * One private, append-only JSONL file per session at
 * `<git-common-dir>/agent-pipeline/fanout/<runner>-<session-hash>.jsonl`. There is
 * NO lock and NO rewrite: every event is one small line written with a single
 * `O_APPEND` write, because the budget counter's lock already races on parallel
 * tool calls. Lines are never edited; "who is live" is DERIVED on read.
 *
 * `live(slice)` is the union of three sources, never one:
 *   1. "launch"    a launch event with no later finish event;
 *   2. "record"    a non-terminal dispatch record `evidence/dispatch-record-<id>.json`;
 *   3. "heartbeat" the mtime of the dispatch's budget counter
 *                  `<git-common-dir>/agent-pipeline/dispatch-budget/<agentId>.json`.
 * A silent slice NEVER frees its slot by itself: past `staleAfterMinutes` it stays
 * live and is merely reported by `staleSlices`. Only an explicit `finish` event
 * with `how: "reap"` (plus a reason hash) frees it. A terminal dispatch record or
 * any other finish event ends a slice the same way.
 *
 * Privacy (hash-only, same rule as native-slicing.mjs): events carry slice ids,
 * short tokens, enum values, counters, timestamps and SHA-256 hashes. There is no
 * free-text field, so a prompt, briefing, reason sentence, transcript path or host
 * path cannot be persisted; the raw session id never reaches a path or a line.
 *
 * Interpretations where the design is silent (strictest reading chosen):
 *   - Event vocabulary is exactly the design's launch/finish/stop-eval/block/
 *     declined/pause plus `defied` (named in section 3.3 rule 9). `reap` is a
 *     `finish` with `how: "reap"` (design: "Only slice-queue.mjs reap frees it").
 *   - `launch`/`finish` may carry an optional `agentId` (the counter file stem):
 *     that is the only binding between a slice and its heartbeat counter.
 *   - A finish (reap included) ends liveness for everything older than itself; a
 *     non-terminal record or a counter heartbeat NEWER than the finish proves the
 *     dispatch is still working and revives the slot. A later launch also revives.
 *   - A terminal record ends the dispatch for every source unless a launch event
 *     is newer than the record (a relaunch that has not re-opened its record yet).
 *   - Source 2 only inspects the slice ids the ledger knows plus the `sliceIds`
 *     the caller passes (the queue); it never scans the whole evidence directory.
 */
import { createHash } from "node:crypto";
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readFileSync, readSync, statSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";

import { isSafeTaskId, isTerminalOutcome } from "./dispatch-record.mjs";
import { ensurePrivateDirectory, PrivateBoundaryError } from "./private-boundary.mjs";

export const FANOUT_EVENT_SCHEMA = "pipeline.fanout-event.v1";
export const FANOUT_EVENT_TYPES = Object.freeze(["launch", "finish", "stop-eval", "block", "declined", "pause", "defied"]);
export const FANOUT_FINISH_HOWS = Object.freeze(["record", "notification", "subagent-stop", "elephant", "reap"]);
export const DEFAULT_STALE_AFTER_MINUTES = 20;

const MINUTE_MS = 60_000;
const MAX_LINE_BYTES = 1024;
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
const MAX_RECORD_BYTES = 1024 * 1024;
const HASH64 = /^[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+@-]{0,127}$/u;
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){0,7}$/u;
const RUNNER = /^[a-z][a-z0-9-]{0,31}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

export class FanoutLedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FanoutLedgerError";
    this.code = code;
  }
}
function fail(code, message) {
  throw new FanoutLedgerError(code, message);
}

const oneOf = (values) => (value) => typeof value === "string" && values.includes(value);
const isHash = (value) => typeof value === "string" && HASH64.test(value);
const isToken = (value) => typeof value === "string" && TOKEN.test(value) && !/^[A-Za-z]:/u.test(value) && !value.includes("..");
const isAgentId = (value) => typeof value === "string" && AGENT_ID.test(value) && !value.includes("..");
const isCode = (value) => typeof value === "string" && value.length <= 64 && CODE.test(value);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
const isIso = (value) => typeof value === "string" && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
const isSliceId = (value) => isSafeTaskId(value) && value.length <= 128 && !value.includes("..");

const FIELDS = Object.freeze({
  sliceId: isSliceId,
  agentType: isToken,
  model: isToken,
  writeScopeHash: isHash,
  commitMode: oneOf(["host-commit", "worktree", "diff-only", "self-commit"]),
  agentId: isAgentId,
  how: oneOf(FANOUT_FINISH_HOWS),
  reasonSha256: isHash,
  live: isCount,
  target: isCount,
  ready: isCount,
  decision: oneOf(["allow", "block"]),
  reason: isCode,
  mode: oneOf(["off", "shadow", "advisory", "enforce"]),
  reasonCode: isCode,
  kind: oneOf(["defer", "hold", "depend"]),
  by: oneOf(["po", "elephant"]),
  untilAt: isIso,
  blocks: isCount,
});
const SHAPES = Object.freeze({
  launch: { required: ["sliceId", "agentType", "model", "writeScopeHash", "commitMode"], optional: ["agentId"] },
  finish: { required: ["sliceId", "how"], optional: ["agentId", "reasonSha256"] },
  "stop-eval": { required: ["live", "target", "ready", "decision", "reason", "mode"], optional: [] },
  block: { required: ["reasonCode", "live", "target", "ready"], optional: [] },
  declined: { required: ["sliceId", "kind", "reasonSha256"], optional: [] },
  pause: { required: ["by", "untilAt", "reasonSha256"], optional: [] },
  defied: { required: ["reasonCode", "blocks"], optional: [] },
});

function invalid(message) {
  fail("FANOUT-EVENT-INVALID", `fanout event is invalid: ${message}`);
}

/** Closed, hash-only validation. Returns the normalized event; throws FANOUT-EVENT-INVALID. */
function validateEvent(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) invalid("not an object");
  const shape = Object.hasOwn(SHAPES, input.type) ? SHAPES[input.type] : null;
  if (shape === null) invalid("unknown type");
  const allowedKeys = new Set(["type", "at", ...shape.required, ...shape.optional]);
  for (const key of Object.keys(input)) if (!allowedKeys.has(key)) invalid(`unexpected key ${JSON.stringify(key).slice(0, 40)}`);
  if (!isIso(input.at)) invalid("at must be an ISO-8601 UTC timestamp");
  const normalized = { schema: FANOUT_EVENT_SCHEMA, type: input.type, at: input.at };
  for (const key of shape.required) {
    if (!Object.hasOwn(input, key)) invalid(`missing ${key}`);
    if (!FIELDS[key](input[key])) invalid(`bad ${key}`);
    normalized[key] = input[key];
  }
  for (const key of shape.optional) {
    if (!Object.hasOwn(input, key)) continue;
    if (!FIELDS[key](input[key])) invalid(`bad ${key}`);
    normalized[key] = input[key];
  }
  if (input.type === "finish" && (input.how === "reap") !== Object.hasOwn(input, "reasonSha256")) {
    invalid("reasonSha256 is required for, and only allowed on, a reap");
  }
  return normalized;
}

function resolveNow(now) {
  const value = now === undefined ? Date.now() : typeof now === "function" ? now() : now;
  if (typeof value !== "number" || !Number.isFinite(value)) fail("FANOUT-ARGUMENT", "now must be a finite millisecond timestamp or a function returning one");
  return value;
}

/** `<commonDir>/agent-pipeline/fanout/<runner>-<hash(session)>.jsonl`; same session hash as native-slicing. */
export function fanoutStatePath(commonDir, runner, rawSessionId) {
  if (typeof commonDir !== "string" || commonDir === "") fail("FANOUT-ARGUMENT", "commonDir must be a non-empty string");
  if (typeof runner !== "string" || !RUNNER.test(runner)) fail("FANOUT-ARGUMENT", "runner must be a lowercase token");
  if (typeof rawSessionId !== "string" || rawSessionId === "") fail("FANOUT-ARGUMENT", "sessionId must be a non-empty string");
  const hash = createHash("sha256").update(JSON.stringify(rawSessionId)).digest("hex").slice(0, 32);
  return join(commonDir, "agent-pipeline", "fanout", `${runner}-${hash}.jsonl`);
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Creation goes through the repository's private-state helper (physical
 * directory, 0700, Windows DACL hardening). An EXISTING directory is only checked
 * cheaply (physical, not a symlink, POSIX mode): the helper's Windows assurance
 * spawns PowerShell, which is far too heavy for a per-event hot path.
 */
function ensureLedgerDirectory(directory) {
  for (let attempt = 0; ; attempt += 1) {
    let info = null;
    try {
      info = lstatSync(directory);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (info !== null) {
      if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) {
        fail("FANOUT-DIRECTORY-UNSAFE", "fanout ledger directory is not a private physical directory");
      }
      return;
    }
    try {
      ensurePrivateDirectory(directory);
      return;
    } catch (error) {
      // Two first writers can race on creation; the loser may observe the winner's
      // directory before its hardening finished. Re-check a bounded number of times.
      if (!(error instanceof PrivateBoundaryError) || attempt >= 4) throw error;
      sleepSync(50 * (attempt + 1));
    }
  }
}

/**
 * Appends ONE validated event as ONE `O_APPEND` write. Returns `{ path, event }`.
 * Throws FANOUT-EVENT-INVALID for anything that is not hash-only; a refused event
 * never touches the file. `event.at` defaults to `options.now`.
 */
export function appendEvent(commonDir, runner, sessionId, event, options = {}) {
  const path = fanoutStatePath(commonDir, runner, sessionId);
  const input = event !== null && typeof event === "object" && !Array.isArray(event) ? { ...event } : event;
  if (input !== null && typeof input === "object" && !Array.isArray(input) && input.at === undefined) {
    input.at = new Date(resolveNow(options?.now)).toISOString();
  }
  const normalized = validateEvent(input);
  const line = Buffer.from(`${JSON.stringify(normalized)}\n`, "utf8");
  if (line.length > MAX_LINE_BYTES) invalid("line exceeds the atomic-append bound");
  ensureLedgerDirectory(dirname(path));
  const flags = fsConstants.O_NOFOLLOW === undefined
    ? "a"
    : fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW;
  const fd = openSync(path, flags, 0o600);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) {
      fail("FANOUT-FILE-UNSAFE", "fanout ledger is not a private single-link regular file");
    }
    if (writeSync(fd, line) !== line.length) fail("FANOUT-SHORT-WRITE", "fanout ledger append was short");
  } finally {
    closeSync(fd);
  }
  return { path, event: normalized };
}

/**
 * Reads the session ledger. Damaged, forged or truncated lines are skipped and
 * counted (`skipped`), never fatal. Only the last 8 MiB are read.
 */
export function readEvents(commonDir, runner, sessionId) {
  const path = fanoutStatePath(commonDir, runner, sessionId);
  let fd;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    if (error?.code === "ENOENT") return { path, events: [], skipped: 0 };
    throw error;
  }
  let text;
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1) fail("FANOUT-FILE-UNSAFE", "fanout ledger is not a single-link regular file");
    const length = Math.min(info.size, MAX_LEDGER_BYTES);
    const start = info.size - length;
    const buffer = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const count = readSync(fd, buffer, offset, length - offset, start + offset);
      if (count === 0) break;
      offset += count;
    }
    text = buffer.subarray(0, offset).toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1); // drop the partial first line
  } finally {
    closeSync(fd);
  }
  const events = [];
  let skipped = 0;
  for (const piece of text.split("\n")) {
    if (piece === "") continue;
    try {
      const parsed = JSON.parse(piece);
      if (parsed?.schema !== FANOUT_EVENT_SCHEMA) throw new Error("schema");
      const { schema: _schema, ...rest } = parsed;
      events.push(validateEvent(rest));
    } catch {
      skipped += 1;
    }
  }
  return { path, events, skipped };
}

/** Folds launch/finish events (file order, not timestamp order: appends are totally ordered) per slice. */
function foldEvents(events) {
  const slices = new Map();
  for (const event of events) {
    if (event.type !== "launch" && event.type !== "finish") continue;
    const state = slices.get(event.sliceId)
      ?? { live: false, launchedAtMs: null, lastFinishedAtMs: null, agentType: null, agentId: null };
    const atMs = Date.parse(event.at);
    if (event.type === "launch") {
      if (!state.live) {
        // A repeated launch of an already-live slice only adds a binding (agentId).
        state.live = true;
        state.launchedAtMs = atMs;
        state.agentType = event.agentType;
        state.agentId = null;
      }
    } else {
      state.live = false;
      state.lastFinishedAtMs = atMs;
    }
    if (event.agentId !== undefined) state.agentId = event.agentId;
    slices.set(event.sliceId, state);
  }
  return slices;
}

function readRecord(evidenceDir, sliceId) {
  const path = join(evidenceDir, `dispatch-record-${sliceId}.json`);
  let info;
  try {
    info = statSync(path);
  } catch {
    return null;
  }
  if (!info.isFile() || info.size > MAX_RECORD_BYTES) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (parsed?.taskId !== sliceId || typeof parsed.outcome !== "string") return null;
  return { terminal: isTerminalOutcome(parsed.outcome), mtimeMs: Math.round(info.mtimeMs) };
}

function counterMtimeMs(commonDir, agentId) {
  try {
    return Math.round(statSync(join(commonDir, "agent-pipeline", "dispatch-budget", `${agentId}.json`)).mtimeMs);
  } catch {
    return null;
  }
}

function derive(options) {
  if (options === null || typeof options !== "object") fail("FANOUT-ARGUMENT", "options must be an object");
  const { commonDir, runner, sessionId, evidenceDir = null, sliceIds = [], staleAfterMinutes = DEFAULT_STALE_AFTER_MINUTES } = options;
  if (typeof staleAfterMinutes !== "number" || !Number.isFinite(staleAfterMinutes) || staleAfterMinutes <= 0) {
    fail("FANOUT-ARGUMENT", "staleAfterMinutes must be a positive number");
  }
  if (!Array.isArray(sliceIds) || !sliceIds.every(isSliceId)) fail("FANOUT-ARGUMENT", "sliceIds must be safe slice ids");
  if (evidenceDir !== null && (typeof evidenceDir !== "string" || evidenceDir === "")) fail("FANOUT-ARGUMENT", "evidenceDir must be a non-empty string");
  const nowMs = resolveNow(options.now);
  const staleMs = staleAfterMinutes * MINUTE_MS;
  const states = foldEvents(readEvents(commonDir, runner, sessionId).events);
  const candidates = [...new Set([...states.keys(), ...sliceIds])].sort();
  const entries = [];
  for (const sliceId of candidates) {
    const state = states.get(sliceId) ?? null;
    const record = evidenceDir === null ? null : readRecord(evidenceDir, sliceId);
    const launched = state?.live === true;
    // A terminal record ends the dispatch for every source, unless a launch is newer than it.
    if (record?.terminal === true && (!launched || record.mtimeMs >= state.launchedAtMs)) continue;
    const lastFinish = state?.lastFinishedAtMs ?? null;
    const afterFinish = (ms) => lastFinish === null || ms > lastFinish;
    const heartbeatMs = state?.agentId ? counterMtimeMs(commonDir, state.agentId) : null;
    const sources = [];
    const activity = [];
    if (launched) { sources.push("launch"); activity.push(state.launchedAtMs); }
    if (record !== null && record.terminal === false && afterFinish(record.mtimeMs)) { sources.push("record"); activity.push(record.mtimeMs); }
    if (heartbeatMs !== null && afterFinish(heartbeatMs)) {
      activity.push(heartbeatMs);
      if (nowMs - heartbeatMs <= staleMs) sources.push("heartbeat");
    }
    if (sources.length === 0) continue;
    const lastActivityMs = Math.max(...activity);
    const silentMs = Math.max(0, nowMs - lastActivityMs);
    entries.push({
      sliceId,
      sources,
      agentType: launched ? state.agentType : null,
      launchedAt: launched ? new Date(state.launchedAtMs).toISOString() : null,
      lastActivityAt: new Date(lastActivityMs).toISOString(),
      silentMinutes: Math.round(silentMs / MINUTE_MS),
      stale: silentMs > staleMs,
    });
  }
  return entries;
}

/**
 * Slices that currently hold a slot: the union of the launch event, a
 * non-terminal dispatch record and the budget-counter heartbeat (see header).
 * Options: `{ commonDir, runner, sessionId, evidenceDir?, sliceIds?, staleAfterMinutes?, now? }`.
 * Each entry: `{ sliceId, sources, agentType, launchedAt, lastActivityAt, silentMinutes, stale }`.
 */
export function liveSlices(options) {
  return derive(options);
}

/** The live slices that have been silent for MORE than `staleAfterMinutes` (default 20). They stay live. */
export function staleSlices(options) {
  return derive(options).filter((entry) => entry.stale);
}
