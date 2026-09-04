#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * stop-suggest — Stop hook: after each main-session turn ends, suggests the NEXT pipeline
 * phase/gate non-blockingly, driven by the declarative manifest (`.claude/pipeline.yaml`,
 * `plugins/pipeline-core/lib/manifest.mjs`) and the feature state file
 * (`.claude/pipeline-state.json`, schema `pipeline.state.v0`).
 *
 * Task: AP1-P5 "OIN" (package P5).
 *
 * FAIL-OPEN BY DESIGN (mirrors staleness-check.mjs / manifest.mjs's own contract)
 *   Silent (no stdout, `process.exit(0)`) whenever: the manifest is absent or fails
 *   validation (`loadManifestSafe` -> null); the state file is absent or its JSON is
 *   malformed; the state has no `activeFeature`; `activeFeature.phase` is missing, or names
 *   a phase that is not currently active (disabled, condition-false, or simply unknown) --
 *   "better quiet than wrong" per the briefing. This hook NEVER runs git, NEVER touches the
 *   network, and its own runtime budget is trivial (a couple of file reads + string building).
 *
 * PHASE -> GATE MAPPING (the ONE small table new phases hook into with a one-line addition)
 *   Keyed by the phase being ENTERED (i.e. the NEXT phase in the active-phase sequence).
 *   `gate` names a key under the manifest's `gates:` map (see `gateConfig()`,
 *   `plugins/pipeline-core/lib/manifest.mjs`); `command` is the human-facing verification
 *   command to print for an automated gate, or `null` for a human gate (nothing to run).
 *   A phase with no entry here (e.g. `design`, `ui-design` today) surfaces no gate clause --
 *   this is intentional, not a gap: only phases whose entry is actually gated get one.
 *
 * GATE `mode` IS PRINTED VERBATIM, NEVER SWITCHED ON
 *   The manifest's gate `mode` enum (`blocking|warn|off`) is being corrected in a parallel
 *   follow-up; this hook only ever echoes whatever string is present (or "unknown" if the
 *   field is missing/non-string) into the suggestion text -- it never branches behavior on
 *   the value, so an unexpected/future mode string can never crash or mis-suggest here.
 *
 * SUGGESTION DEDUP (live finding 2026-07-07: "identical suggestion re-fired every turn end
 * while waiting for PO approval" -> chatter): a fingerprint -- the resolved phase-suggestion
 * text itself, or the absence of one -- is persisted per session in
 * `.claude/.stop-suggest-<session_id>.json` (`markerPath`, field `lastFingerprint`). Whenever
 * the fingerprint is unchanged from the previous turn, the hook stays SILENT (no stdout at
 * all) instead of repeating byte-identical text; any change -- a different next-phase
 * suggestion appearing, changing, or the suggestion disappearing and later reappearing --
 * re-emits. Needs a resolvable `session_id` (read once from this hook's own Stop-hook stdin,
 * `resolveSessionIdFromInput`) to key the marker file; when none is resolvable (stdin absent/
 * malformed, or the field itself missing -- e.g. every smoke test in this file's own suite,
 * which never pipes stdin) dedup is structurally impossible (no file to key on) and the hook
 * ALWAYS emits. A marker write failure fails open the same way: the next turn's dedup state
 * is simply inconsistent, never a reason to withhold a suggestion.
 *
 * REMOVED (this task, 2026-09-04, NVA-B-NOCOMPACT-1): a staged context-budget tiering
 * mechanism (warn/overdue/block, plus a nag-cap, a window-independent soft-nudge ladder, a
 * usage-staleness warning and a re-arm step) used to read a statusline usage snapshot
 * (`.claude/.usage-<session_id>.json`) and, at >=85% of the context window, emit
 * `decision: "block"` demanding an immediate `/compact`. All of it is gone: this hook no
 * longer reads the usage file, no longer tiers, no longer emits any line mentioning context
 * usage in any form, and no code path here can force or demand a compaction any more. Reason:
 * the thresholds were calibrated for a 200k context window; sessions now run a 1M window with
 * a one-hour prompt cache, and a forced compaction destroys the cached prefix and loses
 * in-flight working state.
 *
 * OUTPUT CONTRACT (Stop hook JSON shape)
 *   Silent case: nothing on stdout, `process.exit(0)`.
 *   Suggestion case: `{ systemMessage, hookSpecificOutput: { hookEventName: "Stop",
 *   additionalContext } }` JSON on stdout, `process.exit(0)`. This hook NEVER blocks: no code
 *   path here can ever produce a `decision` field.
 *
 * ARCHITECTURE: mirrors `staleness-check.mjs` -- pure exported resolver functions
 * (`loadStateSafe`, `resolveSuggestion`, `decideOutput`, `decideDedupedOutput`, the message
 * builders) take explicit parameters and do no I/O; `run()` is the only function that touches
 * the real filesystem/environment/stdin and always calls `process.exit(0)`, regardless of
 * outcome.
 *
 * VERIFY: node plugins/pipeline-core/hooks/stop-suggest.test.mjs
 * Manual smoke (from the repo root; always exits 0, stdout empty unless an active feature
 * with a resolvable next phase applies):
 *   node plugins/pipeline-core/hooks/stop-suggest.mjs
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { loadManifestSafe, activePhases, gateConfig } from "../lib/manifest.mjs";
import {
  LEGACY_STATE,
  NEUTRAL_STATE,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";
import {
  coordinatorNextPhases,
  readCloseCoordinator,
} from "../scripts/publication-close-journal.mjs";

// ---- phase -> gate mapping (ONE small table; later phases are one-line additions) -------
export const PHASE_GATE_MAP = {
  implementation: { gate: "dev-plan", command: null },
  "security-scan": { gate: "security", command: "node plugins/pipeline-core/scripts/security-scan.mjs" },
};

// ---- shared safe-JSON-object loader (fail-open: missing file / malformed JSON / non-object
// -> null; never throws). Used for both the state file and the dedup marker file. ------------
function loadJsonObjectSafe(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null; // missing/unreadable -> fail-open, silent
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null; // malformed JSON -> fail-open, silent
  }
}

// ---- state file loading (fail-open: missing file / malformed JSON / non-object -> null) --
/**
 * @param {string} stateFilePath
 * @returns {object|null}
 */
export function loadStateSafe(stateFilePath) {
  return loadJsonObjectSafe(stateFilePath);
}

// ---- message builders (pure) --------------------------------------------------------------
/**
 * Builds the "transition to the next phase" suggestion, including the gate clause / check
 * command (when the next phase maps to a gate) and the dev-plan missing-approval hint.
 * @param {string} currentPhase
 * @param {string} nextPhase
 * @param {object} manifest
 * @param {object} activeFeature
 * @returns {string}
 */
function buildTransitionMessage(currentPhase, nextPhase, manifest, activeFeature) {
  const mapping = PHASE_GATE_MAP[nextPhase];
  let gateClause = "";
  let commandClause = "";
  let noteClause = "";

  if (mapping && mapping.gate) {
    const gate = gateConfig(manifest, mapping.gate);
    const mode = gate && typeof gate.mode === "string" && gate.mode !== "" ? gate.mode : "unknown";
    gateClause = ` (Gate: ${mapping.gate}, mode: ${mode})`;

    if (mapping.command) {
      commandClause = ` Check: ${mapping.command}`;
    }
    if (mapping.gate === "dev-plan" && activeFeature.planApproved !== true) {
      noteClause = " Note: approval (planApproved) still missing.";
    }
  }

  return `Pipeline: phase "${currentPhase}" active → next step: "${nextPhase}"${gateClause}.${commandClause}${noteClause}`;
}

/**
 * Builds the "all phases done, push gate is next" completion message.
 * @param {object} manifest
 * @returns {string}
 */
function buildCompletionMessage(manifest) {
  const activeProfileName =
    manifest.profiles && typeof manifest.profiles === "object" && typeof manifest.profiles.active === "string"
      ? manifest.profiles.active
      : "(no profile)";
  const pushGate = gateConfig(manifest, "push");
  const mode = pushGate && typeof pushGate.mode === "string" && pushGate.mode !== "" ? pushGate.mode : "unknown";
  return `Pipeline: all phases of profile "${activeProfileName}" complete — push gate (mode: ${mode}) is the last step.`;
}

// ---- core resolver (pure) ------------------------------------------------------------------
/**
 * Resolves the suggestion string for the given (already-loaded) manifest/state, or `null`
 * when the hook should stay silent. Every precondition failure (absent/invalid manifest,
 * absent/malformed state, no activeFeature, unknown/inactive phase) collapses to `null` --
 * never throws.
 * @param {object|null} manifest - result of `loadManifestSafe()`
 * @param {object|null} state - result of `loadStateSafe()`
 * @returns {string|null}
 */
export function resolveCoordinatorSuggestion(coordinator) {
  const phase = coordinator?.phase;
  if (typeof phase !== "string" || phase === "") return null;
  const next = coordinatorNextPhases(phase);
  if (next.length === 0 || ["closed-local", "delivered", "promoted"].includes(phase)) return null;
  if (phase === "checkpointed") {
    return "Pipeline close: checkpoint is durable; resume the active feature, or use feature-close-prepared only after completion.";
  }
  return `Pipeline close: next transition is ${next[0]} (current: ${phase}).`;
}

export function resolveSuggestion(manifest, state, coordinator = null) {
  if (!manifest || typeof manifest !== "object") return null;
  if (!state || typeof state !== "object") return null;

  const activeFeature = state.activeFeature;
  if (!activeFeature || typeof activeFeature !== "object") return null;

  // H5 private coordinator state is authoritative when discovered. Project
  // State never gets to project or forge a coordinator phase.
  if (coordinator !== null) return resolveCoordinatorSuggestion(coordinator);

  const currentPhase = activeFeature.phase;
  if (typeof currentPhase !== "string" || currentPhase === "") return null;

  const activeList = activePhases(manifest);
  const idx = activeList.indexOf(currentPhase);
  if (idx === -1) return null; // unknown or currently-inactive phase -> silent

  if (idx === activeList.length - 1) return buildCompletionMessage(manifest);

  const nextPhase = activeList[idx + 1];
  return buildTransitionMessage(currentPhase, nextPhase, manifest, activeFeature);
}

function physicalDirectory(path) {
  const info = lstatSync(path);
  return info.isDirectory() && !info.isSymbolicLink() && realpathSync(path) === path;
}

function resolveGitCommonDirectorySafe(rootDir) {
  try {
    const root = realpathSync(resolve(rootDir));
    const dotGit = join(root, ".git");
    const info = lstatSync(dotGit);
    let gitDirectory;
    if (info.isDirectory() && !info.isSymbolicLink() && realpathSync(dotGit) === dotGit) {
      gitDirectory = dotGit;
    } else if (info.isFile() && !info.isSymbolicLink() && info.size <= 4096) {
      const match = /^gitdir: ([^\r\n]+)\r?\n?$/u.exec(readFileSync(dotGit, "utf8"));
      if (!match) return null;
      gitDirectory = realpathSync(resolve(root, match[1]));
      if (!physicalDirectory(gitDirectory)) return null;
    } else {
      return null;
    }
    const commonMarker = join(gitDirectory, "commondir");
    const common = existsSync(commonMarker)
      ? realpathSync(resolve(gitDirectory, readFileSync(commonMarker, "utf8").trim()))
      : gitDirectory;
    if (!physicalDirectory(common)) return null;
    const rel = relative(common, gitDirectory);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    return common;
  } catch {
    return null;
  }
}

/** Read-only, fail-open discovery of exactly one coordinator for this feature. */
export function loadCloseCoordinatorSafe(rootDir, state) {
  const featureId = state?.activeFeature?.id;
  if (typeof featureId !== "string" || featureId === "") return null;
  const common = resolveGitCommonDirectorySafe(rootDir);
  if (common === null) return null;
  const parent = join(common, "agent-pipeline", "publication-close");
  try {
    if (!physicalDirectory(parent)) return null;
    const matches = [];
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[A-Za-z0-9._-]{1,100}$/u.test(entry.name)) continue;
      try {
        const stored = readCloseCoordinator(common, entry.name);
        if (stored.coordinator.featureId === featureId) matches.push(stored.coordinator);
      } catch {
        // One malformed/unsafe private lifecycle is not authority for a hint.
      }
    }
    const nonterminal = matches.filter((value) => !["closed-local", "delivered", "promoted"].includes(value.phase));
    if (nonterminal.length === 1) return nonterminal[0];
    if (nonterminal.length === 0 && matches.length === 1) return matches[0];
    return null;
  } catch {
    return null;
  }
}

