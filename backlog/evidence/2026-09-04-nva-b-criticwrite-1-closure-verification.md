# NVA-B-CRITICWRITE-1 — independent closure verification

Closed against `b72e22b2cccfb49a9d4b74131b7b3f55518befca`
(`docs(critic): give CR-06-D a proven write command, not just an authorization`).
Verified by the dispatching Elephant independently rather than accepted from the
dispatch report.

## The composition problem, and the direction chosen

`backlog/items/2026-09-01-a-critic-has-no-writable-location-for-its-own-report.md`
named a real gap: no location was simultaneously inside the project root,
writable by the read-only Critic role, and not a tracked state change. Both
source rounds (2026-09-01) had disclosed the authorization existed
(`roles/critic.md` CR-06-D) but no working shell shape — `echo`/redirects fail
the closed grammar — and fell back to reporting inline instead.

Of the item's three named directions, the dispatch chose the cheapest that
holds: document the working command shape, rather than widening any guard
admission or granting a new capability. Zero guard code change, zero new tool
grant, zero new script.

## Independent re-verification

The dispatch's own probe was not taken on trust. Re-run here, standalone:

    node -e 'require("fs").mkdirSync("scratch/dispatch/verify-criticwrite-a1b2c3d4",
    {recursive:true}); require("fs").writeFileSync(".../critic-notes.md",
    "line one\nline two with \"quotes\"\n")'

Read back byte-exact, including the embedded double quote. The probe directory
was removed after verification; nothing tracked was touched by the probe itself.

`templates/prompts/critic-review.md` was correctly left unchanged — it already
defers to CR-06-D as authoritative, so adding the command shape there would
duplicate rather than clarify.

## What this closure does not cover

The item's own second, smaller finding — a dispatch record's `report`/
`report.text` prose reaching a Critic that must not read implementor
narrative — was explicitly out of this dispatch's scope. It is the same defect
as
`backlog/items/2026-09-04-a-dispatch-record-carries-implementor-prose-into-a-critic-that-must-not-read-it.md`,
which stays open and is not duplicated by this closure.

## An unrelated defect this dispatch surfaced, corrected separately

The dispatch reused the task id `NVA-B-CRITICWRITE-1` for a work package
unrelated to an earlier, completed 2026-09-03 package under the same id
(`f262a5c7`, an ADR draft). This overwrote that package's dispatch record.
Restored and recorded as its own addendum in
`backlog/items/2026-09-01-half-the-dispatch-records-omit-the-field-that-binds-them-to-their-commit.md`
— not a defect in the fix this item closes against, but disclosed here because
it touched the same evidence file during this dispatch's run.
