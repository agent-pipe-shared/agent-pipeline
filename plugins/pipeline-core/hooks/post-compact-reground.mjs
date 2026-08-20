#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Non-blocking SessionStart projection of validated compact continuity state. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import {
  continuityDispatchAllowed,
  validateContinuityState,
} from "../lib/continuity-state.mjs";
import { buildContinuationLine } from "../lib/interaction-continuity.mjs";
import { reconcileMainSessionRoute } from "../lib/main-session-route.mjs";
import { readModelIdentityObservation } from "../lib/main-session-route-attestation.mjs";
import {
  boundedNarrativeExcerpt,
  boundedPayload,
  measureBootstrapPayload,
} from "../lib/bootstrap-payload-budget.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";

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

// docs/state.md's own convention (the sentence next to this heading: "this
// paragraph is deliberately NOT yet archived since it is the live open
// state") treats everything from the top of the file up to this exact
// heading as current, unarchived narrative -- never inside the heading text
// itself, so a match only ever fires at a genuine section boundary.
const ARCHIVED_HISTORY_HEADING = /^## Archived history\s*$/m;

/**
 * Pure: extract docs/state.md's free-text "live open state" section -- the
 * top of the file up to (not including) the `## Archived history` heading.
 * Never reads a file itself, never mutates its input. Returns null for
 * anything that is not a non-empty string, or that trims down to nothing
 * (e.g. a `docs/state.md` with only a heading and no narrative above it).
 * When no `## Archived history` heading is present at all, the whole
 * content is treated as the live section -- a file with nothing archived
 * yet is still a valid "live open state" by this same convention.
 */