/**
 * Turns a resolved suggestion (or silence) into the hook's stdout contract.
 * PRE-DEDUP CONTRACT, UNCHANGED (35 original cases assert this exact shape): no dedup, always
 * emits when there is a message -- `run()` layers `decideDedupedOutput` on top of this same
 * shape; this function itself never reads/writes the marker file.
 * @param {object|null} manifest
 * @param {object|null} state
 * @returns {{message: string|null, stdout: string, json: boolean, payload?: object}}
 */
export function decideOutput(manifest, state) {
  const message = resolveSuggestion(manifest, state);
  if (!message) return { message: null, stdout: "", json: false };

  const payload = {
    systemMessage: message,
    hookSpecificOutput: { hookEventName: "Stop", additionalContext: message },
  };
  return { message, stdout: JSON.stringify(payload) + "\n", json: true, payload };
}

// ============================================================================================
// session_id resolution from Stop-hook stdin (pure -- takes the already-JSON.parsed value, or
// `null` if parsing failed; never throws, never does I/O itself).
// ============================================================================================
/**
 * @param {object|null} parsedInput - `JSON.parse()` result of the hook's stdin, or `null`
 *   if stdin was empty/unreadable/unparsable.
 * @returns {string|null}
 */
export function resolveSessionIdFromInput(parsedInput) {
  if (!parsedInput || typeof parsedInput !== "object") return null;
  const sid = parsedInput.session_id;
  return typeof sid === "string" && sid !== "" ? sid : null;
}

