# Closure evidence: `approve-push` humanName authority mismatch

- **Fix commit:** `ad81a9b9ab89aab52fb4099971c3c3a0fcd6f852` (GF-067, goldfish-deep).
- **Independent verification (Elephant):** diff read directly (`git show`), both
  targeted suites (`pipeline-state.test.mjs`, `critical-human-proof-gate.test.mjs`,
  `po-human-approval.test.mjs`) re-run and confirmed green; Full Verify re-run
  clean and exactly bound (267/267 suites, `evidence/verify-latest.json`,
  commit `0af4eb74e854e7fdc77f15dcb02019ab6321ebcc`).
- **Critic review:** claude-opus-5 at max, functional-equivalent-read-only lane
  (MP-07 guardrail/security escalation). Verdict: **FAIL overall**, but the
  reviewed commit itself was explicitly cleared — "the code change itself is
  correct, minimal, correctly anchored and genuinely tested — do not alter
  `ad81a9b9`." The FAIL rested entirely on two process findings, both now
  addressed without touching the fix:
  - **F1** (major): a second, documented reader of the same `trust-policy.json`
    (`po-approval-request.mjs verify`) still exhibits the identical bug, and
    that residual had no durable record — filed separately as
    `2026-08-09-po-approval-request-verify-still-rejects-a-fresh-setup1-authority.md`,
    including the standing `own()` exact-match-vs-subset design question.
  - **F2** (minor): the archived diff snapshot
    (`evidence/gf067-diff-snapshot.txt`) omitted the test-file hunk —
    regenerated in full (both files, unabridged `git show` output).
  Two additional briefing-quality notes (an internal inconsistency between
  the dispatch's stated criticality row and its T1 isolation line; an
  off-by-one in stating how many commits separated the reviewed commit from
  the evidence-bound commit) are process notes for future Critic dispatches,
  not defects in this fix.
- **This item's specific scope** — `approve-push` rejecting a fresh,
  correctly-generated SETUP-1 (3-field) authority file — is fully resolved
  and verified. The sibling command's identical defect is tracked in the
  item referenced above; this item is closed to that exact scope, not to the
  broader class.
