#!/usr/bin/env node
/**
 * statusline-context — statusLine command: prints a compact context-budget status
 * line and side-writes a per-session usage snapshot for `stop-suggest.mjs`'s staged
 * /compact enforcement mechanics to consume.
 *
 * Sole statusLine script in this plugin -- nothing prior to extend.
 *
 * NOT YET WIRED (TP-4): `.claude/settings.json`'s `statusLine` field is untouched here on
 * purpose -- the later bundled wiring wave (W-WIRE-2, same plan) adds it under one
 * explicit PO-approved sentinel edit. This file's own test suite invokes the script
 * directly (module import + real subprocess spawn via stdin pipe), never via the live
 * statusLine pipeline.
 *
 * STDIN FIELD-NAME AMBIGUITY (briefing stop-condition note, resolved defensively): the
 * exact Claude-Code statusLine stdin JSON shape could not be independently confirmed from
 * any file already in this repo (no prior statusline code, no vendored schema/example).
 * The briefing names the field PATHS this script must primarily read
 * (`context_window.used_percentage`, a token-total field, `model.display_name`,
 * `session_id`) -- this implementation reads exactly those, but ALSO tolerates a small set
 * of plausible sibling spellings per field (camelCase variants, a computed-from-used/max-
 * tokens fallback for the percentage, a top-level `total_tokens`/`cost.total_tokens`
 * fallback for the token total, `model` as a bare string, `model.id` as a model-name
 * fallback) so a real-world field-name mismatch degrades to "still prints a line" rather
 * than "silently never prints anything" -- never a silent WRONG value, only a defensively
 * widened ACCEPT list. Every extractor below is a small, explicit, independently testable
 * pure function (`resolveUsedPct`/`resolveTotalTokens`/`resolveModelName`/
 * `resolveSessionId`) precisely so this defensive-accept list is auditable and easy to
 * extend in one place if the real field names turn out to differ once wired (W-WIRE-2).
 *
 * FAIL-OPEN BY DESIGN (mirrors stop-suggest.mjs / staleness-check.mjs)
 *   Malformed/absent/empty stdin, or stdin missing the two fields this line's format
 *   requires (a resolvable percentage AND a resolvable model name) -> EMPTY stdout,
 *   `process.exit(0)`. The per-session usage side-write additionally requires a
 *   resolvable `session_id`; without one, the status line may still print (model+pct+
 *   tokens are independent of session_id) but the side-write is silently skipped (nothing
 *   for `stop-suggest.mjs` to key a marker/usage file on without a session id anyway).
 *   The side-write itself is best-effort: a write failure (e.g. `.claude/` uncreatable)
 *   never affects the printed status line and never throws upward.
 *
 * OUTPUT CONTRACT (statusLine command contract: plain text on stdout, one line, no JSON):
 *   `{model} · Context {pct}% ({tokens}k)` -- middle-dot field separator "·" (matches every
 *   other hook message's style in this plugin), `pct` rounded to the
 *   nearest integer, `tokens` rounded to the nearest thousand (e.g. 124000 tokens -> "124k").
 *
 * SIDE-WRITE: `.claude/.usage-<session_id>.json` (gitignored, see root `.gitignore`) --
 *   `{ usedPct: <int>, totalTokens: <int>, updatedAt: "<ISO-8601>", contextWindowSize?: <int> }`,
 *   pretty-printed + trailing newline (same shape convention as `pipeline-state.mjs`'s own
 *   writes). `contextWindowSize` (design decision 2026-07-08) is additive and only present
 *   when resolvable -- a future consumer field, not read by `stop-suggest.mjs` today. This is
 *   a machine-regenerated snapshot (overwritten every statusLine tick), never meant to be
 *   git-committed or read by a human directly -- consumed exclusively by
 *   `stop-suggest.mjs`'s `loadUsageSafe()`/`resolveTotalTokensFromUsage()`/
 *   `resolveUsedPctFromUsage()`.
 *
 * ARCHITECTURE: mirrors `stop-suggest.mjs`/`staleness-check.mjs` -- pure exported resolver
 * functions take explicit parameters and do no I/O; `run()` is the only function that
 * touches the real filesystem/stdin/environment and always calls `process.exit(0)`,
 * regardless of outcome.
 *
 * VERIFY: node plugins/pipeline-core/scripts/statusline-context.test.mjs
 * Manual smoke (from the repo root; always exits 0, stdout empty on malformed/absent stdin):
 *   printf '{"context_window":{"used_percentage":42},"model":{"display_name":"Claude Sonnet 5"},"total_input_tokens":84000,"session_id":"demo"}' | node plugins/pipeline-core/scripts/statusline-context.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ---- small numeric helper (pure) -----------------------------------------------------------
function toFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function clampPct(n) {
  return Math.max(0, Math.min(100, n));
}

// ---- field extraction (pure, defensive -- see header "STDIN FIELD-NAME AMBIGUITY") --------
/**
 * @param {object|null} input - already-`JSON.parse()`d stdin, or `null`
 * @returns {number|null} 0-100, or `null` if unresolvable
 */
