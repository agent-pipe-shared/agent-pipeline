# Critic record — R7-11 budget lock, round 2 (delta)

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: fac3bdd62, 4311c6f96 (delta over 65496a0fb, fdc1dd0e4, b60fb3c48, d71588d8a, 4262cbcbc); registry F3–F7.
- Verdict: **FAIL**. Trajectory: consistent.
- F-A major: `counter-lock-recovery-raced` is now fail-closed, but the single attempt also returns it on benign parallel-race exits of dead-owner recovery (`guard-dispatch-budget.mjs` ~826 recovery lock released by a winner, ~838 stale-recovery takeover ENOENT/EEXIST, ~852 main-lock ENOENT/EEXIST), so a losing parallel call after a crashed holder is refused as `DISPATCH-BUDGET-INPUT-INVALID` with a host-path repair (§22.11 R7-11a/R7-11b, AC-37). The T3 pin scripts the code at the attempt seam and never drives the real race exits.
- F3–F7 of round 1: cleared within the delta (typed timeout, monotonic bound, retry set, pins).
- Disposition: QG-13 round cap reached (decision A) — no third Critic. Test-only dispatch pins the split (race exits retried; a genuine I/O exception during recovery fails closed under its own code), then a fix dispatch; the Elephant self-verifies the result against F-A.
