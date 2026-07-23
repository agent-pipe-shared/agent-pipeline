// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only projection of the sanctioned `pipeline.state.v0` continuity record.
 *
 * This module deliberately has no writer, lock or transition import.  A status
 * question describes current work; it cannot close, revoke or otherwise alter it.
 * `pipeline-state.mjs` remains the only writer for the enclosing state and
 * `validateContinuityState` remains the only continuity-shape authority.
 */
import { validateContinuityState } from "./continuity-state.mjs";
import { projectGateEstimate } from "./gate-estimate.mjs";

const HOST_NO_BACKGROUND_RESUME = Object.freeze({
  mode: "resume-on-next-turn",
  reasonCode: "host-no-background-wakeup",
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function activeFeatureOf(state) {
  const feature = state?.activeFeature;
  if (feature === undefined) return { kind: "absent", value: null };
  if (!isObject(feature)
    || typeof feature.id !== "string" || feature.id.length === 0
    || typeof feature.planPath !== "string" || feature.planPath.length === 0
    || typeof feature.phase !== "string" || feature.phase.length === 0) {
    return { kind: "invalid", value: null };
  }
  return {
    kind: "valid",
    value: { id: feature.id, planPath: feature.planPath, phase: feature.phase },
  };
}

function unknownEta() {
  // No ETA field exists in either sanctioned state.  Do not manufacture one
  // from a revision, phase or wall clock: only a separately evidence-bound
  // gate estimate may ever turn this into a known range.
  return { state: "unknown", rangeMinutes: null, source: null };
}

function safeEtaSource(value) {
  if (!isObject(value) || Object.keys(value).length !== 2
    || typeof value.path !== "string" || value.path.length === 0 || value.path.length > 240
    || value.path.startsWith("/") || value.path.includes("\\") || value.path.includes("\0")
    || !value.path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
    || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) return false;
  return true;
}

function sourcedEta(value) {
  if (!isObject(value) || Object.keys(value).length !== 2
    || !isObject(value.rangeMinutes) || Object.keys(value.rangeMinutes).length !== 2
    || !Number.isSafeInteger(value.rangeMinutes.min) || value.rangeMinutes.min < 0
    || !Number.isSafeInteger(value.rangeMinutes.max) || value.rangeMinutes.max < value.rangeMinutes.min
    || !safeEtaSource(value.source)) return unknownEta();
  return {
    state: "known",
    rangeMinutes: { min: value.rangeMinutes.min, max: value.rangeMinutes.max },
    source: { path: value.source.path, sha256: value.source.sha256 },
  };
}

function status({
  stateStatus,
  lifecycle,
  code,
  activeFeature,
  continuityStatus,
  continuityRevision = null,
  nextAction = { state: "unknown", value: null },
  resume = { mode: null, reasonCode: null },
  eta = unknownEta(),
}) {
  return {
    stateStatus,
    lifecycle,
    code,
    activeFeature,
    continuity: { status: continuityStatus, revision: continuityRevision },
    nextAction,
    resume,
    eta,
  };
}

function projectedResume(continuity, hostSupportsBackground) {
  if (hostSupportsBackground === true) {
    return { mode: continuity.resume.mode, reasonCode: continuity.resume.reasonCode };
  }
  return { ...HOST_NO_BACKGROUND_RESUME };
}

/**
 * Project an already-read `pipeline.state.v0` object without mutating it.
 *
 * The host has no guaranteed background wakeup by default.  Therefore every
 * active status result maps to `resume-on-next-turn` unless the caller has
 * explicitly evidenced `hostSupportsBackground: true`.
 */
export function projectContinuityStatus(state, { hostSupportsBackground = false, gateEta = null, gateEstimateContext = null } = {}) {
  if (!isObject(state)) {
    return status({
      stateStatus: "malformed",
      lifecycle: "unavailable",
      code: "CS-STATUS-STATE-INVALID",
      activeFeature: null,
      continuityStatus: "unavailable",
    });
  }

  const active = activeFeatureOf(state);
  if (active.kind === "invalid") {
    return status({
      stateStatus: "ok",
      lifecycle: "unavailable",
      code: "CS-STATUS-ACTIVE-FEATURE-INVALID",
      activeFeature: null,
      continuityStatus: "unavailable",
    });
  }

  if (active.kind === "absent") {
    if (state.continuity !== undefined) {
      return status({
        stateStatus: "ok",
        lifecycle: "unavailable",
        code: "CS-STATUS-ORPHAN-CONTINUITY",
        activeFeature: null,
        continuityStatus: "invalid",
      });
    }
    return status({
      stateStatus: "ok",
      lifecycle: "inactive",
      code: "CS-STATUS-INACTIVE",
      activeFeature: null,
      continuityStatus: "absent",
    });
  }

  const fallbackResume = hostSupportsBackground === true
    ? { mode: "immediate", reasonCode: "active-turn" }
    : { ...HOST_NO_BACKGROUND_RESUME };
  const projected = gateEstimateContext === null
    ? null
    : projectGateEstimate(state.gateEstimate, { activeFeature: active.value, ...gateEstimateContext });
  const eta = projected === null
    ? sourcedEta(gateEta)
    : projected.state === "known"
      ? { state: "known", rangeMinutes: projected.rangeMinutes, source: projected.source }
      : unknownEta();
  if (state.continuity === undefined) {
    return status({
      stateStatus: "ok",
      lifecycle: "active",
      code: "CS-STATUS-ACTIVE-NO-CONTINUITY",
      activeFeature: active.value,
      continuityStatus: "absent",
      resume: fallbackResume,
      eta,
    });
  }

  const valid = validateContinuityState(state.continuity, active.value.id);
  if (!valid.ok) {
    return status({
      stateStatus: "ok",
      lifecycle: "active",
      code: "CS-STATUS-CONTINUITY-INVALID",
      activeFeature: active.value,
      continuityStatus: "invalid",
      resume: fallbackResume,
      eta,
    });
  }

  const continuity = state.continuity;
  const nextAction = continuity.blocker === null
    ? { state: "known", value: continuity.queueHead.nextAction }
    : { state: "blocked", value: null };
  return status({
    stateStatus: "ok",
    lifecycle: "active",
    code: "CS-STATUS-ACTIVE",
    activeFeature: active.value,
    continuityStatus: "valid",
    continuityRevision: continuity.revision,
    nextAction,
    resume: projectedResume(continuity, hostSupportsBackground),
    eta,
  });
}

/** Project a `readState()` result while preserving an absent/malformed source distinction. */
export function projectReadContinuityStatus(readResult, options = {}) {
  if (!isObject(readResult) || typeof readResult.status !== "string") {
    return status({
      stateStatus: "malformed",
      lifecycle: "unavailable",
      code: "CS-STATUS-READ-INVALID",
      activeFeature: null,
      continuityStatus: "unavailable",
    });
  }
  if (readResult.status === "absent") {
    return status({
      stateStatus: "absent",
      lifecycle: "inactive",
      code: "CS-STATUS-STATE-ABSENT",
      activeFeature: null,
      continuityStatus: "absent",
    });
  }
  if (readResult.status === "malformed") {
    return status({
      stateStatus: "malformed",
      lifecycle: "unavailable",
      code: "CS-STATUS-STATE-MALFORMED",
      activeFeature: null,
      continuityStatus: "unavailable",
    });
  }
  if (readResult.status !== "ok") {
    return status({
      stateStatus: "malformed",
      lifecycle: "unavailable",
      code: "CS-STATUS-READ-INVALID",
      activeFeature: null,
      continuityStatus: "unavailable",
    });
  }
  return projectContinuityStatus(readResult.state, options);
}

export const CONTINUITY_STATUS_CODES = Object.freeze([
  "CS-STATUS-STATE-INVALID",
  "CS-STATUS-ACTIVE-FEATURE-INVALID",
  "CS-STATUS-ORPHAN-CONTINUITY",
  "CS-STATUS-INACTIVE",
  "CS-STATUS-ACTIVE-NO-CONTINUITY",
  "CS-STATUS-CONTINUITY-INVALID",
  "CS-STATUS-ACTIVE",
  "CS-STATUS-READ-INVALID",
  "CS-STATUS-STATE-ABSENT",
  "CS-STATUS-STATE-MALFORMED",
]);
