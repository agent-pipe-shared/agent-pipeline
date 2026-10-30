# W7-D204: a Critic follow-up round that moves a trust boundary falls back to an effective full round

Held patch: `w7-d204-critic-follow-up-falls-back-to-a-full-round.patch`, built in scratch clones against candidate
`69ce588e75f918e228025f7378d5013a493f20a1`. Decision D204; backlog item
`2026-10-30-critic-follow-up-round-that-moves-a-trust-boundary-has-no-route`. Goldfish
`W7-D204-CRITIC-FULL-FALLBACK-20261030` built stages 1-4; it ended without a final report. The Elephant finished the lineage
line and the text follow-ups (PO exception for small fixes, 2026-10-30).

## Stages and the test that pins each

| Stage | Change | Pinned by |
|---|---|---|
| 1 admission | `admitReviewAttempt`: structural bindings checked one by one (`binding` names the first failing one); `trustBoundaryChanged` or `impactAmbiguous` true with valid structure is admitted as mode `full`, code `RE-DELTA-FALLBACK-FULL`, `reason` `trust-boundary-change` / `impact-ambiguous` | `lib/review-economy.test.mjs` RE21, RE22, RE22b-d; `lib/pins/critic-round-cap-and-delta-scope-are-not-enforced.test.mjs` AC2 (QG-04 restatements, intent in comments) |
| 2a preflight | `critic-dispatch-preflight.mjs` accepts mode full for round > 1 only for `RE-DELTA-FALLBACK-FULL` with a delta request | anchor `D204 ANCHOR` (both flags) |
| 2b packet, batch, finalize | preflight reports the course genesis base as `base` / `reviewerInput.baseCommit`; `courseAdmission.courseBase` keeps the parent candidate; finalizer reserves with `courseBase`; batch reservation file `full-N-admission.json`, enumerated by `reservations()`, genesis range accepted for the fallback | anchor |
| 2c lineage | registration passes the previous candidate as course base, matches the delta request on it, records `full-review-required` with the reason; `compileRegisteredCriticReviewLineage` expects the genesis range for the fallback | anchor (round 3 lineage assertions) |
| 2c' lineage history | `critic-review-lineage-core.mjs` `transitionCode`: a round with new correction commits may carry a `diff.base` other than the parent candidate ONLY when `request.admissionCode` is `RE-DELTA-FALLBACK-FULL`, `request.mode` is `full` AND `diff.base` equals the course genesis base | anchor: r2->r3 null; diff.base moved to the candidate -> `CRL-HISTORY-CORRECTION-BINDING`; admissionCode `RE-DELTA-ADMITTED`/mode delta -> `CRL-HISTORY-CORRECTION-BINDING` |
| 2d counter | corrections counted from the PREVIOUS round's candidate | anchor (`correctionCommitCount` 3 at round 4) |
| 2e next diff round | round 4 admitted `RE-DELTA-ADMITTED` with the full round as parent | anchor |
| 2f texts | `CCA-REQUESTED-MODE`, comment, `CCA-DETERMINISTIC-UNAVAILABLE` | `D204 the CCA-REQUESTED-MODE text ...` |
| 3 registration result | `nextRoundMode`, `nextRoundReason`, `nextRoundNote` | anchor |
| 4 help and refusal texts | one-commit evidence route in the register help, diagnostic help (numbering 1-5), skill, `FPR-DELTA-NO-DIAGNOSTIC`, `CCA-DETERMINISTIC-FAILED`; skill names `RE-DELTA-FALLBACK-FULL` | `lib/critic-diagnostic-evidence.test.mjs` "D204 every diagnostic-evidence route text ..."; D41 x2 and D2 text (1)/(2) restated (QG-04) |

The anchor starts from the consumer's state: two consumed registered rounds, a correction that moves the boundary, the
fallback full round 3, then an ordinary diff round 4.

## QG-04 restatements outside the Goldfish's suites

- `lib/critic-diagnostic-evidence.test.mjs` D41 (both scripts): route order is now produce, register, ONE evidence-only
  commit, rerun preflight with `--registration-commit <that commit>`; the old order pinned a commit before registration that
  the admission refuses (the Glossover defect: "help says two commits, code allows one").
- D2 text (1)/(2): the preserved step now reads `--registration-commit <that commit>` (step 4 in the registrar help).
- D2 text (3): pre-existing red at `69ce588e7`, not caused here. The anchor searched for the literal `--base <merge base`;
  the hint interpolates `${first}` since the late-review-unit change. Anchor restated to that spelling; the assertions are
  unchanged.

## Verification (clone, driver labels c5-c10)

Green: review-economy, critic-course-admission 76/76, critic-review-lineage, critic-generic-batch, critic-dispatch-preflight,
session-critic-finalizer, critic-round-cap pin, critic-diagnostic-evidence 18/18, repair-map, catalogue pin
(registration has no suite of its own; it is exercised through the anchor and the preflight suite). Pre-existing reds at the base, unchanged by this patch: `codex-critic-host` CCH136/137 (native-managed
inventory), `codex-isolated-critic-protected-preimage` (digest baseline not rebaselined after the 2026-10-28 project-state
record change; PO call), `harness/scripts/check-consumer-safe-paths.mjs` (ADR-0014 line 103, roles/critic.md line 40).

## Notes

- `request.mode` / `request.admissionCode` and `invalidation` in the lineage record carry "requested delta, effective full".
- `codex-critic-host.mjs` needed no change in this patch.
