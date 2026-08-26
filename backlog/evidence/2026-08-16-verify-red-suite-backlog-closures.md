# Closure evidence: two backlog items missing/invalid closure metadata (PHX-VF-BACKLOG2)

## What this closes

Two backlog items were surfaced red by `check-backlog-state.mjs`. Neither
required a new decision — both already carried a finished disposition in
their own body text; only their frontmatter metadata was incomplete or
non-canonical.

## `pipeline.guard-testpath-not-kernel-protected`

Finding: `status must be open, in_progress, or closed` (the item carried
`status: rejected`, not a member of the canonical three-value status set
`BACKLOG_STATUSES` in `plugins/pipeline-core/lib/backlog-state.mjs`).

Decision already on record: the item's own "## Resolution — rejected,
2026-08-11 (PO decision)" section, and the canonical "Resolved, 2026-08-11"
paragraph in `docs/adr/0058-guard-maintenance-window.md`'s Follow-up
section, record that the PO rejected the proposed
`NEVER_LIFTABLE_KERNEL_PATHS` addition; the exposure stays, and the item is
decided and finished. Commit `bf46008eb4bc34e5e585e6d12e8006f644eeabec`
(`docs(adr-0058): PO rejects guard-testpath.mjs kernel-list addition`) is
what recorded that decision in both the item and the ADR — that commit's
own message notes the exact tooling gap this closure now bridges: "the
status enum (open/in_progress/closed) doesn't currently model 'rejected'
... left as a pre-existing tooling gap, not chased here." Since no fourth
status exists and the item is not open (nothing further is planned) and not
in_progress (no active work), `closed` is the only canonical status that
does not misrepresent the outcome; the frontmatter is corrected to
`status: closed`, `closed_at: 2026-08-11`, `closure_repository: self`,
`closure_commit: bf46008eb4bc34e5e585e6d12e8006f644eeabec`,
`closure_evidence:` this file. `closed` here records that the decision
process concluded, not that the proposed repair was implemented — the
rejection itself, and its rationale, remain verbatim in the item's own
Resolution section and in the ADR.

Proof: `git -C . cat-file -t bf46008eb4bc34e5e585e6d12e8006f644eeabec`
→ `commit`, exit 0.

## `pipeline.semgrep-timeout-oversized-pipeline-state-test-file`

Findings: `closed item requires closed_at` / `closure_repository` /
`closure_commit` / `closure_evidence` (the item was `status: closed` with a
fully filled-in Triage section but none of the four required closure
fields).

Decision already on record: the item's own "## Triage" section states
"Decision: accepted, fixed same session (option (a) from the Proposal)."
The fixing commit is `ba1a7d282913357208d31f2fc4eea6857a64639d`
(`fix(security-scan): raise semgrep's per-rule timeout to survive large
files`). Frontmatter is corrected to add `closed_at: 2026-08-11`,
`closure_repository: self`, `closure_commit:
ba1a7d282913357208d31f2fc4eea6857a64639d`, `closure_evidence:` this file.

Proof: `git -C . cat-file -t ba1a7d282913357208d31f2fc4eea6857a64639d`
→ `commit`, exit 0.

## Cascading findings resolved without direct edits

- `ledger event 248: id does not name a current backlog item` — a cascade
  of the first item's invalid status: `check-backlog-state.mjs` builds its
  item index only from items with a valid status, so the item (and the
  ledger event naming it) dropped out. Resolved automatically once the
  status became canonical; the ledger itself was not edited.
- `items: pipeline.agent-decision-journal-no-production-producer has no
  transition-ledger entry` and `items:
  pipeline.reconcile-lock-reuse-lexical-path-comparison has no
  transition-ledger entry` — both items were unaffected by this dispatch's
  scope; their missing entries, and the missing entries this dispatch's own
  two items produced once their statuses became consistent with the
  ledger's last-known state for each, were all added by the one sanctioned
  writer, `node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs
  --activate`.

## Verification

- `node plugins/pipeline-core/scripts/check-backlog-state.mjs` → exit 0.
- `node --test
  plugins/pipeline-core/scripts/reconcile-backlog-ledger.test.mjs` → all
  green, exit 0.
- `node --test plugins/pipeline-core/lib/backlog-state.test.mjs` → all
  green, exit 0 (no regression).
- `node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` (no
  flags, read-only, run last) → "Backlog ledger already records every
  item's asserted status; nothing to reconcile.", exit 0.

Exact commands and exit codes as run for this closure are reproduced in the
final dispatch report; this file records the decisions and the commits, not
raw log output.
