# w30g4 - trustBoundaryChanged leaves the Critic diff rounds (C30G-E2)

Criterion binding: AC-108 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text). The PRD and the Spec are unchanged.
Recorded decision (PO, 2026-11-17, tile, option "strike the flag from diff rounds"): `trustBoundaryChanged` stops steering Critic DIFF (delta) rounds. The PO finds the value ambiguous to judge and does not want a hand-set flag to force an irreversible full round. The FIRST full round of a course still reviews the whole trust boundary; `impactAmbiguous` is not part of the decision and keeps its behaviour and its `--confirm-full-round`.

## Order of application and base

The patch is a delta on the applied candidate 30g chain (six commits, `candidate30g`): apply the chain first, then this patch. `apply --check` against the applied-chain clone: exit 0; against the real checkout it fails until the chain is applied (expected).
Patch base: the chain head of the clone before this change (`71d385a20`). The base first named in the briefing (`e808cc335`) was the Coordinator's error: `e808cc335..HEAD` of the clone also carries the removal of 46 evidence and doc files the clone does not have. The Coordinator confirmed `71d385a20` is correct.

## What (per site: drop / optional-and-ignored / field kept but not required)

- `lib/review-economy.mjs`: optional and ignored. A supplied value must still be a boolean, an absent key is complete; the fallback to a full round reads `impactAmbiguous` only. The invalidation reason `trust-boundary-change` stays in the enum (old lineage records hold it).
- `lib/critic-review-lineage.mjs`: dropped. The branch that derived the invalidation `trust-boundary-change` is removed; it would disagree with the admission.
- `lib/critic-review-lineage-core.mjs`: NOT changed. The key stays in the attempt key set and the reason in the closed enum, so an old record validates with its digest unchanged.
- `lib/critic-course-admission.mjs`: optional and ignored. The closed key lists (delta attempt, registered delta request, prepare input) accept the key present or absent; the registered request and the attempt carry it only when it was supplied, so no existing request's digest changes and a new one has no such key.
- `lib/critic-generic-batch.mjs`: optional and ignored. The correction key list accepts the key when present; the attempt carries it only when supplied.
- `lib/feature-package-registration.mjs`, `scripts/register-feature-package.mjs`: the input needs four keys, the skeleton lists three judgment fields; a supplied value must be boolean, is carried into the request and ignored; the full-round confirmation, `nextRoundMode` and the lineage invalidation read `impactAmbiguous` only; help and guidance texts updated.
- `scripts/review-attempt.schema.json`: field kept, not required; the `const: false` in the delta clause is removed. `$id` and `pipeline.review-attempt.v1` untouched.
- `scripts/codex-critic-host.mjs`: NOT changed (it only forwards the value, which is now ignored) and it is pinned by the protected preimage inventory.

A registered request that carries `true` and was never consumed becomes a plain diff round now (the value has no effect): a consequence of the decision, not a defect.

## Tests (failing-first: RED against the original code before the first production edit, then GREEN)

- `lib/review-economy.test.mjs` (RE21 restated; RE21b-e new): a request with `true` is a delta round, without the key is admitted, an old `false` unchanged, a non-boolean refused, `impactAmbiguous` still full.
- `lib/critic-review-lineage.test.mjs` (one new check, count 20 to 21): a supplied value changes no byte of a record; an old record with the reason `trust-boundary-change` still validates, digest unchanged; `impactAmbiguous` keeps its invalidation.
- `lib/critic-course-admission.test.mjs` (AC-108 cases 1-4; the end-to-end anchor now runs for `impactAmbiguous` only).
- `lib/critic-generic-batch.test.mjs`: the new assertions run inside the D199 case because the case-id list of that file is closed.
- Pins restated only where the rule changed (QG-04): `pins/critic-course-consumer-chain-walk.test.mjs` (C30d refusal case for `impactAmbiguous` only, skeleton field list, fallback round now requested by `impactAmbiguous`, one new case: `true` registers without confirmation), `pins/critic-round-cap-and-delta-scope-are-not-enforced.test.mjs`, `scripts/critic-dispatch-preflight.test.mjs`. No restatement needed (they pass an old-shape `false`): `close-coordinator-...`, `interruption-receipts`, `check-critic-skip-coverage`.
- No live Critic round: the Critic is suspended by the PO; verified by tests only.

