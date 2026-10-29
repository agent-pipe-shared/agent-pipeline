# W7-D199 -- notes (state: HELD, built by the Elephant in a scratch clone under the D192 exception)

Candidate `8242b6ac2`. Patch: `w7-d199-critic-rounds-uncapped-in-batch-and-after-pass.patch` (8 paths, apply-check exit 0). Closes three consumer blocks in one patch: Toolbox `CGB-BUDGET` (round 3), Glossover PF-102 (`CRL-V2-EXCEPTION-BINDING`) and Glossover `CCA-PARENT` / `CGB-PASS-STOPS` (review of commits after a PASS). PO decision: D190 (no count refuses a diff round) and D199 (diff round after PASS, tile answer 2026-10-29).

## What it delivers

1. **Toolbox, round cap in the generic batch** (`lib/critic-generic-batch.mjs`, `scripts/critic-dispatch-preflight.mjs`). The stamp `adc250283` lifted the cap in the course, lineage and economy paths only; the batch store still refused at `retained.length >= 4`, at more than 3 correction commits in one range, and at the 5th reservation, and the packet preflight still refused `round > 4`. All five numeric refusals are gone for diff rounds; one bound of 4096 reservations remains against a corrupt directory. The reservation scan now reads every `delta-N-admission.json` (round 2 is stored as `delta-admission.json`). The `CGB-BUDGET` that stays is the consistency check "reservation count equals ordinal - 1".
2. **Glossover PF-102** (`lib/critic-review-lineage-core.mjs`). `v2BindingCode` demanded a digest `criterionSha256` for every round past 2 (the old PO-exception model). The criterion is only bound when an accepted exception was read, so a normal round 3 had it `null` and was refused. The rule is dropped; null-or-digest is still enforced for all four binding digests. `v2BindingCode` is exported for the test.
3. **Glossover CCA-PARENT, review after a PASS** (D199, `lib/critic-course-admission.mjs`, `lib/critic-generic-batch.mjs`). A consumed PASS ended the course for every later request. Now it ends it only for the same candidate: in the course, a request in mode delta whose base is the passed record's candidate and whose range holds a real (non-evidence) commit continues as a diff round with the passed record as parent (`continuation` in `runtimeCompose`; `stopped-pass` only without a registered delta request). In the batch, `CGB-PASS-STOPS` fires only when the new candidate equals the passed one (three sites), and the extra PASS check in `retainedReservation` is gone.
4. **Docs**: `skills/critic-review/SKILL.md`, section "Real commits after a consumed PASS (D199)": order of lineage registration, base = passed candidate, delta request, admit, finalize.

## Tests (scratch clone)

- `critic-generic-batch.test.mjs`: CGB002 now runs rounds 5 and 6 past the old cap; CGB003 pins both halves (same candidate: `CGB-PASS-STOPS`; real commit after the PASS: admitted and finalized as round 2).
- `critic-review-lineage.test.mjs`: new check 19 (rounds 2 to 9 without exception binding; malformed binding and the delta-request rule stay refused).
- `critic-course-admission.test.mjs`: new case "D199 CONTINUATION" over the real verbs (consumed PASS, lineage, real commit, delta request, admission): decision admitted, mode delta, round 2. The two existing cases that pin `RE-CONSUMED-PACKAGE-PASS` for a request without a commit after the passed candidate pass unchanged.
- Green in the clone: critic-generic-batch, critic-course-admission, critic-review-lineage, review-economy, critic-dispatch-preflight, session-critic-finalizer, the round-cap pin, the skill-budget pin and the citation check.

## NOT in this patch / open

- Canon still states the old cap: `guardrails/quality-gates.md` ("Four Critic calls total is the maximum"), `roles/elephant.md` ("maximum of three correction-diff reviews") and the preflight refusal text of `CDP-COURSE-BUDGET`; pins assert that wording, so changing it is its own act.
- The refusal text of `CDP-COURSE-BUDGET` now fires only for a mode mismatch or a changed constant but still says "Critic budget spent".
- Not run against a real consumer repository (no Toolbox or Glossover state here). The consumers must re-run their preflight after the install; a `CGB-BUDGET` from the reservation-count consistency check would still show.
- Full Verify, batch Critic and PO acceptance remain pending. Kernel paths: the PO applies the patch in the same ceremony.
