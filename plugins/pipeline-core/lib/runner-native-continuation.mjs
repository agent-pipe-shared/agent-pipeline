// SPDX-License-Identifier: SUL-1.0
/**
 * Closed, provider-neutral continuation record and transition planner.
 *
 * This module is deliberately pure: adapters own their runner transport, while
 * this contract decides whether a native goal may be set, paused, cleared or reported
 * unavailable. Nothing here starts a process, changes permissions or stores a
 * prompt.
 */
import { createHash } from "node:crypto";

export const RUNNER_NATIVE_CONTINUATION_SCHEMA = "pipeline.runner-native-continuation.v1";
export const CONTINUATION_STATES = Object.freeze([
  "active", "paused-po-gate", "blocked", "achieved", "cleared", "unavailable", "failed",
]);
export const CONTINUATION_TERMINALS = Object.freeze([
  "none", "verified-completion", "named-po-gate", "typed-blocker", "explicit-control-change", "unavailable", "failed",
]);
export const NATIVE_GOAL_ACTIONS = Object.freeze(["set", "pause", "clear", "none"]);
export const RUNNER_NATIVE_CONTINUATION_CODES = Object.freeze([
  "RNC-VALID", "RNC-SCHEMA", "RNC-TERMINAL", "RNC-GENERATION", "RNC-READBACK",
  "RNC-EVENT", "RNC-TRANSITION", "RNC-SET", "RNC-PAUSE", "RNC-CLEAR", "RNC-NOOP", "RNC-INPUT", "RNC-PROGRESS",
  "RNC-REFRESH",
  "RNC-CONTROLLER-INPUT", "RNC-CONTROLLER-FEATURE", "RNC-CONTROLLER-EVENT", "RNC-CONTROLLER-STATE",
  "RNC-CODEX-HOST", "RNC-CLAUDE-HOST", "RNC-CLAUDE-OBJECTIVE",
]);

