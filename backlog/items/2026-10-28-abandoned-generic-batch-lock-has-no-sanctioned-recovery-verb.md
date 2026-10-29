---
schema: pipeline.backlog-item.v1
id: pipeline.abandoned-generic-batch-lock-has-no-sanctioned-recovery-verb
type: defect
owner: pipeline
status: open
created: 2026-10-28
sprint: alfred
source: "PO relay of a consumer session, 2026-10-28 (see the item body)"
done_when: manual
---

# Admit still ends in CGB-HELD on a leftover generic-batch `transaction.lock` of a dead owner over an empty store, and no sanctioned command reaches the recovery that exists (Toolbox D61, P0)

Relayed 2026-10-28 by the PO from the Toolbox session after the round-3 follow-up bundle. Build under test:
`0.7.0+claude.20261028105149.e883458`.

## Observed

`admit` still ends in `CGB-HELD`. The cause is no longer a half-finished packet (D60, resumed or released since the
follow-up bundle) but a leftover `transaction.lock` of the generic batch store: the store is empty
(`empty-store-held`) and the owner process of the lock is dead.

`recoverGenericCriticBatchEmptyStore` and `inspectGenericCriticBatchRecovery` exist in
`plugins/pipeline-core/lib/critic-generic-batch.mjs`, but no CLI verb and no finalizer verb calls them, and the
`CGB-HELD` refusal for a held lock names no recovery command. The session deleted nothing by hand.

## Wanted

- A sanctioned inspect verb (read-only: status and digest) and a recover verb (digest-bound) beside the packet
  `release` verb of the finalizer; the `CGB-HELD` text for a held lock names both.
- Tested against the real state (a registration killed while it holds the lock) and the upgrade state (a lock written
  by the previous build), not only a state built by the new code.
- The path after recovery (admit, finalize, export, block, cleanup) walked and pinned end to end.

Related: D60 (`2026-10-28-admit-refuses-on-a-held-packet-it-would-resume.md`), PF-93 upgrade state
(`2026-10-28-finalized-legacy-packet-receipt-digest-refused-by-export.md`).