## Verification status at the last checkpoint (run alone, one at a time, with the clone's private TMPDIR)

GREEN: `review-economy.test.mjs` 1/1; `critic-review-lineage.test.mjs` 1/1; `critic-generic-batch.test.mjs` 41/41; `critic-course-admission.test.mjs` 101/101; `pins/critic-round-cap-and-delta-scope-are-not-enforced.test.mjs` 12/12; `scripts/critic-dispatch-preflight.test.mjs` 124/124; `scripts/codex-critic-host.test.mjs` 141/141 (unchanged file); `lib/interruption-receipts.test.mjs` 107/107; `scripts/check-critic-skip-coverage.test.mjs` 61/61; the check test 3/3.
`pins/critic-course-consumer-chain-walk.test.mjs`, by test name (the full file takes well over 15 minutes in one run): "C30d|AC-108" 3/3, "PATH A" 2/2, "W9 SLICE 3" 6/6, "multi-round consumer" 1/1, "W9 CHAIN|PATH D (ADR" 2/2. NOT run: the other cases of that file (PATH B/C negatives, W9 NEGATIVE, W9 REAL HOOK, PATH D negatives); they do not use the changed input shape or the fallback round.
`pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs` (unchanged file, passes an old-shape `false`), by name "(j)|D223 chain" (the cases that use the delta input): 4/4; the full file was not completed in one run (over 3 minutes).

## Pending for a later slice (NOT done here)

PART B (texts), deferred by the Coordinator. It needs a re-pin of `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json` (entries `plugins/pipeline-core/skills/critic-review/SKILL.md` and `templates/prompts/critic-review.md`, field `rawSha256`; checked by `codex-isolated-critic-protected-preimage.test.mjs`, case "current Critic execution surfaces remain byte-identical"), which is a PO route, not a test edit. The plugin copy of `critic-review.md` must stay byte-identical to the root copy (`check-vendored-template-sync`). Exact edits:
- `skills/critic-review/SKILL.md`, line of "`coordinatorImpactConfirmed`, `trustBoundaryChanged`, `impactAmbiguous`)": drop `trustBoundaryChanged`.
- `skills/critic-review/SKILL.md`, Operator note: "(a delta request that moves a trust boundary or is impact-ambiguous, RE-DELTA-FALLBACK-FULL)" becomes "(a delta request that is impact-ambiguous, ...)"; "(the four judgment fields stay for the Coordinator)" becomes three; "Mind the cost of two of them: `trustBoundaryChanged` or `impactAmbiguous` ..." keeps the cost warning for `impactAmbiguous` only; the sentence "`trustBoundaryChanged` is true only when ..." is removed; add that the Coordinator no longer supplies `trustBoundaryChanged` (an old value is accepted and ignored).
- `templates/prompts/critic-review.md` and `plugins/pipeline-core/templates/prompts/critic-review.md`, the `append-correction` paragraph ("additionally supplies `changedBehaviorClaims`, `pathInvariantMap`, `coordinatorImpactConfirmed`, `trustBoundaryChanged`, `impactAmbiguous` and `evidencePaths`"): drop `trustBoundaryChanged` and state that the Coordinator no longer supplies it.

PART C (architecture policy text): no description for the person who sets the boundary policy exists in a file of this slice (`architecture-orientation.md` is about the architecture estate and does not mention the policy); nothing was invented. Verified: GS-16 is `architecture/boundary-policy.json` (ADR-0096; only its first creation by `architecture-boundary-check.mjs --write-policy` is free). The one sentence (the policy is deliberately permanent, has no owner and no expiry, a later edit is a gate-protected change under GS-16, nothing about it ever stops a close for age) is pending for a file the PO route may touch.

## Off-list items for the integration (not edited)

- `plugins/pipeline-core/scripts/codex-critic-dispatch.schema.json`: `review_economy` still lists `trust_boundary_changed` in `required` (line of `"required": ["round", "correction_commits", ...]`) and as a property; the Codex host route therefore keeps supplying it (ignored). Making it optional is a change of that schema (and of the protected preimage inventory, which also pins it).
- `harness/config/verify-case-completion-augmentations.v1.json`, entry `critic-course-admission-tests`: four new cases (`CCA073`-`CCA076`) were added to `critic-course-admission.test.mjs`; the declared id list was not checked against them.
