---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-test-briefs-lack-targeted-and-quick-command-routes
type: defect
owner: pipeline
status: open
created: 2026-10-22
source: "Original Alfred item (AC-187); original body lost, restated 2026-10-22 per D111 from the pin, the code and the portable requirement record."
sprint: alfred
done_when: manual
---

# Goldfish test briefs lack targeted and quick command routes

## Restated 2026-10-22 (D111)

This is a re-statement, not the original text, which is not present in the repository (the pin header and `specs/sprint-alfred-epic/plans/acceptance-reconstruction/R3.md` say so). The PO confirms it at acceptance.

## Problem

A Goldfish briefing that asks for test work said only "run relevant tests, then the quick check if there is one". It named no concrete command per acceptance criterion, let a missing or invalid quick route be reported as a quick PASS (or invented from a lifecycle profile named `quick`), and did not say who owns the final integrated Verify.

## Acceptance (as the pin asserts it)

Pin: `plugins/pipeline-core/lib/pins/goldfish-test-briefs-lack-targeted-and-quick-command-routes.test.mjs` (template text, both copies). Emitted text: `plugins/pipeline-core/scripts/dispatch-briefing.test.mjs`.

1. P1 (case "P1 targeted-check field demands concrete commands"): the `- Targeted checks` field of `templates/prompts/goldfish-task.md` and its vendored copy requires concrete meaningful commands, each with its acceptance criteria; never just "run relevant tests"; a failed or missing targeted check cannot be cleared by a quick check.
2. P2 ("quick-check field offers configured / absent / invalid routes"): `- Quick check:` is the actual configured command with source reference, scope and owner, or "missing — unknown, no quick PASS", or "invalid — report the exact source/validation problem".
3. P3 ("quick route is never fabricated, run invalid, or reported PASS when absent"): no command invented from a lifecycle profile named `quick`; an invalid route is not run; an absent command is not reported PASS; missing quick configuration does not remove the targeted checks.
4. P4 ("final integrated Verify is Coordinator-owned..."): `- Final integrated Verify` is Coordinator-owned, worker targeted/quick results do not certify it, impacted work evidence never substitutes for full candidate evidence.
5. P5 ("root template and vendored copy are byte-identical").
6. P6 ("field order is targeted, quick, final Verify").
7. RED mirror ("the checkers fail on a pre-fix brief that has no explicit routes").
8. Emitted briefs (`dispatch-briefing.test.mjs`, AC-187 cases "the generated briefing carries the targeted, quick and final Verify routes in order and never invents a quick command" and "a project that calibrates no Verify command still gets targeted -> quick -> final Verify, with the absence stated"): the generator renders the three routes in order, lists every package command under the targeted route, renders the quick route as "missing — unknown, no quick PASS." and never an invented command, and states the final Verify as Coordinator-owned or states that the project calibrates none.

## Already done

Template fields and vendored copy (P1-P6, pin green: 7 of 7 on 2026-10-22, run alone); briefing generator emission and its two cases (commit 792b6348b).

## What remains

Consumer coverage: the scope pass (`plans/scope-pass-2026-10-20.md`, row 87) asks for "the remaining AC-187 clauses and consumer coverage with a counted GREEN"; the work index names a "quick consumer qualification" owner and unqualified reporter/runtime/native obligations. R3 records the PO question left open: which of briefing-template fields, reporter or runtime obligations, and native obligations are in scope, and what counts as a configured quick route. Not decided here.
