# Critic record — R7-11 budget lock, round 2 (delta)

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: fac3bdd62, 4311c6f96 (delta over 65496a0fb, fdc1dd0e4, b60fb3c48, d71588d8a, 4262cbcbc); registry F3–F7.
- Verdict: **FAIL**. Trajectory: consistent.
- F-A major: `counter-lock-recovery-raced` is now fail-closed, but the single attempt also returns it on benign parallel-race exits of dead-owner recovery (`guard-dispatch-budget.mjs` ~826 recovery lock released by a winner, ~838 stale-recovery takeover ENOENT/EEXIST, ~852 main-lock ENOENT/EEXIST), so a losing parallel call after a crashed holder is refused as `DISPATCH-BUDGET-INPUT-INVALID` with a host-path repair (§22.11 R7-11a/R7-11b, AC-37). The T3 pin scripts the code at the attempt seam and never drives the real race exits.
- F3–F7 of round 1: cleared within the delta (typed timeout, monotonic bound, retry set, pins).
- **Elephant self-verification of F-A (round cap, decision A), 2026-10-07:** pins `25b7fc691` (T4, 10 cases driving the real
  fs seams) and `31a72a4f8` (T3 realigned to `counter-lock-recovery-failed`, new T5 raced-is-retried); fix `46b500610` adds
  `counterLockRecoveryErrorResult` (`guard-dispatch-budget.mjs` ~805: ENOENT/EEXIST → `counter-lock-recovery-raced`, else
  `counter-lock-recovery-failed`), used at the three race exits (~840 vanished recovery lock, ~852 takeover, ~870 republish), the
  non-fs publish branch returns `counter-lock-recovery-failed` (~853), and `counter-lock-recovery-raced` is back in
  `COUNTER_LOCK_TRANSIENT_CODES` (~894). `evidence/r7-11-f4b-after.txt`: 85 tests, 84 pass, 0 fail, 1 pre-existing skip.
  F-A resolved. Residuals (unpinned, recorded): a recovery lock vanishing between the existence check and the stable read still
  yields `counter-lock-recovery-malformed`; the first-publish raw-message code (~803 at the earlier revision) is outside recovery.
- Disposition: QG-13 round cap reached (decision A) — no third Critic. Test-only dispatch pins the split (race exits retried; a genuine I/O exception during recovery fails closed under its own code), then a fix dispatch; the Elephant self-verifies the result against F-A.
