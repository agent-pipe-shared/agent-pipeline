# w228 — a registry lock whose owner is gone is refused with the heal that retires it

- Found by: Windows dispatch B preparation on 19f: `dispatch-briefing build` refused `DBG-RULESET-LOCK-HELD` for a lock whose owner (pid 24404) was "dead for 37230s" (left by a hook the host ended earlier); the refusal named `wait` (a dead owner never clears) and `release-lock` (the assertion for an owner that cannot be judged). The peer solved it with `wait` and `heal`.
- Change (`dispatch-briefing.mjs`): for `lock.owner === "dead"` the refusal says the owner is gone and names `session-authority-repair.mjs heal --root <repo>` (what `inspect` itself names for a dead owner), then retry; the live and unjudgeable texts are unchanged. A dead owner is still never waited for.
- Test: the first K12 case now also drives a dead-owner lock (never paused, names heal, does not name wait). Suite `dispatch-briefing` 162/162.
