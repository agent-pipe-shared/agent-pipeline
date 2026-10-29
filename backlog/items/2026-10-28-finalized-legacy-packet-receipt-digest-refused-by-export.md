---
schema: pipeline.backlog-item.v1
id: pipeline.finalized-legacy-packet-receipt-digest-refused-by-export
type: defect
owner: pipeline
status: open
created: 2026-10-28
sprint: alfred
source: "PO relay of a consumer session, 2026-10-28 (see the item body)"
done_when: manual
---

# Export still ends in SCF-EXPORT-UNCONSUMED for a legacy packet finalized by the previous build: the receipt digest is not the one the readers compute (Glossover PF-93, third report, P0)

Relayed 2026-10-28 by the PO from the Glossover session (section 8b of its `docs/pipeline-handover-pf93.md`, commit
`00bfc06`). Build under test: `0.7.0+claude.20261028105149.e883458`.

## Observed

Export ends in `SCF-EXPORT-UNCONSUMED`. The receipt written by finalize carries `packetDigest` `37f56e92...`; export
computes `7a18a007...` over the packet in its stored form, and the packet journal carries `7a18a007...` too.
Candidate, tree, diff base, diff commit, diff digest and packet id all match. The Verify binding
(`critic-verify-lifecycle.mjs`, about line 68) compares the same digest and probably fails the same way.

Working hypothesis, not yet proven by a run: the packet was finalized by the previous build (`692301fd9`), which bound
the digest of the normalized view of the legacy packet, while the current readers digest the stored form.

## Wanted

- The upgrade state is built with the real previous-build code and the current readers must accept it: a receipt digest
  equal to the raw digest or to the normalized-view digest of the same packet, computed by one shared function; any
  other digest, or a packet changed after finalize, stays refused.
- The whole path after export (next review round, Verify binding, lineage, block, cleanup) walked for the upgrade state.

Lesson: three rounds of fixes were tested against states built by the new code while the consumer held a state written
by the previous build.

Related: PF-93 (`2026-10-28-critic-packet-claimed-under-an-older-version-cannot-finalize.md`), D61
(`2026-10-28-abandoned-generic-batch-lock-has-no-sanctioned-recovery-verb.md`).
