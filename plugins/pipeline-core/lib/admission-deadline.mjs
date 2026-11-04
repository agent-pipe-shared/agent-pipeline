// SPDX-License-Identifier: SUL-1.0
/**
 * admission-deadline.mjs -- one process-wide deadline for the dispatch admission, checked inside the registry read loops.
 *
 * WHY. The host ends a PreToolUse hook at its timeout (guard-dispatch: 330 s) and then lets the tool call run: a timed-out hook is
 * not a block. A measured native Windows consumer run (2026-11-04) let the admission read the session-authority registry for the whole
 * timeout; the host ended it while it held the registry lock and before it wrote the pending host-commit state, and the dispatch
 * started with no admission result, no pending state, no warning and a lock owned by a dead process. The phase checkpoints
 * (createAdmissionCheckpoint) cannot see this: none of them lies before the long registry reads.
 *
 * SHAPE. The admission sets the deadline (its start plus its budget minus a margin for printing and unwinding) around the preparation
 * and clears it afterwards. The registry read loops and the read-only native observations call assertAdmissionDeadline(), which throws a
 * typed GUARD-DISPATCH-SLOW error. The throw unwinds through withSessionAuthorityBoundary, whose finally releases the lock, and the
 * preparation turns it into a refusal the guard prints. It is deliberately NOT checked on the cleanup path (reading or removing the lock
 * file in that finally): a deadline that interrupts the release would leave the lock behind, which is the failure this closes.
 *
 * Platform-neutral on purpose: the loops run on every platform; only the cost per step differs.
 */

/** The margin kept for printing the refusal and releasing the lock before the host's own timeout. */
export const ADMISSION_DEADLINE_MARGIN_MS = 5000;

let deadlineAtMs = null;
let startedAtMs = null;
let budgetMs = null;
let checks = 0;

/**
 * @param {{startMs: number, budgetMs: number}} deadline the admission start and its budget (milliseconds)
 * @param {number} [marginMs] time kept free before the budget ends
 */
export function setAdmissionDeadline({ startMs, budgetMs: budget } = {}, marginMs = ADMISSION_DEADLINE_MARGIN_MS) {
  if (!Number.isFinite(startMs) || !Number.isFinite(budget) || budget <= 0) { clearAdmissionDeadline(); return false; }
  startedAtMs = startMs;
  budgetMs = budget;
  deadlineAtMs = startMs + budget - Math.max(0, marginMs);
  checks = 0;
  return true;
}

export function clearAdmissionDeadline() {
  deadlineAtMs = null;
  startedAtMs = null;
  budgetMs = null;
  checks = 0;
}

export function admissionDeadlineActive() { return deadlineAtMs !== null; }

/** Throws GUARD-DISPATCH-SLOW once the deadline has passed; does nothing while none is set. */
export function assertAdmissionDeadline(now = Date.now()) {
  if (deadlineAtMs === null) return;
  checks += 1;
  if (now <= deadlineAtMs) return;
  const seconds = ((now - startedAtMs) / 1000).toFixed(1);
  const reason = `GUARD-DISPATCH-SLOW: the admission was still reading the session-authority registry after ${seconds}s (${checks} checks), past its ${(budgetMs / 1000).toFixed(0)}s budget; it refuses now so that the host does not end it while it holds the registry lock and then start the dispatch unguarded`;
  throw Object.assign(new Error(reason), {
    code: "GUARD-DISPATCH-SLOW",
    reason,
    repair: "retry once; if it repeats, run node <plugin-root>/scripts/session-authority-repair.mjs inspect --root <root> and the routine heal it names (finished dispatches whose pending states and stop-failure records remain slow every later admission)",
  });
}
