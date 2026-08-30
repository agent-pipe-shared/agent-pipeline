---
schema: pipeline.backlog-item.v1
id: pipeline.trust-anchor-bootstrap-confirmed-still-circular-live
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-30
closure_repository: self
closure_commit: 6876ba53eb1213e4857881ec4f4a0aa36eaf8134
closure_evidence: plugins/pipeline-core/lib/trust-anchor-bootstrap-circularity.repro.test.mjs
created: 2026-08-29
sprint: nova
tracking: "NOW / Nova A -- happy-path blocker, confirmed live by 2 of 3 independent runners against the exact candidate the PO tested with."
source: "Codex 060-77 and Claude/Windows 060-78 greenfield retrospectives (scratch/greenfield-reports/), plus direct PO confirmation 2026-08-29: 'das ist auch mein Eindruck ... die fixes gingen eindeutig nicht weit genug und die Runner haben die berichteten Probleme wirklich [gehabt]'."
---

# Trust-anchor bootstrap is still circular in a live, genuinely fresh signature-mode project, despite the 2026-08-29 closure of the item describing the same defect

## What happened

`2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` was closed
2026-08-29 (commit `180d427a`, dispatch NVA-R32-TRUSTANCHORBOOT) as "found
already satisfied" -- verified via existing unit tests, no new code written.

The candidate the PO then used for a 3-runner greenfield test (built from
commit `ab0906d`, 16:43 CEST; stamped `0bf246d1`, 18:44 CEST) already
contained that exact closure commit. Yet BOTH the Codex/WSL and Claude/Windows
sessions -- run on genuinely independent physical machines/environments,
per Claude's own report's explicit independence argument -- hit the
IDENTICAL circularity the original item described: no sanctioned path to
write the first trust anchor into `project/critical-human-proof.json`
(GS-2-protected), only escapable via a human-run `git commit --no-verify`.

This is a live-verification gap, not a version-skew artifact: the fix
commit's timestamp precedes the candidate build by hours.

## Direction

Do NOT re-read the code and re-conclude "found already satisfied" a second
time -- that is what produced the false closure. Required this time:

1. Reproduce against a GENUINELY fresh fixture: no pre-existing machine-plane
   key pointer (`~/.agent-pipeline/machine.json` absent or pointing nowhere),
   `signature` mode, from a clean onboarding start.
2. Drive the actual `po-human-approval.mjs setup` / onboarding flow live
   (not just read `detectExistingLocalTrustAnchor()`/
   `freshCriticalHumanProofPolicyBytes()` and assume they compose correctly)
   and observe whether the first trust anchor actually lands in
   `project/critical-human-proof.json` without a `--no-verify` bypass.
3. If it still doesn't: the likely gap, per both runner reports, is that
   `po-human-approval.mjs setup`'s own write path is not exempted from the
   same GS-2 gate-strength protection it needs to satisfy, or the
   `collect-input` guidance action it fires does not actually complete the
   write it names.

## Acceptance criteria

- A live, scripted reproduction (not a code-reading exercise) of a fresh
  `signature`-mode onboarding through the FIRST successful human-override use
  completes with zero `--no-verify` bypass.
- The reproduction script/fixture is committed as permanent regression
  coverage, not a scratch throwaway -- this exact "closed via code-reading,
  still broken live" failure mode has now recurred at least twice this
  session (see also the Codex-restart item) and needs a durable guard against
  recurring a third time.

## Progress, 2026-08-29 (NVA-CF-KEYBOOTSTRAP dispatch)

Direction steps 1-2 done, live, exactly as specified: a real git repo, the
REAL installed pre-commit backstop, and a real key created via
`po-human-approval.mjs setup` (not code-reading, not an assumption of
composition). Step 3's hypothesis was refined by the live run: it is not that
`setup`'s write path lacks a GS-2 exemption -- a fresh project's FIRST commit
already succeeds via `pre-commit-hook-install.mjs`'s first-appearance
exemption. The actual break is one step later: ADDING the trust anchor to
that now-already-tracked `project/critical-human-proof.json` after a later
key creation is blocked (no exemption applies to an already-tracked file),
and the sanctioned GS-10/HGO ceremony itself refuses to run without an
already-existing trust anchor (`HGO-TRUST-ANCHOR-MISSING`,
`human-guard-override.mjs:3182-3197` -- NVA-HGOFIX-1's deliberate posture).
Permanent regression coverage committed:
`plugins/pipeline-core/lib/trust-anchor-bootstrap-circularity.repro.test.mjs`
(commit `7c44e746`) -- satisfies the acceptance criteria's "committed as
permanent regression coverage" clause; it currently PASSES because it
correctly documents the still-blocked state, not because the deadlock is
fixed. **The fix itself is not yet chosen or dispatched** -- it needs one of
two file-scope decisions (widen `pre-commit-hook-install.mjs`'s exemption, or
give `human-guard-override.mjs` a bootstrapping TOFU route) that touches
security-sensitive/fail-closed code, so it is on the PO decisions list
(`scratch/po-decisions-pending-2026-08-29-final.md`) rather than picked
autonomously. This item stays open until that fix lands and the reproduction
in the committed test flips from documenting-the-bug to proving-the-fix.

## Triage

- **Decision:** accepted, Nova A, high priority
- **Rationale:** confirmed live by 2 independent runners against the actual
  tested candidate; PO explicitly confirmed the finding 2026-08-29.
- **Date:** 2026-08-29

## Closed, 2026-08-30 (NVA-CF-TRUSTANCHOR-TOFU)

Commit `6876ba53` (dispatch NVA-CF-TRUSTANCHOR-TOFU, PO decision Option A)
added a second, narrow `isTrustAnchorBootstrapUpgrade()` exemption in
`pre-commit-hook-install.mjs`, firing only for
`project/critical-human-proof.json`, only for a v1/v2/v3(no-anchor) ->
v3(exactly-one-anchor) transition with `requiredKinds`/`waivedKinds`
semantically unchanged. This closes exactly the gap this item's own
"Progress" note identified: adding the FIRST trust anchor to the
already-tracked file after key creation now commits directly, with no
`--no-verify` bypass. Any other already-tracked rewrite of that path (a
replaced anchor, a second anchor, an unrelated bundled field) stays exactly
as blocked as before -- covered by the fix commit's own new
`pre-commit-hook-install.trust-anchor-bootstrap.test.mjs`.
`human-guard-override.mjs`'s fail-closed posture is untouched, per the PO's
explicit choice of fix location.

This item's own Acceptance Criteria required the reproduction to flip from
documenting-the-bug to proving-the-fix, not a fresh reproduction attempt --
the fix commit did exactly that: `trust-anchor-bootstrap-circularity.repro.test.mjs`'s
final assertion changed from expecting the commit to fail to asserting
`r.status === 0` and that the committed policy file actually carries the new
anchor. Independently re-verified by the Elephant, 2026-08-30:
`node --test plugins/pipeline-core/lib/trust-anchor-bootstrap-circularity.repro.test.mjs`
-- 1/1 pass. (Minor, non-blocking: that test's own `test(...)` title string
still reads "...is still blocked without --no-verify" -- stale wording left
over from before the fix; the assertions inside it are correct and green.
Worth a one-line title fix alongside the next dispatch that touches this
file, not worth its own dispatch.)

## Related

- `2026-08-28-onboarding-must-bootstrap-the-trust-anchor-once.md` (closed) --
  the item this supersedes; its closure verdict is now known incorrect for
  the live case.
- `2026-08-29-verify-contract-fails-until-configured-but-gs-10-blocks-configuring-it.md`
  -- the structurally identical GS-10 deadlock found the same session.
