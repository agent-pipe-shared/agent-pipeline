#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Surface a concise, non-mutating Agent-Pipeline entry hint in every Codex session. */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { inspectResumeHint, recordResumeHintConsumption, recordResumeHintDelivery } from "../lib/resume-hint.mjs";
import { readOnboardingIntakeCheckpoint, readOnboardingIntakeMaterialInput } from "../lib/onboarding-continuity.mjs";
import { decideOutput, loadStateSafe, shouldActivate } from "./post-compact-reground.mjs";
import { LEGACY_STATE, NEUTRAL_STATE, resolveProjectAuthorityPaths } from "../lib/project-authority.mjs";

const GOVERNANCE_MARKERS = [
  ".agent-pipeline/core.lock.json",
  "pipeline.user.yaml",
  "project/pipeline.json",
  "project/pipeline.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
];

/**
 * NVA-BL-72: the resume-hint READ side was documented (pipeline-start/SKILL.md #6) as a
 * "MUST-DO consumption step" but enforced nowhere -- `project-onboarding-v3.mjs` never reads
 * it, and the only other reference is a write-side write-tool admission in
 * guard-lifecycle-ready.mjs. This SessionStart hook is the one place in this codebase that
 * delivers text INTO a session's context unbidden (`additionalContext`), on every
 * `startup|resume|clear` -- exactly the "first successful bootstrap after a restart" trigger,
 * and more reliable than a "first ready" hook: readiness is re-derived fresh on every guarded
 * tool call (guard-lifecycle-ready.mjs) rather than being a stored one-time event. Folding the
 * card's content into THIS hook's output turns "run a separate command and remember to read
 * it" into "it is already in the context before the first turn starts" -- the strongest
 * available meaning of "mandatory" here, since no code can force an LLM to attend to a field
 * it was merely permitted to fetch. `inspectResumeHint()` stays "Passive observation only" --
 * this reads its result, never its absence or staleness, into a decision; a status other than
 * `available` adds no lines, exactly mirroring "no hint state can alter lifecycle readiness."
 */
// Selection is implemented by the dedicated reader, not by host-path instructions in this hook.
const TRANSCRIPT_RECOVERY_SCRIPT = fileURLToPath(new URL("../scripts/runner-transcript-recovery.mjs", import.meta.url));

function priorTranscriptRecoveryLine(root, sessionId, runner) {
  if (runner !== "codex") {
    return "Transcript recovery is unavailable for this runner because it has no trusted, declared transcript source; do not search host session storage.";
  }
  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    return "Prior-transcript recovery is unavailable because this SessionStart supplied no usable current session identity; continue honestly without searching host session storage.";
  }
  const command = `node ${JSON.stringify(TRANSCRIPT_RECOVERY_SCRIPT)} --root ${JSON.stringify(root)} --runner codex --exclude-session ${JSON.stringify(sessionId)}`;
  return "On startup, resume, clear or compact restart, recover bounded operational context only by running exactly: "
    + `${command}. This dedicated read-only command selects only a PRIOR Codex transcript whose own session metadata matches this repository identity, excludes this session by its supplied identity, and returns only a bounded tool/error excerpt. If it reports unavailable, state that honestly and continue; never search $CODEX_HOME, ~/.codex, or any runner session directory directly.`;
}

