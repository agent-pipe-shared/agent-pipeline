---
schema: pipeline.backlog-item.v1
id: pipeline.half-the-dispatch-records-omit-the-field-that-binds-them-to-their-commit
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Critic round I, finding F-2, 2026-09-01, reviewing commit 7bca7f5d. Measured against evidence/dispatch-record-NVA-B-HANDOVERPATH-FIX.json and then against the whole evidence corpus."
---

# Roughly half the dispatch records omit `report.changedFiles`, so their commits' authorship cannot be established mechanically

## What was measured

`templates/prompts/agent-obligations.md` §6 — a GENERATED file, derived from the
enforcing component rather than hand-written — states three conditions that a
`Dispatch: <TASK_ID> (goldfish)` commit trailer entails:

> `evidence/dispatch-record-<TASK_ID>.json` must exist, its `outcome` must be
> terminal rather than `in-progress`, and its `report.changedFiles` must cover
> the paths the commit touches.

For the commit under review, two of the three held. The record existed, its
`outcome` was `implemented-committed`. The key `changedFiles` did not appear in
the file at all. The changed paths were present only as free prose inside the
report text.

The reviewer then widened the measurement rather than filing against one
dispatch: roughly **60 of about 130 records** in `evidence/` carry the field, and
a substantial share of the same session block's own records also lack it. The
corpus is mixed, not uniformly compliant with a rule one record happened to miss.

## Why this matters more than a missing field usually would

The `Dispatch:` trailer and the dispatch record are described in
`goldfish-task.md` field 6 as "the deterministic authorship/evidence pair for
close step 6b and the Critic". The word doing the work there is *deterministic*.
A record whose changed-path list exists only as prose can be read by a person and
cannot be resolved by a checker — so for half the corpus, the authorship chain the
pair exists to establish is human-establishable only.

That is precisely the property the pair was introduced to replace. `AI-Assisted:
true` is already the anonymous assistance marker; the trailer's whole additional
value is that it binds to a machine-readable record.

## Why it is a systemic gap and not fifteen lapses

The template that mandates the field is the same template every dispatch is built
from, and it states the requirement in bold. Records still omit it at scale. Two
readings are available and this item does not choose between them:

1. The requirement is stated but nothing checks it, so compliance decays. Nothing
   in the verify gate examines dispatch-record shape.
2. The records predate the requirement's current wording, and the gap is
   historical rather than ongoing. This is testable: compare the omission rate
   before and after the commit that last strengthened that bullet.

The second reading is checkable cheaply and should be checked first, because it
decides whether the remedy is a backfill, a gate step, or both.

## Deliberately not asserted

The reviewer did **not** execute `dispatch-authorship-verify.mjs`, because it
could not rule out that the script writes an evidence artifact and its read-only
constraint takes precedence. So this item records a measured absence of a field
and the documented entailment of that absence. It does **not** claim an observed
`UNVERIFIABLE` verdict from the checker. Anyone acting on this should run the
checker first and record what it actually says — the entailment may be stated more
strictly in the template than the implementation enforces.

## Directions, none pre-selected

1. Make dispatch-record shape a gate step, so an omission is caught at the
   boundary rather than by a Critic reading one record.
2. Backfill the field for records whose commits are still reachable, accepting
   that a reconstructed list is weaker evidence than one written at dispatch time.
3. Narrow the template's claim to what is actually enforced, if the checker turns
   out to treat the field as optional — the gap would then be in the documentation
   rather than in the corpus.
