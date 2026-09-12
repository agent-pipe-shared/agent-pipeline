// SPDX-License-Identifier: SUL-1.0
/** Pure closed payload foundation for non-dispatch governance actions. */

import { canonicalSha256 } from "./governance-event.mjs";

export const GOVERNANCE_ACTION_EVENT_SCHEMA = "pipeline.governance-action-event.v1";
export const GOVERNANCE_ACTION_ID_DOMAIN = `${GOVERNANCE_ACTION_EVENT_SCHEMA}:action-id`;
export const GOVERNANCE_ACTION_EVENT_ID_DOMAIN = `${GOVERNANCE_ACTION_EVENT_SCHEMA}:event-id`;

export const GOVERNANCE_ACTION_MATRIX = Object.freeze({
  verification: Object.freeze({
    completed: Object.freeze(["VERIFICATION_PASSED"]),
    failed: Object.freeze(["VERIFICATION_FAILED"]),
    unknown: Object.freeze(["VERIFICATION_UNKNOWN"]),
    unavailable: Object.freeze(["VERIFICATION_UNAVAILABLE"]),
  }),
  review: Object.freeze({ completed: Object.freeze(["REVIEW_PASSED", "REVIEW_FINDINGS"]) }),
  gate: Object.freeze({ completed: Object.freeze(["PUSH_APPROVED", "DEPLOY_APPROVED"]) }),
  recovery: Object.freeze({ completed: Object.freeze(["RECOVERY_COMPLETED"]) }),
  reconciliation: Object.freeze({ completed: Object.freeze(["RECONCILIATION_COMPLETED"]) }),
});

const TOP_KEYS = Object.freeze(["eventId", "kind", "status", "reasonCode", "correlation", "candidate"]);
const BUILD_KEYS = Object.freeze(["kind", "status", "reasonCode", "requestId", "featureId", "sessionId", "candidate"]);
const CORRELATION_KEYS = Object.freeze(["actionId", "featureId", "requestId", "sessionId"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

export class GovernanceActionEventError extends Error {
  constructor(code) {
    super("Governance action event is invalid.");
    this.name = "GovernanceActionEventError";
    this.code = code;
  }
}

function fail(code) { throw new GovernanceActionEventError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function sourceIdentity(value) {
  return (typeof value === "string" && ID.test(value))
    || (exact(value, ["state"]) && value.state === "not-applicable");
}
function freezeIdentity(value) { return typeof value === "string" ? value : Object.freeze({ state: value.state }); }

export function deriveGovernanceActionId({ kind, requestId } = {}) {
  if (!Object.hasOwn(GOVERNANCE_ACTION_MATRIX, kind) || typeof requestId !== "string" || !ID.test(requestId)) fail("GAE-ACTION-ID-INPUT");
  return canonicalSha256({ domain: GOVERNANCE_ACTION_ID_DOMAIN, kind, requestId });
}

export function deriveGovernanceActionEventId({ kind, status, reasonCode, correlation, candidate } = {}) {
  return canonicalSha256({ domain: GOVERNANCE_ACTION_EVENT_ID_DOMAIN, kind, status, reasonCode, correlation, candidate });
}

/** Validate, recompute both identifiers, clone, and deeply freeze one portable payload. */
export function validateGovernanceActionEvent(event) {
  if (!exact(event, TOP_KEYS)) fail("GAE-SHAPE");
  if (!Object.hasOwn(GOVERNANCE_ACTION_MATRIX, event.kind)) fail("GAE-KIND");
  if (!Object.hasOwn(GOVERNANCE_ACTION_MATRIX[event.kind], event.status)) fail("GAE-STATUS");
  if (!GOVERNANCE_ACTION_MATRIX[event.kind][event.status].includes(event.reasonCode)) fail("GAE-REASON");
  if (!exact(event.correlation, CORRELATION_KEYS)
    || typeof event.correlation.requestId !== "string" || !ID.test(event.correlation.requestId)
    || !sourceIdentity(event.correlation.featureId) || !sourceIdentity(event.correlation.sessionId)) fail("GAE-CORRELATION");
  if (!exact(event.candidate, ["commit", "tree"])
    || typeof event.candidate.commit !== "string" || !OID.test(event.candidate.commit)
    || typeof event.candidate.tree !== "string" || !OID.test(event.candidate.tree)) fail("GAE-CANDIDATE");
  const actionId = deriveGovernanceActionId({ kind: event.kind, requestId: event.correlation.requestId });
  if (typeof event.correlation.actionId !== "string" || !SHA256.test(event.correlation.actionId)
    || event.correlation.actionId !== actionId) fail("GAE-ACTION-ID");
  const correlation = Object.freeze({
    actionId,
    featureId: freezeIdentity(event.correlation.featureId),
    requestId: event.correlation.requestId,
    sessionId: freezeIdentity(event.correlation.sessionId),
  });
  const candidate = Object.freeze({ commit: event.candidate.commit, tree: event.candidate.tree });
  const eventId = deriveGovernanceActionEventId({
    kind: event.kind, status: event.status, reasonCode: event.reasonCode, correlation, candidate,
  });
  if (typeof event.eventId !== "string" || !SHA256.test(event.eventId) || event.eventId !== eventId) fail("GAE-EVENT-ID");
  return Object.freeze({ eventId, kind: event.kind, status: event.status, reasonCode: event.reasonCode, correlation, candidate });
}

/** Build one complete payload from already validated source identifiers and exact candidate. */
export function buildGovernanceActionEvent(input) {
  if (!exact(input, BUILD_KEYS)) fail("GAE-BUILD-SHAPE");
  if (!Object.hasOwn(GOVERNANCE_ACTION_MATRIX, input.kind)) fail("GAE-KIND");
  if (!Object.hasOwn(GOVERNANCE_ACTION_MATRIX[input.kind], input.status)) fail("GAE-STATUS");
  if (!GOVERNANCE_ACTION_MATRIX[input.kind][input.status].includes(input.reasonCode)) fail("GAE-REASON");
  if (typeof input.requestId !== "string" || !ID.test(input.requestId)
    || !sourceIdentity(input.featureId) || !sourceIdentity(input.sessionId)) fail("GAE-CORRELATION");
  if (!exact(input.candidate, ["commit", "tree"])
    || typeof input.candidate.commit !== "string" || !OID.test(input.candidate.commit)
    || typeof input.candidate.tree !== "string" || !OID.test(input.candidate.tree)) fail("GAE-CANDIDATE");
  const actionId = deriveGovernanceActionId({ kind: input.kind, requestId: input.requestId });
  const correlation = {
    actionId, featureId: input.featureId, requestId: input.requestId, sessionId: input.sessionId,
  };
  const eventId = deriveGovernanceActionEventId({
    kind: input.kind, status: input.status, reasonCode: input.reasonCode, correlation, candidate: input.candidate,
  });
  return validateGovernanceActionEvent({
    eventId, kind: input.kind, status: input.status, reasonCode: input.reasonCode, correlation, candidate: input.candidate,
  });
}
