// SPDX-License-Identifier: SUL-1.0
/** Closed projection for one durably accepted, exact-candidate Critic receipt. */

import { buildGovernanceActionEvent, validateGovernanceActionEvent } from "./governance-action-events.mjs";
import { canonicalSha256 } from "./governance-event.mjs";
import {
  GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
  buildGovernanceActionArtifactRetry,
  preflightGovernanceActionOutput,
  retryGovernanceActionArtifact,
  validateGovernanceActionArtifactRetry,
  writeGovernanceActionArtifact,
} from "./governance-action-artifact.mjs";

export const GOVERNANCE_REVIEW_SOURCE_SCHEMA = "pipeline.governance-review-source.v1";
export const GOVERNANCE_REVIEW_RETRY_SCHEMA = "pipeline.governance-review-action-retry.v1";
export const GOVERNANCE_REVIEW_REQUEST_ID_DOMAIN = "pipeline.governance-review-action.v1:request-id";

const SOURCE_KEYS = Object.freeze(["schema", "receiptSha256", "verdictSha256", "candidate", "featureId", "sessionId", "reviewPass", "findingCount"]);
const RETRY_KEYS = Object.freeze(["schema", "eventOutPath", "event"]);
const SHA256 = /^[a-f0-9]{64}$/u;

export class GovernanceReviewActionError extends Error {
  constructor(code) {
    super("Governance review action is invalid.");
    this.name = "GovernanceReviewActionError";
    this.code = code;
  }
}

function fail(code) { throw new GovernanceReviewActionError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function checkedReviewEvent(event, operation) {
  let checked;
  try { checked = validateGovernanceActionEvent(event); } catch { fail(`GRA-${operation}-EVENT`); }
  if (checked.kind !== "review" || checked.status !== "completed"
    || !["REVIEW_PASSED", "REVIEW_FINDINGS"].includes(checked.reasonCode)) fail(`GRA-${operation}-EVENT`);
  return checked;
}
function translateArtifactError(error) {
  const codes = {
    "GAA-OUTPUT-PATH": "GRA-OUTPUT-PATH",
    "GAA-OUTPUT-EXISTS": "GRA-OUTPUT-EXISTS",
    "GAA-OUTPUT-WRITE": "GRA-OUTPUT-WRITE",
    "GAA-OUTPUT-READBACK": "GRA-OUTPUT-READBACK",
  };
  if (codes[error?.code] !== undefined) fail(codes[error.code]);
  throw error;
}

export function buildGovernanceReviewAction(source) {
  if (!exact(source, SOURCE_KEYS) || source.schema !== GOVERNANCE_REVIEW_SOURCE_SCHEMA) fail("GRA-SOURCE-SHAPE");
  if (typeof source.receiptSha256 !== "string" || !SHA256.test(source.receiptSha256)
    || typeof source.verdictSha256 !== "string" || !SHA256.test(source.verdictSha256)) fail("GRA-SOURCE-DIGEST");
  if (typeof source.reviewPass !== "boolean" || !Number.isSafeInteger(source.findingCount) || source.findingCount < 0) fail("GRA-SOURCE-VERDICT");
  if (!source.reviewPass && source.findingCount === 0) fail("GRA-SOURCE-VERDICT");
  const reasonCode = source.findingCount === 0 && source.reviewPass ? "REVIEW_PASSED" : "REVIEW_FINDINGS";
  const requestId = canonicalSha256({
    domain: GOVERNANCE_REVIEW_REQUEST_ID_DOMAIN,
    receiptSha256: source.receiptSha256,
    verdictSha256: source.verdictSha256,
  });
  try {
    return buildGovernanceActionEvent({
      kind: "review",
      status: "completed",
      reasonCode,
      requestId,
      featureId: source.featureId,
      sessionId: source.sessionId,
      candidate: source.candidate,
    });
  } catch { fail("GRA-SOURCE-BINDING"); }
}

export function buildGovernanceReviewRetry({ eventOutPath, event } = {}) {
  const checked = checkedReviewEvent(event, "RETRY");
  try {
    const retry = buildGovernanceActionArtifactRetry({ eventOutPath, event: checked });
    return Object.freeze({ schema: GOVERNANCE_REVIEW_RETRY_SCHEMA, eventOutPath: retry.eventOutPath, event: retry.event });
  } catch (error) {
    if (error?.code === "GAA-RETRY-PATH") fail("GRA-RETRY-PATH");
    fail("GRA-RETRY-EVENT");
  }
}

export function validateGovernanceReviewRetry(retry) {
  if (!exact(retry, RETRY_KEYS) || retry.schema !== GOVERNANCE_REVIEW_RETRY_SCHEMA) fail("GRA-RETRY-SHAPE");
  return buildGovernanceReviewRetry({ eventOutPath: retry.eventOutPath, event: retry.event });
}

export function preflightGovernanceReviewActionOutput(options) {
  try { return preflightGovernanceActionOutput(options); } catch (error) { translateArtifactError(error); }
}

export function writeGovernanceReviewAction({ rootDir, eventOutPath, event } = {}) {
  const checked = checkedReviewEvent(event, "OUTPUT");
  try { return writeGovernanceActionArtifact({ rootDir, eventOutPath, event: checked }); }
  catch (error) { translateArtifactError(error); }
}

export function retryGovernanceReviewAction({ rootDir, retry } = {}) {
  const checked = validateGovernanceReviewRetry(retry);
  const generic = validateGovernanceActionArtifactRetry({
    schema: GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
    eventOutPath: checked.eventOutPath,
    event: checked.event,
  });
  try { return retryGovernanceActionArtifact({ rootDir, retry: generic }); }
  catch (error) { translateArtifactError(error); }
}