const ROOT = new Set(["schema", "continuationId", "subject", "objective", "acceptance", "evidence", "terminal", "runner", "generation", "status", "progress", "readback", "reason", "resolution", "recordSha256"]);
const SUBJECT = new Set(["featureId", "phase", "planSha256", "specSha256", "queueRevision", "packageId", "actionId"]);
const OBJECTIVE = new Set(["conditionSha256", "summarySha256"]);
const ACCEPTANCE = new Set(["criterionId", "status", "evidenceSha256"]);
const EVIDENCE = new Set(["kind", "path", "fileSha256", "recordSha256"]);
const TERMINAL = new Set(["kind", "atRevision"]);
const RUNNER = new Set(["runnerId", "adapterVersion", "capability"]);
const GENERATION = new Set(["number", "goalSha256"]);
const PROGRESS = new Set(["kind", "status", "evidenceSha256"]);
const READBACK = new Set(["goalIdSha256", "generation", "observedAt", "status"]);
const REASON = new Set(["code", "evidenceSha256"]);
const PO_DECISION_RECEIPT = new Set(["schema", "featureId", "continuationId", "pausedRecordSha256", "pauseRevision", "resolvedRevision", "decision", "receiptSha256"]);
const ADDITIVE = new Set(["kind", "evidenceSha256"]);
const EVENTS = new Set(["activate", "resume", "compact-reentry", "po-gate", "po-gate-resolved", "typed-blocker", "verified-completion", "explicit-control", "capability-unavailable", "activation-failed"]);
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_PATH = /^(?!\/)(?!.*\/\/)(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]{1,512}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key)); }
function digest(value, nullable = false) { return (nullable && value === null) || (typeof value === "string" && SHA256.test(value)); }
function id(value) { return typeof value === "string" && SAFE_ID.test(value); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function computeRunnerNativeContinuationDigest(value) {
  const { recordSha256: _recordSha256, ...unsigned } = value;
  return createHash("sha256").update(canonical(unsigned), "utf8").digest("hex");
}

/** A closed, durable PO decision receipt; only its digest is portable evidence. */
export function computePoGoalDecisionReceiptDigest(value) {
  const { receiptSha256: _receiptSha256, ...unsigned } = value;
  return createHash("sha256").update(`pipeline.po-goal-decision-receipt.v1\0${canonical(unsigned)}`, "utf8").digest("hex");
}

function validSubject(value) {
  return exact(value, SUBJECT) && [value.featureId, value.phase, value.packageId, value.actionId].every(id)
    && digest(value.planSha256) && digest(value.specSha256)
    && Number.isSafeInteger(value.queueRevision) && value.queueRevision >= 0;
}
function validObjective(value) { return exact(value, OBJECTIVE) && digest(value.conditionSha256) && digest(value.summarySha256); }
function validAcceptance(value) {
  return Array.isArray(value) && value.length <= 64 && value.every((entry) => exact(entry, ACCEPTANCE)
    && id(entry.criterionId) && ["pending", "passed", "failed", "unknown"].includes(entry.status) && digest(entry.evidenceSha256, true));
}
function validEvidence(value) {
  return Array.isArray(value) && value.length <= 64 && value.every((entry) => exact(entry, EVIDENCE)
    && id(entry.kind) && typeof entry.path === "string" && SAFE_PATH.test(entry.path)
    && digest(entry.fileSha256) && digest(entry.recordSha256, true));
}
function validTerminal(value, subject) {
  return exact(value, TERMINAL) && CONTINUATION_TERMINALS.includes(value.kind)
    && Number.isSafeInteger(value.atRevision) && value.atRevision >= subject.queueRevision;
}
function validRunner(value) { return exact(value, RUNNER) && [value.runnerId, value.adapterVersion].every(id) && ["available", "unavailable", "failed"].includes(value.capability); }
function validGeneration(value) { return exact(value, GENERATION) && Number.isSafeInteger(value.number) && value.number >= 0 && digest(value.goalSha256); }
function validProgress(value) {
  return Array.isArray(value) && value.length <= 32 && value.every((entry) => exact(entry, PROGRESS)
    && id(entry.kind) && ["known", "unknown", "unavailable"].includes(entry.status) && digest(entry.evidenceSha256, true));
}
function validReadback(value, generation, active, status) {
  if (active) {
    return exact(value, READBACK) && digest(value.goalIdSha256) && value.generation === generation.number
      && typeof value.observedAt === "string" && ISO.test(value.observedAt) && value.status === "active";
  }
  // A claimed normal terminal is durable only when the exact clear readback is
  // retained. `null` is reserved for a typed unavailable/failed adapter path,
  // which intentionally makes no claim that a native goal was cleared.
  if (value === null) return ["unavailable", "failed"].includes(status);
  if (status === "blocked") {
    return exact(value, READBACK) && digest(value.goalIdSha256) && value.generation === generation.number
      && typeof value.observedAt === "string" && ISO.test(value.observedAt) && value.status === "blocked";
  }
  if (status === "paused-po-gate") {
    return exact(value, READBACK) && digest(value.goalIdSha256) && value.generation === generation.number
      && typeof value.observedAt === "string" && ISO.test(value.observedAt) && value.status === "paused";
  }
  return exact(value, new Set(["goalIdSha256", "generation", "status"]))
    && value.goalIdSha256 === null && value.generation === generation.number && value.status === "cleared";
}
function validReason(value) { return exact(value, REASON) && id(value.code) && digest(value.evidenceSha256, true); }
function validPoGoalDecisionReceipt(value) {
  return exact(value, PO_DECISION_RECEIPT) && value.schema === "pipeline.po-goal-decision-receipt.v1"
    && id(value.featureId) && id(value.continuationId) && digest(value.pausedRecordSha256)
    && Number.isSafeInteger(value.pauseRevision) && value.pauseRevision >= 0
    && Number.isSafeInteger(value.resolvedRevision) && value.resolvedRevision > value.pauseRevision
    && value.decision === "resume" && digest(value.receiptSha256)
    && computePoGoalDecisionReceiptDigest(value) === value.receiptSha256;
}
function validResolution(value) { return value === null || validPoGoalDecisionReceipt(value); }
function validAdditive(value) { return exact(value, ADDITIVE) && ["question", "clarification", "observation"].includes(value.kind) && digest(value.evidenceSha256); }

function terminalEvent(value) {
  return object(value) && EVENTS.has(value.kind) && Number.isSafeInteger(value.atRevision)
    && value.atRevision >= 0
    && ((["activate", "resume", "compact-reentry"].includes(value.kind)
      && exact(value, new Set(["kind", "atRevision"])))
      || (value.kind === "po-gate-resolved"
        && exact(value, new Set(["kind", "atRevision", "evidenceSha256", "pausedRecordSha256", "poDecisionReceipt"]))
        && digest(value.evidenceSha256) && digest(value.pausedRecordSha256)
        && validPoGoalDecisionReceipt(value.poDecisionReceipt)
        && value.evidenceSha256 === value.poDecisionReceipt.receiptSha256
        && value.pausedRecordSha256 === value.poDecisionReceipt.pausedRecordSha256)
      || (!["activate", "resume", "compact-reentry", "po-gate-resolved"].includes(value.kind)
        && exact(value, new Set(["kind", "atRevision", "evidenceSha256"]))
        && digest(value.evidenceSha256)));
}

function verifiedAcceptance(value) {
  return value.length > 0 && value.every((entry) => entry.status === "passed" && digest(entry.evidenceSha256));
}

/**
 * Derive the portable native-goal request from the persisted active work item.
 * The caller supplies only already-sanitized acceptance/evidence references;
 * raw chat input and private host coordinates are deliberately not accepted.
 */
export function buildRunnerNativeContinuationRequest({ continuationId, activeFeature, continuity, runner, acceptance = [], evidence = [], progress = [] }) {
  if (!id(continuationId) || !exact(activeFeature, new Set(["id", "phase"])) || !id(activeFeature.id) || !id(activeFeature.phase)
    || !object(continuity) || continuity.featureId !== activeFeature.id || continuity.blocker !== null
    || !object(continuity.queueHead) || !object(continuity.authority) || !validRunner(runner)
    || !validAcceptance(acceptance) || !validEvidence(evidence) || !validProgress(progress)) return { ok: false, code: "RNC-SCHEMA" };
  const head = continuity.queueHead;
  const subject = {
    featureId: activeFeature.id, phase: activeFeature.phase,
    // The approved PRD is the durable plan authority for an active feature.
    // `authority.plan` was an optional early fixture field and is not present
    // in the canonical neutral lifecycle State.
    planSha256: continuity.authority.prd?.sha256, specSha256: continuity.authority.spec?.sha256,
    queueRevision: continuity.revision, packageId: head.packageId, actionId: head.actionId,
  };
  if (!validSubject(subject)) return { ok: false, code: "RNC-SCHEMA" };
  const conditionSha256 = createHash("sha256").update(canonical({ subject, acceptance, evidence }), "utf8").digest("hex");
  const summarySha256 = createHash("sha256").update(canonical({ featureId: subject.featureId, phase: subject.phase, packageId: subject.packageId, actionId: subject.actionId }), "utf8").digest("hex");
  return { ok: true, code: "RNC-VALID", request: { continuationId, subject, objective: { conditionSha256, summarySha256 }, acceptance, evidence, progress, runner } };
}

/** Materialize an evidence-bound record only after an adapter has read it back. */
export function materializeRunnerNativeContinuation({ request, generation, adapterResult, observedAt, reasonCode = "active", reasonEvidenceSha256 = null, resolution = null }) {
  if (!request?.ok || !id(request.request?.continuationId) || !validSubject(request.request.subject)
    || !validObjective(request.request.objective) || !validAcceptance(request.request.acceptance)
    || !validEvidence(request.request.evidence) || !validProgress(request.request.progress)
    || !validRunner(request.request.runner) || !Number.isSafeInteger(generation) || generation < 0
    || !object(adapterResult) || (adapterResult.status === "active" && (typeof observedAt !== "string" || !ISO.test(observedAt)))
    || !id(reasonCode) || !digest(reasonEvidenceSha256, true) || !validResolution(resolution)) return { ok: false, code: "RNC-SCHEMA" };
  const active = adapterResult.ok === true && adapterResult.status === "active"
    && exact(adapterResult.readback, READBACK) && digest(adapterResult.readback.goalIdSha256)
    && adapterResult.readback.generation === generation && adapterResult.readback.status === "active"
    && ISO.test(adapterResult.readback.observedAt) && adapterResult.readback.observedAt === observedAt;
  const blocked = adapterResult.ok === false && adapterResult.status === "blocked"
    && exact(adapterResult.readback, READBACK) && digest(adapterResult.readback.goalIdSha256)
    && adapterResult.readback.generation === generation && ISO.test(adapterResult.readback.observedAt)
    && adapterResult.readback.status === "blocked";
  const unavailable = !active && !blocked;
  const value = {
    schema: RUNNER_NATIVE_CONTINUATION_SCHEMA,
    continuationId: request.request.continuationId,
    subject: request.request.subject,
    objective: request.request.objective,
    acceptance: request.request.acceptance,
    evidence: request.request.evidence,
    terminal: { kind: blocked ? "typed-blocker" : unavailable ? "unavailable" : "none", atRevision: request.request.subject.queueRevision },
    runner: { ...request.request.runner, capability: unavailable ? "unavailable" : "available" },
    generation: { number: generation, goalSha256: createHash("sha256").update(canonical({ subject: request.request.subject, objective: request.request.objective, runner: request.request.runner, generation }), "utf8").digest("hex") },
    status: blocked ? "blocked" : unavailable ? "unavailable" : "active",
    progress: request.request.progress,
    readback: active || blocked ? { ...adapterResult.readback } : null,
    reason: { code: unavailable || blocked ? (typeof adapterResult.code === "string" && id(adapterResult.code) ? adapterResult.code : "adapter-unavailable") : reasonCode, evidenceSha256: reasonEvidenceSha256 ?? (blocked ? request.request.objective.conditionSha256 : null) },
    resolution: resolution === null ? null : structuredClone(resolution),
    recordSha256: null,
  };
  value.recordSha256 = computeRunnerNativeContinuationDigest(value);
  return validateRunnerNativeContinuation(value).ok ? { ok: true, code: "RNC-VALID", continuation: value } : { ok: false, code: "RNC-SCHEMA" };
}

/**
 * Project bounded, machine-readable progress from the persisted work state.
 * This deliberately derives observations from state and approved evidence
 * references; callers cannot smuggle free-form status text into a goal record.
 */
export function projectRunnerNativeProgress({ continuity, acceptance = [], evidence = [] }) {
  if (!object(continuity) || !object(continuity.queueHead) || !validAcceptance(acceptance) || !validEvidence(evidence)) {
    return { ok: false, code: "RNC-SCHEMA", progress: null };
  }
  const hasEvidence = evidence.length > 0;
  const hasTestEvidence = evidence.some((entry) => ["test", "verify", "security"].includes(entry.kind));
  const hasCandidate = evidence.some((entry) => ["candidate", "commit", "tree"].includes(entry.kind));
  const progress = [
    { kind: "phase", status: "known", evidenceSha256: null },
    { kind: "queue-revision", status: "known", evidenceSha256: null },
    { kind: "deadline", status: "unknown", evidenceSha256: null },
    { kind: "tests", status: hasTestEvidence ? "known" : "unknown", evidenceSha256: null },
    { kind: "dispatch", status: continuity.queueHead.dispatch === null ? "unknown" : "known", evidenceSha256: null },
    { kind: "candidate", status: hasCandidate ? "known" : "unknown", evidenceSha256: null },
    { kind: "evidence", status: hasEvidence ? "known" : "unknown", evidenceSha256: null },
    { kind: "artifacts", status: hasEvidence ? "known" : "unknown", evidenceSha256: null },
  ];
  return validProgress(progress) ? { ok: true, code: "RNC-PROGRESS", progress } : { ok: false, code: "RNC-SCHEMA", progress: null };
}

/** Validate one fully materialized, portable continuation record. */
export function validateRunnerNativeContinuation(value) {
  if (!exact(value, ROOT) || value.schema !== RUNNER_NATIVE_CONTINUATION_SCHEMA || !id(value.continuationId)
    || !validSubject(value.subject) || !validObjective(value.objective) || !validAcceptance(value.acceptance)
    || !validEvidence(value.evidence) || !validTerminal(value.terminal, value.subject) || !validRunner(value.runner)
    || !validGeneration(value.generation) || !CONTINUATION_STATES.includes(value.status) || !validProgress(value.progress)
    || !validReason(value.reason) || !validResolution(value.resolution) || !digest(value.recordSha256)) return { ok: false, code: "RNC-SCHEMA" };

  const active = value.status === "active";
  if (!validReadback(value.readback, value.generation, active, value.status)) return { ok: false, code: "RNC-READBACK" };
  if ((active && (value.terminal.kind !== "none" || value.runner.capability !== "available" || value.readback.status !== "active"))
    || (value.status === "paused-po-gate" && value.terminal.kind !== "named-po-gate")
    || (value.status === "blocked" && value.terminal.kind !== "typed-blocker")
    || (value.status === "achieved" && value.terminal.kind !== "verified-completion")
    || (value.status === "cleared" && value.terminal.kind !== "explicit-control-change")
    || (value.status === "unavailable" && (value.terminal.kind !== "unavailable" || value.runner.capability !== "unavailable"))
    || (value.status === "failed" && value.terminal.kind !== "failed")) return { ok: false, code: "RNC-TERMINAL" };
  if (!active && !["unavailable", "failed"].includes(value.status) && !digest(value.reason.evidenceSha256)) return { ok: false, code: "RNC-TERMINAL" };
  if (value.status === "achieved" && !verifiedAcceptance(value.acceptance)) return { ok: false, code: "RNC-TERMINAL" };
  if (value.resolution !== null && (
    value.resolution.featureId !== value.subject.featureId
    || value.resolution.continuationId !== value.continuationId
    || value.resolution.pauseRevision < value.subject.queueRevision
    || value.reason.evidenceSha256 !== value.resolution.receiptSha256
    || !["active", "unavailable"].includes(value.status)
    || (value.status === "active" && value.reason.code !== "po-gate-resolved")
  )) return { ok: false, code: "RNC-TERMINAL" };
  if (value.status === "active" && value.reason.code === "po-gate-resolved" && value.resolution === null) return { ok: false, code: "RNC-TERMINAL" };
  if (computeRunnerNativeContinuationDigest(value) !== value.recordSha256) return { ok: false, code: "RNC-GENERATION" };
  return { ok: true, code: "RNC-VALID" };
}

/**
 * Record a bounded intermediate input as progress evidence without changing the
 * active action or exposing its raw text.  The returned record is suitable for
 * one sanctioned continuity CAS; this pure function performs no persistence.
 */
export function recordRunnerNativeAdditiveInput({ continuation, input }) {
  const checked = validateRunnerNativeContinuation(continuation);
  if (!checked.ok || continuation.status !== "active" || !validAdditive(input)) return { ok: false, code: checked.ok ? "RNC-EVENT" : checked.code, continuation: null };
  const entry = { kind: `input-${input.kind}`, status: "known", evidenceSha256: input.evidenceSha256 };
  if (continuation.progress.some((value) => canonical(value) === canonical(entry))) return { ok: true, code: "RNC-NOOP", continuation: structuredClone(continuation) };
  if (continuation.progress.length >= 32) return { ok: false, code: "RNC-SCHEMA", continuation: null };
  const next = structuredClone(continuation);
  next.progress = [...next.progress, entry];
  next.recordSha256 = computeRunnerNativeContinuationDigest(next);
  return validateRunnerNativeContinuation(next).ok ? { ok: true, code: "RNC-INPUT", continuation: next } : { ok: false, code: "RNC-SCHEMA", continuation: null };
}

/**
 * Materialize a paused or cleared terminal only after the adapter confirms the
 * exact state. A failed operation becomes typed unavailable evidence rather
 * than a false claim about the native Goal.
 */
export function materializeRunnerNativeTerminal({ continuation, transition, event, adapterResult }) {
  const checked = validateRunnerNativeContinuation(continuation);
  if (!checked.ok || !object(transition) || !["pause", "clear"].includes(transition.action) || !terminalEvent(event)
    || event.atRevision < continuation.subject.queueRevision || !object(adapterResult)) {
    return { ok: false, code: "RNC-SCHEMA", continuation: null };
  }
  if (transition.terminal === "verified-completion" && !verifiedAcceptance(continuation.acceptance)) {
    return { ok: false, code: "RNC-TERMINAL", continuation: null };
  }
  const cleared = adapterResult.ok === true && adapterResult.status === "cleared"
    && exact(adapterResult.readback, new Set(["goalIdSha256", "generation", "status"]))
    && adapterResult.readback.goalIdSha256 === null && adapterResult.readback.generation === continuation.generation.number
    && adapterResult.readback.status === "cleared";
  const paused = adapterResult.ok === true && adapterResult.status === "paused"
    && exact(adapterResult.readback, READBACK) && digest(adapterResult.readback.goalIdSha256)
    && adapterResult.readback.generation === continuation.generation.number
    && typeof adapterResult.readback.observedAt === "string" && ISO.test(adapterResult.readback.observedAt)
    && adapterResult.readback.status === "paused";
  const confirmed = transition.action === "pause" ? paused : cleared;
  const next = structuredClone(continuation);
  if (confirmed) {
    next.status = transition.state;
    next.terminal = { kind: transition.terminal, atRevision: event.atRevision };
    next.readback = { ...adapterResult.readback };
    next.reason = { code: transition.reasonCode, evidenceSha256: event.evidenceSha256 };
  } else {
    next.status = "unavailable";
    next.terminal = { kind: "unavailable", atRevision: event.atRevision };
    next.runner = { ...next.runner, capability: "unavailable" };
    next.readback = null;
    next.reason = { code: typeof adapterResult.code === "string" && id(adapterResult.code) ? adapterResult.code : "adapter-unavailable", evidenceSha256: event.evidenceSha256 };
  }
  next.recordSha256 = computeRunnerNativeContinuationDigest(next);
  return validateRunnerNativeContinuation(next).ok
    ? { ok: true, code: confirmed ? (transition.action === "pause" ? "RNC-PAUSE" : "RNC-CLEAR") : "RNC-VALID", continuation: next }
    : { ok: false, code: "RNC-SCHEMA", continuation: null };
}

function decision(action, state, terminal, reasonCode, generation) {
  return { ok: true, code: action === "set" ? "RNC-SET" : action === "pause" ? "RNC-PAUSE" : action === "clear" ? "RNC-CLEAR" : "RNC-NOOP", action, state, terminal, reasonCode, generation };
}

/**
 * Map one explicit lifecycle event to one bounded native-goal action. The
 * caller persists the resulting record and must obtain adapter readback after
 * `set`; this planner never treats a requested action as a successful goal.
 */
export function planNativeGoalTransition({ continuation, event }) {
  const checked = validateRunnerNativeContinuation(continuation);
  if (!checked.ok) return { ok: false, code: checked.code, action: "none" };
  if (!terminalEvent(event) || event.atRevision < continuation.subject.queueRevision) {
    return { ok: false, code: "RNC-EVENT", action: "none" };
  }
  if (event.kind === "po-gate-resolved") {
    if (continuation.status !== "paused-po-gate" || event.atRevision <= continuation.terminal.atRevision) return decision("none", continuation.status, continuation.terminal.kind, "po-gate-not-pending", continuation.generation.number);
    if (event.pausedRecordSha256 !== continuation.recordSha256
      || event.poDecisionReceipt.featureId !== continuation.subject.featureId
      || event.poDecisionReceipt.continuationId !== continuation.continuationId
      || event.poDecisionReceipt.pauseRevision !== continuation.terminal.atRevision
      || event.poDecisionReceipt.resolvedRevision !== event.atRevision) return { ok: false, code: "RNC-EVENT", action: "none" };
    if (continuation.runner.capability !== "available") return decision("none", "unavailable", "unavailable", "capability-unavailable", continuation.generation.number);
    return decision("set", "active", "none", event.kind, continuation.generation.number);
  }
  if (["activate", "resume", "compact-reentry"].includes(event.kind)) {
    if (continuation.status !== "active") return decision("none", continuation.status, continuation.terminal.kind, "not-active", continuation.generation.number);
    if (continuation.runner.capability !== "available") return decision("none", "unavailable", "unavailable", "capability-unavailable", continuation.generation.number);
    // An active native goal spans ordinary resumes and compaction.  Only a
    // named PO gate pauses it and its recorded resolution restores that same Goal.
    return decision("none", "active", "none", "active-goal-retained", continuation.generation.number);
  }
  if (continuation.status !== "active") return decision("none", continuation.status, continuation.terminal.kind, "terminal-or-paused", continuation.generation.number);
  const mapping = {
    "po-gate": ["paused-po-gate", "named-po-gate"],
    "typed-blocker": ["blocked", "typed-blocker"],
    "verified-completion": ["achieved", "verified-completion"],
    "explicit-control": ["cleared", "explicit-control-change"],
    "capability-unavailable": ["unavailable", "unavailable"],
    "activation-failed": ["failed", "failed"],
  }[event.kind];
  if (!mapping) return { ok: false, code: "RNC-TRANSITION", action: "none" };
  return decision(event.kind === "po-gate" ? "pause" : "clear", mapping[0], mapping[1], event.kind, continuation.generation.number);
}
