#!/usr/bin/env node
/**
 * stop-suggest — Stop hook: after each main-session turn ends, suggests the NEXT pipeline
 * phase/gate non-blockingly, driven by the declarative manifest (`.claude/pipeline.yaml`,
 * `plugins/pipeline-core/lib/manifest.mjs`) and the feature state file
 * (`.claude/pipeline-state.json`, schema `pipeline.state.v0`).
 *
 * Task: AP1-P5 "OIN" (package P5).
 *
 * DEDUP (mandatory briefing step 1): grepped the repo for Stop-hook / next-step / suggest
 * precursors before writing this file -- zero prior Stop-hook code found; the only matches
 * were generic mentions of the word "Stop" in `plugins/pipeline-core/agents/critic.md` and
 * `goldfish-implementor.md` (stop-CONDITIONS prose, unrelated to a hook). Nothing to extend.
 *
 * NOT YET WIRED (TP-4): `hooks.json` is untouched here on purpose -- a later bundled wiring
 * wave (W-WIRE) adds the Stop entry under
 * one explicit PO-approved sentinel edit. This file's own test suite invokes the script
 * directly (module import + one real subprocess spawn), never via the live hook pipeline.
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
 * ============================================================================================
 * G-B EXTENSION (package G-B, 2026-07-07):
 * staged /compact context-budget mechanics + suggestion dedup, layered on top of the
 * ORIGINAL phase-suggestion logic above (which is UNCHANGED, byte-for-byte, at the pure
 * `resolveSuggestion`/`decideOutput` level -- the 35 pre-existing test cases assert exactly
 * that). Two independent additions live in `run()` and a handful of new pure helpers below:
 *
 *   (1) CONTEXT-BUDGET STAGED WARNING (reads `.claude/.usage-<session_id>.json`, written by
 *       `plugins/pipeline-core/scripts/statusline-context.mjs`; `session_id` comes from THIS
 *       hook's own Stop-hook stdin, read for the first time here -- the original file never
 *       read stdin at all, see header note below). Absent/malformed usage file, or no
 *       resolvable `session_id`, silently skips the context part entirely (fail-open) --
 *       the phase suggestion (if any) still fires exactly as before.
 *       Staged context thresholds (`contextTier`/`buildContextMessage`, PO decision
 *       2026-07-07, floor ~170k on a 200k window (direction-safe, never later -- see the
 *       write-side rounding note below); PERCENTAGE-based since design decision 2026-07-08
 *       (P2 fix, EL-04) -- window-size-agnostic, matching the 200k thresholds to within the
 *       write side's whole-percent rounding (NOT byte-identical -- MINOR-2, DISP 2026-07-08):
 *         >= 50% used -> "warn"    ("/compact handover window (...)")  [200k-equiv: ~100k]
 *         >= 75% used -> "overdue" ("OVERDUE")                              [200k-equiv: ~150k]
 *         >= 85% used -> "block"   (`decision: "block"`, hard emergency brake) [200k-equiv: ~170k]
 *       `totalTokens` (the REAL token count, from `resolveTotalTokensFromUsage`) is still used
 *       for the DISPLAY text ("Context {k}k") -- only the tiering decision moved to `usedPct`.
 *
 *   (2) NAG-CAP (block tier only): a Stop hook returning `decision:"block"` on every single
 *       turn risks Claude Code's own block-cap session-abort safety (plan G-B: "Stop-hook
 *       block-cap 8 = session abort risk"). `decideCombinedOutput` therefore counts
 *       CONSECUTIVE turns where the tier is "block" (persisted in the session-keyed marker
 *       file, field `consecutiveBlocks`) and only sets `decision:"block"` for the FIRST TWO;
 *       the 3rd+ consecutive turn downgrades to a plain (non-blocking) warning that still
 *       carries the full emergency text plus an explicit downgrade note. The counter resets
 *       to 0 the moment the tier is no longer "block" (context got cut), so a LATER re-entry
 *       into the block tier gets a fresh two-turn window.
 *
 *       WRITE-THEN-EMIT (T1 critic MAJOR-1 fix, 2026-07-08): the nag-cap is only as strong as
 *       the marker file it is persisted in -- a marker that CANNOT be written (unwritable path,
 *       directory collision, disk full) used to reset `consecutiveBlocks` to 0 on every
 *       subsequent read, which silently defeated the cap (every turn looked like "the first
 *       consecutive block turn" forever -- UNBOUNDED `decision:"block"`, the exact opposite of
 *       fail-open). The fix: `run()` now persists the incremented marker BEFORE it is allowed
 *       to emit `decision:"block"` (`writeMarkerSafe`'s own boolean return feeds
 *       `applyPersistenceGuard` below). If that write fails, the block is unconditionally
 *       stripped and the output downgrades to the "overdue" wording (OVERDUE, no
 *       `decision`/`reason` field) instead -- the fail-open promise now explicitly covers the
 *       block tier too, not just the tiers below it. Belt-and-suspenders: if the hook's own
 *       stdin carries `stop_hook_active: true` (Claude Code re-invoked this Stop hook because
 *       the PRIOR turn's own `decision:"block"` already fired) AND the marker is
 *       missing/unreadable, `decision:"block"` is withheld outright -- with no readable
 *       counter, the only defensible assumption is "a block already happened, the conservative
 *       cap is 1" (`decideCombinedOutput`'s `forceCapped` parameter).
 *
 *   (3) SUGGESTION DEDUP (live finding 2026-07-07: "identical suggestion re-fired every turn
 *       end while waiting for PO approval" -> chatter): a fingerprint of
 *       `<phaseMessage>::<tier>` is persisted in the SAME session-keyed marker file
 *       (`.claude/.stop-suggest-<session_id>.json`, field `lastFingerprint`). Whenever the
 *       fingerprint is unchanged from the previous turn, the hook stays SILENT (no stdout at
 *       all) instead of repeating byte-identical text; any change -- a different next-phase
 *       suggestion, OR a context-tier transition (none -> warn -> overdue -> block and back)
 *       -- immediately re-emits. DELIBERATE EXCEPTION: an ACTIVE (non-downgraded) block turn
 *       ALWAYS emits regardless of the fingerprint match -- deduping the emergency brake away
 *       would silently defeat its entire purpose (it must be felt on each of its allotted
 *       consecutive turns, not just the first). A DOWNGRADED block turn (3rd+ consecutive) is
 *       NOT exempt from dedup -- once downgraded to a plain warning, repeating byte-identical
 *       text every further turn is exactly the same chatter problem this feature exists to
 *       fix, so it participates in the normal fingerprint check like any other tier.
 *       Marker persistence needs a `session_id`; when none is resolvable (stdin absent/
 *       malformed, or the field itself missing -- e.g. every pre-G-B smoke test in this
 *       file's own suite, which never pipes stdin) dedup/nag-cap are structurally impossible
 *       (no file to key on) and the hook ALWAYS emits -- this is exactly the pre-G-B
 *       behavior, which is why all 35 original cases stay green unmodified.
 *
 *   STDIN (new): this hook now reads its own Stop-hook stdin (`{ session_id, ... }`) ONCE, to
 *   resolve `session_id` -- purely defensive (`resolveSessionIdFromInput`, never throws, `null`
 *   on anything not shaped like `{ session_id: "<non-empty string>" }`). Absent/unreadable/
 *   malformed stdin was already a non-issue before (never read) and remains one now (treated
 *   identically to "no session_id").
 * ============================================================================================
 *
 * OUTPUT CONTRACT (Stop hook JSON shape; ORIGINAL, unchanged shape when there is no active
 * block turn):
 *   Silent case: nothing on stdout, `process.exit(0)`.
 *   Suggestion case: `{ systemMessage, hookSpecificOutput: { hookEventName: "Stop",
 *   additionalContext } }` JSON on stdout (message duplicated in both fields, matching the
 *   staleness-check.mjs precedent), `process.exit(0)`.
 *   ACTIVE BLOCK TURN ONLY (G-B, tier "block", not yet nag-capped): the SAME payload shape
 *   PLUS top-level `decision: "block"` and `reason: <same combined message>` -- still
 *   `process.exit(0)` (this hook NEVER blocks via its own exit code, only via the `decision`
 *   field Claude Code itself interprets; mirrors this file's own "always exit 0" contract).
 *
 * ARCHITECTURE: mirrors `staleness-check.mjs` -- pure exported resolver functions
 * (`loadStateSafe`, `resolveSuggestion`, `decideOutput`, the two message builders, and the
 * new G-B helpers below) take explicit parameters and do no I/O; `run()` is the only
 * function that touches the real filesystem/environment/stdin and always calls
 * `process.exit(0)`, regardless of outcome.
 *
 * ============================================================================================
 * STALE-DETECTION EXTENSION (context-counter hardening, PO-directive 2026-07-08): the usage
 * snapshot (`.claude/.usage-<session_id>.json`) is only refreshed when the statusLine actually
 * RENDERS (`statusline-context.mjs`'s write side) -- on long/remote/autonomous stretches where
 * the statusLine never fires, the snapshot can sit unchanged for the rest of the session while
 * real usage keeps climbing, and this hook would silently keep tiering on the stale, too-low
 * number. `resolveUpdatedAtMs`/`isUsageStale`/`buildStaleMessage` (pure, `nowMs` an explicit
 * parameter -- `run()` is the only caller of the real `Date.now()`, exactly like every other
 * pure helper in this file) detect this and produce a warning line. The warning is
 * folded into `decideCombinedOutput`'s EXISTING dedup/fingerprint machinery (a `"::stale"`
 * fingerprint suffix, present only while stale is actually true, so the pre-existing exact
 * fingerprint strings the test suite asserts stay byte-identical when nothing is stale) --
 * one warning per stale EPISODE, not one per turn, and it still fires standalone (no phase
 * suggestion, tier "none") because the "nothing to say" fast path now also checks
 * `staleMessage`. Fail-open, as always: no usage file, or a file with no parsable `updatedAt`,
 * makes NO staleness claim at all -- the pre-fix behaviour is the fallback in every ambiguous
 * case, never a false alarm.
 * ============================================================================================
 *
 * ============================================================================================
 * ABSOLUTE SOFT-NUDGE LAYER (Elephant decision, 2026-07-10 -- resolves a goldfish-deep stop on
 * genuine design latitude): a prior dispatch correctly identified an ambiguity between "EL-04
 * says window-size-agnostic" and "a window-independent absolute checkpoint nudge is also
 * wanted" and stopped rather than guess. Resolution: these are TWO ORTHOGONAL SIGNALS, kept
 * distinct rather than merged into one ladder:
 *
 *   (1) The HARD emergency tier (`decision:"block"`) STAYS PERCENT-BASED, unchanged --
 *       EL-04's core assertion ("no spurious hard brake on a large, lightly-used window", see
 *       above) is fully PRESERVED. `contextTier` itself is untouched byte-for-byte.
 *
 *   (2) The SOFT proactive nudge (`warn`/`overdue`) additionally gains a window-INDEPENDENT
 *       ABSOLUTE ladder (`absoluteContextTier`, new pure function beside `contextTier`):
 *         >= 180k real tokens -> "warn"    ("look for the next good cut")
 *         >= 200k real tokens -> "overdue" ("clearly time to checkpoint")
 *         >= 250k real tokens -> "overdue" (same tier, strongest-soft framing -- see the
 *                                            function's own comment for why this collapses to
 *                                            the same machine-checkable state as 200k)
 *       This ladder NEVER returns "block" -- structurally incapable of it, not just by
 *       convention (see the function itself). `effectiveContextTier(usedPct, totalTokens)`
 *       combines the two ladders via "more severe wins" (`none < warn < overdue < block`).
 *       Because the absolute ladder tops out at "overdue", `effectiveContextTier` can only
 *       ever be "block" when the PERCENT ladder already says "block" -- the hard brake stays
 *       automatically percent-gated, with no special-casing needed anywhere else in the file.
 *       `run()` now tiers on `effectiveContextTier(usedPct, totalTokens)` instead of bare
 *       `contextTier(usedPct)`; every OTHER G-B/MAJOR-1/stale-detection mechanic above (nag-cap,
 *       write-then-emit, dedup, forceCapped) is untouched -- they all operate on "whatever the
 *       final tier is", agnostic to which ladder produced it.
 *
 *   (3) RECURRING RE-ARM (additive third dimension, independent of both ladders and of the
 *       nag-cap): the marker (`.claude/.stop-suggest-<session_id>.json`) grows a new field,
 *       `lastEmittedTotalTokens`, set ONLY when the hook actually emits something (never on a
 *       deduped/silent turn -- exactly like `lastFingerprint`/`consecutiveBlocks`'s own
 *       persistence discipline). `decideCombinedOutput` bypasses its ordinary fingerprint dedup
 *       -- forcing a fresh emission even though the phase+tier fingerprint is UNCHANGED --
 *       whenever the effective tier is not "none" AND real usage has grown by
 *       >= `CONTEXT_REARM_STEP_TOKENS` (50k) tokens since that last emission. Without this, a
 *       session sitting at "overdue" for another 200k tokens because nothing else about the
 *       situation changed would go silent after the first nudge -- exactly the chatter-fix this
 *       hook exists for, but pointed at the wrong target (staying silent when the SITUATION
 *       WORSENED is not the "nothing changed" case dedup is meant to catch).
 *
 *   (4) COPYABLE /compact COMMAND: `buildContextMessage` now appends a copy-pasteable
 *       `/compact <summary prompt>` line to every non-"none"-tier message, ONCE, inside the
 *       function itself -- every reuse site (the normal `decideCombinedOutput` emission path,
 *       its capped/downgraded path, `applyPersistenceGuard`'s fail-open downgrade path) carries
 *       it automatically, with no per-call-site duplication.
 * ============================================================================================
 *
 * VERIFY: node plugins/pipeline-core/hooks/stop-suggest.test.mjs
 * Manual smoke (from the repo root; always exits 0, stdout empty unless an active feature
 * with a resolvable next phase, or a staged context-budget warning, applies):
 *   node plugins/pipeline-core/hooks/stop-suggest.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { loadManifestSafe, activePhases, gateConfig } from "../lib/manifest.mjs";

// ---- phase -> gate mapping (ONE small table; later phases are one-line additions) -------
export const PHASE_GATE_MAP = {
  implementation: { gate: "dev-plan", command: null },
  "security-scan": { gate: "security", command: "node harness/scripts/security-scan.mjs" },
};

// ---- shared safe-JSON-object loader (fail-open: missing file / malformed JSON / non-object
// -> null; never throws). Used for the state file, the G-B usage snapshot, and the G-B
// dedup/nag-cap marker -- three independent files, same tiny read contract. ------------------
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
export function resolveSuggestion(manifest, state) {
  if (!manifest || typeof manifest !== "object") return null;
  if (!state || typeof state !== "object") return null;

  const activeFeature = state.activeFeature;
  if (!activeFeature || typeof activeFeature !== "object") return null;

  const currentPhase = activeFeature.phase;
  if (typeof currentPhase !== "string" || currentPhase === "") return null;

  const activeList = activePhases(manifest);
  const idx = activeList.indexOf(currentPhase);
  if (idx === -1) return null; // unknown or currently-inactive phase -> silent

  if (idx === activeList.length - 1) return buildCompletionMessage(manifest);

  const nextPhase = activeList[idx + 1];
  return buildTransitionMessage(currentPhase, nextPhase, manifest, activeFeature);
}

/**
 * Turns a resolved suggestion (or silence) into the hook's stdout contract.
 * PRE-G-B CONTRACT, UNCHANGED (35 existing cases assert this exact shape): no context clause,
 * no `decision` field, no dedup -- `run()` is the only place those G-B additions apply.
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
// G-B: session_id resolution from Stop-hook stdin (pure -- takes the already-JSON.parsed
// value, or `null` if parsing failed; never throws, never does I/O itself).
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

/**
 * Belt-and-suspenders input (T1 critic MAJOR-1 fix, 2026-07-08). Never throws, never does I/O.
 * @param {object|null} parsedInput - same shape as `resolveSessionIdFromInput`'s input.
 * @returns {boolean} `true` only when `stop_hook_active` is the literal boolean `true` --
 *   Claude Code sets this when it re-invoked the Stop hook because a PRIOR turn's own
 *   `decision:"block"` already fired (see `run()`'s belt-and-suspenders guard, header
 *   NAG-CAP/WRITE-THEN-EMIT note). Any other value (absent, `false`, non-boolean) -> `false`.
 */
