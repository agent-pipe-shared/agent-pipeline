# Closure evidence — critical-human-proof.json now materialized for both onboarding routes

Item: `backlog/items/2026-08-09-critical-human-proof-not-materialized-for-signature-mode.md`
Date: 2026-08-09

## What Direction remedy 1 asked for

Auto-provision `project/critical-human-proof.json` (`requiredKinds: ["push"]`)
at onboarding time, since `gates.push_approval` is already known by then —
avoiding the full signed Human-Guard-Override ceremony a fresh project would
otherwise need just to create that one file.

## What shipped

`d777e67dca95b46545be912d5d971b0ef1f3ef16` wired
`freshCriticalHumanProofPolicyBytes()` into `freshBaselines()` and
`planProjectOnboardingV3`'s target list — the primary onboarding route.
Independent Critic review of that commit alone (`scratch/critic-bcd4dfc9/critic-notes.md`)
found a real gap: `planProjectPartialAuthorityAdoption`, a second onboarding
route (pre-V3 migration/reconstruction) in the same file, seeds the
identical blocking `push` gate chapter but was left reaching the original
`CRITICAL-PROOF-POLICY-KIND-REQUIRED` dead end. `3db838f2c7822faa7d17bea9459aed347e9f69b4`
extended the fix to that route too, and corrected two test-coverage gaps in
the accompanying regression test (`PUSHPROOF-1`'s signature and chat halves
each previously refused or returned too early to exercise the reported
failure).

A second, final Critic review of both commits together
(`scratch/critic-1f03ce024c82/critic-notes.md`) independently re-derived the
closure of all three findings from source rather than trusting the fix
narrative, confirmed genuine RED-to-GREEN discrimination for the corrected
test, confirmed no weakened/skipped assertions, and returned **PASS** with
no surviving findings.

## What remains open, deliberately

Direction remedy 2 (collapsing the Human-Guard-Override ceremony itself) is
unaddressed by this closure and remains tracked in
`2026-08-08-the-signed-guard-override-has-no-command-that-emits-the-digest-to-sign.md`.
Remedy 1 alone fully closes the gap this item reports: a freshly onboarded
project (either route) no longer needs that ceremony just to bootstrap the
push proof-policy file.

The second review also surfaced two judgment calls it deliberately did not
treat as findings of this diff — filed as their own items rather than lost:
`2026-08-09-critical-human-proof-policy-seeded-without-trust-anchor.md` and
`2026-08-09-project-reset-does-not-classify-the-proof-policy-artifact.md`.

## Result

`project-onboarding-v3.test.mjs` 113/113; repo-wide Verify 267/267 exit 0,
bound to commit `3db838f2c7822faa7d17bea9459aed347e9f69b4`.
