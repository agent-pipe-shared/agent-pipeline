// SPDX-License-Identifier: SUL-1.0
/**
 * admission-progress.mjs -- a phase mark that survives a hook the host ends.
 *
 * The authority trace (authority-trace-hook.mjs) is written when the process exits. A PreToolUse hook the host ends at its timeout
 * (guard-dispatch: 330 s) never exits normally, so the trace of exactly the run that matters is missing. When the opt-in trace is
 * installed it registers a writer on a well-known global; this module only calls it. Without the trace nothing is registered, so the
 * call is a no-op: no import, no file, no output. It never throws.
 */
const PROGRESS = Symbol.for("pipeline.authority-trace-progress");

/** Appends one `pipeline.hook-authority-progress.v1` line to the authority trace file, right now, when the trace is installed. */
export function admissionProgress(phase) {
  try {
    const write = globalThis[PROGRESS];
    if (typeof write === "function") write(String(phase));
  } catch { /* a diagnostic never changes the admission it observes */ }
}

export const ADMISSION_PROGRESS_SYMBOL = PROGRESS;