export function resolveUsedPct(input) {
  if (!input || typeof input !== "object") return null;
  const cw = input.context_window;
  if (cw && typeof cw === "object") {
    const direct = toFiniteNumber(cw.used_percentage) ?? toFiniteNumber(cw.percentage_used) ?? toFiniteNumber(cw.usedPercentage);
    if (direct !== null) return clampPct(direct);
    const used = toFiniteNumber(cw.used_tokens) ?? toFiniteNumber(cw.usedTokens);
    const max = toFiniteNumber(cw.max_tokens) ?? toFiniteNumber(cw.maxTokens) ?? toFiniteNumber(cw.total_tokens) ?? toFiniteNumber(cw.context_size);
    if (used !== null && max !== null && max > 0) return clampPct((used / max) * 100);
  }
  const topLevel = toFiniteNumber(input.used_percentage) ?? toFiniteNumber(input.usedPercentage);
  if (topLevel !== null) return clampPct(topLevel);
  return null;
}

/**
 * @param {object|null} input
 * @returns {number|null} total token count, or `null` if unresolvable
 */
export function resolveTotalTokens(input) {
  if (!input || typeof input !== "object") return null;
  const cw = input.context_window;
  if (cw && typeof cw === "object") {
    // PRIMARY (real statusLine schema, design decision 2026-07-08): context_window carries
    // `total_input_tokens` (+ `total_output_tokens` of the most recent response, additive when
    // both are present -- output tokens are context consumption too, not a subset of the input
    // count). This is the field the real stdin actually sends; everything else in this function
    // is a defensive fallback that the real schema never triggers.
    const inputTok = toFiniteNumber(cw.total_input_tokens);
    if (inputTok !== null) {
      const outputTok = toFiniteNumber(cw.total_output_tokens);
      return outputTok !== null ? inputTok + outputTok : inputTok;
    }
    const v = toFiniteNumber(cw.used_tokens) ?? toFiniteNumber(cw.usedTokens) ?? toFiniteNumber(cw.total_tokens);
    if (v !== null) return v;
  }
  const topLevel = toFiniteNumber(input.total_input_tokens) ?? toFiniteNumber(input.total_tokens) ?? toFiniteNumber(input.totalInputTokens);
  if (topLevel !== null) return topLevel;
  const cost = input.cost;
  if (cost && typeof cost === "object") {
    const v = toFiniteNumber(cost.total_tokens) ?? toFiniteNumber(cost.total_input_tokens);
    if (v !== null) return v;
  }
  // Display-robustness fallback (design decision 2026-07-08): no token field resolved above,
  // but `used_percentage` + `context_window_size` are both present -- derive an approximate
  // total from the percentage so the status line still shows a plausible token count instead
  // of a hard "0k". Intentionally approximate (rounding), only reached when the real token-
  // count fields are entirely absent.
  if (cw && typeof cw === "object") {
    const pct = toFiniteNumber(cw.used_percentage);
    const size = toFiniteNumber(cw.context_window_size);
    if (pct !== null && size !== null && size > 0) {
      return Math.round((pct / 100) * size);
    }
  }
  return null;
}

/**
 * @param {object|null} input
 * @returns {number|null} the context window size (200000/1000000 typically), or `null`
 */