export function resolveStopHookActiveFromInput(parsedInput) {
  return !!(parsedInput && typeof parsedInput === "object" && parsedInput.stop_hook_active === true);
}

// ============================================================================================
// G-B: context-budget usage file (`.claude/.usage-<session_id>.json`, written by
// statusline-context.mjs) -- path helper + safe loader + pure token extraction.
// ============================================================================================
/** @param {string} rootDir @param {string} sessionId @returns {string} */
export function usageFilePath(rootDir, sessionId) {
  return join(rootDir, ".claude", `.usage-${sessionId}.json`);
}

/** Fail-open loader for the usage snapshot -- identical contract to loadStateSafe. */
export function loadUsageSafe(path) {
  return loadJsonObjectSafe(path);
}

/**
 * @param {object|null} usage - result of `loadUsageSafe()`
 * @returns {number|null} the total-token count, or `null` if absent/non-numeric.
 */
export function resolveTotalTokensFromUsage(usage) {
  return usage && typeof usage === "object" && typeof usage.totalTokens === "number" && Number.isFinite(usage.totalTokens)
    ? usage.totalTokens
    : null;
}

/**
 * (design decision 2026-07-08, P2 fix) Mirrors `resolveTotalTokensFromUsage` for the
 * percentage field the usage snapshot carries (`statusline-context.mjs`'s `resolveUsedPct`
 * already resolves this correctly -- P1 only ever affected `totalTokens`). This is the field
 * `contextTier` now tiers on, so it is validated to the same 0-100 range `resolveUsedPct`
 * clamps into on the write side.
 * @param {object|null} usage - result of `loadUsageSafe()`
 * @returns {number|null} 0-100, or `null` if absent/non-numeric/out-of-range.
 */