export function extractLiveStateNarrative(stateMdContent) {
  if (typeof stateMdContent !== "string") return null;
  const match = ARCHIVED_HISTORY_HEADING.exec(stateMdContent);
  const narrative = match ? stateMdContent.slice(0, match.index) : stateMdContent;
  const trimmed = narrative.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Read docs/state.md and produce its bounded, verbatim live-open-state
 * excerpt in one fail-closed step -- mirrors `loadStateSafe`'s own
 * try/catch-to-null pattern exactly. A missing file, an unreadable file, a
 * file with no live narrative, or any other read failure all resolve to
 * `null` (no excerpt, no crash), never a thrown error.
 */
export function loadStateNarrativeExcerptSafe(stateMdPath, options = {}) {
  try {
    const raw = readFileSync(stateMdPath, "utf8");
    const narrative = extractLiveStateNarrative(raw);
    if (narrative === null) return null;
    return boundedNarrativeExcerpt(narrative, options);
  } catch {
    return null;
  }
}

function stoppedProjection(code, featureId = null) {
  return {
    code,
    workResumptionAllowed: false,
    featureId,
    phase: null,
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

function phaseRouteId(phase) {
  return phase === "design" ? "design_phase" : "execution_phase";
}

/*
 * SessionStart input is not a model attestation by itself.  A host adapter may
 * provide one separately under pipelineMainSessionRoute; the reconciliation
 * kernel rejects any observation that is not explicitly main-session and
 * host-introspection sourced.  This hook never writes a switchback or infers
 * identity from a dispatched child.
 */
function mainSessionRouteProjection(input, phase, rootDir = null) {
  const context = isObject(input?.pipelineMainSessionRoute) ? input.pipelineMainSessionRoute : {};
  const route = reconcileMainSessionRoute({
    profile: context.profile,
    phase: phaseRouteId(phase),
    runner: context.runner,
    observed: context.observed ?? null,
    reportedEventIds: context.reportedEventIds ?? [],
    poException: context.poException ?? null,
  });
  const sessionId = typeof input?.session_id === "string"
    ? input.session_id
    : typeof context.sessionId === "string" ? context.sessionId : null;
  return {
    ...route,
    modelIdentity: rootDir ? readModelIdentityObservation(rootDir, sessionId) : null,
  };
}

/**
 * Produce the complete deterministic post-compact projection. This projection
 * never attests authority freshness, provider identity, or OS isolation.
 */
export function resolveRegroundProjection(state, input = null, { rootDir = null } = {}) {
  if (!isObject(state) || state.schema !== OUTER_SCHEMA) {
    return stoppedProjection("PCR-OUTER-INVALID");
  }
  const featureId = state.activeFeature?.id;
  const phase = state.activeFeature?.phase;
  if (typeof featureId !== "string" || featureId.length === 0
    || typeof phase !== "string" || phase.length === 0) {
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
    phase,
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
    mainSessionRoute: mainSessionRouteProjection(input, phase, rootDir),
  };
}

const STATE_MD_READ_INSTRUCTION_EN =
  "If anything above is unclear or looks incomplete, read docs/state.md directly before risking duplicate work.";
const STATE_MD_READ_INSTRUCTION_DE =
  "Falls hier etwas unklar ist oder unvollständig wirkt, lies docs/state.md direkt, bevor du doppelte Arbeit riskierst.";

/**
 * Render the docs/state.md excerpt block (or its absence) plus the always-on
 * "read docs/state.md directly if in doubt" instruction, in the caller's
 * language. `stateNarrative` is the `loadStateNarrativeExcerptSafe`/
 * `boundedNarrativeExcerpt` result shape, or null (no excerpt available).
 */
function buildStateNarrativeLines(stateNarrative, language) {
  const instruction = language === "de" ? STATE_MD_READ_INSTRUCTION_DE : STATE_MD_READ_INSTRUCTION_EN;
  if (!stateNarrative || typeof stateNarrative.value !== "string" || stateNarrative.value.length === 0) {
    return [instruction];
  }
  const label = language === "de"
    ? "docs/state.md (aktueller offener Stand, wörtlich):"
    : "docs/state.md (current live open state, verbatim):";
  return [label, stateNarrative.value, instruction];
}

/** Render only validated runtime language; invalid projections use a code-only stop. */
export function buildRegroundMessage(stateOrProjection, { stateNarrative = null } = {}) {
  const projection = REGROUND_CODES.includes(stateOrProjection?.code)
    ? stateOrProjection
    : resolveRegroundProjection(stateOrProjection);
  const canonical = JSON.stringify(projection);
  const continuation = projection.workResumptionAllowed
    ? buildContinuationLine({
      featureId: projection.featureId,
      phase: projection.phase,
      queueRevision: projection.revision,
      nextAction: projection.nextAction,
    })
    : null;
  if (!projection.workResumptionAllowed && projection.runtime === null) {
    return `POST_COMPACT_REGROUND ${canonical}`;
  }
  const language = projection.runtime?.humanFacingLanguage ?? "en";
  const activeDuty = projection.runtime?.activeDuty ?? null;
  const narrativeLines = buildStateNarrativeLines(stateNarrative, language);
  if (language === "de") {
    return [
      "Re-Grounding nach /compact.",
      `Aktive Duty: ${JSON.stringify(activeDuty)}.`,
      `Validierte Continuity-Projektion: ${canonical}`,
      continuation,
      ...narrativeLines,
    ].join("\n");
  }
  return [
    "Re-grounding after /compact.",
    `Active duty: ${JSON.stringify(activeDuty)}.`,
    `Validated continuity projection: ${canonical}`,
    continuation,
    ...narrativeLines,
  ].join("\n");
}

/**
 * Build host JSON for compact; all other sources remain silent. `rootDir`
 * is optional and additive: when supplied, docs/state.md is read from under
 * it for the narrative excerpt; when omitted (existing callers), behavior
 * is unchanged -- no excerpt is attempted, matching prior output exactly.
 */
export function decideOutput(input, state, { rootDir = null } = {}) {
  if (!shouldActivate(input)) return { stdout: "", json: false };
  const projection = resolveRegroundProjection(state, input, { rootDir });
  const bounded = boundedPayload(projection, { mode: "compact" });
  const stateNarrative = rootDir
    ? loadStateNarrativeExcerptSafe(join(rootDir, "docs", "state.md"))
    : null;
  const message = buildRegroundMessage(bounded.value, { stateNarrative });
  const measurement = measureBootstrapPayload(message, { mode: "compact" });
  const payload = {
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: message,
      bootstrapPayloadMeasurement: measurement,
      originalBootstrapPayloadMeasurement: bounded.originalMeasurement,
      bootstrapPayloadTruncated: bounded.truncated === true,
      bootstrapPayloadOverBudget: bounded.overBudget === true,
    },
  };
  return { stdout: `${JSON.stringify(payload)}\n`, json: true, payload, projection, measurement };
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

  const authority = resolveProjectAuthorityPaths({ rootDir });
  const statePath = authority.status === "ready"
    ? authority.state
    : (existsSync(join(rootDir, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
  const state = loadStateSafe(join(rootDir, statePath));
  const { stdout } = decideOutput(input, state, { rootDir });
  if (stdout) process.stdout.write(stdout);
  process.exit(0);
}

if (isDirectInvocation(import.meta.url)) run();
