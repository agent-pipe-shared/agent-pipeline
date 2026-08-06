// SPDX-License-Identifier: SUL-1.0
/**
 * Destination-profile delivery discipline for the outbound export path.
 *
 * The outbox decides *what* is owed to a destination; this module decides
 * *whether the exporter may send it now*, and that decision is a pure function
 * of a closed, serializable session. Keeping it pure is what makes shutdown and
 * restart honest: the session is the whole recoverable state, so a process that
 * dies mid-backoff resumes with its retry budget and rate limit intact instead
 * of starting over with a fresh budget against a destination it was already
 * failing to reach.
 *
 * Nothing here is authority. A rate limit, a backoff, or an exhausted retry
 * budget only ever stops the Pipeline from sending; none of them may be read as
 * evidence that a governance event was or was not delivered.
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { validateGovernanceExportAdapterProfile } from "./governance-export-adapter.mjs";
import { validateGovernanceExportOutbox } from "./governance-export-outbox.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const POLICY_SCHEMA = "pipeline.governance-export-delivery-policy.v1";
const SESSION_SCHEMA = "pipeline.governance-export-delivery-session.v1";
const PLAN_SCHEMA = "pipeline.governance-export-delivery-plan.v1";
const COMPRESSION = new Set(["none", "gzip"]);
const DISPOSITIONS = new Set(["delivered", "quarantined", "retryable-failure"]);
const CANCEL_REASONS = new Set(["shutdown", "operator", "policy-revoked", "destination-withdrawn"]);

function fail(code) { const error = new Error("Governance export delivery policy input is invalid."); error.code = code; throw error; }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function bounded(value, min, max) { return Number.isSafeInteger(value) && value >= min && value <= max; }
function freeze(value) { return Object.freeze(value); }

const POLICY_KEYS = ["schema", "profileId", "maxBatchEvents", "compression", "minIntervalMs", "maxAttempts", "initialBackoffMs", "backoffFactor", "maxBackoffMs", "maxPendingEntries"];

/** Validates a delivery policy and holds it inside the adapter profile's own bounds. */
export function validateGovernanceExportDeliveryPolicy(policy, { profile } = {}) {
  const active = validateGovernanceExportAdapterProfile(profile);
  if (!exact(policy, POLICY_KEYS) || policy.schema !== POLICY_SCHEMA || policy.profileId !== active.profileId
    || !bounded(policy.maxBatchEvents, 1, active.maxBatchEvents) || !COMPRESSION.has(policy.compression)
    || !bounded(policy.minIntervalMs, 0, 3_600_000) || !bounded(policy.maxAttempts, 1, 64)
    || !bounded(policy.initialBackoffMs, 0, 3_600_000) || !bounded(policy.maxBackoffMs, policy.initialBackoffMs, 86_400_000)
    || !Number.isSafeInteger(policy.backoffFactor) || policy.backoffFactor < 1 || policy.backoffFactor > 16
    || !bounded(policy.maxPendingEntries, 1, 1_000_000)) fail("GEP-POLICY");
  return freeze({ ...policy });
}

const SESSION_KEYS = ["schema", "profileId", "attempt", "nextAttemptAtEpochMs", "cancelled", "cancelReason", "flushing", "deliveredEvents", "quarantinedEvents", "retryableFailures"];

function sessionShape(value) {
  return exact(value, SESSION_KEYS) && value.schema === SESSION_SCHEMA && ID.test(value.profileId ?? "")
    && bounded(value.attempt, 1, Number.MAX_SAFE_INTEGER) && bounded(value.nextAttemptAtEpochMs, 0, Number.MAX_SAFE_INTEGER)
    && typeof value.cancelled === "boolean" && (value.cancelReason === null || CANCEL_REASONS.has(value.cancelReason))
    && value.cancelled === (value.cancelReason !== null) && typeof value.flushing === "boolean"
    && bounded(value.deliveredEvents, 0, Number.MAX_SAFE_INTEGER) && bounded(value.quarantinedEvents, 0, Number.MAX_SAFE_INTEGER)
    && bounded(value.retryableFailures, 0, Number.MAX_SAFE_INTEGER);
}

export function createGovernanceExportDeliverySession({ policy, profile } = {}) {
  const active = validateGovernanceExportDeliveryPolicy(policy, { profile });
  return freeze({ schema: SESSION_SCHEMA, profileId: active.profileId, attempt: 1, nextAttemptAtEpochMs: 0, cancelled: false, cancelReason: null, flushing: false, deliveredEvents: 0, quarantinedEvents: 0, retryableFailures: 0 });
}

/**
 * Re-admits a persisted session after a restart.
 *
 * A restart must not become a way to buy a fresh retry budget, so the recorded
 * attempt count and any outstanding wait survive verbatim. The one correction
 * made is a ceiling on the wait: a persisted next-attempt time further out than
 * one full backoff -- from clock skew or a tampered file -- would stall the
 * exporter indefinitely, which is a worse failure than retrying too early.
 */
export function restoreGovernanceExportDeliverySession(value, { policy, profile, nowEpochMs } = {}) {
  const active = validateGovernanceExportDeliveryPolicy(policy, { profile });
  if (!sessionShape(value) || value.profileId !== active.profileId || !bounded(nowEpochMs, 0, Number.MAX_SAFE_INTEGER)) fail("GEP-RESTORE");
  const ceiling = nowEpochMs + active.maxBackoffMs;
  return freeze({ ...value, nextAttemptAtEpochMs: Math.min(value.nextAttemptAtEpochMs, ceiling) });
}

/** Cancellation is terminal: a cancelled session never plans another delivery. */
export function cancelGovernanceExportDeliverySession(session, { reasonCode } = {}) {
  if (!sessionShape(session) || !CANCEL_REASONS.has(reasonCode)) fail("GEP-CANCEL");
  return freeze({ ...session, cancelled: true, cancelReason: session.cancelReason ?? reasonCode });
}

