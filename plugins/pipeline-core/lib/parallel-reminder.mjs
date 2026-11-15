// SPDX-License-Identifier: SUL-1.0
/**
 * parallel-reminder.mjs -- the parallel-by-default reminder the main session gets at session start, after a compact and
 * every N of its own tool calls (C29e T10, PO tile 2026-11-14 "idea one": extend existing hooks).
 *
 * Agents keep falling back to serial work. Three existing hooks carry the same short text:
 *   - hooks/setup-check.mjs (SessionStart startup|resume|clear), when it has nothing else to say;
 *   - hooks/post-compact-reground.mjs (SessionStart compact), as one more line of the re-grounding;
 *   - hooks/guard-dispatch-budget.mjs (PreToolUse), on every N-th call of the orchestrator session.
 *
 * The every-N output carries `additionalContext` only, never a `permissionDecision`: an "allow" would skip the user's
 * permission prompt for that call (Claude Code hooks reference, PreToolUse decision control), so the reminder must not
 * decide anything. The counter is lock-free and fail-open: one byte appended per call, the file size decides, any error
 * means no reminder. Parallel calls may both see a multiple of N or skip one; that only moves a reminder by a call.
 *
 * `session.parallel_reminder_every` in pipeline.user.yaml sets N (an integer 0..1000); 0 turns the reminder off at all
 * three points; absent or invalid means the default 25.
 */
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseYaml } from "./yaml-lite.mjs";

export const PARALLEL_REMINDER_DEFAULT_EVERY = 25;
export const PARALLEL_REMINDER_MAX_EVERY = 1000;
export const PARALLEL_REMINDER =
  "Parallel by default: send independent read-only tool calls together in one message, run independent read-only scouts at the same time and independent test files in parallel. "
  + "Limits: never two heavy test suites at once, one write dispatch per message, no write to the tree while a write dispatch runs.";

/** N from an already parsed pipeline.user.yaml value (null when unreadable): the default when absent or invalid. */
export function parallelReminderEvery(parsedUserYaml) {
  const value = parsedUserYaml !== null && typeof parsedUserYaml === "object" && !Array.isArray(parsedUserYaml)
    ? parsedUserYaml.session?.parallel_reminder_every
    : undefined;
  return Number.isSafeInteger(value) && value >= 0 && value <= PARALLEL_REMINDER_MAX_EVERY ? value : PARALLEL_REMINDER_DEFAULT_EVERY;
}

/** N from `<rootDir>/pipeline.user.yaml`; fail-open to the default when the file is missing or unreadable. */
export function readParallelReminderEvery(rootDir, deps = {}) {
  try {
    return parallelReminderEvery(parseYaml((deps.readFileSyncFn ?? readFileSync)(join(rootDir, "pipeline.user.yaml"), "utf8")));
  } catch {
    return parallelReminderEvery(null);
  }
}

/** SessionStart stdout that only adds the reminder to the model's context. */
export function parallelReminderSessionStartStdout() {
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: PARALLEL_REMINDER } })}\n`;
}

/** PreToolUse stdout that only adds the reminder next to the tool result; no permission decision (module header). */
export function parallelReminderPreToolUseStdout() {
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: PARALLEL_REMINDER } })}\n`;
}

/** The orchestrator's call counter file, next to the budget guard's once-per-session marker. */
export function parallelReminderCounterPath(commonDir, transcriptPath) {
  const stem = typeof transcriptPath === "string" && transcriptPath.trim() !== ""
    ? basename(transcriptPath).replace(/\.jsonl$/u, "")
    : "unknown-session";
  return join(commonDir, "agent-pipeline", "dispatch-budget", "orchestrator-seen", `${stem}.calls`);
}

/**
 * Count one orchestrator call; true when this call is the N-th (and 2N-th, ...). Fail-open: false on any error, and
 * false when N is 0. `deps` are seams for tests.
 */
export function tickParallelReminder({ commonDir, transcriptPath, every }, deps = {}) {
  if (!Number.isSafeInteger(every) || every <= 0 || typeof commonDir !== "string" || commonDir === "") return false;
  const appendFn = deps.appendFileSyncFn ?? appendFileSync;
  const mkdirFn = deps.mkdirSyncFn ?? mkdirSync;
  const statFn = deps.statSyncFn ?? statSync;
  try {
    const path = parallelReminderCounterPath(commonDir, transcriptPath);
    mkdirFn(dirname(path), { recursive: true, mode: 0o700 });
    appendFn(path, ".", { mode: 0o600 });
    const size = statFn(path).size;
    return Number.isSafeInteger(size) && size > 0 && size % every === 0;
  } catch {
    return false;
  }
}
