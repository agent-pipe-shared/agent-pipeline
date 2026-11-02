# w86 — an edit to a companion file of an approved design source is denied before it is made, naming reopen-design (candidate 18, C18-13)

Edits `plugins/pipeline-core/lib/guard/denial-route.mjs` and `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` only. Criterion binding: AC-155 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged.

## What it adds

- `boundAuthorityDocumentPath()` already refused (code `GUARD-LIFECYCLE-AUTHORITY-BOUND`, text naming `reopen-design --by <name>`) an edit to the bound PRD, Spec, sibling `design-input.md` and the po-gate plan/spec paths. It did not cover the companion sources of the approved design, so an edit to one was accepted and only the next edit was stopped afterwards by `DAA-DESIGN-SOURCE-DRIFT`.
- The candidate list now also contains every `planApproval.designApprovalBinding.sources.companions[].path` read from the same Pipeline State object the PRD/Spec candidates come from (no new state read). A new helper `approvedDesignCompanionPaths()` returns `[]` when the binding or the list is absent or malformed (fail open, as before).
- Comparison is unchanged: the resolved absolute candidate must equal the requested path exactly, so a path outside the list (including a prefix-sharing name) stays allowed.
- The denial code, its JSON fields and its text are unchanged; only the set of protected paths grows. The existing release rules (reopened design via `planInvalidation`, design phase without an approved plan, no continuity authority) still apply before the candidates are read, so an unapproved design stays editable.

## Tests

In `guard-lifecycle-ready.test.mjs` (written first, RED against the original code, then GREEN): the fixture helper `withContinuityAuthority` takes an optional `companions` list and writes the approval binding shape; one case asserts each companion edit is denied with `GUARD-LIFECYCLE-AUTHORITY-BOUND` and `reopen-design --by <name>`, an unrelated file and a prefix-sharing path stay allowed; one case asserts a would-be companion path stays editable with no approved design binding. No existing case was changed or weakened.

## Checks

- `guard-lifecycle-ready.test.mjs` in the slice clone, before the production edit: 430 tests, 426 pass, 1 fail (the companion-denial case), 3 skipped; after: 430 tests, 427 pass, 0 fail, 3 skipped.
- `guard-devplan-design-approval.test.mjs`: 12 of 12 pass.
- `harness/scripts/check-consumer-safe-paths.test.mjs`: 9 of 9 pass.
- The patch applies to the real HEAD (`git apply --check` exit 0); `w86-...check.test.mjs` (3 of 3 pass) pins that and the touched-file list.

## Not changed / not proven

- The helper reads the recorded approval binding without consulting `planApproved` separately: the binding is written by `approve-plan` itself, so an absent binding is treated as an unapproved design (covered by the second new case); the earlier design-phase release rule still runs first.

- `DAA-DESIGN-SOURCE-DRIFT` in `guard-devplan-policy.mjs` and every other denial code are untouched.
- The binding is not validated here (`validateDesignApprovalBinding` is not called): the denial only needs the recorded paths.
- Full Verify and a live consumer run were not made.
