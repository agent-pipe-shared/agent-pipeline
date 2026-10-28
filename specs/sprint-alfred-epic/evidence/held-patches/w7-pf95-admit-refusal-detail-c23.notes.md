# w7-pf95-admit-refusal-detail-c23 notes (CHECKPOINT, tests only, no production fix yet)

Base: candidate 1b3f1efe6094f92ed7fd0d84d8719dc1d18edd7a. Targeted delivery: BLOCKED (checkpoint at the tool budget).

## Finding of step 2 (neither briefed suspect is the whole story)

Measured in the clone, RED log (driver log `red`): in the untaken-over-batch case of `PF94 TAKEOVER (6)` the error that the library-level
`admitSessionCriticReview` throws is NOT a `CGB-CONFLICT` carrying the delivery-target detail. The restored assertion failed with the message
`Generic Critic batch is unavailable or refused.` and the new case failed at `code`: actual `CGB-BUDGET`, expected `CGB-CONFLICT`. So the course admit
of the second packet is refused by a detail-less `fail("CGB-BUDGET")` in `plugins/pipeline-core/lib/critic-generic-batch.mjs` (candidate sites: lines 905 and
908 in the feature-course admit transaction, or 498/547), reached before or instead of the line-882 delivery-target `CGB-CONFLICT`. Suspect (1) (a re-wrapping
layer) is not indicated: the raw library error is already generic. Suspect (2) (200-character cut in `describeCliError`) still applies to the two CGB-CONFLICT details
but is moot for this fixture because a different code fires. Which exact site fires was not isolated (a debug run was started; its log was not read before the budget ended).
The `rg` for the pinned TAKEOVER_DETAIL phrases in other tests was not conclusive (command returned nothing; not re-run).

## What the patch contains (tests only, 1 file)

`plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`: restored `assert.ok(refused.message.includes("inspect-course-takeover"))` in
`PF94 TAKEOVER (6)`; new case `PF95 admit refusal (1) the CLI output of a refused admit names both takeover verbs` (helper `assertOperatorNamesTakeoverVerbs`,
uses `d173Cli`, i.e. the real CLI adapter catch/`describeCliError`, not a request-file `admit` run: deviation, the fixture request is a library-level request; second half
covers the TAKEOVER_DETAIL owner case through `takeoverFixture`).

## RED (clone, unchanged production code)

Finalizer file: tests 82, pass 79, fail 3. Failing names: the known pre-existing `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`,
`PF94 TAKEOVER (6) ...` (generic message), `PF95 admit refusal (1) ...` (code CGB-BUDGET instead of CGB-CONFLICT).

## NOT done

No production edit; no GREEN run; no clone2 baseline run; side suites (critic-generic-batch 35, check-verify-case-completion 32, critic-course-admission 65,
inventory 30) not run; VCR01 pin untouched. Next step: isolate which `CGB-BUDGET` site fires for the second packet (debug stack), then decide whether the
fix is a verb-first detail on that site (and on both CGB-CONFLICT details, under 190 characters) or whether the fixture's refusal is itself unexpected
(then the premise of the briefing needs the Elephant's decision). The new case may need its first half adjusted to whichever refusal the real state produces.

## Operator flow / commit

Patch applies cleanly at the candidate (`git apply --check` in clone2, exit 0). Proposed message once complete: "fix(critic): show the takeover verbs in the operator output when admit is refused by an old batch (PF-95)".
Flow: apply-diff, `git add -u` with a path limit, `--no-verify` commit, stamp, install. Protected-path classification: none of the touched files match TP-1..TP-13.
Independent Critic review stays a parent-owned batch gate.
