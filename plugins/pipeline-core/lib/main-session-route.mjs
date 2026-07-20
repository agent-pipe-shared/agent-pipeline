// SPDX-License-Identifier: Apache-2.0

/**
 * Desired-versus-observed reconciliation for the coordinator's main session.
 *
 * A requested profile route is policy, not identity evidence.  Identity is
 * accepted only when a host labels the subject as the main session.  In
 * particular, a child/dispatch receipt can never satisfy this boundary.
 */
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameRoute(left, right) {
  return left.runner === right.runner
    && left.selector.kind === right.selector.kind
    && left.selector.value === right.selector.value
    && left.effort === right.effort;
}

function desiredRoute(profile, phase, runner, registry) {
  const cell = registry?.profiles?.[profile]?.[phase]?.[runner];
  if (!cell || !isObject(cell.selector) || typeof cell.selector.kind !== "string"
    || typeof cell.selector.value !== "string" || typeof cell.effort !== "string") return null;
  return {
    runner,
    selector: { kind: cell.selector.kind, value: cell.selector.value },
    effort: cell.effort,
  };
}

function observedMainSession(value) {
  if (!isObject(value)
    || value.subject !== "main-session"
    || value.source !== "host-introspection"
    || !SAFE_ID.test(value.eventId ?? "")
    || !["claude", "codex"].includes(value.runner)
    || typeof value.modelId !== "string" || value.modelId.length === 0
    || typeof value.effort !== "string" || value.effort.length === 0) return null;
  return {
    eventId: value.eventId,
    runner: value.runner,
    modelId: value.modelId,
    effort: value.effort,
  };
}

function matchesException(exception, observed) {
  return isObject(exception)
    && exception.authority === "po"
    && SAFE_ID.test(exception.id ?? "")
    && ["claude", "codex"].includes(exception.runner)
    && typeof exception.modelId === "string" && exception.modelId.length > 0
    && typeof exception.effort === "string" && exception.effort.length > 0
    && exception.runner === observed.runner
    && exception.modelId === observed.modelId
    && exception.effort === observed.effort;
}

function unverified(desired, reasonCode) {
  return {
    code: "MSR-UNVERIFIED",
    desired,
    observed: null,
    action: null,
    reasonCode,
  };
}

/**
 * Reconcile a profile/phase authority against one host-attested main-session
 * observation. This function is deliberately pure: it cannot change a model,
 * persist an acknowledgement, or infer identity from a child route receipt.
 * Callers persist `observed.eventId` only after displaying a drift request.
 */
export function reconcileMainSessionRoute({
  profile,
  phase,
  runner,
  observed,
  reportedEventIds = [],
  poException = null,
  registry = loadRunnerProfilesV3Registry(),
} = {}) {
  const desired = desiredRoute(profile, phase, runner, registry);
  if (desired === null) return unverified(null, "MSR-DESIRED-ROUTE-UNAVAILABLE");

  const main = observedMainSession(observed);
  if (main === null) return unverified(desired, "MSR-HOST-OBSERVATION-UNAVAILABLE");

  const actual = {
    runner: main.runner,
    selector: { kind: "model-id", value: main.modelId },
    effort: main.effort,
  };
  if (sameRoute(desired, actual)) {
    return { code: "MSR-ALIGNED", desired, observed: main, action: null, reasonCode: null };
  }
  if (matchesException(poException, main)) {
    return {
      code: "MSR-PO-EXCEPTION", desired, observed: main, action: null,
      reasonCode: "MSR-EXPLICIT-PO-ROUTE-EXCEPTION",
    };
  }
  const alreadyReported = Array.isArray(reportedEventIds) && reportedEventIds.includes(main.eventId);
  if (alreadyReported) {
    return { code: "MSR-DRIFT-ALREADY-REPORTED", desired, observed: main, action: null, reasonCode: null };
  }
  return {
    code: "MSR-DRIFT-RETURN-REQUESTED",
    desired,
    observed: main,
    reasonCode: "MSR-OBSERVED-DESIRED-MISMATCH",
    action: {
      kind: "request-main-session-route-change",
      eventId: main.eventId,
      target: desired,
      automatic: false,
    },
  };
}
