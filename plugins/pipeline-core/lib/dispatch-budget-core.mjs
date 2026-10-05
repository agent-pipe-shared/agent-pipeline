// SPDX-License-Identifier: SUL-1.0

/**
 * Runner-neutral, side-effect-free dispatch budget policy.
 *
 * Host adapters authenticate and normalize their own caller evidence, then
 * pass only the resulting field-presence facts and values here. They also
 * decide whether a concrete host call is one of that adapter's closing acts.
 * This module deliberately knows nothing about hook payloads, tool names,
 * paths, persistence, or a particular runner.
 */
import { createHash } from "node:crypto";

export const DENIAL_CODE = "DISPATCH-BUDGET-EXHAUSTED";
export const INVALID_INPUT_CODE = "DISPATCH-BUDGET-INPUT-INVALID";
export const CLOSING_ALLOWANCE = 5;
export const SAFETY_MARGIN = 10;

/**
 * Classify normalized caller evidence without trusting runner-specific field
 * names. Presence is explicit because an omitted identity and a malformed
 * present identity have different, already-established policy outcomes.
 */
export function classifyDispatchBudgetCaller({
  agentIdPresent = false,
  agentId,
  agentTypePresent = false,
  agentType,
} = {}) {
  if (typeof agentId === "string" && agentId.trim() !== "") {
    return {
      kind: "subagent",
      agentId,
      agentType: typeof agentType === "string" ? agentType : undefined,
    };
  }
  if (agentIdPresent || agentTypePresent) {
    const reason = !agentIdPresent
      ? "agent-type-without-agent-id"
      : (typeof agentId === "string" && agentId.trim() === "")
        ? "agent-id-present-but-blank"
        : "agent-id-present-but-not-a-string";
    return { kind: "unresolved", reason, agentIdRaw: agentId, agentTypeRaw: agentType };
  }
  return { kind: "orchestrator" };
}

/** The usable work calls before the fixed closing and safety reserve. */
export function dispatchWorkingCap(maxTurns) {
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= 0) return null;
  return Math.max(0, maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN));
}

/** Bind a declared work cap to the smaller capacity the selected tier can safely carry. */
export function effectiveDispatchBaseCap(baseCalls, maxTurns) {
  if (!Number.isSafeInteger(baseCalls) || baseCalls <= 0) return null;
  const workingCap = dispatchWorkingCap(maxTurns);
  if (workingCap === null) return null;
  return Math.min(baseCalls, workingCap);
}

function invalidBudgetInput(reason) {
  return {
    allowed: false,
    decision: "invalid-input",
    code: INVALID_INPUT_CODE,
    reason,
    nextCount: null,
    workingCap: null,
  };
}

/**
 * Advance one attributable dispatch call and decide its policy lane. The
 * caller persists `nextCount`, including denied attempts. After the working
 * cap, only closing acts within the next CLOSING_ALLOWANCE calls may proceed;
 * neither closing acts nor denied attempts can extend that fixed reserve.
 */
export function decideDispatchBudgetCall(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return invalidBudgetInput("budget-call-input-must-be-an-object");
  const { maxTurns, baseCalls, currentCount, isClosingAct } = input;
  const grantedCalls = input.grantedCalls === undefined ? 0 : input.grantedCalls;
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= 0) return invalidBudgetInput("max-turns-must-be-a-positive-safe-integer");
  if (!Number.isSafeInteger(baseCalls) || baseCalls <= 0) return invalidBudgetInput("base-calls-must-be-a-positive-safe-integer");
  if (!Number.isSafeInteger(currentCount) || currentCount < 0) return invalidBudgetInput("current-count-must-be-a-nonnegative-safe-integer");
  if (currentCount === Number.MAX_SAFE_INTEGER) return invalidBudgetInput("current-count-cannot-be-incremented-safely");
  if (typeof isClosingAct !== "boolean") return invalidBudgetInput("is-closing-act-must-be-boolean");
  if (!Number.isSafeInteger(grantedCalls) || grantedCalls < 0) return invalidBudgetInput("granted-calls-must-be-a-nonnegative-safe-integer");
  const workingCap = effectiveDispatchWorkingCap(baseCalls, maxTurns, grantedCalls);
  const nextCount = currentCount + 1;
  if (nextCount <= workingCap) {
    return { allowed: true, decision: "working", nextCount, workingCap };
  }
  if (isClosingAct === true && nextCount <= workingCap + CLOSING_ALLOWANCE) {
    return { allowed: true, decision: "closing", nextCount, workingCap };
  }
  return { allowed: false, decision: "exhausted", nextCount, workingCap };
}

