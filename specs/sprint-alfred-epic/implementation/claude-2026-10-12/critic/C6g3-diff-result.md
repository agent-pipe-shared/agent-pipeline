# C6g3 correction-DIFF review 1 of at most 3 — result (2026-10-17)

- Candidates: `ec3b97599` (ALF-C-C6G3-CORR) and `a5d7b63bc` (ALF-C-C6G3-CORR-B).
- Route: claude-sonnet-5-5, read-only, no execution. Budget checkpoint reached at call 36 of 45.
- Verdict: **WITHHELD (partial review)**. This is not a clearance.
- Critic notes: `scratch/dispatch/critic-a56ce1bc954c8a466/critic-notes.md` (local).

## Findings

| ID | Severity | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F1 | minor | Three drift codes reach the `inspectArchitectureDesign` catch for plan approvals that are not v8/v9: `DWP-APPROVAL-SOURCE-DRIFT`, `DWP-APPROVAL-DIGEST-DRIFT` and `DWP-APPROVAL-PLAN-SPEC-MISMATCH`. The bootstrap acknowledgement must also be invalid. The reopen-design allowlist does not contain them, so the handover says "do not reopen design". `guard-devplan-policy` classes the same codes as contentDrift → reopen-design. | `lib/architecture-design.mjs:310-325`, `:227-229`, `:344-350`; `lib/design-workflow-package.mjs:825-842`; `lib/guard-devplan-policy.mjs:274-276` | open; correction candidate (AC-174) |
| F2 | minor | The E1 negation lookahead does not check where the negation stands and uses a fixed word list. An incidental `not`/`never`/`no longer`/`n't` suppresses the refusal: "E1 is not optional and is a prerequisite …" passes, which is a false negative. `cannot` is missing from the list. The pin does not cover the "negation, then positive" form. | `lib/design-workflow-package.mjs:142-143`; pin `design-workflow-package-omits-contract.test.mjs:318-326` | open; correction candidate (AC-157) |

## Not reached (named by the Critic)

- `ec3b97599`:
  - consumers of `PO-GATE-PRIMARY-ROOT-UNAVAILABLE` outside `inspectArchitectureDesign`;
  - the `underlyingError` property, which can leak a path or errno when serialized;
  - the placement of the project-onboarding-v3 test-seam export;
  - execution of the F4 pin cases.
- `a5d7b63bc`: the remainder of `e1FreezeOrderContradiction`, and execution of the pin.
- Not established: whether project-onboarding-v3 was already red before `ec3b97599`. The c157 measurement covered only the parent of `a5d7b63bc`.

## Deliberately not flagged

- Trailers.
- The typed-code contract.
- Test integrity (behavioural instead of grep; no skip or only).
- QG-06 owner and due date.
- The correction of the AC-226 → AC-145 citation.
- Scope, dependencies and language.