export function resolveUsedPctFromUsage(usage) {
  return usage &&
    typeof usage === "object" &&
    typeof usage.usedPct === "number" &&
    Number.isFinite(usage.usedPct) &&
    usage.usedPct >= 0 &&
    usage.usedPct <= 100
    ? usage.usedPct
    : null;
}

// ============================================================================================
// STALE-DETECTION (context-counter hardening, PO-directive 2026-07-08) -- see header. Three
// pure helpers; `nowMs` is always an explicit parameter, never read internally (`run()` is the
// sole real-`Date.now()` caller in this whole file).
// ============================================================================================
/**
 * @param {object|null} usage - result of `loadUsageSafe()`
 * @returns {number|null} ms epoch timestamp parsed from `usage.updatedAt`, or `null` when the
 *   field is absent, not a string, or not `Date.parse`-able (fail-open -- never throws).
 */
export function resolveUpdatedAtMs(usage) {
  if (!usage || typeof usage !== "object" || typeof usage.updatedAt !== "string" || usage.updatedAt === "") return null;
  const ms = Date.parse(usage.updatedAt);
  return Number.isFinite(ms) ? ms : null;
}

/** Staleness threshold: 15 minutes (context-counter hardening, PO-directive 2026-07-08). */
export const USAGE_STALE_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * @param {object|null} usage - result of `loadUsageSafe()`
 * @param {number} nowMs - caller-supplied "now" (real `Date.now()` only in `run()`)
 * @param {number} thresholdMs - staleness threshold
 * @returns {boolean} `true` ONLY when a valid `updatedAt` exists AND its age exceeds
 *   `thresholdMs`. A missing/unparsable `updatedAt` (or a non-finite `nowMs`/`thresholdMs`)
 *   returns `false` -- no stale-claim without evidence (fail-open, mirrors every other
 *   validation path in this file).
 */
