---
schema: pipeline.backlog-item.v1
id: pipeline.the-dispatch-record-field-enumeration-omits-a-field-the-checker-requires
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Found 2026-09-01 while verifying dispatch NVA-B-WFRECORD, which had to add the same missing field to a copy of this list in the Workflow-dispatch reference (commit 6ce146f4). The source list was left uncorrected."
---

# The authoritative dispatch-record field enumeration omits a field the authorship checker requires

## What was measured

`templates/prompts/goldfish-task.md` is the authoritative definition of the
dispatch-record artifact's shape, and says so in those words. Its field
enumeration reads:

> Fields: `taskId`, `agentType`, `model`, `rulesetSha`, `dispatcher`, `outcome`,
> plus `commits`, `log` and `report`.

`effort` is absent. Two lines further down, the prose requires it: "Field 6's
`model`/`effort` values are then DERIVED FROM that agent's own definition file."

The enumeration is the list a builder copies. The prose is what a builder skims.

## Why the omission has teeth

`compareRecordedModel()` in `plugins/pipeline-core/lib/agent-model-registry.mjs`
does not treat a missing `effort` as unknown. It compares:

    String(recordedEffort ?? "").trim().toLowerCase() === String(resolved.effort ?? "").trim().toLowerCase()

An absent `effort` becomes the empty string, which does not equal `"medium"` or
`"xhigh"`. With `agentType` declared and no `modelOverride`, the result is
classification `model-mismatch`, which `dispatch-authorship-verify.mjs` downgrades
to **FAIL** — on a commit genuinely authored by the agent it names.

The check is right. The field list that feeds it is not.

## This already happened once

The Workflow-tool dispatch-record fallback in
`plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md` had
been built from exactly this enumeration and carried the same omission. It was
corrected at the copy in commit `6ce146f4`. The source list was left as it was,
so the next copy will reproduce it.

## Why it was deferred rather than fixed on discovery

Recorded because the reasoning is part of the item, not an excuse. This is the
file every dispatch in the repository is constructed from, and it is vendored
under `plugins/pipeline-core/`, so editing it obligates a vendored-canon
regeneration as well. A one-word enumeration change to the most load-bearing
template in the repository is not a one-word change, and it was found forty
minutes before a release freeze.

Established while scoping it: `goldfish-task.md` is NOT an input to
`harness/scripts/generate-agent-obligations.mjs`, so the obligation is the single
vendored-canon regeneration and no second generator.

## What closing it looks like

Add `effort` to the enumeration, and state there — not two lines later — that a
record omitting it fails the authorship check even when the commit is honest.
Regenerate the vendored canon. Confirm by building a record from the enumeration
alone and running the checker against it, rather than by re-reading the text.
