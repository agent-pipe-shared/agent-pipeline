# ADR coverage progress — 2026-09-08

## Current source checkpoint — 52 of 75 accepted decisions

Source commit `9742b1aaa8b2f2502bd9d4a42285ede411034967` contains the same
80 numbered ADRs: 75 accepted, 3 historical, 1 provisional and 1 proposed.
Fifty-two accepted decisions now declare governing paths; 23 still lack them.
The immutable complete rows are
`scratch/adr-source-inventory-round8-rows-20260908.json`, SHA-256
`fccdb5049e54dfcc9c3b0f962443d2ac1119e6ad6ca875ed5ab47ded26f88c60`;
`scratch/adr-source-inventory-round8-20260908.json` binds their source bytes
and exact tracked corpus to that commit.

The latest additions are ADR-0013–0016 in
`1d191a56941cfe2c767edab867fe60a37c0dd05f` and ADR-0018/0019/0020/0023 in
the source checkpoint above. Both pass strict dispatch authorship. Readable
obligation mappings and unchanged-body proof references are
`backlog/evidence/2026-09-08-adr-contracts-governs-coverage.md` and
`backlog/evidence/2026-09-08-adr-practice-governs-coverage.md`. They distinguish
actual native guard and V3 effort owners from missing monitoring and explicitly
process-only repository scoping. This declaration count does not establish
implementation conformance or final source-candidate reconciliation.
Queue item 12 remains open until the 23 remaining accepted decisions and
legitimate exclusions are addressed and the final source candidate is reconciled.
The two latest universal copies were integrated separately in
`2e94c12d96d9af574d9ec8c89722ed6f5654e756`. Generator, consumer and document
checks pass, including the nine existing consumer regressions. Exactly one
inherited ADR-0014 header needed classification; a separate consumer instruction
remains rejected. See
`backlog/evidence/2026-09-08-adr-contracts-vendor-integration.md`.

## Earlier source checkpoint — 44 of 75 accepted decisions

Source commit `9d2cbc3870e7bbd29dfa00c506d0c5ae3131d4d6` contains 80
numbered ADRs: 75 accepted, 3 historical, 1 provisional and 1 proposed.
Forty-four accepted ADRs now declare governing paths; 31 still lack them.
The complete row inventory is preserved independently of future updates at
`scratch/adr-source-inventory-round7-rows-20260908.json`, SHA-256
`360d7b78fe45f366976c46acb20ac0523db8ea4b9dcb2aa3a1311f56415f059b`.
Its binding at `scratch/adr-source-inventory-round7-20260908.json` confirms
the exact tracked corpus, all current source hashes, and an unchanged ADR
tree relative to that commit. Historical inventory artifacts below remain intact.

The latest eight additions are ADR-0003 through ADR-0010, committed in
`017603d50e5038127ce907b70d1d137242a98475` and the source checkpoint above.
Their readable responsibility mappings and fixed-body proof references are
`backlog/evidence/2026-09-08-adr-foundation-governs-coverage.md` and
`backlog/evidence/2026-09-08-adr-session-governs-coverage.md`. Strict dispatch
authorship passes for both source commits. The four universal consumer copies
were integrated separately in `9f07a1e89dbf7f3dc8c49a199dd5968e31e7d68b`.
Generator, document-contract and consumer checks pass, including nine consumer
regressions. Three inherited header metadata entries use the existing narrow
classification; separate added consumer instructions remain rejected. See
`backlog/evidence/2026-09-08-adr-foundation-session-vendor-integration.md`.
These checks do not establish a complete green candidate gate.

The earlier continuity and approval packages are recorded in
`backlog/evidence/2026-09-08-adr-continuity-governs-coverage.md` and
`backlog/evidence/2026-09-08-adr-approval-governs-coverage.md`.
These mappings explicitly retain unimplemented or deferred obligations,
including feature-close rotation and universal ceremony conformance.

At this earlier checkpoint, 31 accepted decisions still lacked declarations;
their legitimate exclusions and final source-candidate reconciliation also
remained outstanding.
Declaration counts alone prove neither complete semantic path coverage nor
implementation conformance. The real-Git acceptance proof described below
remains valid for its isolated fixture; it does not reconcile this new source
checkpoint automatically.

## Earlier checkpoint — 19 of 75 accepted decisions

At commit `b9460f7f5870fb16d235aa71e3396fae553f9e0d`, the numbered corpus
contains 80 ADRs: 75 accepted, 3 superseded/historical, 1 provisional and
1 proposed. Nineteen accepted ADRs declare Governs paths; 56 do not yet.

The previous 74-accepted denominator was incorrect. Its status heuristic
classified ADR-0062 as draft because explanatory text says accepted as drafted.
The replacement inventory reads normative content before reference translations,
supports inline and section status forms, and keeps ADR-0017/0022/0031 as
superseded, ADR-0021 provisional and ADR-0039 proposed.

All 80 source hashes were checked against the actual files, and git confirmed
the ADR tree matches the named commit. The full compact inventory includes
status, category, source hash, Governs globs and matched tracked-path count in
`scratch/NVA-B-ADR-COVERAGE-STATUS-2/source-hash-rows-final.json`. Its SHA-256 is
`66824c4496ff05b38b07f59a1b4f6c1a17810e6171a5ad21d5c56da758befc60`.
Binding readback: `scratch/adr-inventory-bound-20260908.json`.

The first seven additions are ADR-0070, 0050, 0052, 0053, 0001, 0002 and
0011. Their evidence files explain exact owning paths and residual exclusions;
parser/body checks prove no accepted decision text was rewritten. A declared
path hit is not a claim that every implementation obligation of an ADR is
complete or that all its relevant paths have been discovered.

An independent isolated Git fixture exercises actual reconciliation for the
new ADR-0050 declaration. Missing, uncommitted, stale and unrelated records
are rejected; only the committed descendant record for the exact candidate
passes. See `backlog/evidence/2026-09-08-new-adr-coverage-reconciliation-proof.md`.
This acceptance test does not stand in for final source-candidate reconciliation.

At that earlier checkpoint, 56 accepted decisions still lacked declarations.
The current count and remaining work are recorded above; the historical,
provisional and proposed exclusions have not changed.
