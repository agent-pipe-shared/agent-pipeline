#!/usr/bin/env node
/**
 * post-compact-reground — SessionStart hook: fires ONLY right after a `/compact`
 * compaction event and prints an English re-grounding reminder so a freshly-summarized
 * context does not silently drift out of English, forget the active role, or lose track of
 * which feature/phase is currently active.
 *
 * Package G-B ("context-hooks"). Live finding this addresses: "/compact language drift".
 *
 * DEDUP (mandatory briefing step 1): grepped the repo for "post-compact"/"reground"/
 * "SessionStart" + "compact" before writing this file. Zero prior hook targeting the
 * compact SessionStart source exists -- `staleness-check.mjs` is the only other
 * SessionStart hook, and its own file header/`hooks.json`'s comment explicitly say
 * "compact deliberately excluded — no re-bootstrap after compaction" for THAT hook. This
 * is a deliberate division of labor, not a duplicate: staleness-check.mjs stays
 * startup/resume/clear-only; this NEW hook owns compact exclusively. Nothing to extend.
 *
 * NOT YET WIRED (TP-4): `hooks.json` is untouched here on purpose (Forbidden list, this
 * briefing) -- the later bundled wiring wave (W-WIRE-2, same plan) adds the matcher
 * (`compact`) under one explicit PO-approved sentinel edit. This file's own test suite
 * invokes the script directly (module import + real subprocess spawn via stdin pipe),
 * never via the live hook pipeline.
 *
 * ACTIVATION: fires ONLY when the SessionStart stdin JSON's `source` field is exactly the
 * string `"compact"` -- every other value (`"startup"`/`"resume"`/`"clear"`/anything
 * else/absent/unparsable) is a silent no-op: `process.exit(0)`, NOTHING on stdout.
 *
 * FAIL-OPEN BY DESIGN (mirrors stop-suggest.mjs / staleness-check.mjs)
 *   Malformed/absent/empty stdin -> silent (cannot even tell whether `source == "compact"`,
 *   so never assume it is). `.claude/pipeline-state.json` absent, unreadable, malformed
 *   JSON, or without a usable `activeFeature` -> the re-ground message STILL fires (the
 *   language/role reminder is unconditional) but the feature/phase line degrades to a
 *   generic "no active feature recorded" note instead of throwing or going silent --
 *   losing track of the STATE file must never suppress the more important reminder that
 *   compaction just happened at all.
 *
 * OUTPUT CONTRACT (SessionStart hook JSON shape, mirrors staleness-check.mjs's stale case):
 *   Inactive case (source != "compact"): nothing on stdout, `process.exit(0)`.
 *   Active case: `{ systemMessage, hookSpecificOutput: { hookEventName: "SessionStart",
 *   additionalContext } }` JSON on stdout (message duplicated in both fields), `process.exit(0)`.
 *
 * ARCHITECTURE: mirrors `staleness-check.mjs`/`stop-suggest.mjs` -- pure exported resolver
 * functions (`shouldActivate`, `loadStateSafe`, `buildRegroundMessage`, `decideOutput`)
 * take explicit parameters and do no I/O; `run()` is the only function that touches the
 * real filesystem/stdin/environment and always calls `process.exit(0)`, regardless of
 * outcome.
 *
 * MECHANICS: stdin = `{ source, session_id, ... }` (SessionStart hook contract; `source`
 * is one of `startup|resume|clear|compact`). Wiring into hooks.json happens in the later
 * W-WIRE-2 wave (TP-4), not here.
 *
 * VERIFY: node plugins/pipeline-core/hooks/post-compact-reground.test.mjs
 * Manual smoke (from the repo root; always exits 0, stdout empty unless `source=="compact"`):
 *   printf '{"source":"compact"}' | node plugins/pipeline-core/hooks/post-compact-reground.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ---- activation gate (pure) -----------------------------------------------------------------
/**
 * @param {object|null} input - already-`JSON.parse()`d SessionStart stdin, or `null`
 * @returns {boolean}
 */
export function shouldActivate(input) {
  return Boolean(input) && typeof input === "object" && input.source === "compact";
}

// ---- state loading (fail-open: missing file / malformed JSON / non-object -> null) --------
/**
 * @param {string} stateFilePath
 * @returns {object|null}
 */
export function loadStateSafe(stateFilePath) {
  let raw;
  try {
    raw = readFileSync(stateFilePath, "utf8");
  } catch {
    return null; // missing/unreadable -> fail-open
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null; // malformed JSON -> fail-open
  }
}

// ---- message builder (pure) ------------------------------------------------------------------
/**
 * @param {object|null} state - result of `loadStateSafe()`, or `null`
 * @returns {string}
 */
export function buildRegroundMessage(state) {
  const activeFeature = state && typeof state === "object" ? state.activeFeature : undefined;
  let featureLine;
  if (activeFeature && typeof activeFeature === "object" && typeof activeFeature.id === "string" && activeFeature.id !== "") {
    const phase = typeof activeFeature.phase === "string" && activeFeature.phase !== "" ? activeFeature.phase : "unknown";
    featureLine = `- Active feature: "${activeFeature.id}" (phase: ${phase}).`;
  } else {
    featureLine = "- No active feature recorded in state (.claude/pipeline-state.json).";
  }

  return [
    "Re-grounding after /compact:",
    "- Chat/output language stays ENGLISH (the project's human-facing language) — compaction must not drift it.",
    "- Active role unchanged (Elephant/Goldfish/Critic per the running dispatch) — the rules in roles/ + CLAUDE.md still apply.",
    featureLine,
    "- Full history/register/next steps: docs/state.md.",
  ].join("\n");
}

// ---- output decision (pure) -------------------------------------------------------------------
/**
 * @param {object|null} input - already-parsed SessionStart stdin, or `null`
 * @param {object|null} state - result of `loadStateSafe()`, or `null`
 * @returns {{stdout: string, json: boolean, payload?: object}}
 */
export function decideOutput(input, state) {
  if (!shouldActivate(input)) return { stdout: "", json: false };

  const message = buildRegroundMessage(state);
  const payload = {
    systemMessage: message,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message },
  };
  return { stdout: JSON.stringify(payload) + "\n", json: true, payload };
}

// ---- CLI entrypoint: real environment, always exit 0 ------------------------------------------
export function run() {
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let input = null;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0); // malformed/absent/empty stdin -> silent, fail-open (cannot confirm source)
  }
  if (!shouldActivate(input)) process.exit(0);

  const stateFilePath = join(rootDir, ".claude", "pipeline-state.json");
  const state = loadStateSafe(stateFilePath);

  const { stdout } = decideOutput(input, state);
  if (stdout) process.stdout.write(stdout);
  process.exit(0); // NEVER blocks, regardless of outcome
}

// Only auto-run when executed directly (`node post-compact-reground.mjs`), never on import
// (the test file imports the functions above without triggering the real CLI/exit).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