// Resume-hint material is surfaced only after the existing delivery receipt is recorded.
function intakeVerbatimContextLines(root) {
  let checkpoint;
  let material;
  try {
    checkpoint = readOnboardingIntakeCheckpoint({ rootDir: root });
    material = readOnboardingIntakeMaterialInput({ rootDir: root });
  } catch {
    return [];
  }
  if (checkpoint?.status !== "present") return [];
  const lines = [];
  const values = checkpoint.value?.values ?? null;
  if (values) {
    const parts = [];
    const author = values.gitAuthor;
    if (author && (author.name || author.email)) parts.push(`commit author ${author.name ?? "?"} <${author.email ?? "?"}>`);
    if (values.language) parts.push(`operator language ${values.language}`);
    if (values.profile) parts.push(`PO profile ${values.profile}`);
    if (parts.length > 0) lines.push(`Resume-hint answered onboarding values (already answered, do not re-ask): ${parts.join("; ")}.`);
  }
  const chunks = Array.isArray(material?.chunks) ? material.chunks : [];
  if (chunks.length > 0) {
    lines.push(
      `Resume-hint verbatim material input from onboarding intake is also available and MUST be read in full now, not treated as already condensed by the summary above (${chunks.length} chunk(s)):`,
    );
    chunks.forEach((chunk, index) => {
      lines.push(`Resume-hint material input chunk ${index + 1} of ${chunks.length}: ${chunk.text}`);
    });
    lines.push("Retain these checkpoint-origin chunks byte-for-byte in capture order; do not recapture an existing chunk merely to satisfy a ritual, and do not substitute answered onboarding settings for product requirements.");
  }
  return lines;
}

function resumeHintContextLines(root, sessionId) {
  let observed;
  try {
    observed = inspectResumeHint({ rootDir: root });
  } catch {
    return [];
  }
  if (observed?.status !== "available" || !observed.hint?.context) return [];
  // NVA-R11-RESUMECONSUME: this is the actual bootstrap consumption step -- the card's
  // content is about to be surfaced into the session's own context below, unbidden, on
  // every startup|resume|clear. Persist delivery first, then record consumption. The
  // receipt's DIGEST is always re-derived by recordResumeHintConsumption
  // itself from the card's own recorded bytes (readResumeHintCardDigest), never asserted
  // here, so this call can never attest to a reading that did not happen. If delivery cannot
  // be persisted, keep the card pending and withhold its content so Verify cannot report a
  // delivered-but-unconsumed card as freshly captured.
  const hasSessionId = typeof sessionId === "string" && sessionId.trim().length > 0;
  if (!hasSessionId) {
    return [
      "A Resume-Hint card is pending, but this SessionStart supplied no usable session identity. Defer surfacing its content until a later identified SessionStart can record delivery and consumption; do not claim that the card was read.",
    ];
  }
  let delivery;
  try {
    delivery = recordResumeHintDelivery({
      rootDir: root,
      sessionId,
    });
  } catch { delivery = { status: "unavailable" }; }
  if (delivery.status !== "recorded") {
    return [
      "A Resume-Hint card is pending, but its digest-bound delivery marker could not be recorded. Defer surfacing its content until a later SessionStart can record delivery; do not claim that the card was read.",
    ];
  }
  try { recordResumeHintConsumption({ rootDir: root, sessionId }); } catch { /* Verify sees the delivery without a receipt. */ }
  const { intent, scope, constraints, questions, progress } = observed.hint.context;
  const lines = [
    "A resume-hint card from a prior session is available and MUST be read now: incorporate it into this session's understanding before continuing -- noting its availability without reading its content does not satisfy this step.",
    "Its distilled fields are a recovered summary, never verbatim material input: when only that summary is available while drafting, label it as a recovered summary with its available source pointer; never manufacture a verbatim materialInput chunk from it.",
    `Resume-hint intent: ${intent}`,
  ];
  if (Array.isArray(scope) && scope.length > 0) lines.push(`Resume-hint scope: ${scope.join("; ")}`);
  if (Array.isArray(constraints) && constraints.length > 0) lines.push(`Resume-hint constraints: ${constraints.join("; ")}`);
  if (Array.isArray(questions) && questions.length > 0) lines.push(`Resume-hint questions: ${questions.join("; ")}`);
  if (Array.isArray(progress) && progress.length > 0) lines.push(`Resume-hint progress: ${progress.join("; ")}`);
  lines.push(...intakeVerbatimContextLines(root));
  return lines;
}

