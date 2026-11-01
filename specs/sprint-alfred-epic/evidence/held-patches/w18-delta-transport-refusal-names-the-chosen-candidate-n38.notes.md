# Held patch notes — the delta verb's transport refusal names the candidate it chose (N38, candidate 15c)

Patch: `w18-delta-transport-refusal-names-the-chosen-candidate-n38.patch`.

## Why

`backlog/items/2026-10-31-delta-candidate-choice-and-transport-test-disagree-on-reconcile-commits.md` (Toolbox N38): after a PO-signed `feature-package-reconcile` commit,
`register-feature-package.mjs --add-delta-request` refused with `FPR-DELTA-TRANSPORT`, and the refusal did not say which candidate the verb had chosen, so the cause was found by reading code.
The item's proposed direction has two parts: (1) one predicate for "evidence-only" in the candidate choice and in the transport check, (2) in every case the refusal names the candidate.

## What (part 2 only)

- `plugins/pipeline-core/lib/feature-package-registration.mjs`: the `FPR-DELTA-TRANSPORT` refusal text now names the chosen candidate, the base and HEAD, explains which test chose the candidate,
  and names the likely cause (a commit between candidate and HEAD that changes the manifest beyond registering evidence, for example a feature-package-reconcile commit, passes the
  candidate-choice test but not the transport check) and the workaround that worked (a real non-evidence commit becomes the candidate; diagnostic evidence for that commit).
  The refusal's data fields gain `candidateCommit`, `baseCommit`, `headCommit`. Nothing about which commit is chosen or when the verb refuses changes.
- `plugins/pipeline-core/lib/critic-course-admission.test.mjs`: one new case appended after the numbered cases (the completion registry numbers unnumbered cases by position, so a mid-file insert
  would renumber the rest): the PF94 delta fixture plus a manifest-only commit that flips `feature.rigor` (manifest core) reproduces the refusal and asserts the named commits and the data fields (6 assertions).
- The pinned assertion count of critic-course-admission (334 -> 340) is NOT in this patch: its hunk touches lines next to the N21 patch's pin hunk and would not apply after it. It travels as
  `w18b-pin-count-of-the-course-admission-suite-after-n38`, applied last on the full stack.

## NOT done: part 1 (the predicate)

Choosing one predicate changes which commit becomes the candidate of a Critic delta round, or which commits the transport check accepts. That is a trust-boundary decision, so it is a PO tile
(`scratch/pending-po-tiles-2026-11-01.md`), not a hold-patch change. The backlog item stays open.

## Evidence

Scratch clone: critic-course-admission suite + critic-diagnostic-evidence suite green; the new case reproduced the refusal; VCR01 fails on the count until w18b is applied (then green).
Pending: Full Verify, batch Critic, native runs, PO acceptance.
