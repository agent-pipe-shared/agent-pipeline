// SPDX-License-Identifier: SUL-1.0
/**
 * A PO-requested, recorded, expiring MODEL EXCEPTION for the Claude dispatch route (C30G-M16, PO decision 2026-11-17).
 *
 * The project's routing (`pipeline.user.yaml`, read by dispatch-model-enforcement.mjs) decides which model a dispatch runs. When the PO
 * wants ONE dispatch on a model no configured route selects (first use: a design-tier analysis on the Fable family), the orchestrator records
 * that request here instead of editing the gate-strength routing file. The record is an ATTRIBUTION record: the PO's request as relayed
 * by the orchestrator, labelled with the `--by` label the PO supplied. It is NOT a signature and proves nothing about who typed it.
 *
 * Store: one closed-shape, digest-chained, append-only file under `<git-common-dir>/agent-pipeline/dispatch-model-exception/store.json`
 * (the same shape and rules as the dispatch-budget grant store, lib/dispatch-budget-core.mjs). Three entry types: `record` (the request),
 * `revoke` (ends one) and `use` (one admitted dispatch consumed from it, written by the dispatch guard). State is derived by replay, so the
 * audit trail is the file itself. Anything that does not verify grants NOTHING (the safe direction). One orchestrator at a time is the
 * contract; a short lock file bounds two concurrent hooks. A dispatched agent can never reach the store or its script (hooks/guard-dispatch-budget.mjs).
 */
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveGitCommonDir } from "./po-key-directory.mjs";

export const MODEL_EXCEPTION_STORE_SCHEMA = "pipeline.dispatch-model-exception-store.v1";
export const MODEL_EXCEPTION_GENESIS_DIGEST = "0".repeat(64);
export const MODEL_EXCEPTION_MAX_ENTRIES = 500;
export const MODEL_EXCEPTION_MAX_REASON = 500;
export const MODEL_EXCEPTION_MAX_BY = 80;
/** A dispatch-id or count exception that is never used still ends here; a minutes exception ends at its own window. */
export const MODEL_EXCEPTION_DEFAULT_LIFETIME_MINUTES = 1440;
export const MODEL_EXCEPTION_COUNT_RANGE = Object.freeze([1, 5]);
export const MODEL_EXCEPTION_MINUTES_RANGE = Object.freeze([1, 240]);
const MAX_FILE_BYTES = 786432;
const STORE_DIR_PARTS = Object.freeze(["agent-pipeline", "dispatch-model-exception"]);
const STORE_FILE = "store.json";

const ALIAS_SHAPE = /^[a-z][a-z0-9]{1,15}$/u;
const EFFORT_SHAPE = /^[a-z]{2,12}$/u;
const DISPATCH_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const KEY_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO_SHAPE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/u;
const ID_SHAPE = /^MX-[1-9][0-9]{0,3}$/u;
const SHA256_SHAPE = /^[a-f0-9]{64}$/u;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/u;

