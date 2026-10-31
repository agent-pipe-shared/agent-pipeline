# W9 slice 3 follow-ups: finalizer case, template sentence, optional-wording, N43 text, pinned counts

Built by the Elephant (PO exception: small items in a scratch clone, held as a patch). Stacks on all ten candidate 15 patches in this order: lineage (slice 1), close-coordinator addendum (slice 2), N43, dispatch preflight (slice 3), refresh-derived-files (slice 4), N42, N42 follow-up, N40, round-4 fixes, onboarding registration. Every one of them applied cleanly in that order (stack candidate 38299968f in the clone).

## What it does
1. `session-critic-finalizer.test.mjs`: case `D1 walk (1)` restated. Slice 3 makes the preflight derive the bindings in memory, so an admit without the bindings field is now admitted and the packet binds the derived echo (`derived: true`, `path: null`); the old expectation (refused with CDP-CORRECTION-INPUT-REQUIRED) was red by construction. Same title family, new intent in the title; the expected value is the library's own preflight output, compared by digest like walk (3).
2. `templates/prompts/critic-review.md` and its vendored copy: the same sentence in both (built-in convention set `docs/HISTORY.md` and `docs/state-archive/`; any other history-named file is refused with CDP-HISTORY-IN-RANGE). `check-vendored-template-sync` and the CCI canon pins stay green.
3. Wording "optional: the preflight derives the same bindings itself when the flag is omitted" appended to the bindings step of `critic-diagnostic-evidence.mjs` help, `register-feature-package.mjs` help (steps 6 and 8), the `push-prepare.mjs` hint, and the operator note of `skills/critic-review/SKILL.md` (which also names the optional registration commit and the delta skeleton). Existing text assertions stay green because nothing was removed.
4. N43 text (Toolbox answer): the missing-guardrails refusal now also says to keep `--base` exactly as printed (a base equal to the candidate derives an empty set), to produce the diagnostic while HEAD is still the candidate with a clean tree (CDI-DIRTY-CANDIDATE after any follow-up commit), and that a second diagnostic for the same candidate gives CCA-DELTA-BINDING until the delta request is registered again. Four assertions added to `N43 (a)`.
5. `check-verify-case-completion.test.mjs` pins (VCR01): `critic-course-admission` 329 to 334, `critic-dispatch-preflight` 352 to 382, measured on the stacked candidate with the unchanged classifier (the Goldfish measured 373 for the stack before slice 3 and +5 for slice 3; the four new N43 assertions make 382). Names, paths, classifications and all other counts unchanged; one comment hunk documents the restatement.

## Evidence
- Finalizer file 91 pass / 0 fail on the full stack (log `c1`); preflight 89/0 and diagnostic evidence 22/0 (`c2`); pins 32/32 (`c6`; red before the numbers were set, `c5`).
- Doc parity: `check-vendored-template-sync` test (4/4) and script, the CCI canon pin file (17/17), `check-doc-contracts`, `check-critic-contract-citations`, `check-critic-fail-closed` green (`c3`, `c4`).
- Revert proof: with the five production files reverted to the stacked candidate, `N43 (a)` is red and nothing else in the preflight file; restored byte-equal.
- Patch applies on the stacked candidate (`git apply --check`, exit 0).

## Not done here (named)
- `session-critic-finalizer.mjs featureReservationFor` still rebuilds the course input from the request's `courseContext`, so a request that omits the registration commit cannot be expressed; follow-up item.
- No new pin for the template sentence beyond the existing parity check.
- Digest-pinned doc snapshots and Reader inputs change with the template, protocol and skill edits: assembly runs `scripts/refresh-derived-files.mjs` and commits the result.
- Native Windows run, Full Verify on the assembled candidate (fv9), batch Critic, PO acceptance.
