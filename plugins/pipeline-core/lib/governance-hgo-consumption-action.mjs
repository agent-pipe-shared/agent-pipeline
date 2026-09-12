// SPDX-License-Identifier: SUL-1.0
/** Minimal public-safe projection of one authenticated HGO consumption. */

import { buildGovernanceActionEvent, validateGovernanceActionEvent } from "./governance-action-events.mjs";
import {
  GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
  buildGovernanceActionArtifactRetry,
  preflightGovernanceActionOutput,
  retryGovernanceActionArtifact,
  validateGovernanceActionArtifactRetry,
  writeGovernanceActionArtifact,
} from "./governance-action-artifact.mjs";
import {
  HGO_GOVERNANCE_CONSUMPTION_SOURCE_SCHEMA,
  validateGovernanceHgoConsumptionSource,
} from "./governance-hgo-consumption-source.mjs";

export { preflightGovernanceActionOutput };
export const GOVERNANCE_HGO_CONSUMPTION_RETRY_SCHEMA = "pipeline.governance-hgo-consumption-action-retry.v1";

const SOURCE_KEYS = Object.freeze(["schema", "status", "consumptionSha256", "candidate"]);
const BUILD_KEYS = Object.freeze(["source"]);
const RETRY_KEYS = Object.freeze(["schema", "eventOutPath", "event"]);

export class GovernanceHgoConsumptionActionError extends Error {
  constructor(code) {
    super("Governance HGO consumption action is invalid.");
    this.name = "GovernanceHgoConsumptionActionError";
    this.code = code;
  }
}

function fail(code) { throw new GovernanceHgoConsumptionActionError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function checkedEvent(event, code) {
  let checked;
  try { checked = validateGovernanceActionEvent(event); } catch { fail(code); }
  if (checked.kind !== "gate" || checked.status !== "completed" || checked.reasonCode !== "HGO_CONSUMED") fail(code);
  return checked;
}
function translateArtifactError(error) {
  const codes = {
    "GAA-EVENT": "GHCA-OUTPUT-EVENT",
    "GAA-OUTPUT-PATH": "GHCA-OUTPUT-PATH",
    "GAA-OUTPUT-EXISTS": "GHCA-OUTPUT-EXISTS",
    "GAA-OUTPUT-WRITE": "GHCA-OUTPUT-WRITE",
    "GAA-OUTPUT-READBACK": "GHCA-OUTPUT-READBACK",
  };
  const code = codes[error?.code];
  if (code !== undefined) fail(code);
  throw error;
}

/** Build only from the closed readback returned by HGO's authenticated store. */
export function buildGovernanceHgoConsumptionAction(input) {
  if (!exact(input, BUILD_KEYS) || !exact(input.source, SOURCE_KEYS)
    || input.source.schema !== HGO_GOVERNANCE_CONSUMPTION_SOURCE_SCHEMA
    || input.source.status !== "consumed") fail("GHCA-SOURCE-SHAPE");
  let source;
  try { source = validateGovernanceHgoConsumptionSource(input.source); }
  catch (error) { fail(error?.code === "GHCS-DIGEST" ? "GHCA-SOURCE-DIGEST" : "GHCA-SOURCE-BINDING"); }
  try {
    return buildGovernanceActionEvent({
      kind: "gate",
      status: "completed",
      reasonCode: "HGO_CONSUMED",
      requestId: source.consumptionSha256,
      featureId: Object.freeze({ state: "not-applicable" }),
      sessionId: Object.freeze({ state: "not-applicable" }),
      candidate: source.candidate,
    });
  } catch { fail("GHCA-SOURCE-BINDING"); }
}

export function buildGovernanceHgoConsumptionRetry({ eventOutPath, event } = {}) {
  const checked = checkedEvent(event, "GHCA-RETRY-EVENT");
  let retry;
  try { retry = buildGovernanceActionArtifactRetry({ eventOutPath, event: checked }); }
  catch (error) { fail(error?.code === "GAA-RETRY-PATH" ? "GHCA-RETRY-PATH" : "GHCA-RETRY-EVENT"); }
  return Object.freeze({
    schema: GOVERNANCE_HGO_CONSUMPTION_RETRY_SCHEMA,
    eventOutPath: retry.eventOutPath,
    event: retry.event,
  });
}

export function validateGovernanceHgoConsumptionRetry(retry) {
  if (!exact(retry, RETRY_KEYS) || retry.schema !== GOVERNANCE_HGO_CONSUMPTION_RETRY_SCHEMA) fail("GHCA-RETRY-SHAPE");
  return buildGovernanceHgoConsumptionRetry({ eventOutPath: retry.eventOutPath, event: retry.event });
}

export function writeGovernanceHgoConsumptionAction({ rootDir, eventOutPath, event } = {}) {
  const checked = checkedEvent(event, "GHCA-OUTPUT-EVENT");
  try { return writeGovernanceActionArtifact({ rootDir, eventOutPath, event: checked }); }
  catch (error) { translateArtifactError(error); }
}

export function retryGovernanceHgoConsumptionAction({ rootDir, retry } = {}) {
  const checked = validateGovernanceHgoConsumptionRetry(retry);
  const artifactRetry = validateGovernanceActionArtifactRetry({
    schema: GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
    eventOutPath: checked.eventOutPath,
    event: checked.event,
  });
  try { return retryGovernanceActionArtifact({ rootDir, retry: artifactRetry }); }
  catch (error) { translateArtifactError(error); }
}