export function resolveContextWindowSize(input) {
  if (!input || typeof input !== "object") return null;
  const cw = input.context_window;
  if (cw && typeof cw === "object") {
    const v = toFiniteNumber(cw.context_window_size) ?? toFiniteNumber(cw.contextWindowSize);
    if (v !== null) return v;
  }
  return null;
}

/**
 * @param {object|null} input
 * @returns {string|null}
 */
export function resolveModelName(input) {
  if (!input || typeof input !== "object") return null;
  const model = input.model;
  if (model && typeof model === "object") {
    if (typeof model.display_name === "string" && model.display_name !== "") return model.display_name;
    if (typeof model.id === "string" && model.id !== "") return model.id;
  }
  if (typeof model === "string" && model !== "") return model;
  return null;
}

/**
 * @param {object|null} input
 * @returns {string|null}
 */
export function resolveSessionId(input) {
  if (!input || typeof input !== "object") return null;
  return typeof input.session_id === "string" && input.session_id !== "" ? input.session_id : null;
}

// ---- status-line construction (pure) --------------------------------------------------------
/**
 * @param {object|null} input - already-parsed stdin, or `null`
 * @returns {{line: string, usedPct: number, totalTokens: number, sessionId: string|null}|null}
 *   `null` when the minimal required fields (pct + model name) cannot be resolved -- the
 *   caller then stays silent (fail-open).
 */
export function buildStatus(input) {
  const pct = resolveUsedPct(input);
  const modelName = resolveModelName(input);
  if (pct === null || modelName === null) return null;
  const totalTokens = resolveTotalTokens(input) ?? 0;
  const pctRounded = Math.round(pct);
  const tokensK = Math.round(totalTokens / 1000);
  const line = `${modelName} · Context ${pctRounded}% (${tokensK}k)`;
  return { line, usedPct: pctRounded, totalTokens, contextWindowSize: resolveContextWindowSize(input), sessionId: resolveSessionId(input) };
}

// ---- side-write (fail-open, best-effort) ----------------------------------------------------
/** @param {string} rootDir @param {string} sessionId @returns {string} */
export function usageFilePath(rootDir, sessionId) {
  return join(rootDir, ".claude", `.usage-${sessionId}.json`);
}

/**
 * Best-effort per-session usage snapshot write. Never throws upward; returns whether the
 * write succeeded (test seam). No-op (returns false) when `sessionId` is falsy.
 * @param {string} rootDir
 * @param {string|null} sessionId
 * @param {number} usedPct
 * @param {number} totalTokens
 * @param {string} nowIso
 * @param {number|null} [contextWindowSize] - additive field (design decision 2026-07-08) for
 *   future consumers; written only when it resolves to a finite number, keeping the pre-
 *   existing `{usedPct, totalTokens, updatedAt}` shape intact when it does not.
 * @returns {boolean}
 */
export function writeUsageFile(rootDir, sessionId, usedPct, totalTokens, nowIso, contextWindowSize = null) {
  if (!sessionId) return false;
  try {
    const claudeDir = join(rootDir, ".claude");
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
    const payload = { usedPct, totalTokens, updatedAt: nowIso };
    if (typeof contextWindowSize === "number" && Number.isFinite(contextWindowSize)) {
      payload.contextWindowSize = contextWindowSize;
    }
    writeFileSync(usageFilePath(rootDir, sessionId), JSON.stringify(payload, null, 2) + "\n");
    return true;
  } catch {
    return false; // best-effort side-write; never blocks the status line itself
  }
}

// ---- CLI entrypoint: real environment, always exit 0 ----------------------------------------
export function run() {
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let input = null;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0); // malformed/absent/empty stdin -> silent, fail-open
  }

  const status = buildStatus(input);
  if (!status) process.exit(0); // pct/model unresolvable -> silent, fail-open

  process.stdout.write(status.line + "\n");
  if (status.sessionId) {
    writeUsageFile(rootDir, status.sessionId, status.usedPct, status.totalTokens, new Date().toISOString(), status.contextWindowSize);
  }
  process.exit(0); // NEVER blocks, regardless of outcome
}

// Only auto-run when executed directly (`node statusline-context.mjs`), never on import
// (the test file imports the functions above without triggering the real CLI/exit).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