export function sessionStartDecision(projectDir = process.cwd(), exists = existsSync, sessionId = null, runner = "codex") {
  let governed = false;
  let root = null;
  try {
    root = resolve(projectDir);
    governed = GOVERNANCE_MARKERS.some((marker) => exists(join(root, marker)));
  } catch {
    // A session-start hint must never prevent Codex from opening a workspace.
  }
  if (governed) {
    const message =
      "Agent Pipeline is active for this repository. Before project work, run pipeline-core:pipeline-start and report the resolved Pipeline version.";
    return {
      governed,
      message,
      context: [
        message,
        "This governed-repository bootstrap is mandatory; do not substitute a project-local script or stale cache path.",
        "After a ready bootstrap, the Operating Model and compiled manifest are the gate authority: continue ordinary implementation, focused tests, commits, Verify, Critic preparation and state readback autonomously.",
        "Do not invent a human checkpoint for routine work. Request the PO only for a configured decision gate, required final acceptance, an irreversible/external consequence, or a typed hard block with no safe returned recovery action.",
        "A guard denial is not by itself a human gate: first execute its exact typed read-only or lifecycle recovery action when one is supplied.",
        priorTranscriptRecoveryLine(root, sessionId, runner),
        ...resumeHintContextLines(root, sessionId),
      ].join(" "),
    };
  }
  const message =
    "Agent Pipeline is available as an optional project workflow, but it is not active in this folder. Ask the user whether they want to install it before any project work.";
  return {
    governed,
    message,
    context: [
      message,
      "On the user's first request, briefly explain that Agent Pipeline adds a structured, verifiable delivery workflow, then ask whether it should be installed for this repository.",
      "End that turn and wait.",
      "Before an explicit affirmative answer, do not invoke pipeline-core:pipeline-start, inspect or plan onboarding, initialize Git, or change project files.",
      "After consent, invoke pipeline-core:pipeline-start; every returned mutating lifecycle action still keeps its own digest-bound confirmation.",
      "Reply in the user's language.",
    ].join(" "),
  };
}

export function sessionStartMessage(projectDir = process.cwd(), exists = existsSync) {
  return sessionStartDecision(projectDir, exists).message;
}

/**
 * NVA-W4-09: on a `compact` SessionStart, do not unconditionally instruct a full
 * re-bootstrap. Reuse post-compact-reground.mjs's own exported projection logic --
 * the same PCR-READY/PCR-BLOCKED skip-or-continue signal Claude already gets on
 * compact via its own separately-wired `compact`-matcher hook -- so a Codex session
 * (whose codex-hooks.json SessionStart matcher includes `compact` on THIS hook,
 * since post-compact-reground.mjs is not itself wired into codex-hooks.json) gets
 * the identical lightweight re-ground instead of a redundant full bootstrap.
 */
function compactStdout(input, projectDir) {
  if (!shouldActivate(input)) return null;
  const rootDir = resolve(projectDir ?? process.cwd());
  const authority = resolveProjectAuthorityPaths({ rootDir });
  const statePath = authority.status === "ready"
    ? authority.state
    : (existsSync(join(rootDir, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
  const state = loadStateSafe(join(rootDir, statePath));
  const { stdout } = decideOutput(input, state, { rootDir });
  return stdout || null;
}

function readStdinInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

export function main({ projectDir, exists, input } = {}) {
  const compact = compactStdout(input, projectDir);
  if (compact) {
    process.stdout.write(compact);
    return;
  }
  // NVA-R11-RESUMECONSUME: the real session identity a Claude/Codex SessionStart hook
  // payload carries, same field post-compact-reground.mjs already reads for the same
  // purpose one hook over -- never re-derived, never asserted by this hook itself.
  const sessionId = typeof input?.session_id === "string" ? input.session_id : null;
  const decision = sessionStartDecision(projectDir, exists, sessionId);
  process.stdout.write(`${JSON.stringify({
    systemMessage: decision.message,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: decision.context,
    },
  })}\n`);
}

if (isDirectInvocation(import.meta.url)) main({ input: readStdinInput() });
