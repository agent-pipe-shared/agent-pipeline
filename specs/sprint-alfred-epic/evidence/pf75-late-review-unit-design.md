# PF-75 design memo: admissible first review base for a review unit added after delivery

Slice W6-D165-PF75-ANALYSIS-20261026 · candidate 5eaaf9af3 · research only, no code changed, no suite run.
Paths below are under `plugins/pipeline-core/` unless stated. "Not verified" marks what this memo did not read.

## 1. Every place that requires the unit at the base commit

| Place | Evidence | Effect |
|---|---|---|
| Course admission, unit lookup | `lib/critic-course-admission.mjs:506` reads the manifest at `identity.genesisCandidate.base`; `:509-511` demands exactly one unit entry (class design, authority false, immutable, retain) | else `CCA-REVIEW-UNIT-REQUIRED` |
| Course admission, blob | `:513-514` `observedBlob(root, genesisCandidate.base, path)` sha must equal the entry | else `CCA-REVIEW-UNIT-BINDING` |
| Course admission, spec | `:516-517` the one authority spec is taken from the manifest at base | `CCA-REVIEW-UNIT-SPEC` |
| Shared reader call | `:518` `readCriticReviewUnit({baseCommit: genesisCandidate.base, ...})` | see next row |
| `readCriticReviewUnit` -> `reviewUnitSource` | `lib/critic-generic-batch.mjs:676-681`, `:271-299`: `reference(root, baseCommit, reviewUnitPath)` at `:273` (must exist at base), blob equality base vs candidate `:275`, declaration parsed from base `:277`, criteria must appear in the spec at base `:285`, base ancestor of candidate `:295` | unit must predate the base. The same function serves ordinary generic batches (`declarationSource :268`), where "unit committed before base" is the intended ordering proof (comment `:272`) |
| Course key | `:430-433`: `genesisCandidate = {base, commit, tree}` is inside `keySubject`; `originalManifestSha256` is the manifest at base (`:432`) | the key hashes the manifest as it was at the first base; a pre-unit base gives a unit-less manifest hash (acceptable, see 2) |
| Preflight | `scripts/critic-dispatch-preflight.mjs` has no unit check of its own. `:290` `CDP-RANGE` (base == candidate); `:367` `registrationCommit` defaults to `candidateCommit`; `:369-373` passes `baseCommit` to admission; `:376` maps the refusal through `criticCourseRepair` (not read); `:395` only compares `reviewUnit.specPath` to the spec | the refusal text comes from admission |
| Message text | `lib/critic-course-admission.mjs:39` (`CCA-REVIEW-UNIT-REQUIRED`: "that commit is the base of the first review"); `lib/feature-package-registration.mjs:324` (comment) and `:385` (`next:` text: "earliest base a Critic review ... can use"). `scripts/register-feature-package.mjs:51-69` only parses `--add-review-unit` and calls `addCriticReviewUnit`; it owns no such text | the "earliest base" sentence is a rule statement, not only prose: it mirrors `:506/:513/:518` |

Already available: `runtimeCompose` input carries `registrationCommit` (`:524`, key list `:345`). It is used for alias, retained history, manifest hashes and transport (`:423-425, 438, 474, 480, 489, 545`) but not for the unit.

## 2. Smallest rule for a late-added unit

Goal: first review base = merge-base with the publication target (or last published main); unit stays immutable; course key stays stable.

