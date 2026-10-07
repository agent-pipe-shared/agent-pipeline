# Critic record — R7-1a git null device, round 1 (full, partial)

- Route: requested claude-sonnet-5-5 at max (class-mittel cascade); effective identity claude-sonnet-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: 95bcc458c, 12ac0a7af, e72bae788, 2c6dce21c.
- Verdict: **withheld — partial review** (budget checkpoint); F1/F2 major stand. Trajectory: partly not verifiable. Escalation note: next round on the higher-capability model (possible protected-baseline touch not reached).
- F1 major: QG-04 — fix dispatch R7-1A-F2 edited the RED test file in the fix commit (ratchet detector extended with `R71A_WIN32_TERNARY`, net-strengthening, no positive control added) and fixture files of modules it changed.
- F2 major: red suites without baselines in the evidence (`r7-1a-f3-txhost` 1 failure, `r7-1a-f3-codexcap` 3, `r7-1a-f3-e2e` 3; first `r7-1a-f-green` run red on win32 private-state, rerun green); no post-change run of `project-onboarding-v3.test.mjs`; no Critic-mode verify receipt.
- F3 minor: eleven inline `"/dev/null"` git values in eight production files remain outside the shared constant; ratchet only searches NUL spellings; askpass comment overclaims.
- F4 minor: ratchet scans `lib/` and `scripts/` production modules only (no fixtures, `hooks/`, `harness/scripts/`).
- F5 minor: R7-1a sentence 1 exercised behaviourally for `runGit` only; sentence 3 has no dedicated case; no consumer-layout / POSIX run (§22.0).
- Disposition: F1 → regularize with a test-only dispatch that adds the missing positive control (the Critic-side QG-04 record stays). F3/F4 → the same test-only dispatch extends the ratchet (RED on the eleven sites), then a fix dispatch. F2 → baseline runs at `12ac0a7af^` for the three red suites and a post-change `project-onboarding-v3` run before the delta round (known unrelated failures: afk-transaction-host 1, codex-onboarding-capabilities 3). F5 → part of the F2 matrix (POSIX/WSL and consumer layout) before the stamp. One delta Critic remains (decision A), on claude-opus-5-5.
