# Project onboarding sharding Critic — round 1

Candidate: `7b096ed2a65c51471c690876eda2a0fab811f67a`

Verdict: FAIL.

The independent Critic reported three findings:

1. The review brief did not name a rollback path and the Critic treated generic
   push-policy checklist item 4 as blocking.
2. Residual serial-lane and release-trend work had an owner but no expiry; the
   Critic treated generic push-policy checklist item 8 as blocking.
3. The shard controller did not directly regression-test malformed coordinates
   or child error, signal and non-zero outcomes. This was rated major against
   acceptance criteria 3–4 and QG-11.

The first two findings cite
`governance/examples/policies/checklist.md`, which labels itself a generic
example applied before the push gate. This package is a local test-runner
change and does not request push admission. The correction nevertheless records
the cheap, useful recovery path and bounds the named follow-up so the eventual
push review has explicit evidence. The third finding is applicable now and is
corrected with an executable controller self-test in the suite's ordinary
entrypoint.

Assurance reported by the Critic: functional-equivalent read-only; OS isolation
was not asserted. It reported no briefing violation.
