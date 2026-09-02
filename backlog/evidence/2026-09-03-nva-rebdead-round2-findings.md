# NVA-REBDEAD — findings registry, round 2

Independent Critic review of the nine-commit package, `claude-opus-5` at `max`
(MP-07: guardrail diff). Round 2 of at most two on this package. Two findings
against the diff, plus two briefing violations against the dispatcher.

## F1 (round 2) — `43413349` is an Elephant-authored production diff on a guardrail hook (major)

**Accepted without qualification. The violation is the dispatcher's.**

`43413349` carries no `Dispatch:` trailer; all eight siblings do. EL-01's
stage-0 exception requires *all* of ≤2 files, ≤~25 diff lines, no
test/guardrail-hook/CI change, trivially revertable, no risk flag. This commit
fails three independently:

| condition | limit | actual |
| --- | --- | --- |
| files | ≤ 2 | 3 |
| diff lines | ~25 | 146 |
| surfaces excluded by name | none | a guardrail hook **and** a test file |

EL-01's own extracted clarification closes the remaining route in this exact
shape: a guardrail-hook file or a multi-file/large diff "still routes to a
`goldfish-mechanic` dispatch, never Elephant self-execution."

The Critic calibrated the severity rather than inflating it, and that
calibration is recorded here because it is the honest reading: the resulting
production state is a revert to code a Goldfish had already written, and the
refutation's mechanism was independently confirmed correct. The residual *code*
risk is low. What was bypassed is the control EL-01 exists for — the same
session that formed the judgement "F1 is refuted" executed the removal from the
guard, with no fresh context between hypothesis and edit.

That control is not theoretical in this package. `8f1c0737` narrowed the same
relief on a reasoned-but-wrong premise, the suite stayed green, and only a
separately dispatched round caught it. The revert happened to be right; the
process that produced it could not have told the difference.

**Disposition:** no code change. The correct remedy is not to re-do the revert
through a dispatch — that would churn a guardrail hook to launder authorship.
It is recorded as a lifecycle violation against the dispatcher, which is what
EL-16's close-time authorship check exists to surface.

## F2 (round 2) — acceptance criterion 2's `apply_patch` clause has no coverage (minor)

**Accepted.** The criterion requires regression coverage for
"Edit/Write/apply_patch admitted on that exact conflict path". `d244c19c` added
it; `43413349` reverted the code and its tests together and nothing replaced
the assertion. `guard-apply-patch.test.mjs` carries no rebase coverage either.

The behaviour is correct, and rests on an implicit precondition no test states:
the unconditional early return for any tool outside `SHELL_TOOLS`/`WRITE_TOOLS`,
plus `guard-apply-patch.mjs`'s translation loop. Adding `apply_patch` to
`WRITE_TOOLS`, or moving that early return below the reliefs, would silently
re-close the deadlock for the Codex runner with the whole suite green.

That is the same shape the spec itself diagnoses as the reason the original
defect shipped: fourteen passing cases while the reported deadlock was fully
live. Dispatched as `NVA-REBDEAD-R2F2`, coverage only — no guard change, and
explicitly not a re-introduction of the unreachable branches the earlier round
removed.

## Briefing violations — both the dispatcher's

### BV1 — a fabricated commit SHA in a fail-closed reference boundary

The dispatch enumerated `434133495d8d05a1d0cf70e1e26c40de9c1de0e2`. No such
object exists. The real commit is `43413349e103d61cee7beffaa944f9fd16015083`;
the two diverge at character 9. The dispatcher extended an 8-character prefix
into a plausible-looking 40-character identifier instead of resolving it.

In a boundary whose whole purpose is that the review object is fixed and
unambiguous, that is a fabricated identifier, not a typo. The Critic resolved it
against three independent admissible sources rather than stopping — correct
judgement on its part, and no excuse for the defect.

**Remedy, applied:** enumerate SHAs only from `git rev-parse` output, never
typed or extended by hand. The authorship projection this same dispatch shipped
was built that way and carried the correct value; the prose list beside it was
not, which is precisely why a hand-maintained duplicate of machine-derivable
data should not exist in a dispatch at all.

### BV2 — session history leaked into a closed input contract

The tool-budget field said six dispatches in this session's package had hit the
`maxTurns` cliff. True, operationally useful, and outside the contract: a Critic
briefing may carry references and metadata, not orchestrator narrative. The
Critic did not treat it as contaminating, since it says nothing about the review
object, and recorded it anyway. Correct on both counts.

**Remedy:** state the cap and the cliff as numbers. The reason the number was
chosen is the dispatcher's business.

## Disclosed limitation of this round, carried forward

Two package commits modify `2026-09-02-nva-rebdead-1-findings.md`, which the
dispatch deliberately excluded as dispatcher rationale. The Critic honoured the
exclusion and therefore did not review those 38 lines of the diff.

This is a real consequence of the exclusion, not an oversight, and it is a
structural tension worth naming: a findings registry is both the honest record
of a round and, once committed, part of the next round's diff. Excluding it
keeps the review independent and leaves part of the diff unreviewed. Neither
half is wrong; the tension has no resolution inside a single round and is
recorded so a later round does not rediscover it as a gap.

## Categories examined and found in order

Path-shape handling across both reliefs; lift accumulation through the new early
return; the widening to `continuity-observation-unavailable` and its two
bounding predicates; the push/force-push/history-rewrite surface and the
`signature`-mode gate; acceptance criteria 1, 3, 4 and 5; `68c164e8`'s
sanitisation claim; GIT-01's admitted type vocabulary for the revert; GIT-02
atomicity; new imports and dependency surface; language assignment; and test
integrity across the parameterisation.