Recommended rule ("introducing commit"): the declaration commit D of the unit is
- the base itself, if the manifest at base already lists the unit (today's behaviour, byte-identical, same course keys), else
- the first commit in `genesisCandidate.base..candidate` (use `range()`, `:441`, bounded 512) whose manifest at `identity.manifestPath` lists the unit entry.

Edits (function level):
1. `featureReviewUnit` (`:504-522`): compute D once; use D instead of `genesisCandidate.base` at `:506`, `:513`, and as the new `declarationCommit` argument at `:518`. Keep `:507/:512` (candidate manifest must hold the byte-equal entry = immutability against later rewrite) and keep the owner check `:520` unchanged. `CCA-REVIEW-UNIT-REQUIRED` then fires only when no commit in the range lists the unit.
2. `reviewUnitSource` / `readCriticReviewUnit` (`critic-generic-batch.mjs:271, 676`): add an optional `declarationCommit` (default `baseCommit`) and use it at `:273, :277, :285`; leave `:275` comparing declaration commit vs candidate, leave `:295`. `declarationSource` passes nothing, so generic batches are unchanged.
3. Texts: `:39` and `feature-package-registration.mjs:385` stop saying "start from it"; say any base on the candidate's history works, a late unit does not shift the base.

Why the key stays stable: the key is computed from the first review's base (`:430`) and, after the first record, from `first.diff.base` and the stored binding (`:431-432`). Round 2+ reads the same D because D depends only on the manifests in `genesisCandidate.base..candidate`, not on the moving candidate.

Alternative, smaller but weaker: read the unit at `input.registrationCommit` (default = candidate, preflight `:367`). One-line change at `:506/:513/:518`, but when registration equals candidate, `:507/:512` compare the manifest with itself, so a unit rewritten between rounds is no longer detected. Rank it below the introducing-commit rule.

## 3. What the reviewer sees

- Range = `merge-base..candidate`: `runtimeSource` (`:477`) builds `rangeCommits` and `changedPaths` from `input.baseCommit`; preflight `:310-311` diffs the same range. It includes the delivered feature code and the unit commit.
- Commits that are not evidence-only count as correction commits (`:479`), but the count is forced to 0 for round 1 (`:536`), so no budget is spent.
- `readCriticReviewUnit` does not test that `logicalWorkIds` lie in the range: `logicalWorkIds` come from the declaration itself (`:518`) and `reviewUnitSource` only checks equality with the declaration (`critic-generic-batch.mjs:283`). A feature id as logical work id is accepted.
- Criteria check `:285` runs on the spec at D; the unit was rendered from that spec (`feature-package-registration.mjs:350`), so it holds.
- Risks: a delivered feature of more than 512 commits since the merge-base fails `CCA-RANGE-BOUND` (`:441`); a large first packet.

## 4. Second variant: bind the unit to an earlier base

A sanctioned route (for example `--add-review-unit --effective-base <oid>`) would record an earlier base in the unit. Costs: the unit schema is closed (`critic-generic-batch.mjs:279`) so the key list changes; the registration lib and admission both change; admission would trust an unverifiable claim that the unit existed at that base, which breaks the ordering proof (`:272`). Rewriting history to put the unit before the code is not an option for published commits. Rank: below the introducing-commit rule (read-only deduction from history, no schema change, no new trust).

## 5. deliveryBoundary.mainRef

- Written: `lib/feature-package-registration.mjs:121-127` (`primaryMainRef`: `symbolic-ref HEAD` of the primary checkout), used at `:134, :138, :262, :350`.
- Read: only `lib/critic-generic-batch.mjs:291-294`: `mainRef` must equal the primary checkout's `symbolic-ref HEAD` at review time, and `:296` the candidate must be an ancestor of that ref (`CGB-MAIN-INTEGRATION`).
- Push: `scripts/push-init.mjs` and `scripts/check-critic-bound-verify.mjs` contain no `mainRef`/`deliveryBoundary`, and `push-prepare.mjs` reaches the Critic gate only through `check-critic-bound-verify` -> `lib/critic-verify-readiness.mjs` (no mainRef either). So `push-init` with destination `refs/heads/main` does not fail on a mismatch with `refs/heads/feat/<branch>`; I found no push-side comparison. Not verified: a plugin-wide search (my broad `rg` was refused by the shell grammar), `push-prepare.mjs` itself and guard hooks were not grepped for it.
- Where it does bite: preflight/admission, if the primary checkout is on a different branch (for example `main`) when the review runs. The unit is immutable, so the consumer cannot adjust it. Out of the recommended change set; note for the consumer: run the review with the primary checkout on the branch named in the unit.

## 6. Why `private-critic-binding-unavailable`, and repair-map

- `lib/critic-verify-readiness.mjs:33-41`: the directory `<git-common-dir>/agent-pipeline/critic-verify-lifecycle` is missing/unreadable -> that code. `:43-50`: no receipt in it passes `readCriticVerifyLifecycle`. Same code for both causes.
- Receipts are written by `recordCriticVerifyLifecycle` (`lib/critic-verify-lifecycle.mjs:178`, mkdir `:205`), which needs a consumed Critic receipt (`readBoundConsumedCriticReceipt :54`). With no admissible first review there is no receipt, so green head Verify evidence (`headEvidenceOk`, `:26`) is not enough. The item's `critic-verify-...` record may be a different directory than `critic-verify-lifecycle`; not verified.
- The check fires because `requiresPublicationReview` returns `required: true` (`REVIEW-PACKAGE-REQUIRED`) whenever a rigor 1/2 `lifecycle.json` exists (`lib/publication-review-requirement.mjs:35-43`); the check is `scripts/push-prepare.mjs:745-752`, remedy text `:751` is generic.
- `scripts/repair-map.mjs` has no Critic/critic-bound-verify content (only the import at `:55` matched `critic`); it covers override refusals, not push preconditions. The route to name is the preflight call `critic-dispatch-preflight.mjs --base <merge-base with publication target> --candidate <HEAD> --spec ...` then the Critic dispatch and consume steps.
- Interim for the feature branch only: `push-prepare.mjs:735-737, 279-293` skips the Verify/Critic checks for a feature-checkpoint push when `pushDestinationPolicy` opts in. Not a route for `refs/heads/main`. Not verified end to end.

## Ranking and recommended change set

1. Introducing-commit rule (recommended). Files: `lib/critic-course-admission.mjs` (`featureReviewUnit`, texts `:39`), `lib/critic-generic-batch.mjs` (`reviewUnitSource`, `readCriticReviewUnit`: optional `declarationCommit`), `lib/feature-package-registration.mjs` (`next:` text `:385`, comment `:324`). Optional follow-up: `scripts/push-prepare.mjs:751` remedy names the preflight route per code (wish in the item).
2. Read the unit at `registrationCommit`: smaller, loses the cross-round immutability check.
3. Effective-base unit schema: largest, weakest trust.

Kernel versus ordinary: I did not read the kernel path list. Judgment, to confirm by the coordinator: admission and batch-source files (`critic-course-admission.mjs`, `critic-generic-batch.mjs`) are gate logic and likely held-patch/kernel; `feature-package-registration.mjs` text edits and the `push-prepare.mjs` remedy text are likely ordinary but are also gate-adjacent; the test files are ordinary (no `TP-1..13` pattern matches `critic-course-admission.test.mjs`).

Unit cases to add (`lib/critic-course-admission.test.mjs` unless noted):
- `late unit: first review at merge-base is admitted`
- `late unit: range contains delivered code and the unit commit`
- `unit present at base: course key and decision unchanged` (back-compat)
- `no commit in range lists the unit: CCA-REVIEW-UNIT-REQUIRED`
- `late unit rewritten after introduction: CCA-REVIEW-UNIT-BINDING`
- `late unit: round 2 resolves the same introducing commit and course key`
- `late unit: range over 512 commits: CCA-RANGE-BOUND`
- `base equals candidate stays CDP-RANGE` (preflight test file)
- `readCriticReviewUnit default declarationCommit equals base` (`critic-generic-batch` test file)

Not changed in this slice: `lib/critic-course-admission.test.mjs` (no case added: research-only; adding RED cases would break the candidate before the implementation exists). The last two cases live in test files outside this slice's write scope.

## 7. Coordinator addendum 2026-10-26: the base must already list the feature manifest

Slice B's mandatory pre-check (dispatch W6-D165-PF75-B-20261026, stopped as designed) showed a gap in sections 2 and 3:
`lib/critic-course-admission.mjs:432` reads the feature manifest at `genesisCandidate.base` for `originalManifestSha256`,
which is part of the course key. A base before the manifest exists (a plain merge base with main when the feature
branch added `specs/<id>/lifecycle.json`) is refused with `CCA-MANIFEST-READ` before `featureReviewUnit` runs.

Decision (Elephant, D164 authority, option (a)): the course identity is not changed. The first review of a course
with a late unit takes as base the commit that first added the feature manifest
(`git log --diff-filter=A --format=%H -- specs/<id>/lifecycle.json`, last line) or any later commit on the candidate
history that lists the manifest. The manifest need not list the unit there; the introducing-commit rule of section 2
finds it later in the range. The delivered feature code lies after the registration commit and is in the range.
Rejected, option (b): defining the course key for an absent manifest (first commit that lists it, or a sentinel); it
changes stored identities and is a separate decision. The repair text for `CCA-MANIFEST-READ` names the git command.
