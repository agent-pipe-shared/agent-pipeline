# LND-3 mixed-stream replay and viewer

Date: 2026-09-12  
Scope: ADR-0083 LND-3, runner-neutral offline reader

Implementation commit `9bdd94c2a5b9d6ede5f587a218e4d4b5df2b26d5`
(tree `6adf18d1d607e9825510432de44f5556a3ab5cd1`) introduces replay/readback
v2. Lifecycle-v1 records retain their per-dispatch timelines and
package/worker/attempt topology. Action-v1 records enter a separate action
timeline and the static viewer renders them in a separately labelled
non-authoritative section. Existing replay readback v1 artifacts remain
readable and are normalized into the v2 view model without rewriting source
records. The export projection remains envelope-only.

Focused execution passed:

- replay core: 6/6;
- replay view: 12/12;
- replay CLI: 3/3;
- replay viewer CLI: 3/3;
- governance export projection: 4/4;
- governance action schema/runtime: 7/7;
- governance envelope/runtime: 12/12;
- portable event-store regressions: 50/50 at the host subprocess boundary;
- documentation contracts: valid for 1,596 Markdown files and 1,371 links.

The first independent review found one major completeness gap: a saved v2
readback containing sequences 1 and 3 could match a sequence-3 checkpoint and
still render as observed. Correction commit
`ceea79684529727654cc0f49b1539dd7eb3a72dc` (tree
`a1857967ae2f85b6c18ee617b4615d1aa29c837c`) requires the combined dispatch
and action history to cover every sequence from 1 through the terminal
checkpoint. The regression fixture proves the gapped artifact fails with
`GRV-SEQUENCE-COVERAGE`. The exact single-commit correction review returned
PASS with no findings.

Rollback may disable new producers and v2 artifact creation. Per ADR-0083 D7,
the action validator, store router, replay-v2 reader and v1 compatibility
reader must remain once action events may exist; removing them would strand a
valid append-only stream prefix.

LND-3 is complete. The parent backlog item remains open for LND-4 through
LND-8 and the separately collected candidate-freeze obligations.
