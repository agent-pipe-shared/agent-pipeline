# W7 course takeover retires an unregistrable round

Status: implemented and green except one pinned text in a file outside the slice scope (see Blocker).

## Behaviour
- `takeoverState`: for the SAME course key, `registeredRounds` (optional input key, integer >= 0, must equal `courseHistoryRegistered === (n > 0)`, else CGB-SHAPE) selects the tail of reservations above the registered lineage. Empty tail -> CGB-TAKEOVER-COURSE; any tail packet unconsumed -> CGB-TAKEOVER-OPEN; else refusalCode null with `scope: "round"` and `tailOrdinals`. Every other case: `scope: "batch"`, `tailOrdinals: []`. Without the key the same-key case is refused as before.
- `supersedeFeatureCourseTakeover` with scope round: audit first (scope, tailOrdinals, roundMoves), then moves only the tail reservation files and the member files they name (`.json` and `.complete.json`) to `superseded/<digest>/rounds/`; registration, logical and origins entries and lower rounds untouched; replay idempotent. The batch path is unchanged.
- `session-critic-finalizer.mjs` takeoverTarget passes `registeredRounds`. Texts changed: TAKEOVER_REPAIR COURSE, both FPR-LINEAGE-TRANSPORT/COMPILE texts, the CGB-BUDGET text of a reserved round.

## Evidence (driver logs in scratch/agent-out/w7takeover)
- RED before production edit (red1): CGB034, CGB037, CGB038 failed on the original code.
- GREEN c1: critic-generic-batch 38/38, session-critic-finalizer 90/90 (before the CLI case). c3: the new finalizer CLI case passes alone (exit 0). Full finalizer suite with the CLI case: 90 pass / 1 fail in c2 on the first draft of the CLI case; the corrected case passes in c3; the full suite was not re-run after the correction.
- Revert proof (production files reverted): CGB034, CGB037, CGB038 and the finalizer CLI case fail; files restored byte-equal.
- Baseline (clone2, base1): critic-course-admission 73/73 green; check-verify-case-completion VCR01 RED at the baseline too (stale pinned counts, not caused by this patch).

## Blocker (outside the write scope, not changed)
- `plugins/pipeline-core/lib/critic-course-admission.test.mjs` case CCA071 (PF94 DOCS (b), line ~1176) pins the OLD sentence "retire the old batch with session-critic-finalizer inspect-course-takeover and supersede-course-takeover and rerun round 1 on the course path". The briefed text change makes it red. Needed change: replace that sentence by "retire the unregistered round with session-critic-finalizer inspect-course-takeover then supersede-course-takeover (it retires only the rounds above the registered lineage) and rerun that round as a delta from the last registered round".
- check-verify-case-completion VCR01 pins `critic-generic-batch-tests` sites at 79 (now 115 measured); it is red at the baseline for other rows as well, so it needs a restatement round of its own.

## Limits
- The CLI case does not drive `register-feature-package.mjs --add-review-lineage` (its fixture manifest is not an approved package); it pins the two refusal texts from the source and walks inspect then supersede then replay. It does not assert scope round for the CLI (the verb derived a different key than the admitted round in that fixture, so inspect returned the batch-scope path).
- The unit round-scope case uses a stand-in lower round (reservation files rewritten in the test). A fresh admission of round N+1 after the takeover is not exercised.
- The CGB-BUDGET text has no test.

## Completed by the dispatcher (Elephant, 2026-10-30, PO exception for held patches in scratch clones)
- The Goldfish stopped at the CCA071 blocker and correctly refused a scope widening sent by chat. The dispatcher made exactly that one-line change in the clone (CCA071 now pins the new sentence, which is byte-identical to the two texts in feature-package-registration.mjs lines 529 and 562); no other case changed.
- Clone c5: critic-course-admission 73/73, critic-generic-batch 38/38, session-critic-finalizer 91/91 (with the CLI case). Baseline clone2 base5: critic-generic-batch 36/36, session-critic-finalizer 90/90; no failing names in either set.
- The patch was regenerated: 35127 bytes, 7 files, apply-check exit 0 on the plain candidate 140310e46.
- VCR01 stays red at baseline and is out of scope.
- Open: a fresh admission of round N+1 after the round takeover is not exercised in a fixture; the live proof is the consumer retest after install. Full Verify, Critic, native Windows runs and PO acceptance stay pending.
