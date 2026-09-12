// SPDX-License-Identifier: SUL-1.0
/** Runner-neutral projection and compatible wrapper for one aggregate terminal Verify fact. */

import {
  buildGovernanceActionArtifactRetry,
  preflightGovernanceActionOutput,
  retryGovernanceActionArtifact,
  writeGovernanceActionArtifact,
} from "./governance-action-artifact.mjs";
import { buildGovernanceActionEvent, validateGovernanceActionEvent } from "./governance-action-events.mjs";

export const GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA = "pipeline.governance-verification-terminal.v1";
export const GOVERNANCE_VERIFICATION_RETRY_SCHEMA = "pipeline.governance-verification-action-retry.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const OUTCOMES = Object.freeze({
  passed: Object.freeze({ status: "completed", reasonCode: "VERIFICATION_PASSED" }),
  failed: Object.freeze({ status: "failed", reasonCode: "VERIFICATION_FAILED" }),
  unknown: Object.freeze({ status: "unknown", reasonCode: "VERIFICATION_UNKNOWN" }),
  unavailable: Object.freeze({ status: "unavailable", reasonCode: "VERIFICATION_UNAVAILABLE" }),
});
const SOURCE_KEYS = Object.freeze([
  "schema", "terminalEvidenceSha256", "outcome", "candidate", "featureId", "sessionId",
]);
const RETRY_KEYS = Object.freeze(["schema", "eventOutPath", "event"]);

export class GovernanceVerificationActionError extends Error {
  constructor(code) {
    super("Governance verification action is invalid.");
    this.name = "GovernanceVerificationActionError";
    this.code = code;
  }
}

function fail(code) { throw new GovernanceVerificationActionError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function checkedVerificationEvent(event, code) {
  let checked;
  try { checked = validateGovernanceActionEvent(event); } catch { fail(code); }
  if (checked.kind !== "verification") fail(code);
  return checked;
}
function translateArtifactError(error) {
  const codes = {
    "GAA-EVENT": "GVA-OUTPUT-EVENT",
    "GAA-RETRY-PATH": "GVA-RETRY-PATH",
    "GAA-RETRY-SHAPE": "GVA-RETRY-SHAPE",
    "GAA-OUTPUT-PATH": "GVA-OUTPUT-PATH",
    "GAA-OUTPUT-EXISTS": "GVA-OUTPUT-EXISTS",
    "GAA-OUTPUT-WRITE": "GVA-OUTPUT-WRITE",
    "GAA-OUTPUT-READBACK": "GVA-OUTPUT-READBACK",
  };
  const code = codes[error?.code];
  if (code !== undefined) fail(code);
  throw error;
}

/** Build exactly one closed action from an aggregate terminal Verify binding. */
export function buildGovernanceVerificationAction(source) {
  if (!exact(source, SOURCE_KEYS) || source.schema !== GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA) fail("GVA-SOURCE-SHAPE");
  if (typeof source.terminalEvidenceSha256 !== "string" || !SHA256.test(source.terminalEvidenceSha256)) fail("GVA-SOURCE-DIGEST");
  const outcome = OUTCOMES[source.outcome];
  if (outcome === undefined) fail("GVA-SOURCE-OUTCOME");
  try {
    return buildGovernanceActionEvent({
      kind: "verification",
      status: outcome.status,
      reasonCode: outcome.reasonCode,
      requestId: source.terminalEvidenceSha256,
      featureId: source.featureId,
      sessionId: source.sessionId,
      candidate: source.candidate,
    });
  } catch { fail("GVA-SOURCE-BINDING"); }
}

/** Closed data sufficient to retry only the observational artifact write. */
export function buildGovernanceVerificationRetry({ eventOutPath, event } = {}) {
  const checked = checkedVerificationEvent(event, "GVA-RETRY-EVENT");
  try {
    const retry = buildGovernanceActionArtifactRetry({ eventOutPath, event: checked });
    return Object.freeze({ schema: GOVERNANCE_VERIFICATION_RETRY_SCHEMA, eventOutPath: retry.eventOutPath, event: retry.event });
  } catch (error) {
    if (error?.code === "GAA-RETRY-PATH") fail("GVA-RETRY-PATH");
    translateArtifactError(error);
  }
}

export function validateGovernanceVerificationRetry(retry) {
  if (!exact(retry, RETRY_KEYS) || retry.schema !== GOVERNANCE_VERIFICATION_RETRY_SCHEMA) fail("GVA-RETRY-SHAPE");
  return buildGovernanceVerificationRetry({ eventOutPath: retry.eventOutPath, event: retry.event });
}

export function preflightGovernanceVerificationActionOutput(options) {
  try { return preflightGovernanceActionOutput(options); } catch (error) { translateArtifactError(error); }
}

export function writeGovernanceVerificationAction({ rootDir, eventOutPath, event, allowExistingIdentical = false } = {}) {
  const checked = checkedVerificationEvent(event, "GVA-OUTPUT-EVENT");
  try {
    return writeGovernanceActionArtifact({ rootDir, eventOutPath, event: checked, allowExistingIdentical });
  } catch (error) { translateArtifactError(error); }
}

export function retryGovernanceVerificationAction({ rootDir, retry } = {}) {
  const checked = validateGovernanceVerificationRetry(retry);
  let artifactRetry;
  try { artifactRetry = buildGovernanceActionArtifactRetry({ eventOutPath: checked.eventOutPath, event: checked.event }); }
  catch (error) { translateArtifactError(error); }
  try { return retryGovernanceActionArtifact({ rootDir, retry: artifactRetry }); }
  catch (error) { translateArtifactError(error); }
}