// ---------------------------------------------------------------------------
// Checkpoint notice, orchestrator grant (ALFRED-BUDGET-20261005; PO decision
// 2026-10-05 "checkpoint and hand back instead of a hard abort"). Pure policy:
// adapters persist, authenticate and word the notice for their own runner.
// ---------------------------------------------------------------------------

export const CHECKPOINT_REPEAT_CALLS = 3;
export const MAX_GRANT_EXTRA_PER_CALL = 40;
export const MAX_GRANT_ENTRIES = 20;
export const MAX_GRANT_REASON_LENGTH = 500;
export const GRANT_SCHEMA = "pipeline.dispatch-budget-grant.v1";
export const GRANT_GENESIS_DIGEST = "0".repeat(64);

/**
 * Working cap including orchestrator-granted calls. A grant only ever raises the
 * cap, and never beyond `maxTurns - CLOSING_ALLOWANCE - 1`, so working + closing
 * calls stay at least one below the harness `maxTurns` cliff.
 */
export function effectiveDispatchWorkingCap(baseCalls, maxTurns, grantedCalls = 0) {
  const base = effectiveDispatchBaseCap(baseCalls, maxTurns);
  if (base === null) return null;
  if (!Number.isSafeInteger(grantedCalls) || grantedCalls <= 0) return base;
  const ceiling = maxTurns - CLOSING_ALLOWANCE - 1;
  return Math.max(base, Math.min(base + grantedCalls, ceiling));
}

/** Most calls a grant can still add to this agent (0 when the tier has no headroom). */
export function dispatchGrantHeadroom(baseCalls, maxTurns) {
  const base = effectiveDispatchBaseCap(baseCalls, maxTurns);
  if (base === null) return 0;
  return Math.max(0, maxTurns - CLOSING_ALLOWANCE - 1 - base);
}

/** ceil(0.8 x workingCap) in integer arithmetic (no float rounding). */
export function dispatchCheckpointThreshold(workingCap) {
  if (!Number.isSafeInteger(workingCap) || workingCap < 1) return null;
  return Math.floor((4 * workingCap + 4) / 5);
}

/**
 * Should the call that just became counted call `nextCount` carry the checkpoint
 * notice? Yes at exactly ceil(0.8 x cap) and on each of the last
 * CHECKPOINT_REPEAT_CALLS working calls, never below the threshold, and never
 * for a closing/denied call (the closing lane has its own text).
 */
export function dispatchCheckpointDecision({ workingCap, nextCount, decision = "working" } = {}) {
  const threshold = dispatchCheckpointThreshold(workingCap);
  if (threshold === null || decision !== "working" || !Number.isSafeInteger(nextCount) || nextCount < 1 || nextCount > workingCap) {
    return { notice: false, threshold, remainingWorkingCalls: null };
  }
  const notice = nextCount === threshold || (nextCount > threshold && nextCount > workingCap - CHECKPOINT_REPEAT_CALLS);
  return { notice, threshold, remainingWorkingCalls: workingCap - nextCount };
}

function grantEntryDigest(agentId, entry) {
  return createHash("sha256")
    .update(JSON.stringify([GRANT_SCHEMA, agentId, entry.seq, entry.extra, entry.reason, entry.grantedAt, entry.prevDigest]))
    .digest("hex");
}

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GRANTED_AT_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/u;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export function isValidGrantAgentId(agentId) {
  return typeof agentId === "string" && AGENT_ID_PATTERN.test(agentId);
}

function validGrantReason(reason) {
  return typeof reason === "string" && reason.trim() === reason && reason.length >= 1
    && reason.length <= MAX_GRANT_REASON_LENGTH && !CONTROL_CHARACTERS.test(reason);
}

function hasExactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

/**
 * Closed-shape validation of a persisted grant record: exact key sets, contiguous
 * sequence, bounded sizes, a recomputed digest chain, no duplicate digest, and a
 * `totalExtra`/`digest` that match the history. Anything else is `ok: false` and
 * a reader must then treat the agent as having NO grant (the safe direction).
 */
