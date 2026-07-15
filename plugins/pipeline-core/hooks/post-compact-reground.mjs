#!/usr/bin/env node
/** Non-blocking SessionStart projection of validated compact continuity state. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  continuityDispatchAllowed,
  validateContinuityState,
} from "../lib/continuity-state.mjs";

const OUTER_SCHEMA = "pipeline.state.v0";

export const REGROUND_CODES = Object.freeze([
  "PCR-READY",
  "PCR-BLOCKED",
  "PCR-DECISION-PENDING",
  "PCR-OUTER-INVALID",
  "PCR-ACTIVE-FEATURE-INVALID",
  "PCR-CONTINUITY-MISSING",
  "PCR-FEATURE-MISMATCH",
  "PCR-CONTINUITY-INVALID",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Activate only for the exact compact SessionStart source. */
export function shouldActivate(input) {
  return isObject(input) && input.source === "compact";
}

/** Parse a state file without mutating it; callers decide the fail-closed disposition. */
export function loadStateSafe(stateFilePath) {
  try {
    const parsed = JSON.parse(readFileSync(stateFilePath, "utf8"));
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stoppedProjection(code, featureId = null) {
  return {
    code,
    workResumptionAllowed: false,
    featureId,
    revision: null,
    runtime: null,
    authority: null,
    queueHead: null,
    blocker: null,
    nextAction: null,
    resume: null,
    dispatchEligibility: { allowed: false, code: "CS-INVALID" },
    decisionTxn: null,
    recovery: null,
  };
}

/**
 * Produce the complete deterministic post-compact projection. This projection
 * never attests authority freshness, provider identity, or OS isolation.
 */
export function resolveRegroundProjection(state) {
  if (!isObject(state) || state.schema !== OUTER_SCHEMA) {
    return stoppedProjection("PCR-OUTER-INVALID");
  }
  const featureId = state.activeFeature?.id;
  if (typeof featureId !== "string" || featureId.length === 0) {
    return stoppedProjection("PCR-ACTIVE-FEATURE-INVALID");
  }
  if (!Object.prototype.hasOwnProperty.call(state, "continuity")) {
    return stoppedProjection("PCR-CONTINUITY-MISSING", featureId);
  }
  if (!isObject(state.continuity) || state.continuity.featureId !== featureId) {
    return stoppedProjection("PCR-FEATURE-MISMATCH", featureId);
  }
  const validated = validateContinuityState(state.continuity, featureId);
  if (!validated.ok) return stoppedProjection("PCR-CONTINUITY-INVALID", featureId);

  const continuity = state.continuity;
  const dispatch = continuityDispatchAllowed(continuity, featureId);
  const code = continuity.decisionTxn !== null
    ? "PCR-DECISION-PENDING"
    : continuity.blocker !== null ? "PCR-BLOCKED" : "PCR-READY";
  return {
    code,
    workResumptionAllowed: code === "PCR-READY",
    featureId,
    revision: continuity.revision,
    runtime: structuredClone(continuity.runtime),
    authority: structuredClone(continuity.authority),
    queueHead: structuredClone(continuity.queueHead),
    blocker: structuredClone(continuity.blocker),
    nextAction: continuity.queueHead?.nextAction ?? null,
    resume: structuredClone(continuity.resume),
    dispatchEligibility: { allowed: dispatch.allowed, code: dispatch.code },
    decisionTxn: structuredClone(continuity.decisionTxn),
    recovery: structuredClone(continuity.recovery),
  };
}

/** Render only validated runtime language; invalid projections use a code-only stop. */
export function buildRegroundMessage(stateOrProjection) {
  const projection = REGROUND_CODES.includes(stateOrProjection?.code)
    ? stateOrProjection
    : resolveRegroundProjection(stateOrProjection);
  const canonical = JSON.stringify(projection);
  if (!projection.workResumptionAllowed && projection.runtime === null) {
    return `POST_COMPACT_REGROUND ${canonical}`;
  }
  const language = projection.runtime.humanFacingLanguage;
  if (language === "de") {
    return [
      "Re-Grounding nach /compact.",
      `Aktive Duty: ${JSON.stringify(projection.runtime.activeDuty)}.`,
      `Validierte Continuity-Projektion: ${canonical}`,
    ].join("\n");
  }
  return [
    "Re-grounding after /compact.",
    `Active duty: ${JSON.stringify(projection.runtime.activeDuty)}.`,
    `Validated continuity projection: ${canonical}`,
  ].join("\n");
}

/** Build host JSON for compact; all other sources remain silent. */
export function decideOutput(input, state) {
  if (!shouldActivate(input)) return { stdout: "", json: false };
  const projection = resolveRegroundProjection(state);
  const message = buildRegroundMessage(projection);
  const payload = {
    systemMessage: message,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message },
  };
  return { stdout: `${JSON.stringify(payload)}\n`, json: true, payload, projection };
}

/** Real hook boundary. It always exits zero and never writes repository state. */
export function run() {
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  if (!shouldActivate(input)) process.exit(0);

  const state = loadStateSafe(join(rootDir, ".claude", "pipeline-state.json"));
  const { stdout } = decideOutput(input, state);
  if (stdout) process.stdout.write(stdout);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
