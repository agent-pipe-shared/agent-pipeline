docs(adr): accept ADR-0101, the stage-0 fast path admits small changes with tests

PO tile G-T1 round 3 of 2026-11-14 ("Medium + tests", register D253):
an interactive Elephant may make a change itself at any rigor with at
most 3 files, at most 60 changed lines, one concern and at most 25 lines
of production logic. Tests and pins may change, except a test that
checks the Elephant's own new logic from the same change. No new public
API, schema, dependency or security surface. Affected tests are green,
the trailer is Dispatch: stage-0 (elephant), and there is no extra
Critic round. "Tier-0" is retired.

The ADR states what the checks enforce (provenance 3/60 plus a 25-line
code cap; the guard maintenance window keeps refusing test files) and
what stays unchanged. The canon text, the generators and the checks
follow in separate commits.

AI-Assisted: true
Dispatch: stage-0 (elephant)
