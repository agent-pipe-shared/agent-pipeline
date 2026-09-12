// SPDX-License-Identifier: SUL-1.0
/** Closed projections for exact-candidate recovery and reconciliation completions. */

import { buildGovernanceActionEvent, validateGovernanceActionEvent } from "./governance-action-events.mjs";
import {
  GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
  preflightGovernanceActionOutput,
  retryGovernanceActionArtifact,
  validateGovernanceActionArtifactRetry,
  writeGovernanceActionArtifact,
} from "./governance-action-artifact.mjs";

export { preflightGovernanceActionOutput };
export const GOVERNANCE_RECOVERY_SOURCE_SCHEMA = "pipeline.governance-recovery-source.v1";
export const GOVERNANCE_RECONCILIATION_SOURCE_SCHEMA = "pipeline.governance-reconciliation-source.v1";
export const GOVERNANCE_RECOVERY_RETRY_SCHEMA = "pipeline.governance-recovery-action-retry.v1";
export const GOVERNANCE_RECONCILIATION_RETRY_SCHEMA = "pipeline.governance-reconciliation-action-retry.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const SOURCE_KEYS = Object.freeze(["schema", "planSha256", "candidate", "featureId", "sessionId"]);
const RECOVERY_SOURCE_KEYS = Object.freeze(["schema", "recoveryPlanSha256", "candidate", "featureId", "sessionId"]);
const RECONCILIATION_SOURCE_KEYS = Object.freeze(["schema", "reconciliationPlanSha256", "candidate", "featureId", "sessionId"]);
const RETRY_KEYS = Object.freeze(["schema", "eventOutPath", "event"]);
const KINDS = Object.freeze({
  recovery: Object.freeze({ reasonCode: "RECOVERY_COMPLETED", retrySchema: GOVERNANCE_RECOVERY_RETRY_SCHEMA }),
  reconciliation: Object.freeze({ reasonCode: "RECONCILIATION_COMPLETED", retrySchema: GOVERNANCE_RECONCILIATION_RETRY_SCHEMA }),
});

export class GovernanceRecoveryReconciliationActionError extends Error {
  constructor(code) {
    super("Governance recovery or reconciliation action is invalid.");
    this.name = "GovernanceRecoveryReconciliationActionError";
    this.code = code;
  }
}

