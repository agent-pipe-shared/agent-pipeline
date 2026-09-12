// SPDX-License-Identifier: SUL-1.0
/** Closed projection for an exact-candidate push or deploy approval. */

import { buildGovernanceActionEvent, validateGovernanceActionEvent } from "./governance-action-events.mjs";
import {
  GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
  buildGovernanceActionArtifactRetry,
  preflightGovernanceActionOutput,
  retryGovernanceActionArtifact,
  validateGovernanceActionArtifactRetry,
  writeGovernanceActionArtifact,
} from "./governance-action-artifact.mjs";

export { preflightGovernanceActionOutput };
export const GOVERNANCE_GATE_SOURCE_SCHEMA = "pipeline.governance-gate-source.v1";
export const GOVERNANCE_GATE_RETRY_SCHEMA = "pipeline.governance-gate-action-retry.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const SOURCE_KEYS = Object.freeze([
  "schema", "approvalSubjectSha256", "action", "candidate", "featureId", "sessionId",
]);
const RETRY_KEYS = Object.freeze(["schema", "eventOutPath", "event"]);
const REASONS = Object.freeze({ push: "PUSH_APPROVED", deploy: "DEPLOY_APPROVED" });

export class GovernanceGateActionError extends Error {
  constructor(code) {
    super("Governance gate action is invalid.");
    this.name = "GovernanceGateActionError";
    this.code = code;
  }
}

function fail(code) { throw new GovernanceGateActionError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function checkedGateEvent(event, code) {
  let checked;
  try { checked = validateGovernanceActionEvent(event); } catch { fail(code); }
  if (checked.kind !== "gate" || checked.status !== "completed"
    || !["PUSH_APPROVED", "DEPLOY_APPROVED"].includes(checked.reasonCode)) fail(code);
  return checked;
}
function translateArtifactError(error) {
  const codes = {
    "GAA-EVENT": "GGA-OUTPUT-EVENT",
    "GAA-OUTPUT-PATH": "GGA-OUTPUT-PATH",
    "GAA-OUTPUT-EXISTS": "GGA-OUTPUT-EXISTS",
    "GAA-OUTPUT-WRITE": "GGA-OUTPUT-WRITE",
    "GAA-OUTPUT-READBACK": "GGA-OUTPUT-READBACK",
  };
  const code = codes[error?.code];
  if (code !== undefined) fail(code);
  throw error;
}

export function buildGovernanceGateAction(source) {
  if (!exact(source, SOURCE_KEYS) || source.schema !== GOVERNANCE_GATE_SOURCE_SCHEMA) fail("GGA-SOURCE-SHAPE");
  if (typeof source.approvalSubjectSha256 !== "string" || !SHA256.test(source.approvalSubjectSha256)) fail("GGA-SOURCE-DIGEST");
  const reasonCode = REASONS[source.action];
  if (reasonCode === undefined) fail("GGA-SOURCE-ACTION");
  try {
    return buildGovernanceActionEvent({
      kind: "gate",
      status: "completed",
      reasonCode,
      requestId: source.approvalSubjectSha256,
      featureId: source.featureId,
      sessionId: source.sessionId,
      candidate: source.candidate,
    });
  } catch { fail("GGA-SOURCE-BINDING"); }
}

export function buildGovernanceGateRetry({ eventOutPath, event } = {}) {
  const checked = checkedGateEvent(event, "GGA-RETRY-EVENT");
  let retry;
  try { retry = buildGovernanceActionArtifactRetry({ eventOutPath, event: checked }); }
  catch (error) { fail(error?.code === "GAA-RETRY-PATH" ? "GGA-RETRY-PATH" : "GGA-RETRY-EVENT"); }
  return Object.freeze({ schema: GOVERNANCE_GATE_RETRY_SCHEMA, eventOutPath: retry.eventOutPath, event: retry.event });
}

export function validateGovernanceGateRetry(retry) {
  if (!exact(retry, RETRY_KEYS) || retry.schema !== GOVERNANCE_GATE_RETRY_SCHEMA) fail("GGA-RETRY-SHAPE");
  return buildGovernanceGateRetry({ eventOutPath: retry.eventOutPath, event: retry.event });
}

export function writeGovernanceGateAction({ rootDir, eventOutPath, event } = {}) {
  const checked = checkedGateEvent(event, "GGA-OUTPUT-EVENT");
  try { return writeGovernanceActionArtifact({ rootDir, eventOutPath, event: checked }); }
  catch (error) { translateArtifactError(error); }
}

export function retryGovernanceGateAction({ rootDir, retry } = {}) {
  const checked = validateGovernanceGateRetry(retry);
  const artifactRetry = validateGovernanceActionArtifactRetry({
    schema: GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
    eventOutPath: checked.eventOutPath,
    event: checked.event,
  });
  try { return retryGovernanceActionArtifact({ rootDir, retry: artifactRetry }); }
  catch (error) { translateArtifactError(error); }
}
