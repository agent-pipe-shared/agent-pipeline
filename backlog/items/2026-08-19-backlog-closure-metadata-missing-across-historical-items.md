---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-closure-metadata-missing-across-historical-items
type: defect
owner: pipeline
status: closed
created: 2026-08-19
source: "Found by PHX-WP-BACKLOG-OBSGOV-MISC-TRIAGE while diagnosing backlog-state-check and backlog-ledger-reconciliation-tests failures from a full clean-candidate Verify run, 2026-08-18/19."
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "a2a2bcc715f21ed79541064e9152f865b253fb6f"
closure_evidence: "backlog/items/2026-08-19-backlog-closure-metadata-missing-across-historical-items.md"
---

# Dozens of closed backlog items lack required closure metadata, dating back to 2026-07-27

## Description

`validateBacklogItem()` (`plugins/pipeline-core/lib/backlog-state.mjs`)
requires `closed_at`/`closure_repository`/`closure_commit`/`closure_evidence`
on every item with `status: closed`. Dozens of items across the entire
backlog history — verified directly in
`backlog/items/2026-07-27-recovery-preview-ack-unstable-getter-poisons-replay-ledger.md`'s
frontmatter, and almost certainly others — lack all four fields, causing
`backlog-state-check` (exit 2) and `backlog-ledger-reconciliation-tests`
(exit 1) to fail in a full Verify run. This long predates this session's own
backlog work.

## Affected artifact

`plugins/pipeline-core/lib/backlog-state.mjs` (`validateBacklogItem`'s
requirement), and every closed `backlog/items/*.md` file missing the four
fields — the exact set needs its own inventory pass (not enumerated here).

## Proposal

Not designed here — this needs a real inventory (which closed items are
missing which fields) before a remediation approach can even be scoped.
Fabricating `closure_commit`/`closure_evidence` values would be dishonest
and is explicitly out of bounds; genuine historical research (finding the
real commit/evidence for each item, where it exists) or a deliberate,
disclosed backfill policy for items too old to reconstruct are the two
realistic directions — a PO call on which (or a mix) is needed before
dispatching real work here.

## Triage — 2026-08-19

- **Decision:** accept-open, NOT dispatch-ready — needs an inventory pass and
  a PO decision on remediation approach (historical research vs. disclosed
  backfill policy vs. relaxing the validator's requirement for pre-2026-08
  items) before any implementation work is scoped.
- **Rationale:** Large, historical, cannot be safely bounded without first
  knowing the actual scope (how many items, how far back, whether real
  closure evidence is even recoverable for the oldest ones).
- **Assignment (if accepted):** Unassigned — needs Elephant-led inventory
  pass first, then a PO decision on remediation approach.
- **Date:** 2026-08-19

## Progress note — 2026-08-19 (historical reconstruction attempted)

`PHX-WP-BACKLOG-CLOSURE-HISTORICAL-RECONSTRUCTION` (commit `b3c2eaef`) attempted
real historical reconstruction rather than waiting for a PO policy call, per
this item's own "genuine historical research... is one legitimate direction"
proposal. Result: **69 of 79** closed items missing the 4 required fields were
reconstructed with real, `git cat-file`-verified commit SHAs (no fabrication —
every value traces to an actual commit). **10 items were deliberately left
untouched**, because they are not a missing-evidence case at all: their
frontmatter says `status: closed` but their own final Triage/Decision text
says the opposite ("stays open", "accept-open", "accept-deferred", "confirmed
still open") — a genuine status/content contradiction, not a data gap. Adding
closure metadata to these would misrepresent items that may actually still be
open. The 10:
- 2026-08-05-claude-dir-leftovers-defeat-runner-neutral-project-migration.md
- 2026-08-05-claude-has-no-start-time-opt-in-adoption-path.md
- 2026-08-05-critical-human-proof-not-wired-to-push-and-prd-gates.md
- 2026-08-06-local-plugin-install-attestation-does-not-bind-external-marketplace-root.md
- 2026-08-06-neutral-authority-tier-is-a-frozen-snapshot-the-compiler-never-updates.md
- 2026-08-06-no-gate-is-tested-end-to-end-for-satisfiability.md
- 2026-08-06-restart-launch-is-codex-only-for-every-runner.md
- 2026-08-07-gs6-blocks-inert-plugin-metadata-in-self-hosted-sessions.md
- 2026-08-07-onboarding-ready-path-unconditional-restart-barrier-read.md
- 2026-08-07-part-a-limitation-2-orphaned-by-the-r2-rework.md

One additional item (`2026-08-16-installed-plugin-gmw-hgo-v3-anchor-gap-blocks-all-protected-edits.md`)
has a `closure_evidence` value that points outside this repository (an
external marketplace checkout path) rather than a regular repository file —
`validateBacklogItem` rejects this shape; needs its own small, separate fix
(point the evidence at an in-repo reference, or accept the out-of-repo
reference as a distinct, deliberately-allowed shape — a real but narrow
question).

**`node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate`
is itself fail-closed and currently BLOCKED** by these same 11 items (the 10
contradictions + the 1 malformed evidence path) — confirmed by running it
without `--activate`: it refuses with all 41 findings and writes nothing.
`backlog-ledger-reconciliation-tests`'s remaining ~97 "status does not match
its final ledger transition" failures are a downstream symptom of this same
block, not a separate defect — once the 11 items are resolved, re-running
`reconcile-backlog-ledger.mjs --activate` should resolve most or all of them
in one pass.

**Sharper remaining scope:** the PO decision this item still needs is narrow
now — for each of the 10 contradiction items, should `status` revert to what
their own Triage text says, or should the Triage text be reconciled to
confirm `closed` (with real closure metadata then added)? This is a much
smaller, well-bounded decision than the original "unknown historical scope."

## Triage — closed 2026-08-19

- **Decision:** closed — resolved. The "sharper remaining scope" question above
  was itself answered by `PHX-WP-BACKLOG-CONTRADICTION-REINVESTIGATE` (commit
  `a2a2bcc7`): all 10 "contradiction" items were re-investigated end-to-end
  and every one turned out to have a genuine, later, superseding closure the
  prior pass had missed (not a real contradiction needing a PO call) — all 10
  now carry real, verified closure metadata. The 1 malformed-evidence-path item
  was separately fixed (`f86b9cbd`). `reconcile-backlog-ledger.mjs --activate`
  then ran clean, recording 177 transitions across 94 items with zero blocking
  findings. The one genuinely unresolved piece this investigation surfaced —
  ledger event 41's stale `itemSha256` on a genesis event, which has no
  supported amendment mechanism — is out of THIS item's original scope (a
  missing-metadata problem, not a hash-chain-integrity one) and is tracked in
  its own item, `2026-08-19-ledger-genesis-event-hash-rebind-has-no-amendment-mechanism.md`.
- **Rationale:** Every symptom this item was filed against (`backlog-state-check`
  exit 2, `backlog-ledger-reconciliation-tests` failures from missing closure
  metadata) is resolved and verified, not merely narrowed.
- **Date:** 2026-08-19