/**
 * Flush drops the rate limit so a shutdown can drain what is already owed.
 * It deliberately does not drop the retry budget, the backoff after a failure,
 * or cancellation -- a shutdown is a reason to finish, not to hammer a
 * destination that is already refusing traffic.
 */
export function flushGovernanceExportDeliverySession(session) {
  if (!sessionShape(session)) fail("GEP-FLUSH");
  return freeze({ ...session, flushing: true });
}

function backoffFor(policy, attempt) {
  let delay = policy.initialBackoffMs;
  for (let step = 1; step < attempt; step += 1) {
    delay *= policy.backoffFactor;
    if (delay >= policy.maxBackoffMs) return policy.maxBackoffMs;
  }
  return Math.min(delay, policy.maxBackoffMs);
}

const plan = (action, reason, extra = {}) => freeze({ schema: PLAN_SCHEMA, action, reason, ...extra });

/**
 * Decides the next delivery action. The order of the checks is the contract:
 * cancellation outranks everything, an exhausted retry budget outranks a
 * pending wait, and backpressure is reported even when there is work to send,
 * because the producer -- not the sender -- is what has to slow down.
 */
export function planGovernanceExportDelivery({ session, outbox, policy, profile, nowEpochMs } = {}) {
  const active = validateGovernanceExportDeliveryPolicy(policy, { profile });
  const queue = validateGovernanceExportOutbox(outbox);
  if (!sessionShape(session) || session.profileId !== active.profileId || queue.destinationProfile !== active.profileId || !bounded(nowEpochMs, 0, Number.MAX_SAFE_INTEGER)) fail("GEP-PLAN");
  const pending = queue.entries.filter((entry) => entry.status === "pending").length;
  if (session.cancelled) return plan("cancelled", session.cancelReason, { pending });
  if (session.attempt > active.maxAttempts) return plan("exhausted", "retry-budget", { pending, attempt: session.attempt });
  if (pending === 0) return plan("idle", "nothing-pending", { pending });
  const waiting = !session.flushing && nowEpochMs < session.nextAttemptAtEpochMs;
  if (waiting) return plan(session.attempt > 1 ? "backoff" : "rate-limited", session.attempt > 1 ? "retry-backoff" : "rate-limit", { pending, waitMs: session.nextAttemptAtEpochMs - nowEpochMs });
  return plan("deliver", session.flushing ? "flush" : "ready", {
    pending,
    attempt: session.attempt,
    maxEvents: Math.min(active.maxBatchEvents, pending),
    compression: active.compression,
    // Backpressure is advisory to the producer and never suppresses a delivery:
    // the exporter's job under overload is to keep draining, not to stop.
    backpressure: pending > active.maxPendingEntries,
  });
}

/** Folds one delivery outcome back into the session's rate limit and retry budget. */
export function advanceGovernanceExportDeliverySession({ session, policy, profile, disposition, eventCount, nowEpochMs } = {}) {
  const active = validateGovernanceExportDeliveryPolicy(policy, { profile });
  if (!sessionShape(session) || session.profileId !== active.profileId || !DISPOSITIONS.has(disposition)
    || !bounded(eventCount, 0, Number.MAX_SAFE_INTEGER) || !bounded(nowEpochMs, 0, Number.MAX_SAFE_INTEGER)) fail("GEP-ADVANCE");
  if (disposition === "retryable-failure") {
    // The wait follows the attempt that just failed, so the first failure waits
    // exactly `initialBackoffMs` rather than one factor more.
    return freeze({ ...session, attempt: session.attempt + 1, nextAttemptAtEpochMs: nowEpochMs + backoffFor(active, session.attempt), retryableFailures: session.retryableFailures + 1 });
  }
  // Progress clears the retry budget: the destination answered, so the next
  // failure starts its own backoff rather than inheriting the previous one.
  return freeze({
    ...session,
    attempt: 1,
    nextAttemptAtEpochMs: nowEpochMs + active.minIntervalMs,
    deliveredEvents: disposition === "delivered" ? session.deliveredEvents + eventCount : session.deliveredEvents,
    quarantinedEvents: disposition === "quarantined" ? session.quarantinedEvents + eventCount : session.quarantinedEvents,
  });
}

/**
 * Encodes one mapped batch for the wire, applying compression only where the
 * policy enables it. The uncompressed digest is always reported so a compressed
 * batch and its plain equivalent remain provably the same events.
 */
export function encodeGovernanceExportBatch({ mappings, policy, profile } = {}) {
  const active = validateGovernanceExportDeliveryPolicy(policy, { profile });
  if (!Array.isArray(mappings) || mappings.length > active.maxBatchEvents
    || mappings.some((mapping) => !object(mapping) || mapping.profileId !== active.profileId || mapping.payload === undefined)) fail("GEP-ENCODE");
  const raw = Buffer.from(mappings.map((mapping) => (typeof mapping.payload === "string" ? mapping.payload : `${JSON.stringify(mapping.payload)}\n`)).join(""), "utf8");
  const encoded = active.compression === "gzip" ? gzipSync(raw, { level: 9 }) : raw;
  // Base64 rather than a buffer: the record stays immutable and serializable,
  // and rawSha256 is taken before compression so a compressed batch and its
  // plain equivalent are provably the same events.
  return freeze({ schema: "pipeline.governance-export-batch-encoding.v1", compression: active.compression, eventCount: mappings.length, rawBytes: raw.byteLength, rawSha256: createHash("sha256").update(raw).digest("hex"), encodedBytes: encoded.byteLength, encodedBase64: encoded.toString("base64") });
}
