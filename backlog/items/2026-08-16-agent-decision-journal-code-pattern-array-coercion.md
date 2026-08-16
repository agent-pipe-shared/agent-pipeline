---
schema: pipeline.backlog-item.v1
id: pipeline.agent-decision-journal-code-pattern-array-coercion
type: defect
owner: pipeline
status: open
created: 2026-08-16
source: "Found 2026-08-16 by PHX-WP-AAC01-REVALIDATION-TRIGGER while adding revalidationTrigger: RegExp.test() stringifies its argument, so CODE.test(value.reasonCode) alone admits an array like [\"SOME_CODE\"] where a string is required. Fixed for the new field with an added typeof guard; the pre-existing reasonCode instance was left untouched as out of scope."
due: 2026-09-30
---

# `agent-decision-journal.mjs`'s `CODE.test(...)` checks admit an array via implicit stringification

## Description

`plugins/pipeline-core/lib/agent-decision-journal.mjs`'s `validateAgentDecisionEvent`
validates `reasonCode` with `CODE.test(value.reasonCode)` alone (no `typeof` guard).
`RegExp.prototype.test` coerces its argument with `String(...)` before matching, so
a single-element array whose sole entry matches the pattern —
`value.reasonCode = ["SOME_CODE"]` — passes `CODE.test` (`String(["SOME_CODE"])`
=== `"SOME_CODE"`) even though the published JSON schema
(`governance/schemas/agent-decision-event.schema.json`) declares `reasonCode` as
`{ "type": "string" }`, breaking validator/schema lockstep for that one input shape.

`revalidationTrigger` (added the same night, `170c44ef`) closed the identical hole
for itself with an explicit `typeof value.revalidationTrigger !== "string"` guard
ahead of the `CODE.test` call — `reasonCode` (and any other bare `CODE.test`/
similar regex-only check in this file, not audited here) was deliberately left
untouched as out of scope for that task.

## Affected artifact

`plugins/pipeline-core/lib/agent-decision-journal.mjs` — `reasonCode`'s validation
in `validateAgentDecisionEvent`, and possibly `validateCommandOfferEvent`/
`validateLegacyImportObservationEvent`'s own `reasonCode`/other `CODE`-pattern
checks (not individually audited when this was filed).

## Proposal

Add the same `typeof value.reasonCode !== "string"` guard (or a shared helper,
e.g. `const isCode = (v) => typeof v === "string" && CODE.test(v);`, reused
everywhere this file currently calls a bare `X.test(value.someField)` on a field
whose schema type is `"string"`) to `reasonCode` and any sibling field found to
have the same gap. Add a regression test asserting an array is rejected, mirroring
the test `170c44ef` already added for `revalidationTrigger`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
