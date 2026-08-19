---
schema: pipeline.backlog-item.v1
id: pipeline.reconcile-backlog-ledger-evidence-commit-predates-referenced-file
type: defect
owner: pipeline
status: closed
created: 2026-08-18
source: "Critic review of Wave-3 diff (dispatch: T1 guardrail-tier, functional-equivalent-read-only, opus), 2026-08-18, finding F4"
---

# reconcile-backlog-ledger.mjs's item-file-reconciliation events pin evidence.commit to a commit that does not yet contain the referenced item file

## Description

`reconcile-backlog-ledger.mjs --activate`, when reconciling a brand-new
backlog item file into the ledger for the first time, emits an
`item-file-reconciliation` event whose `evidence.commit` is the current
`HEAD` at planning time. For a genuinely new item file (never previously
tracked), that HEAD commit necessarily predates the commit that will
actually add the item file — the item file and the ledger event are
committed together, immediately afterward, in one atomic transaction. The
result is a ledger event that pins an `evidence.commit` which provably
does not contain the file it references, even though the event's own
`reason` text asserts "the item file is the pre-existing record."

## Triggering situation

A Critic review of the Wave-3 diff (2026-08-18, dispatch metadata: T1
guardrail-tier due to `policies/model-policy.md` being touched, run on
the functional-equivalent-read-only lane on Opus) found this exact shape
on two events (`backlog/transitions.ndjson` sequences 645/646, added in
commit `d48f1686`, `evidence.commit` pinned to `2b9f9adf`): `git ls-tree
2b9f9adf -- backlog/items/2026-08-18-backlog-plan-writers-skip-drift-classification.md
backlog/items/2026-08-18-guard-devplan-and-guard-testpath-have-no-bash-write-lane.md`
returns nothing, confirming neither file exists at that commit. The
Elephant used `reconcile-backlog-ledger.mjs` exactly as documented
(`plan` then `--activate`); this is not a misuse of the tool, and the
identical pattern — `evidence.commit` referencing a commit unrelated to
or predating the item file's own addition — is visible throughout the
existing `backlog/transitions.ndjson` history for other
`item-file-reconciliation` events, so this is a systemic characteristic
of the tool's design, not a one-off.

## Affected artifact

`plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` (the
`evidence.commit` selection for a first-time `item-file-reconciliation`
event on a new item).

## Proposal

Decide, and then implement, one of: (a) for a brand-new item's first
reconciliation event, omit or null the `evidence.commit`
reachability/content claim, since no prior commit can truthfully attest
to content that does not yet exist there; (b) defer emitting the ledger
event until after the item file's own adding commit exists, then pin
`evidence.commit` to that real commit (changes the tool's transaction
order and CLI usage); (c) reword the event's `reason` text so it no
longer asserts the file is the "pre-existing record" for this specific
new-item case, and treat `evidence.commit` for this shape purely as a
reachability anchor for the ledger append itself, not as a content
binding. Needs a design decision, not a mechanical fix — the ledger's
append-only nature means no existing event can be corrected in place;
any adopted fix only changes behavior going forward.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, option (b) — defer emitting the ledger event
  until the baseline commit genuinely contains the item file; refuse
  (block, write nothing) rather than fabricate a synthetic commit
  object when it does not yet.
- **Rationale:** matches the tool's own existing philosophy for a
  closing step ("a closure whose commit is unreachable ... STOPS the
  reconciliation ... rather than being recorded") and avoids creating
  dangling git objects that risk future GC. Options (a) (omit/null the
  claim) and (c) (reword `reason` only) were not taken — they would
  leave the false content-binding claim in place rather than removing
  it.
- **Assignment:** implemented, Wave 5 round 1, dispatch NVA-W5-04.
- **Date:** 2026-08-19

### Implementation, 2026-08-19 (Wave 5 round 1, dispatch NVA-W5-04)

Added `resolveItemFileCommit(root, baseline, item)` to
`reconcile-backlog-ledger.mjs`: a non-closing event's `evidence.commit`
is only ever set to the reconciliation baseline once
`git cat-file -e <baseline>:<item.path>` confirms the baseline
genuinely contains the item file; otherwise that item is blocked
(nothing written) rather than cited falsely. `resolveClosureCommit()`
(the closing-step path) is unchanged. Regression tests RBL18 (positive:
baseline genuinely contains the file) and RBL19 (negative: file present
only in the working tree, not yet reachable from the baseline, is
refused) added; full suite 19/19 pass;
`node plugins/pipeline-core/scripts/check-backlog-state.mjs` clean
(only the two known pre-existing DRIFT lines).

**Real-world workflow implication, not previously documented
anywhere**: this fix changes the tool's transaction order for a
brand-new item. The item's own file must now be committed BEFORE
`reconcile-backlog-ledger.mjs --activate` runs for it — it can no
longer be committed together with the ledger event in one atomic
transaction, since the plan step needs the file already reachable from
the baseline to accept it. Confirmed live and unaffected by this
change: the standard two-commit closure pattern used throughout this
session (flip status + append Closure section, commit; THEN add
closure metadata frontmatter citing that real commit, commit again;
THEN run `reconcile-backlog-ledger.mjs`) already satisfies this
ordering — the item file is always committed well before
reconciliation runs.
