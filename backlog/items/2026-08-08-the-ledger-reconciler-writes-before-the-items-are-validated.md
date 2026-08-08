---
schema: pipeline.backlog-item.v1
id: pipeline.the-ledger-reconciler-writes-before-the-items-are-validated
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Observed directly on 2026-08-08 while filing three items: reconcile-backlog-ledger.mjs --activate recorded transitions for two items whose frontmatter does not validate."
---

# The ledger reconciler records transitions for items it has not validated

## Description

`reconcile-backlog-ledger.mjs --activate` writes a transition into the
append-only ledger for every item file that lacks one, without first checking
that the item file itself is valid. When an item's frontmatter does not parse,
the reconciler still records its transition, and `check-backlog-state.mjs` then
reports the pair of consequences together:

```
FAIL backlog state: <item>.md: missing required field source
FAIL backlog state: ledger event 222: id does not name a current backlog item
```

The second failure is not an independent problem — it is the ledger pointing at
an id that no valid item carries, created by the reconciler one command earlier.
The ordering is the defect: an append-only store should not be written on behalf
of an input that has not been validated, because the write cannot be taken back.

## Triggering situation

Three items were filed on 2026-08-08. Two of them carried a `source:` value with
commas in it, which the frontmatter parser rejects for unquoted scalars
(`backlog-state.mjs:169` — unquoted values may not contain `'`, `[`, `]`, `{`,
`}` or `,`). The preview run reported `Would record 3 transition(s)` without
objection, `--activate` recorded all three, and only the subsequent
`check-backlog-state.mjs` run surfaced that two of the three items were invalid
and that two ledger events now named nothing.

Recovery was straightforward here — quoting the two `source:` values made the
items valid and the existing ledger events correct again — but that is a
property of this particular failure, not of the ordering. An item whose id is
wrong, rather than whose frontmatter is malformed, would leave a permanent
ledger event naming an id that no item will ever carry.

## Affected artifact

- `plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` — the write path
  and its preview mode, neither of which validates.
- `plugins/pipeline-core/scripts/check-backlog-state.mjs` — where the validation
  it should be reusing already lives.
- `plugins/pipeline-core/lib/backlog-state.mjs:169` — the scalar rule that makes
  a comma in an unquoted `source:` a hard failure.

## Proposal

Validate before writing, in both modes. The preview run should report the same
refusal the write would hit, so that `--activate` is only ever the confirmation
of a preview that already passed. The validation to reuse exists — this is a
call-ordering change, not a new checker.

Two smaller things worth deciding alongside:

1. Whether the reconciler should refuse the whole batch or skip the invalid
   items and record the valid ones. Refusing the batch is more predictable and
   matches how the other sanctioned writers behave on a partial failure.
2. Whether the frontmatter parser's message can name the offending character.
   "must be plain text or JSON strings" does not tell an author that a comma is
   what broke it, and the fix (quote the value) is not obvious from the text.

Acceptance test: an item file with malformed frontmatter makes both the preview
and the activate run refuse, with no ledger write — demonstrated by a deliberate
malformed fixture, not asserted.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