export function isUsageStale(usage, nowMs, thresholdMs) {
  const updatedAtMs = resolveUpdatedAtMs(usage);
  if (updatedAtMs === null) return false;
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) return false;
  if (typeof thresholdMs !== "number" || !Number.isFinite(thresholdMs)) return false;
  return nowMs - updatedAtMs > thresholdMs;
}

/**
 * Builds the stale-warning line. Callers are expected to have already confirmed
 * staleness (e.g. via `isUsageStale`) -- this function independently re-derives `updatedAt`
 * and returns `null` (never throws) whenever it cannot honestly report a timestamp, so it
 * stays safe to call unconditionally.
 * @param {object|null} usage - result of `loadUsageSafe()`
 * @param {number} nowMs - caller-supplied "now" (real `Date.now()` only in `run()`)
 * @returns {string|null}
 */
export function buildStaleMessage(usage, nowMs) {
  const updatedAtMs = resolveUpdatedAtMs(usage);
  if (updatedAtMs === null || typeof nowMs !== "number" || !Number.isFinite(nowMs)) return null;
  const ageMinutes = Math.max(0, Math.floor((nowMs - updatedAtMs) / 60000));
  const d = new Date(updatedAtMs);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `⚠ Context counter stale (as of ${hh}:${mm}, ${ageMinutes}m ago) — check /context, run /compact proactively at the package boundary.`;
}

// ============================================================================================
// G-B: staged context-budget tiering (PO decision 2026-07-07 -- floor ~170k on a 200k window,
// direction-safe; design decision 2026-07-08, P2 fix, EL-04: PERCENTAGE-based, not absolute-
// token-based -- the original absolute thresholds were calibrated for a 200k context window only.
// A 1M-context session (context_window_size: 1000000) at, say, 34% used (340k tokens) would
// have hit the OLD 170k absolute threshold immediately -- a spurious emergency brake. Tiering
// on `usedPct` instead makes the thresholds window-size-agnostic and matches the 200k thresholds
// to within the write side's whole-percent rounding (50% ~ 100k, 75% ~ 150k, 85% ~ 170k --
// `pctRounded = Math.round(pct)` in statusline-context.mjs means the "block" floor can engage up
// to ~1k/0.5% EARLIER than the nominal 170k boundary, never later -- direction-safe, NOT byte-
// identical; MINOR-2, DISP 2026-07-08). `totalTokens` is still passed to `buildContextMessage`
// separately so the DISPLAY text keeps showing the real token count, not a percentage.
// ============================================================================================
/**
 * @param {number|null} usedPct - 0-100, or `null`/non-finite (fail-open -> "none").
 * @returns {"none"|"warn"|"overdue"|"block"}
 */
export function contextTier(usedPct) {
  if (typeof usedPct !== "number" || !Number.isFinite(usedPct)) return "none";
  if (usedPct >= 85) return "block";
  if (usedPct >= 75) return "overdue";
  if (usedPct >= 50) return "warn";
  return "none";
}

// ============================================================================================
// ABSOLUTE SOFT-NUDGE LADDER (Elephant decision, 2026-07-10) -- see header. Window-INDEPENDENT
// (unlike `contextTier` above, which is percent/window-relative on purpose, EL-04). Kept as a
// SEPARATE pure function rather than folded into `contextTier` so the percent function stays
// byte-for-byte untouched (its own direct unit tests below stay green unmodified).
// ============================================================================================
/**
 * @param {number|null} totalTokens - the REAL token count, or `null`/non-finite (fail-open -> "none").
 * @returns {"none"|"warn"|"overdue"} NEVER "block" -- structurally incapable of it (no branch
 *   here ever produces that string), which is what keeps the hard emergency brake automatically
 *   percent-gated once combined via `effectiveContextTier` below.
 */