export function validateGrantRecord(record, expectedAgentId) {
  if (!hasExactKeys(record, ["schema", "agentId", "grants", "totalExtra", "digest"])) return { ok: false, code: "grant-record-shape" };
  if (record.schema !== GRANT_SCHEMA) return { ok: false, code: "grant-record-schema" };
  if (!isValidGrantAgentId(record.agentId) || record.agentId !== expectedAgentId) return { ok: false, code: "grant-record-agent-mismatch" };
  if (!Array.isArray(record.grants) || record.grants.length < 1) return { ok: false, code: "grant-record-empty" };
  if (record.grants.length > MAX_GRANT_ENTRIES) return { ok: false, code: "grant-record-oversized" };
  const seen = new Set();
  let previous = GRANT_GENESIS_DIGEST;
  let total = 0;
  for (let index = 0; index < record.grants.length; index += 1) {
    const entry = record.grants[index];
    if (!hasExactKeys(entry, ["seq", "extra", "reason", "grantedAt", "prevDigest", "digest"])) return { ok: false, code: "grant-entry-shape" };
    if (entry.seq !== index + 1) return { ok: false, code: "grant-entry-sequence" };
    if (!Number.isSafeInteger(entry.extra) || entry.extra < 1 || entry.extra > MAX_GRANT_EXTRA_PER_CALL) return { ok: false, code: "grant-entry-extra" };
    if (!validGrantReason(entry.reason)) return { ok: false, code: "grant-entry-reason" };
    if (typeof entry.grantedAt !== "string" || !GRANTED_AT_PATTERN.test(entry.grantedAt)) return { ok: false, code: "grant-entry-time" };
    if (typeof entry.digest !== "string" || !SHA256_PATTERN.test(entry.digest)) return { ok: false, code: "grant-entry-digest-shape" };
    if (seen.has(entry.digest)) return { ok: false, code: "grant-entry-duplicate-digest" };
    if (entry.prevDigest !== previous) return { ok: false, code: "grant-entry-chain" };
    if (grantEntryDigest(record.agentId, entry) !== entry.digest) return { ok: false, code: "grant-entry-digest-mismatch" };
    seen.add(entry.digest);
    previous = entry.digest;
    total += entry.extra;
  }
  if (record.totalExtra !== total || record.digest !== previous) return { ok: false, code: "grant-record-total-or-digest" };
  return { ok: true, totalExtra: total };
}

/**
 * Append-only extension of a grant history. Returns `{ ok: true, record }` with a
 * fresh record whose earlier entries are byte-for-byte unchanged, or
 * `{ ok: false, code }` (invalid arguments, a malformed existing record, or a
 * duplicate digest). `record` is null for an agent's first grant.
 */
export function appendGrant({ record = null, agentId, extra, reason, grantedAt } = {}) {
  if (!isValidGrantAgentId(agentId)) return { ok: false, code: "grant-agent-id-invalid" };
  if (!Number.isSafeInteger(extra) || extra < 1 || extra > MAX_GRANT_EXTRA_PER_CALL) return { ok: false, code: "grant-extra-out-of-range" };
  if (!validGrantReason(reason)) return { ok: false, code: "grant-reason-invalid" };
  if (typeof grantedAt !== "string" || !GRANTED_AT_PATTERN.test(grantedAt)) return { ok: false, code: "grant-time-invalid" };
  let grants = [];
  let previous = GRANT_GENESIS_DIGEST;
  if (record !== null) {
    const checked = validateGrantRecord(record, agentId);
    if (!checked.ok) return checked;
    grants = record.grants.map((entry) => ({ ...entry }));
    previous = record.digest;
  }
  if (grants.length >= MAX_GRANT_ENTRIES) return { ok: false, code: "grant-record-oversized" };
  const entry = { seq: grants.length + 1, extra, reason, grantedAt, prevDigest: previous, digest: "" };
  entry.digest = grantEntryDigest(agentId, entry);
  if (grants.some((existing) => existing.digest === entry.digest)) return { ok: false, code: "grant-entry-duplicate-digest" };
  grants.push(entry);
  const totalExtra = grants.reduce((sum, item) => sum + item.extra, 0);
  return { ok: true, record: { schema: GRANT_SCHEMA, agentId, grants, totalExtra, digest: entry.digest } };
}
