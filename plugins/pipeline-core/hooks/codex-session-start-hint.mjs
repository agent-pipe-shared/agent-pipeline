#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Surface a concise, non-mutating Agent-Pipeline entry hint in every Codex session. */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { inspectResumeHint, recordResumeHintConsumption } from "../lib/resume-hint.mjs";
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
/**
 * NVA backlog (2026-08-09-codex-restart-cannot-recover-operational-context-from-its-own-
 * prior-transcript.md): the resume-hint card is deliberately barred from carrying "raw
 * transcripts, commands, approvals, lifecycle instructions, host paths" (pipeline-start/
 * SKILL.md #6) -- so even a fully working card was never going to recover the class of
 * context the PO observed lost across a restart (already-hit guard errors, established
 * workarounds, in-progress diagnostic state). Investigation found no code path in this
 * repository that can reliably hand a restarting session its exact PRIOR rollout file: the
 * one restart flow this codebase owns (`codex-onboarding-launch.mjs`) always spawns a
 * genuinely fresh, unrelated Codex process with no `--resume`/session linkage, and an
 * ordinary session restart (a human- or Codex-initiated new session) is not orchestrated by
 * this plugin at all. Passing the path down explicitly is therefore not available; a bounded,
 * host-specific DISCOVERY instruction is the next-best mechanism the PO's own direction
 * accepted. This line is a fixed INSTRUCTION, never captured data -- it names a generic path
 * PATTERN, not a specific host path, so it does not fall under the "no machine-specific
 * absolute paths" rule (CLAUDE.md) any more than the pattern already written in the backlog
 * item's own prose. It is unconditional (independent of resume-hint-card presence) because
 * the PO's own direction (2026-08-12/2026-08-17 re-triages) scoped it to every restart, and it
 * is phrased as a best-effort recovery step, never a blocking precondition, mirroring the
 * resume-hint MUST-read step's own "never a gate" discipline one line below it.
 */
// pipeline.deterministic-transcript-selection (backlog:
// 2026-08-29-undocumented-transcript-fallback-selects-wrong-file-by-mtime): a plain
// most-recent-by-mtime rule can select a transcript belonging to a DIFFERENT project/repo --
// confirmed live when a sibling guardian/review transcript, merely newer, was picked over the
// session's own actual prior transcript. Selection must scope to THIS project's identity
// first (the rollout file's own recorded session metadata, e.g. its cwd/workspace field, must
// match this repository's root) and use modification time only as a tiebreaker WITHIN that
// already-matching set -- never as the primary ranking across every session on the machine.
const PRIOR_ROLLOUT_TRANSCRIPT_LINE =
  "On a startup, resume, clear or compact restart, also locate and read your own most recent " +
  "PRIOR Codex rollout transcript for operational-context recovery (already-hit guard errors, " +
  "established workarounds, in-progress diagnostic state) that the resume-hint card alone may " +
  "not carry: look under $CODEX_HOME/sessions (or ~/.codex/sessions when CODEX_HOME is unset); " +
  "first scope by PROJECT IDENTITY, not recency (pipeline.deterministic-transcript-selection): " +
  "read each candidate file's own recorded session metadata (e.g. its cwd/workspace field) and " +
  "discard outright any transcript whose recorded project does not match this repository's own " +
  "root -- a more-recently-modified transcript from a DIFFERENT project must never be selected " +
  "over an older one belonging to THIS project; only after that identity scoping, and always " +
  "excluding the file this session is itself writing to, use modification time as a tiebreaker " +
  "within the remaining project-matching set, most recent first; if no transcript matches this " +
  "project's identity, say so honestly and continue -- never widen the search back to the most " +
  "recent transcript overall; and bound the read to the most recent handful of tool-call, " +
  "tool-result and error entries rather than the full file; never quote large raw excerpts into " +
  "any git-tracked file, and if no prior transcript can be found or read, say so honestly " +
  "rather than claiming this step was done.";

/**
 * NVA-CF-RESUMEVERBATIM-HOOK: resumeHintContextLines() below only ever surfaced the
 * DISTILLED resume-hint card (intent/scope/constraints/questions/progress) -- never the
 * onboarding intake checkpoint's own verbatim `materialInput` (the user's own design-input
 * chunks, captured specifically to survive a restart) or its answered `values`
 * (commit-author name/email, operator language, PO profile). `scripts/resume-hint.mjs`'s
 * CLI `inspect` command (marker NVA-RESUMEVERBATIM-1) already closes this exact gap for the
 * MANUAL path by merging readOnboardingIntakeCheckpoint()/readOnboardingIntakeMaterialInput()
 * into its output -- this mirrors that same read, for the ONE path that delivers text into a
 * session's context unbidden (see NVA-BL-72 above). Both reads sit behind a single try/catch:
 * an absent checkpoint, a not-yet-git-initialized root (the private-state resolver has no
 * git-free fallback), a malformed checkpoint, or any other read failure must degrade to
 * exactly today's behaviour -- no new lines, never a throw, never a block on SessionStart.
 * `materialInput` text is NOT re-screened here: `verbatimMaterialRejection()` already screens
 * every chunk at CAPTURE time (scripts/resume-hint.mjs, before it is ever written into this
 * checkpoint via applyOnboardingIntakeCapture) -- a duplicate screen here would be redundant,
 * not defensive.
 */
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
  // every startup|resume|clear. Record a consumption receipt for it now, best-effort and
  // never blocking: the receipt's DIGEST is always re-derived by recordResumeHintConsumption
  // itself from the card's own recorded bytes (readResumeHintCardDigest), never asserted
  // here, so this call can never attest to a reading that did not happen. A missing/invalid
  // sessionId, an absent digest record (a card captured outside the CLI path), or any I/O
  // failure must never prevent the card's content from still reaching the session below --
  // observation-only, mirroring inspectResumeHint's own "Passive observation only" contract.
  if (typeof sessionId === "string" && sessionId.trim().length > 0) {
    try { recordResumeHintConsumption({ rootDir: root, sessionId }); } catch { /* best-effort, never blocking */ }
  }
  const { intent, scope, constraints, questions, progress } = observed.hint.context;
  const lines = [
    "A resume-hint card from a prior session is available and MUST be read now: incorporate it into this session's understanding before continuing -- noting its availability without reading its content does not satisfy this step.",
    `Resume-hint intent: ${intent}`,
  ];
  if (Array.isArray(scope) && scope.length > 0) lines.push(`Resume-hint scope: ${scope.join("; ")}`);
  if (Array.isArray(constraints) && constraints.length > 0) lines.push(`Resume-hint constraints: ${constraints.join("; ")}`);
  if (Array.isArray(questions) && questions.length > 0) lines.push(`Resume-hint questions: ${questions.join("; ")}`);
  if (Array.isArray(progress) && progress.length > 0) lines.push(`Resume-hint progress: ${progress.join("; ")}`);
  lines.push(...intakeVerbatimContextLines(root));
  return lines;
}

export function sessionStartDecision(projectDir = process.cwd(), exists = existsSync, sessionId = null) {
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
        PRIOR_ROLLOUT_TRANSCRIPT_LINE,
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
