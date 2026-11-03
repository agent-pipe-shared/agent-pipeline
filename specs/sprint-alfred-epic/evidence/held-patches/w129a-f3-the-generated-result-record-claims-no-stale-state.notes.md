# w129a — F3: the generated result record claims no stale state

Found by the Codex greenfield run (P1) and the Claude Windows run (Q1): the bound `result.md` still said "implementation is in progress" after the feature was closed, which contradicted the closed state and left a reviewer with two statements.

Cause (read in the source): `renderResultRecord` in `lib/feature-package-registration.mjs` writes that sentence at registration, and the record is an `append-only` artifact bound by digest, so nothing rewrites it at close. Rewriting it at close would change a bound artifact, so the change is made at the source instead.

Change:
- `renderResultRecord` now says the record was written at registration, does not track progress, and that the lifecycle state in the feature manifest is the status. It is still "not acceptance". The sentence can no longer go stale.
- `references/implementation-continuation.md` describes the record the same way.
- The pin test `consumer-approved-plan-reaches-the-first-item-host-commit.test.mjs` is restated (QG-04): the assertion on "implementation is in progress" moved to the new sentence plus a negative assertion that the record contains no "in progress". The intent (the record names itself as a registration-time, non-acceptance record, no digest but the Spec's, no machine path) is unchanged.

Tests: the pin suite 8/8 and `critic-course-admission.test.mjs` 85/85. Already-registered features keep their old record (append-only, bound); only new registrations get the new text.

Not proven: no real feature close was run with the new record.
