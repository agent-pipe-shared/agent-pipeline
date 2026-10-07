# Critic record — R7-11 budget lock, round 1 (full)

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: 65496a0fb, fdc1dd0e4, b60fb3c48, d71588d8a, 4262cbcbc (per-SHA).
- Verdict: **FAIL**. Trajectory: consistent (win32 only).
- F1 major: R7-11e (bootstrap receipt at SubagentStart, T20) not covered — needs `hooks.json` (protected) → signed package.
- F2 major: §22.0 matrix not evidenced — only win32 source-checkout runs; no POSIX, no consumer-layout fixture.
- F3 minor: `counter-lock-recovery-raced` is the catch-all for any dead-owner recovery exception, now retried and reported as a "live holder" timeout.
- F4 minor: no pins for the recovery retry codes, the non-retry of `counter-lock-recovery-changed`, timeout without `holderAgeMs`, the `lastChance` branch.
- F5 minor: the timeout surfaces as `DISPATCH-BUDGET-INPUT-INVALID` (`counter-lock-timeout` only in the reason).
- F6 minor: the bound uses the wall clock (`Date.now`), not a monotonic clock.
- F7 minor: the bound's value 3000 is not pinned (tests allow ≤ 10000; spec asks for a pinned named constant).
- Disposition: F3–F7 → test-only dispatch then fix (round 2 = delta). F1 → signed package. F2 → POSIX/WSL and consumer-layout runs of the suite before the stamp.