const canonical = (value) => (value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`);
const entryDigest = (entry) => { const { digest: _ignored, ...body } = entry; return createHash("sha256").update(canonical([MODEL_EXCEPTION_STORE_SCHEMA, body])).digest("hex"); };
const hasExactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const text = (value, max) => typeof value === "string" && value.trim() === value && value.length >= 1 && value.length <= max && !CONTROL.test(value);
const validScope = (scope) => hasExactKeys(scope, ["kind", "value"]) && (
  (scope.kind === "dispatch-id" && typeof scope.value === "string" && DISPATCH_ID_SHAPE.test(scope.value))
  || (scope.kind === "count" && Number.isSafeInteger(scope.value) && scope.value >= MODEL_EXCEPTION_COUNT_RANGE[0] && scope.value <= MODEL_EXCEPTION_COUNT_RANGE[1])
  || (scope.kind === "minutes" && Number.isSafeInteger(scope.value) && scope.value >= MODEL_EXCEPTION_MINUTES_RANGE[0] && scope.value <= MODEL_EXCEPTION_MINUTES_RANGE[1]));

const KEYS = Object.freeze({
  record: ["seq", "type", "id", "model", "effort", "scope", "reason", "by", "at", "expiresAt", "prevDigest", "digest"],
  revoke: ["seq", "type", "target", "at", "prevDigest", "digest"],
  use: ["seq", "type", "target", "dispatchKey", "dispatchId", "model", "effort", "at", "prevDigest", "digest"],
});

export function emptyExceptionStore() {
  return { schema: MODEL_EXCEPTION_STORE_SCHEMA, entries: [], digest: MODEL_EXCEPTION_GENESIS_DIGEST };
}

/** Closed-shape validation: exact keys, contiguous sequence, recomputed digest chain, referential integrity. Anything else is `ok: false`. */
export function validateExceptionStore(store) {
  if (!hasExactKeys(store, ["schema", "entries", "digest"])) return { ok: false, code: "store-shape" };
  if (store.schema !== MODEL_EXCEPTION_STORE_SCHEMA) return { ok: false, code: "store-schema" };
  if (!Array.isArray(store.entries)) return { ok: false, code: "store-entries" };
  if (store.entries.length > MODEL_EXCEPTION_MAX_ENTRIES) return { ok: false, code: "store-full" };
  const records = new Map();
  const seen = new Set();
  let previous = MODEL_EXCEPTION_GENESIS_DIGEST;
  for (let index = 0; index < store.entries.length; index += 1) {
    const entry = store.entries[index];
    const keys = KEYS[entry?.type];
    if (!keys || !hasExactKeys(entry, keys)) return { ok: false, code: "entry-shape" };
    if (entry.seq !== index + 1) return { ok: false, code: "entry-sequence" };
    if (typeof entry.at !== "string" || !ISO_SHAPE.test(entry.at)) return { ok: false, code: "entry-time" };
    if (typeof entry.digest !== "string" || !SHA256_SHAPE.test(entry.digest) || seen.has(entry.digest)) return { ok: false, code: "entry-digest-shape" };
    if (entry.prevDigest !== previous) return { ok: false, code: "entry-chain" };
    if (entryDigest(entry) !== entry.digest) return { ok: false, code: "entry-digest-mismatch" };
    if (entry.type === "record") {
      if (entry.id !== `MX-${entry.seq}` || !ID_SHAPE.test(entry.id)) return { ok: false, code: "record-id" };
      if (typeof entry.model !== "string" || !ALIAS_SHAPE.test(entry.model)) return { ok: false, code: "record-model" };
      if (entry.effort !== null && !(typeof entry.effort === "string" && EFFORT_SHAPE.test(entry.effort))) return { ok: false, code: "record-effort" };
      if (!validScope(entry.scope)) return { ok: false, code: "record-scope" };
      if (!text(entry.reason, MODEL_EXCEPTION_MAX_REASON) || !text(entry.by, MODEL_EXCEPTION_MAX_BY)) return { ok: false, code: "record-text" };
      if (typeof entry.expiresAt !== "string" || !ISO_SHAPE.test(entry.expiresAt) || Date.parse(entry.expiresAt) <= Date.parse(entry.at)) return { ok: false, code: "record-expiry" };
      records.set(entry.id, entry);
    } else if (!records.has(entry.target)) {
      return { ok: false, code: "entry-target" };
    } else if (entry.type === "use") {
      const target = records.get(entry.target);
      if (typeof entry.dispatchKey !== "string" || !KEY_SHAPE.test(entry.dispatchKey)) return { ok: false, code: "use-key" };
      if (entry.dispatchId !== null && !(typeof entry.dispatchId === "string" && DISPATCH_ID_SHAPE.test(entry.dispatchId))) return { ok: false, code: "use-dispatch-id" };
      if (entry.model !== target.model || (entry.effort !== null && entry.effort !== target.effort)) return { ok: false, code: "use-binding" };
    }
    seen.add(entry.digest);
    previous = entry.digest;
  }
  if (store.digest !== previous) return { ok: false, code: "store-digest" };
  return { ok: true };
}

function append(store, body) {
  const checked = validateExceptionStore(store);
  if (!checked.ok) return checked;
  if (store.entries.length >= MODEL_EXCEPTION_MAX_ENTRIES) return { ok: false, code: "store-full" };
  const entry = { seq: store.entries.length + 1, ...body, prevDigest: store.digest, digest: "" };
  entry.digest = entryDigest(entry);
  const next = { schema: MODEL_EXCEPTION_STORE_SCHEMA, entries: [...store.entries, entry], digest: entry.digest };
  const verified = validateExceptionStore(next);
  return verified.ok ? { ok: true, store: next, entry } : { ok: false, code: `entry-refused-${verified.code}` };
}

/** The Claude family alias a tool-layer `model` names (`fable`, or a full id such as `claude-fable-5`); null when it names none of `aliases`. */
export function aliasOfModel(model, aliases) {
  if (typeof model !== "string") return null;
  const given = model.trim().toLowerCase();
  if (aliases.includes(given)) return given;
  const family = /^claude-([a-z][a-z0-9]*)(?:-|$)/u.exec(given)?.[1];
  return family !== undefined && aliases.includes(family) ? family : null;
}

/** Append one PO request. `aliases` is the closed list the caller allows (the enforcement module's CLAUDE_FAMILY_ALIASES). */
export function recordModelException(store, { model, effort = null, scope, reason, by, at, aliases } = {}) {
  if (!Array.isArray(aliases) || typeof model !== "string" || !aliases.includes(model)) return { ok: false, code: "model-not-allowed" };
  if (effort !== null && !(typeof effort === "string" && EFFORT_SHAPE.test(effort))) return { ok: false, code: "effort-invalid" };
  if (!validScope(scope)) return { ok: false, code: "scope-invalid" };
  if (!text(by, MODEL_EXCEPTION_MAX_BY)) return { ok: false, code: "by-invalid" };
  if (!text(reason, MODEL_EXCEPTION_MAX_REASON)) return { ok: false, code: "reason-invalid" };
  if (typeof at !== "string" || !ISO_SHAPE.test(at)) return { ok: false, code: "time-invalid" };
  const minutes = scope.kind === "minutes" ? scope.value : MODEL_EXCEPTION_DEFAULT_LIFETIME_MINUTES;
  const expiresAt = new Date(Date.parse(at) + minutes * 60000).toISOString();
  const id = `MX-${store.entries.length + 1}`;
  const appended = append(store, { type: "record", id, model, effort, scope: { kind: scope.kind, value: scope.value }, reason, by, at, expiresAt });
  return appended.ok ? { ok: true, store: appended.store, id } : appended;
}

export function revokeModelException(store, { target, at } = {}) {
  const state = deriveExceptionStates(store, Date.parse(at)).find((entry) => entry.id === target);
  if (!state) return { ok: false, code: "revoke-unknown-id" };
  if (state.state === "revoked") return { ok: false, code: "revoke-already-revoked" };
  const appended = append(store, { type: "revoke", target, at });
  return appended.ok ? { ok: true, store: appended.store } : appended;
}

/** Append the consumption of `use.id` by one admitted dispatch. A `reused` use (the same dispatch again) appends nothing: a retry never burns it twice. */
export function applyModelExceptionUse(store, use, at) {
  if (use?.reused === true) return { ok: true, store };
  const appended = append(store, { type: "use", target: use?.id, dispatchKey: use?.dispatchKey, dispatchId: use?.dispatchId ?? null, model: use?.model, effort: use?.effort ?? null, at });
  return appended.ok ? { ok: true, store: appended.store } : appended;
}

/** One state row per `record` entry: live | consumed | expired | revoked (revoked beats consumed beats expired). `nowMs` is the clock the caller injects. */
export function deriveExceptionStates(store, nowMs) {
  const rows = new Map();
  for (const entry of store.entries) {
    if (entry.type === "record") rows.set(entry.id, { ...entry, uses: [], revokedAt: null });
    else if (entry.type === "revoke") rows.get(entry.target).revokedAt = entry.at;
    else rows.get(entry.target).uses.push(entry);
  }
  return [...rows.values()].map((row) => {
    const distinct = new Set(row.uses.map((use) => use.dispatchKey)).size;
    const used = row.scope.kind === "dispatch-id" ? distinct >= 1 : row.scope.kind === "count" ? distinct >= row.scope.value : false;
    const expired = !(nowMs < Date.parse(row.expiresAt));
    return { ...row, state: row.revokedAt !== null ? "revoked" : used ? "consumed" : expired ? "expired" : "live", remaining: row.scope.kind === "count" ? Math.max(0, row.scope.value - distinct) : null };
  });
}

/**
 * Does a LIVE exception name this alias for this dispatch? `live` carries the exception and whether this very dispatch (same key) already
 * used it (`reused`: admitted again, nothing more consumed). `none` carries one cause per recent exception: wrong-alias | wrong-dispatch-id |
 * consumed | expired | revoked.
 */
export function findModelException(states, { alias, dispatchId = null, dispatchKey = null } = {}) {
  const scoped = (row) => row.scope.kind !== "dispatch-id" || row.scope.value === dispatchId;
  const mine = states.filter((row) => row.model === alias && scoped(row) && row.state !== "revoked");
  // A dispatch that already used an exception is admitted again (a retry after a transient failure) unless that exception was revoked or ran out
  // unused: the use was already counted, so the retry consumes nothing more even when the count is spent.
  const again = mine.find((row) => dispatchKey !== null && row.state !== "expired" && row.uses.some((use) => use.dispatchKey === dispatchKey));
  if (again) return { outcome: "live", exception: again, reused: true };
  const live = mine.find((row) => row.state === "live" && row.model === alias);
  if (live) return { outcome: "live", exception: live, reused: false };
  const why = states.slice(-4).map((row) => ({ id: row.id, model: row.model, scope: row.scope, at: row.at, by: row.by,
    cause: row.state === "revoked" ? "revoked" : row.model !== alias ? "wrong-alias" : !scoped(row) ? "wrong-dispatch-id" : row.state }));
  return { outcome: "none", why };
}

export const exceptionScopeText = (scope) => (scope.kind === "dispatch-id" ? `dispatch ${scope.value}` : scope.kind === "count" ? `${scope.value} dispatch${scope.value === 1 ? "" : "es"}` : `${scope.value} minutes`);

// ---------------------------------------------------------------------------
// The file store (read by the dispatch guard and the briefing generator, written by the orchestrator's script and the guard's consumption).
// ---------------------------------------------------------------------------

export function modelExceptionStorePath(commonDir) { return join(commonDir, ...STORE_DIR_PARTS, STORE_FILE); }
/** The directory a dispatched agent may never reach. */
export const MODEL_EXCEPTION_STORE_DIR = STORE_DIR_PARTS.join("/");

/** `{ ok: true, store, path, missing }` (a missing file is an empty store) or `{ ok: false, code, path }`; never throws. */
export function readModelExceptionStore(root, dependencies = {}) {
  const commonDir = dependencies.commonDir ?? (typeof root === "string" && root !== "" ? resolveGitCommonDir(root, dependencies) : null);
  if (typeof commonDir !== "string" || commonDir === "") return { ok: false, code: "git-common-dir-unresolved", path: null };
  const path = modelExceptionStorePath(commonDir);
  if (!existsSync(path)) return { ok: true, store: emptyExceptionStore(), path, missing: true };
  let raw;
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return { ok: false, code: "store-oversized", path };
    raw = readFileSync(path, "utf8");
  } catch { return { ok: false, code: "store-unreadable", path }; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, code: "store-malformed", path }; }
  const checked = validateExceptionStore(parsed);
  return checked.ok ? { ok: true, store: parsed, path, missing: false } : { ok: false, code: checked.code, path };
}

export function writeModelExceptionStore(path, store) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
  } catch {
    try { unlinkSync(temporary); } catch { /* best effort */ }
    return { ok: false, code: "store-write-failed" };
  }
  return { ok: true };
}

/** Run `work` while holding a short lock beside the store (a stale lock, older than 10 s, is taken over). */
export function withModelExceptionLock(path, work) {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { closeSync(openSync(lock, "wx", 0o600)); } catch (error) {
      if (error?.code !== "EEXIST") return { ok: false, code: "store-lock-failed" };
      try { if (Date.now() - statSync(lock).mtimeMs > 10000) unlinkSync(lock); } catch { /* raced */ }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      continue;
    }
    try { return work(); } finally { try { unlinkSync(lock); } catch { /* best effort */ } }
  }
  return { ok: false, code: "store-lock-busy" };
}

/**
 * Consume `use` for one ADMITTED dispatch: re-checks under the lock that the exception is still live for this dispatch (a concurrent
 * dispatch may have taken the last count), appends the `use` entry, and returns `undo()`, which puts the previous bytes back (the hook calls it
 * when a later guard refuses the dispatch, so a refused dispatch never consumes). Never throws.
 */
export function consumeModelException({ root, use, nowFn = () => new Date().toISOString() }, dependencies = {}) {
  try {
    const first = readModelExceptionStore(root, dependencies);
    if (!first.ok) return { ok: false, code: first.code, undo() {} };
    return withModelExceptionLock(first.path, () => {
      const read = readModelExceptionStore(root, dependencies);
      if (!read.ok) return { ok: false, code: read.code, undo() {} };
      const now = nowFn();
      const found = findModelException(deriveExceptionStates(read.store, Date.parse(now)), { alias: use.model, dispatchId: use.dispatchId, dispatchKey: use.dispatchKey });
      if (found.outcome !== "live" || found.exception.id !== use.id) return { ok: false, code: "exception-no-longer-live", undo() {} };
      if (found.reused) return { ok: true, undo() {} };
      const applied = applyModelExceptionUse(read.store, { ...use, reused: false }, now);
      if (!applied.ok) return { ok: false, code: applied.code, undo() {} };
      const previous = read.missing ? null : readFileSync(read.path, "utf8");
      const written = writeModelExceptionStore(read.path, applied.store);
      if (!written.ok) return { ok: false, code: written.code, undo() {} };
      return { ok: true, undo() {
        withModelExceptionLock(read.path, () => {
          try {
            const current = JSON.parse(readFileSync(read.path, "utf8"));
            if (current.digest !== applied.store.digest) return null;
            if (previous === null) unlinkSync(read.path); else writeFileSync(read.path, previous, { mode: 0o600 });
          } catch { /* best effort: a later entry or a vanished file is left as it is */ }
          return null;
        });
      } };
    });
  } catch { return { ok: false, code: "consume-internal-error", undo() {} }; }
}
