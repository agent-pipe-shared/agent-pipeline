// SPDX-License-Identifier: SUL-1.0

/**
 * Local-caller-trusted model identity evidence for the coordinator's main
 * session. This is deliberately not a route receipt: it contains no effort
 * field and cannot satisfy main-session-route.mjs's full route contract.
 *
 * The statusLine process is the only producer in this repository. Its input
 * is treated as host-originated under the existing non-cryptographic ceiling;
 * this module does not claim provider or cryptographic attestation.
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = "pipeline.main-session-model-identity.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeSessionId(value) {
  return typeof value === "string" && SAFE_ID.test(value) ? value : null;
}

function safeModelId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 256 ? value : null;
}

export function modelIdentityFilePath(rootDir, sessionId) {
  return join(rootDir, ".claude", `.main-session-model-identity-${sessionId}.json`);
}

/**
 * Build evidence from a real statusLine model/session input. `nowIso` and
 * `eventId` are caller-provided seams so tests can prove the exact binding.
 * No desired route, runner default, or effort value is accepted here.
 */
export function buildModelIdentityObservation(input, { nowIso, eventId } = {}) {
  const sessionId = safeSessionId(input?.session_id);
  const modelId = safeModelId(input?.model?.display_name)
    ?? safeModelId(input?.model?.id)
    ?? safeModelId(input?.model);
  if (!sessionId || !modelId || typeof nowIso !== "string" || nowIso.length === 0
    || !SAFE_ID.test(eventId ?? "")) return null;
  return {
    schema: SCHEMA,
    subject: "main-session",
    source: "host-introspection",
    sessionId,
    eventId,
    modelId,
    observedAt: nowIso,
  };
}

export function writeModelIdentityObservation(rootDir, observation) {
  if (!isObject(observation) || observation.schema !== SCHEMA) return false;
  const sessionId = safeSessionId(observation.sessionId);
  if (!sessionId) return false;
  try {
    const claudeDir = join(rootDir, ".claude");
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
    writeFileSync(modelIdentityFilePath(rootDir, sessionId), `${JSON.stringify(observation, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

function validateObservation(value, sessionId) {
  if (!isObject(value) || value.schema !== SCHEMA
    || value.subject !== "main-session" || value.source !== "host-introspection"
    || value.sessionId !== sessionId || !SAFE_ID.test(value.eventId ?? "")
    || !safeModelId(value.modelId) || typeof value.observedAt !== "string"
    || value.observedAt.length === 0) return null;
  return {
    schema: SCHEMA,
    subject: "main-session",
    source: "host-introspection",
    sessionId: value.sessionId,
    eventId: value.eventId,
    modelId: value.modelId,
    observedAt: value.observedAt,
  };
}

/** Read only the snapshot bound to the current host session. */
export function readModelIdentityObservation(rootDir, sessionId) {
  const safeId = safeSessionId(sessionId);
  if (!safeId) return null;
  try {
    return validateObservation(
      JSON.parse(readFileSync(modelIdentityFilePath(rootDir, safeId), "utf8")),
      safeId,
    );
  } catch {
    return null;
  }
}

export { SCHEMA as MAIN_SESSION_MODEL_IDENTITY_SCHEMA };