export function absoluteContextTier(totalTokens) {
  if (typeof totalTokens !== "number" || !Number.isFinite(totalTokens)) return "none";
  // 250k is documented (Elephant decision 2026-07-10) as the "strongest soft" floor -- but it
  // maps to the SAME "overdue" tier as the 200k floor. There is no 4th soft tier between
  // "overdue" and the percent-gated "block"; the 250k number is an urgency-framing distinction
  // in the decision record, not a separate machine-checkable state.
  if (totalTokens >= 200000) return "overdue"; // also covers the 250k "strongest soft" floor
  if (totalTokens >= 180000) return "warn";
  return "none";
}

const TIER_RANK = { none: 0, warn: 1, overdue: 2, block: 3 };

/** @param {"none"|"warn"|"overdue"|"block"} a @param {"none"|"warn"|"overdue"|"block"} b
 * @returns {"none"|"warn"|"overdue"|"block"} whichever ranks higher (ties keep `a`). */
function moreSevere(a, b) {
  return TIER_RANK[b] > TIER_RANK[a] ? b : a;
}

/**
 * Combines the PERCENT tier (`contextTier`, EL-04, hard-block-eligible) with the ABSOLUTE tier
 * (`absoluteContextTier`, 2026-07-10, soft-nudge-only) via "more severe wins". Because
 * `absoluteContextTier` never returns "block", the ONLY way this function's result can be
 * "block" is when `contextTier(usedPct)` itself already says "block" -- the hard emergency
 * brake therefore stays exactly as percent-gated as EL-04 requires, automatically, with no
 * special-casing needed here or anywhere downstream.
 * @param {number|null} usedPct
 * @param {number|null} totalTokens
 * @returns {"none"|"warn"|"overdue"|"block"}
 */
export function effectiveContextTier(usedPct, totalTokens) {
  return moreSevere(contextTier(usedPct), absoluteContextTier(totalTokens));
}

// ORDERING FIX (this task, 2026-07-10): the copyable `/compact` command previously lived
// INSIDE `buildContextMessage`'s return value as its trailing lines. That was safe as long as
// `buildContextMessage`'s result was the LAST thing appended to the combined output -- but
// `decideCombinedOutput` (nag-downgrade note) and `applyPersistenceGuard` (stale-usage note)
// both append MORE text after `contextMessage` via `parts.join(" ")`, which put that trailing
// text on the SAME LINE as the copyable `/compact ...` command. A user copying "the last line"
// would then feed the warning text into `/compact`'s own argument. Fix: the compact block is
// now a separate, constant building block (`buildCompactCommandBlock`) that combine-sites
// re-attach as the TRUE final line of the whole emitted text, AFTER every other note
// (nag-downgrade, stale-usage) has been folded in -- see `decideCombinedOutput` and
// `applyPersistenceGuard` below.
/**
 * The copyable `/compact` command block (Elephant decision 2026-07-10). Factored out of
 * `buildContextMessage` so combine-sites can reposition it independently of the tier-specific
 * body text. The text is a FIXED constant (independent of tier/totalTokens), which is what lets
 * `extractContextMessageBody` below strip it back off via a plain suffix check.
 * @returns {string}
 */
function buildCompactCommandBlock() {
  return "Copy and run this command:\n/compact Summarize the handover: active phase & feature, open items, next steps, active file paths/dispatches, and any not-yet-persisted decisions.";
}

/**
 * Strips the trailing compact-command block back off a `buildContextMessage()` result, leaving
 * only the tier-specific body line (e.g. "Context 120k — ..."). Every caller in this file only
 * ever passes `null` or a genuine `buildContextMessage()` result, so the fixed suffix always
 * matches; falls back to returning the input unchanged if it somehow doesn't (defensive, never
 * throws).
 * @param {string|null} contextMessage
 * @returns {string|null}
 */
function extractContextMessageBody(contextMessage) {
  if (typeof contextMessage !== "string") return contextMessage;
  const suffix = `\n${buildCompactCommandBlock()}`;
  return contextMessage.endsWith(suffix) ? contextMessage.slice(0, -suffix.length) : contextMessage;
}

/**
 * @param {"none"|"warn"|"overdue"|"block"} tier
 * @param {number|null} totalTokens
 * @returns {string|null} `null` for tier "none" (nothing to say).
 */
export function buildContextMessage(tier, totalTokens) {
  if (tier === "none") return null;
  // NIT-1 fix (T1 critic, 2026-07-08): Math.floor, NOT Math.round -- a value belonging to a
  // NON-block tier (e.g. 169999, tier "overdue") must never render as its rounded-up "170k",
  // which is the block-tier threshold's own display value. Flooring is tier-consistent for
  // every tier including "block" itself (170000+ still floors to the same k-value it would
  // have rounded to for all boundary/whole-thousand inputs the existing suite exercises).
  const k = Math.floor((totalTokens ?? 0) / 1000);
  let base;
  if (tier === "warn") {
    base = `Context ${k}k — /compact handover window (100–150k, cut at a task boundary).`;
  } else if (tier === "overdue") {
    base = `Context ${k}k — /compact OVERDUE (100–150k long exceeded, cut at a task boundary now).`;
  } else {
    // "block"
    base = `Context ${k}k — EMERGENCY BRAKE: /compact is now mandatory (limit 170k).`;
  }
  // Copyable /compact command (Elephant decision 2026-07-10): appended ONCE here so every
  // reuse site (decideCombinedOutput's normal + capped paths, applyPersistenceGuard's downgrade
  // path) carries it automatically -- naming the problem without the exact copy-pasteable fix
  // is half as actionable. Combine-sites strip it back off via `extractContextMessageBody` when
  // they need to insert further notes BEFORE it (see ORDERING FIX above).
  return `${base}\n${buildCompactCommandBlock()}`;
}