// ============================================================================================
// session-keyed dedup marker (`.claude/.stop-suggest-<session_id>.json`).
// ============================================================================================
/** @param {string} rootDir @param {string} sessionId @returns {string} */
export function markerPath(rootDir, sessionId) {
  return join(rootDir, ".claude", `.stop-suggest-${sessionId}.json`);
}

/** Fail-open loader for the marker file -- identical contract to loadStateSafe. */
export function loadMarkerSafe(path) {
  return loadJsonObjectSafe(path);
}

/**
 * Best-effort marker write. Never throws upward. Returns whether the write succeeded; a failed
 * write is harmless (fail-open, mirrors every other path in this file) -- the next turn's
 * dedup state is simply inconsistent, never a reason to withhold a suggestion.
 * @param {string} path
 * @param {{lastFingerprint: string}} marker
 * @returns {boolean}
 */
export function writeMarkerSafe(path, marker) {
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(marker, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the suggestion dedup (see header) to a resolved phase/gate suggestion. Never does
 * I/O; `run()` loads `priorMarker` and persists the returned one.
 * @param {object} args
 * @param {string|null} args.phaseMessage - result of `resolveSuggestion()`
 * @param {{lastFingerprint?: string}|null} args.priorMarker
 * @returns {{stdout: string, marker: {lastFingerprint: string}|null}}
 */
export function decideDedupedOutput({ phaseMessage, priorMarker }) {
  if (phaseMessage === null) {
    // Nothing to say -- identical to the pre-dedup silent case. The marker's fingerprint (if
    // any) carries over unchanged: a LATER reappearance of the exact same message should still
    // be recognised as "already said", not treated as brand new just because a quiet turn sat
    // in between.
    return {
      stdout: "",
      marker: priorMarker ? { lastFingerprint: priorMarker.lastFingerprint ?? "" } : null,
    };
  }

  if (priorMarker && priorMarker.lastFingerprint === phaseMessage) {
    // Dedup: identical suggestion as last turn -- stay silent (the live "chatter" finding this
    // feature fixes). The marker is still refreshed for consistency.
    return { stdout: "", marker: { lastFingerprint: phaseMessage } };
  }

  const payload = {
    systemMessage: phaseMessage,
    hookSpecificOutput: { hookEventName: "Stop", additionalContext: phaseMessage },
  };
  return { stdout: JSON.stringify(payload) + "\n", marker: { lastFingerprint: phaseMessage } };
}

// ---- CLI entrypoint: real environment, always exit 0 ---------------------------------------
export function run() {
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Read this hook's own Stop-hook stdin ONCE, purely to resolve session_id (needed to key the
  // dedup marker file). Absent/unreadable/malformed stdin degrades to `null`; it never blocks.
  let stdinInput = null;
  try {
    stdinInput = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    stdinInput = null;
  }
  const sessionId = resolveSessionIdFromInput(stdinInput);

  const manifest = loadManifestSafe(rootDir);
  const authority = resolveProjectAuthorityPaths({ rootDir });
  const stateRelPath = authority.status === "ready"
    ? authority.state
    : (existsSync(join(rootDir, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE);
  const stateFilePath = join(rootDir, stateRelPath);
  const state = loadStateSafe(stateFilePath);
  const coordinator = loadCloseCoordinatorSafe(rootDir, state);
  const phaseMessage = resolveSuggestion(manifest, state, coordinator);

  // Dedup marker: only loaded/persisted with a resolvable session_id -- without one,
  // `priorMarker` stays `null` on every turn, which makes `decideDedupedOutput` always emit
  // (no dedup possible).
  const markerFilePath = sessionId ? markerPath(rootDir, sessionId) : null;
  const priorMarker = markerFilePath ? loadMarkerSafe(markerFilePath) : null;

  const decided = decideDedupedOutput({ phaseMessage, priorMarker });

  if (markerFilePath && decided.marker) writeMarkerSafe(markerFilePath, decided.marker);

  if (decided.stdout) process.stdout.write(decided.stdout);
  process.exit(0); // NEVER blocks, regardless of outcome
}

// Only auto-run when executed directly (`node stop-suggest.mjs`), never on import (the test
// file imports the functions above without triggering the real CLI/exit).
if (isDirectInvocation(import.meta.url)) {
  run();
}
