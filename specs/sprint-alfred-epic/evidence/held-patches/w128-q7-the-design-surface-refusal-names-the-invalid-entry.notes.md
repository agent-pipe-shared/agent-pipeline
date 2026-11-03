# w128 — Q7: the design surface refusal names the invalid entry

Found by the Claude Code greenfield run (section 3.1, Q7): `ARCHITECTURE-DESIGN-SURFACE-INVALID` named only the code, so one directory entry with a trailing slash among 29 `implementationSurface` entries was found only by reading the plugin source.

Change:
- `lib/architecture-design.mjs`: the surface check is now per entry and raises the field-local form (`field` `implementationSurface[<i>]`, `expected`, `rejectedValue`), two rules named: a bounded file path (no trailing slash, no glob, no `..`), and ownership by a declared module. The code and the empty-list refusal are unchanged.
- `scripts/pipeline-state.mjs`: the `submit-plan` refusal appends `(field ..., expected ...; rejected value ...)` when the inspection carries a field. The pinned phrases `ARCHITECTURE-DESIGN` and "complete the exact draft architecture design" are kept. This also gives the scope and path refusals their field.

Test: two cases in the field-local diagnostics test of `architecture-design.test.mjs` (a trailing slash at index 1; an unowned file at index 0). `architecture-design.test.mjs` 19/19; the pin test `plan-submission-must-not-require-separate-po-approval.test.mjs` 21/21. The new cases were written with the change; RED against the old code was not run separately.

Not proven: no real `submit-plan` run in a greenfield repository printed the new text.