const NAG_CAP_TURNS = 2;
const NAG_DOWNGRADE_NOTE =
  " (Downgraded to a warning after 2 consecutive blocks — Stop-hook block-cap protection, auto-mode.)";

/** Re-arm step (Elephant decision, 2026-07-10) -- see header point (3). */
export const CONTEXT_REARM_STEP_TOKENS = 50000;

// ============================================================================================
// G-B: session-keyed dedup/nag-cap marker (`.claude/.stop-suggest-<session_id>.json`).
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
 * Best-effort marker write. Never throws upward. Returns whether the write succeeded --
 * NOT just a test seam: `run()`'s write-then-emit guard (`applyPersistenceGuard`) depends on
 * this return value to decide whether an active block turn may actually reach stdout (T1
 * critic MAJOR-1 fix, 2026-07-08). BELOW the block tier, a failed write still degrades
 * dedup/nag-cap harmlessly to "always emit" on the NEXT turn (fail-open, mirrors every other
 * G-B fail-open path) -- that harmless-degradation promise does NOT extend to the block tier
 * itself, which is exactly why the write outcome is checked before emission there.
 * @param {string} path
 * @param {{lastFingerprint: string, consecutiveBlocks: number}} marker
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
 * Combines the phase-transition suggestion with the staged context-budget message, applying
 * the nag-cap (block tier only, see header) and the suggestion dedup (see header) in one
 * pure decision. Never does I/O; `run()` loads `priorMarker` and persists the returned one.
 *
 * @param {object} args
 * @param {string|null} args.phaseMessage - result of `resolveSuggestion()`
 * @param {"none"|"warn"|"overdue"|"block"} args.tier - the EFFECTIVE tier, i.e. `run()` passes
 *   `effectiveContextTier()`'s result (Elephant decision 2026-07-10) here, not bare `contextTier()`
 * @param {string|null} args.contextMessage - result of `buildContextMessage()`
 * @param {{lastFingerprint?: string, consecutiveBlocks?: number}|null} args.priorMarker
 * @param {boolean} [args.forceCapped] - belt-and-suspenders override (T1 critic MAJOR-1 fix,
 *   2026-07-08): forces the same "downgraded, no decision field" path as an ordinary 3rd+
 *   consecutive turn, regardless of the counted `consecutiveBlocks` value. `run()` sets this
 *   when the hook's own stdin carries `stop_hook_active: true` AND `priorMarker` is
 *   missing/unreadable (see header) -- with no readable counter, the conservative assumption
 *   is that a block already happened and the safe cap is 1. Defaults to `false`, i.e. every
 *   pre-existing caller keeps its pre-fix behaviour unchanged.
 * @param {string|null} [args.staleMessage] - result of `buildStaleMessage()` (context-counter
 *   hardening, PO-directive 2026-07-08), or `null`/absent when the usage snapshot is fresh (or
 *   there is nothing to check). Defaults to `null`, i.e. every pre-existing caller keeps its
 *   pre-fix behaviour byte-identical (fingerprints included -- the `"::stale"` suffix below is
 *   only ever appended when `staleMessage` is non-null).
 * @param {number|null} [args.totalTokens] - the REAL token count (Elephant decision 2026-07-10,
 *   see header point (3)), used ONLY for the re-arm bypass below -- NOT for tiering (that
 *   happens upstream, in `effectiveContextTier`). Defaults to `null`, i.e. every pre-existing
 *   caller (which never passed this) gets `rearmDue` structurally `false` -- byte-identical
 *   pre-fix behaviour.
 * @returns {{stdout: string, marker: {lastFingerprint: string, consecutiveBlocks: number, lastEmittedTotalTokens: number|null}|null, isActiveBlock: boolean}}
 */
