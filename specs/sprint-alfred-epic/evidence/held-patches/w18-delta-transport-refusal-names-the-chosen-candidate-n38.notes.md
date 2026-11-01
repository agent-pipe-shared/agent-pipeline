# Held patch notes — N38: a manifest-core commit is the delta candidate, and the transport refusal names the chosen commits (candidate 15c)

Patch: `w18-delta-transport-refusal-names-the-chosen-candidate-n38.patch` (the file name keeps the first version's wording).

## Why

`backlog/items/2026-10-31-delta-candidate-choice-and-transport-test-disagree-on-reconcile-commits.md` (Toolbox N38): after a PO-signed `feature-package-reconcile` commit, `register-feature-package.mjs --add-delta-request` refused
`FPR-DELTA-TRANSPORT` without naming the candidate it had chosen. The candidate choice treated a manifest-only commit as evidence-only; the transport check (`critic-course-admission.mjs` `transport`) compares the manifest core
(the manifest minus its `candidate-evidence` artifacts) and refused the reconcile. PO tile answer 2026-11-01: a reconcile (a commit that changes the manifest core) counts as the candidate.

## What

`plugins/pipeline-core/lib/feature-package-registration.mjs`:
- New helpers `manifestCoreSha256` / `manifestCoreUnchanged`: the manifest core of a commit as a canonical digest (`sha256Canonical`), the transport check's own definition; unreadable on either side counts as changed (fails toward the candidate).
- The candidate choice in `addCriticDeltaRequest` skips a first-parent commit as evidence-only only if its paths are the manifest and the feature's evidence directory AND, when it touches the manifest, the manifest core is unchanged. Otherwise the commit is the candidate.
  A diagnostic-registration commit (only `candidate-evidence` entries added) is unchanged in behavior.
- The `FPR-DELTA-TRANSPORT` refusal text names the chosen candidate, the base and HEAD, and the refusal carries `candidateCommit`, `baseCommit`, `headCommit`.

`plugins/pipeline-core/lib/critic-course-admission.test.mjs`: one case appended after the numbered cases (the completion registry numbers unnumbered cases by position): the PF94 delta fixture plus a manifest-only commit that flips `feature.rigor`
(manifest core): the verb now takes that commit as the candidate and refuses `FPR-DELTA-NO-DIAGNOSTIC` naming it (3 assertions). Before the change the same commit ended in `FPR-DELTA-TRANSPORT` (measured earlier in this series).

The pinned assertion count of the suite (334 -> 337) travels as `w18b-pin-count-of-the-course-admission-suite-after-n38` (applied last; its hunk neighbours the N21 pin hunk).

## Consequence for operators

After a reconcile commit the delta round reviews the reconcile commit itself, so its diagnostic evidence must be produced for THAT commit (the refusal says which commit it expects). The transport check is unchanged and stays strict.

## Evidence

Scratch clone: critic-course-admission, consumer-chain-walk pin, close-coordinator pin and critic-diagnostic-evidence suites 158/158. VCR01 fails on the count until w18b is applied. Pending: Full Verify, batch Critic, native runs, PO acceptance.