function fail(code) { throw new GovernanceRecoveryReconciliationActionError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function normalizedSource(source, kind) {
  const keys = kind === "recovery" ? RECOVERY_SOURCE_KEYS : RECONCILIATION_SOURCE_KEYS;
  const schema = kind === "recovery" ? GOVERNANCE_RECOVERY_SOURCE_SCHEMA : GOVERNANCE_RECONCILIATION_SOURCE_SCHEMA;
  const digestKey = kind === "recovery" ? "recoveryPlanSha256" : "reconciliationPlanSha256";
  if (!exact(source, keys) || source.schema !== schema) fail(`GRRA-${kind.toUpperCase()}-SOURCE-SHAPE`);
  const planSha256 = source[digestKey];
  if (typeof planSha256 !== "string" || !SHA256.test(planSha256)) fail(`GRRA-${kind.toUpperCase()}-SOURCE-DIGEST`);
  return Object.freeze({
    schema,
    planSha256,
    candidate: source.candidate,
    featureId: source.featureId,
    sessionId: source.sessionId,
  });
}
function build(source, kind) {
  const normalized = normalizedSource(source, kind);
  if (!exact(normalized, SOURCE_KEYS)) fail("GRRA-INTERNAL-SOURCE");
  try {
    return buildGovernanceActionEvent({
      kind,
      status: "completed",
      reasonCode: KINDS[kind].reasonCode,
      requestId: normalized.planSha256,
      featureId: normalized.featureId,
      sessionId: normalized.sessionId,
      candidate: normalized.candidate,
    });
  } catch { fail(`GRRA-${kind.toUpperCase()}-SOURCE-BINDING`); }
}
function checkedEvent(event, kind, operation) {
  let checked;
  try { checked = validateGovernanceActionEvent(event); } catch { fail(`GRRA-${kind.toUpperCase()}-${operation}-EVENT`); }
  if (checked.kind !== kind || checked.status !== "completed" || checked.reasonCode !== KINDS[kind].reasonCode) {
    fail(`GRRA-${kind.toUpperCase()}-${operation}-EVENT`);
  }
  return checked;
}
function translateArtifactError(error, kind) {
  const suffixes = {
    "GAA-OUTPUT-PATH": "OUTPUT-PATH",
    "GAA-OUTPUT-EXISTS": "OUTPUT-EXISTS",
    "GAA-OUTPUT-WRITE": "OUTPUT-WRITE",
    "GAA-OUTPUT-READBACK": "OUTPUT-READBACK",
  };
  const suffix = suffixes[error?.code];
  if (suffix !== undefined) fail(`GRRA-${kind.toUpperCase()}-${suffix}`);
  throw error;
}
function buildRetry({ eventOutPath, event } = {}, kind) {
  const checked = checkedEvent(event, kind, "RETRY");
  let artifactRetry;
  try {
    artifactRetry = validateGovernanceActionArtifactRetry({
      schema: GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
      eventOutPath,
      event: checked,
    });
  } catch (error) {
    if (error?.code === "GAA-RETRY-PATH") fail(`GRRA-${kind.toUpperCase()}-RETRY-PATH`);
    fail(`GRRA-${kind.toUpperCase()}-RETRY-EVENT`);
  }
  return Object.freeze({ schema: KINDS[kind].retrySchema, eventOutPath: artifactRetry.eventOutPath, event: artifactRetry.event });
}
function validateRetry(retry, kind) {
  if (!exact(retry, RETRY_KEYS) || retry.schema !== KINDS[kind].retrySchema) fail(`GRRA-${kind.toUpperCase()}-RETRY-SHAPE`);
  return buildRetry({ eventOutPath: retry.eventOutPath, event: retry.event }, kind);
}
function write({ rootDir, eventOutPath, event } = {}, kind) {
  const checked = checkedEvent(event, kind, "OUTPUT");
  try { return writeGovernanceActionArtifact({ rootDir, eventOutPath, event: checked }); }
  catch (error) { translateArtifactError(error, kind); }
}
function preflight(options, kind) {
  try { return preflightGovernanceActionOutput(options); }
  catch (error) { translateArtifactError(error, kind); }
}
function retry({ rootDir, retry: retryInput } = {}, kind) {
  const checked = validateRetry(retryInput, kind);
  const artifactRetry = validateGovernanceActionArtifactRetry({
    schema: GOVERNANCE_ACTION_ARTIFACT_RETRY_SCHEMA,
    eventOutPath: checked.eventOutPath,
    event: checked.event,
  });
  try { return retryGovernanceActionArtifact({ rootDir, retry: artifactRetry }); }
  catch (error) { translateArtifactError(error, kind); }
}

export function buildGovernanceRecoveryAction(source) { return build(source, "recovery"); }
export function buildGovernanceReconciliationAction(source) { return build(source, "reconciliation"); }
export function buildGovernanceRecoveryRetry(input) { return buildRetry(input, "recovery"); }
export function buildGovernanceReconciliationRetry(input) { return buildRetry(input, "reconciliation"); }
export function validateGovernanceRecoveryRetry(input) { return validateRetry(input, "recovery"); }
export function validateGovernanceReconciliationRetry(input) { return validateRetry(input, "reconciliation"); }
export function preflightGovernanceRecoveryActionOutput(input) { return preflight(input, "recovery"); }
export function preflightGovernanceReconciliationActionOutput(input) { return preflight(input, "reconciliation"); }
export function writeGovernanceRecoveryAction(input) { return write(input, "recovery"); }
export function writeGovernanceReconciliationAction(input) { return write(input, "reconciliation"); }
export function retryGovernanceRecoveryAction(input) { return retry(input, "recovery"); }
export function retryGovernanceReconciliationAction(input) { return retry(input, "reconciliation"); }