export function decideCombinedOutput({ phaseMessage, tier, contextMessage, priorMarker, forceCapped = false, staleMessage = null, totalTokens = null }) {
  const priorConsecutiveBlocks = typeof priorMarker?.consecutiveBlocks === "number" ? priorMarker.consecutiveBlocks : 0;
  const nextConsecutiveBlocks = tier === "block" ? priorConsecutiveBlocks + 1 : 0;
  const capped = tier === "block" && (nextConsecutiveBlocks > NAG_CAP_TURNS || forceCapped); // 3rd+ consecutive turn, or forced

  // RE-ARM (Elephant decision 2026-07-10, additive third dimension -- see header point (3)):
  // `lastEmittedTotalTokens` is only ever set on an actual emission (below), never on a
  // deduped/silent turn. Whenever the effective tier is still active (not "none") AND real
  // usage has grown by >= CONTEXT_REARM_STEP_TOKENS since that last emission, the fingerprint
  // dedup is bypassed even though phase+tier are otherwise unchanged -- staying silent while
  // the SITUATION WORSENS is not the "nothing changed" case dedup exists to catch. Untouched
  // when `totalTokens`/`priorMarker.lastEmittedTotalTokens` are unavailable (pre-fix callers,
  // or the very first emission ever) -- `rearmDue` is structurally `false` there.
  const priorLastEmittedTotalTokens =
    typeof priorMarker?.lastEmittedTotalTokens === "number" && Number.isFinite(priorMarker.lastEmittedTotalTokens)
      ? priorMarker.lastEmittedTotalTokens
      : null;
  const rearmDue =
    tier !== "none" &&
    typeof totalTokens === "number" &&
    Number.isFinite(totalTokens) &&
    priorLastEmittedTotalTokens !== null &&
    totalTokens - priorLastEmittedTotalTokens >= CONTEXT_REARM_STEP_TOKENS;

  if (phaseMessage === null && contextMessage === null && staleMessage === null) {
    // Nothing to say at all (tier "none", no phase suggestion, no stale warning) -- identical
    // to pre-G-B silence. Still resets the nag counter (in case a marker survives from an
    // earlier, now-resolved block episode) so a LATER real block starts a fresh two-turn
    // window; skips writing anything when there was never a marker to begin with (no needless
    // marker-file churn on an ordinary quiet turn). tier can never be "block" here (a null
    // contextMessage implies tier "none", see buildContextMessage) so isActiveBlock is always
    // false in this branch. `lastEmittedTotalTokens` carries over unchanged -- this is NOT an
    // emission.
    return {
      stdout: "",
      marker: priorMarker
        ? { lastFingerprint: priorMarker.lastFingerprint ?? "", consecutiveBlocks: 0, lastEmittedTotalTokens: priorLastEmittedTotalTokens }
        : null,
      isActiveBlock: false,
    };
  }

  const effectiveTierLabel = tier === "block" && capped ? "block-downgraded" : tier;
  // Stale-detection (PO-directive 2026-07-08): the fingerprint only grows a "::stale" suffix
  // WHILE staleMessage is actually non-null -- a fresh turn's fingerprint is therefore
  // byte-identical to the pre-stale-detection format (every pre-existing exact-string
  // assertion in the test suite stays true unmodified). The suffix dedups an ongoing stale
  // EPISODE (same fingerprint every turn while still stale -> silent after the first) but
  // re-emits the instant staleness flips either direction (stale <-> fresh is a fingerprint
  // change like any other).
  const staleSuffix = staleMessage !== null ? "::stale" : "";
  const fingerprint = `${phaseMessage ?? "∅"}::${effectiveTierLabel}${staleSuffix}`;
  const isActiveBlock = tier === "block" && !capped; // NEVER true below 170k (tier is only "block" there)

  if (!isActiveBlock && !rearmDue && priorMarker && priorMarker.lastFingerprint === fingerprint) {
    // Dedup: identical situation as last turn (same phase suggestion AND same tier AND same
    // stale/fresh state) AND no re-arm due -- stay silent (the live "chatter" finding this
    // feature fixes). The marker is still refreshed (nag counter especially) so state stays
    // consistent across turns; `lastEmittedTotalTokens` carries over unchanged (NOT an emission).
    return {
      stdout: "",
      marker: { lastFingerprint: fingerprint, consecutiveBlocks: nextConsecutiveBlocks, lastEmittedTotalTokens: priorLastEmittedTotalTokens },
      isActiveBlock: false,
    };
  }

  // ORDERING FIX (this task, 2026-07-10): keep the copyable /compact command as the TRUE last
  // line of the whole emitted text -- strip it off `contextMessage` here, fold the nag-downgrade
  // note into the remaining body (not after the compact block), join every part with the stale
  // note included, and re-attach the compact block ONLY at the very end.
  const contextBody = contextMessage ? extractContextMessageBody(contextMessage) : null;
  const parts = [];
  if (phaseMessage) parts.push(phaseMessage);
  if (contextBody) parts.push(capped ? `${contextBody}${NAG_DOWNGRADE_NOTE}` : contextBody);
  if (staleMessage) parts.push(staleMessage);
  const combinedMessage = contextMessage ? `${parts.join(" ")}\n${buildCompactCommandBlock()}` : parts.join(" ");

  const payload = {
    systemMessage: combinedMessage,
    hookSpecificOutput: { hookEventName: "Stop", additionalContext: combinedMessage },
  };
  if (isActiveBlock) {
    payload.decision = "block";
    payload.reason = combinedMessage;
  }

  // Actual emission -> stamp lastEmittedTotalTokens with the current real token count (or
  // `null` when it isn't resolvable this turn), enabling future re-arm checks against THIS turn.
  const emittedTotalTokens = typeof totalTokens === "number" && Number.isFinite(totalTokens) ? totalTokens : null;

  return {
    stdout: JSON.stringify(payload) + "\n",
    marker: { lastFingerprint: fingerprint, consecutiveBlocks: nextConsecutiveBlocks, lastEmittedTotalTokens: emittedTotalTokens },
    isActiveBlock,
  };
}

/**
 * Write-then-emit guard (T1 critic MAJOR-1 fix, 2026-07-08): `decision:"block"` may only reach
 * stdout when the incremented nag-cap counter was RELIABLY persisted. `decideCombinedOutput`
 * itself cannot enforce this -- it never touches the filesystem, so the persistence outcome is
 * only known in `run()`, AFTER the write attempt it makes with the marker `decideCombinedOutput`
 * already returned. This function is the second half of the contract: given that already-decided
 * output plus whether the write succeeded, it strips an active block and downgrades to the
 * "overdue" wording (fail-open) whenever persistence failed -- an unwritable marker path must
 * never translate into an unbounded run of `decision:"block"` turns (a failed write resets
 * `consecutiveBlocks` to 0 on every subsequent read, which would otherwise re-trigger "1st
 * consecutive block" behaviour forever, see header).
 * @param {object} args
 * @param {{stdout: string, isActiveBlock: boolean}} args.decided - `decideCombinedOutput()` result
 * @param {boolean} args.writeSucceeded - `writeMarkerSafe()`'s return value, or `true` when
 *   there was nothing to persist (no marker to write -- e.g. no session_id, see `run()`)
 * @param {string|null} args.phaseMessage - same value passed into `decideCombinedOutput()`
 * @param {"none"|"warn"|"overdue"|"block"} args.tier - same value passed into `decideCombinedOutput()`
 * @param {number|null} args.totalTokens - same value `buildContextMessage()` was built from
 * @param {string|null} [args.staleMessage] - same value passed into `decideCombinedOutput()`
 *   (context-counter hardening, PO-directive 2026-07-08). Defaults to `null` -- pre-existing
 *   callers are unaffected.
 * @returns {string} the stdout to actually write (identical to `decided.stdout` unless downgraded)
 */
export function applyPersistenceGuard({ decided, writeSucceeded, phaseMessage, tier, totalTokens, staleMessage = null }) {
  if (!decided.isActiveBlock || writeSucceeded) return decided.stdout;

  // Persist failed on what would have been an active block turn -- fail-open: downgrade to
  // the overdue-tier wording (OVERDUE), never the block/EMERGENCY BRAKE wording, and never a
  // `decision`/`reason` field: an unpersisted counter means we can no longer prove this is
  // only the 1st/2nd consecutive turn, so the conservative choice is to not claim the
  // emergency-brake tier at all. The stale warning (if any) survives the downgrade unchanged --
  // it is an orthogonal, independently-derived fact about the usage file, not part of the
  // nag-cap counter this guard protects.
  const downgradedContextMessage = tier === "block" ? buildContextMessage("overdue", totalTokens) : null;
  // ORDERING FIX (this task, 2026-07-10): same reordering as `decideCombinedOutput` above -- the
  // copyable /compact command stays the TRUE last line, with the stale note (if any) placed
  // before it, never after.
  const downgradedContextBody = downgradedContextMessage ? extractContextMessageBody(downgradedContextMessage) : null;
  const parts = [];
  if (phaseMessage) parts.push(phaseMessage);
  if (downgradedContextBody) parts.push(downgradedContextBody);
  if (staleMessage) parts.push(staleMessage);
  const joinedParts = parts.join(" ");
  if (!joinedParts) return "";
  const combinedMessage = downgradedContextMessage ? `${joinedParts}\n${buildCompactCommandBlock()}` : joinedParts;

  const payload = {
    systemMessage: combinedMessage,
    hookSpecificOutput: { hookEventName: "Stop", additionalContext: combinedMessage },
  };
  return JSON.stringify(payload) + "\n";
}

// ---- CLI entrypoint: real environment, always exit 0 ---------------------------------------
export function run() {
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // G-B: read this hook's own Stop-hook stdin ONCE, purely to resolve session_id (the
  // original file never read stdin at all -- see header). Absent/unreadable/malformed
  // stdin degrades to `null` exactly like every other fail-open path here; it never blocks.
  let stdinInput = null;
  try {
    stdinInput = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    stdinInput = null;
  }
  const sessionId = resolveSessionIdFromInput(stdinInput);
  // Belt-and-suspenders (T1 critic MAJOR-1 fix, 2026-07-08): Claude Code sets this when it
  // re-invoked the Stop hook because a PRIOR turn already returned `decision:"block"` --
  // see header WRITE-THEN-EMIT note.
  const stopHookActive = resolveStopHookActiveFromInput(stdinInput);

  const manifest = loadManifestSafe(rootDir);
  const stateFilePath = join(rootDir, ".claude", "pipeline-state.json");
  const state = loadStateSafe(stateFilePath);
  const phaseMessage = resolveSuggestion(manifest, state);

  // G-B context-budget part: only reachable with a resolvable session_id (no session_id ->
  // no usage-file path to read -> tier stays "none", contextMessage stays null -- silently
  // skipped, matching the DoD's "file absent -> silently skip" contract).
  const usage = sessionId ? loadUsageSafe(usageFilePath(rootDir, sessionId)) : null;
  const totalTokens = resolveTotalTokensFromUsage(usage);
  // P2 fix (design decision 2026-07-08): tier on usedPct (window-size-agnostic), not on the
  // real totalTokens -- but keep passing the real totalTokens into buildContextMessage so the
  // DISPLAY text still shows real tokens ("Context {k}k"), not a percentage.
  const usedPct = resolveUsedPctFromUsage(usage);
  // Elephant decision 2026-07-10 (see header ABSOLUTE SOFT-NUDGE LAYER): tier on the COMBINED
  // effective tier (percent ladder, EL-04, hard-block-eligible; ∨ absolute ladder, soft-only)
  // instead of the bare percent tier -- `effectiveContextTier` guarantees this can only ever be
  // "block" when the percent ladder alone already says "block", so EL-04 stays intact.
  const tier = effectiveContextTier(usedPct, totalTokens);
  const contextMessage = buildContextMessage(tier, totalTokens);

  // STALE-DETECTION (context-counter hardening, PO-directive 2026-07-08): real Date.now() is
  // read ONLY here -- the sole wall-clock boundary in this file, mirrors every other
  // real-environment read in run(). A usage file that EXISTS but hasn't been refreshed in over
  // USAGE_STALE_THRESHOLD_MS gets an explicit warning line; usage === null (no file at all, or
  // no session_id) already means nothing to check -- that path is covered by the pre-existing
  // "file absent -> silently skip" contract above and stays untouched.
  const nowMs = Date.now();
  const staleMessage = usage !== null && isUsageStale(usage, nowMs, USAGE_STALE_THRESHOLD_MS) ? buildStaleMessage(usage, nowMs) : null;

  // G-B dedup/nag-cap marker: only loaded/persisted with a resolvable session_id -- without
  // one, `priorMarker` stays `null` on every turn, which makes `decideCombinedOutput` always
  // emit (no dedup possible) -- exactly the pre-G-B behavior every original test relies on.
  const markerFilePath = sessionId ? markerPath(rootDir, sessionId) : null;
  const priorMarker = markerFilePath ? loadMarkerSafe(markerFilePath) : null;

  const decided = decideCombinedOutput({
    phaseMessage,
    tier,
    contextMessage,
    priorMarker,
    // Belt-and-suspenders: a re-invoked Stop hook (prior turn already blocked) with no
    // readable counter conservatively forces the downgraded path (see header).
    forceCapped: stopHookActive && priorMarker === null,
    staleMessage,
    totalTokens,
  });

  // WRITE-THEN-EMIT (T1 critic MAJOR-1 fix, 2026-07-08): persist BEFORE emitting -- whether
  // this write succeeds decides whether an active block turn may actually reach stdout.
  const writeSucceeded = markerFilePath && decided.marker ? writeMarkerSafe(markerFilePath, decided.marker) : true;
  const finalStdout = applyPersistenceGuard({ decided, writeSucceeded, phaseMessage, tier, totalTokens, staleMessage });

  if (finalStdout) process.stdout.write(finalStdout);
  process.exit(0); // NEVER blocks, regardless of outcome
}

// Only auto-run when executed directly (`node stop-suggest.mjs`), never on import (the test
// file imports the functions above without triggering the real CLI/exit).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
